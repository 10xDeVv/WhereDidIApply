"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRun, parseEmail, ParseEmailResponse } from "@/lib/proxy";
import {
  listMessageIds,
  getMessage,
  extractPlainText,
  getHeader,
  htmlToText,
  buildJobEmailQuery,
  GmailAuthError,
} from "@/lib/gmail";
import { mapWithConcurrency } from "@/lib/concurrency";
import { mergeResults, AppRow } from "@/lib/merge";
import { saveResults, loadResults, clearResults, formatScannedAt, loadEdits, saveEdits } from "@/lib/storage";

import HeroConnect from "./components/HeroConnect";
import ScanControls from "./components/ScanControls";
import StatsBar from "./components/StatsBar";
import ResultsTable from "./components/ResultsTable";

type ParsedItem = {
  parsed: ParseEmailResponse;
  subject: string;
  from: string;
  internalDate?: string;
};

export default function Home() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const tokenExpiresAt = useRef<number>(0);

  const [days, setDays] = useState<number>(90);
  const [maxEmails, setMaxEmails] = useState<number>(500);
  const [concurrency, setConcurrency] = useState<number>(4);

  const [phase, setPhase] = useState<"idle" | "scanning" | "done" | "error">("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [skippedCount, setSkippedCount] = useState(0);

  const [items, setItems] = useState<ParsedItem[]>([]);
  const rows: AppRow[] = useMemo(() => mergeResults(items), [items]);

  // Cached results metadata (from localStorage)
  const [cachedMeta, setCachedMeta] = useState<{ scannedAt: string; daysBack: number; emailCount: number } | null>(null);
  // Cached rows loaded from storage (used when no fresh scan has been done)
  const [cachedRows, setCachedRows] = useState<AppRow[]>([]);

  // User edits: manual corrections layered on top of scan results
  // Key = row key, value = partial overrides or "__deleted__"
  const [userEdits, setUserEdits] = useState<Record<string, Partial<AppRow> | "__deleted__">>({});

  // ── Streaming-batch buffer (avoids a re-render per email) ──
  const pendingItems = useRef<ParsedItem[]>([]);
  const pendingProgress = useRef<{ done: number; total: number }>({ done: 0, total: 0 });
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushPending = useCallback(() => {
    flushTimer.current = null;
    const batch = pendingItems.current;
    if (batch.length > 0) {
      pendingItems.current = [];
      setItems((prev) => prev.concat(batch));
    }
    setProgress({ ...pendingProgress.current });
  }, []);

  const scheduleFlush = useCallback(() => {
    if (!flushTimer.current) {
      flushTimer.current = setTimeout(flushPending, 250);
    }
  }, [flushPending]);

  // Use live rows during/after a scan, otherwise fall back to cached
  const baseRows = rows.length > 0 || phase === "scanning" || phase === "done" ? rows : cachedRows;
  // Apply user edits (inline corrections + deletions) on top of base rows
  const displayRows = useMemo(() => {
    return baseRows
      .filter((r) => userEdits[r.key] !== "__deleted__")
      .map((r) => {
        const edit = userEdits[r.key];
        if (!edit || edit === "__deleted__") return r;
        return { ...r, ...edit };
      });
  }, [baseRows, userEdits]);

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;

  // ── Stable edit / delete handlers (prevents ResultsTable re-renders) ──
  const handleEdit = useCallback(
    (key: string, updates: Partial<Pick<AppRow, "company" | "role" | "status">>) => {
      setUserEdits((prev) => {
        const next = { ...prev, [key]: { ...(prev[key] === "__deleted__" ? {} : prev[key] ?? {}), ...updates } };
        saveEdits(next);
        return next;
      });
    },
    []
  );

  const handleDelete = useCallback((key: string) => {
    setUserEdits((prev) => {
      const next = { ...prev, [key]: "__deleted__" as const };
      saveEdits(next);
      return next;
    });
  }, []);

  // ──────────────────────────────────────────────────────────
  // Restore cached results on mount
  // ──────────────────────────────────────────────────────────

  useEffect(() => {
    const stored = loadResults();
    if (stored) {
      setCachedRows(stored.rows);
      setCachedMeta({ scannedAt: stored.scannedAt, daysBack: stored.daysBack, emailCount: stored.emailCount });
    }
    const edits = loadEdits();
    if (edits) setUserEdits(edits);
  }, []);

  // ──────────────────────────────────────────────────────────
  // Save results when scan completes
  // ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase === "done" && rows.length > 0) {
      saveResults(rows, days, items.length);
      setCachedMeta({ scannedAt: new Date().toISOString(), daysBack: days, emailCount: items.length });
      setCachedRows(rows);
    }
  }, [phase, rows, days, items.length]);

  // ──────────────────────────────────────────────────────────
  // Auth
  // ──────────────────────────────────────────────────────────

  const requestToken = useCallback((): Promise<string> => {
    return new Promise((resolve, reject) => {
      // @ts-ignore
      const google = window.google;
      if (!google?.accounts?.oauth2) {
        reject(new Error("Google OAuth not loaded yet. Refresh and try again."));
        return;
      }

      // @ts-ignore
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/gmail.readonly",
        callback: (resp: any) => {
          if (resp?.error) {
            reject(new Error(resp.error_description || resp.error));
            return;
          }
          if (resp?.access_token) {
            const expiresInMs = (resp.expires_in ?? 3600) * 1000;
            tokenExpiresAt.current = Date.now() + expiresInMs - 60_000;
            setAccessToken(resp.access_token);
            resolve(resp.access_token);
          } else {
            reject(new Error("No access token returned."));
          }
        },
      });

      tokenClient.requestAccessToken({ prompt: "" });
    });
  }, [clientId]);

  const getValidToken = useCallback(async (): Promise<string> => {
    if (accessToken && Date.now() < tokenExpiresAt.current) {
      return accessToken;
    }
    return requestToken();
  }, [accessToken, requestToken]);

  // ──────────────────────────────────────────────────────────
  // Scan — streams results live as each email completes
  // ──────────────────────────────────────────────────────────

  async function runScan() {
    setError(null);
    setItems([]);
    setPhase("scanning");
    setProgress({ done: 0, total: 0 });
    setSkippedCount(0);

    // Reset buffer
    pendingItems.current = [];
    pendingProgress.current = { done: 0, total: 0 };
    if (flushTimer.current) { clearTimeout(flushTimer.current); flushTimer.current = null; }

    try {
      let token = await getValidToken();
      const run = await createRun();

      const q = buildJobEmailQuery(days);
      let pageToken: string | undefined = undefined;
      const ids: string[] = [];

      while (true) {
        try {
          const page = await listMessageIds(token, q, 100, pageToken);
          const batch = page.messages?.map((m) => m.id) ?? [];
          for (const id of batch) {
            ids.push(id);
            if (ids.length >= maxEmails) break;
          }
          if (ids.length >= maxEmails) break;
          if (!page.nextPageToken) break;
          pageToken = page.nextPageToken;
        } catch (err) {
          if (err instanceof GmailAuthError) {
            token = await requestToken();
            continue;
          }
          throw err;
        }
      }

      setProgress({ done: 0, total: ids.length });

      let skipped = 0;
      let currentToken = token;

      async function processOneEmail(id: string): Promise<ParsedItem> {
        if (Date.now() >= tokenExpiresAt.current) {
          try { currentToken = await requestToken(); } catch { /* try anyway */ }
        }

        const msg = await getMessage(currentToken, id);
        const payload = msg.payload;
        const subject = getHeader(payload, "Subject") || "";
        const from = getHeader(payload, "From") || "";
        const { text, isHtml } = extractPlainText(payload);
        const emailText = isHtml ? htmlToText(text) : text;

        const res = await parseEmail(run.runToken, {
          messageId: msg.id,
          from,
          subject,
          emailContent: emailText,
        });

        return { parsed: res, subject, from, internalDate: msg.internalDate };
      }

      const RETRY_DELAYS = [2000, 5000];

      await mapWithConcurrency(
        ids,
        concurrency,
        async (id) => {
          let lastErr: any = null;

          for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
            try {
              return await processOneEmail(id);
            } catch (err: any) {
              lastErr = err;

              if (err instanceof GmailAuthError) {
                try { currentToken = await requestToken(); } catch { /* fall through */ }
                continue;
              }

              const isRetryable = err?.message?.includes("429")
                || err?.message?.includes("RATE_LIMIT")
                || err?.message?.includes("500")
                || err?.message?.includes("502")
                || err?.message?.includes("503")
                || err?.message?.includes("GEMINI")
                || err?.message?.includes("timeout");

              if (isRetryable && attempt < RETRY_DELAYS.length) {
                await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
                continue;
              }

              break;
            }
          }

          skipped++;
          setSkippedCount(skipped);
          console.warn(`Skipped email ${id} after retries:`, lastErr?.message);
          return null;
        },
        (done, total) => {
          pendingProgress.current = { done, total };
          scheduleFlush();
        },
        // ⚡ Buffer results and flush in batches (~250ms) instead of per-email
        (result) => {
          if (result !== null) {
            pendingItems.current.push(result as ParsedItem);
            scheduleFlush();
          }
        }
      );

      // Flush any remaining buffered items
      if (flushTimer.current) { clearTimeout(flushTimer.current); flushTimer.current = null; }
      flushPending();

      setPhase("done");
    } catch (e: any) {
      if (e instanceof GmailAuthError) {
        setAccessToken(null);
        tokenExpiresAt.current = 0;
        setError("Gmail session expired. Please reconnect your account.");
      } else {
        setError(e?.message ?? "Something went wrong");
      }
      setPhase("error");
    }
  }

  // ──────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────

  if (!accessToken) {
    return (
      <main className="min-h-screen">
        <HeroConnect
          onConnect={async () => {
            try {
              await requestToken();
            } catch (err: any) {
              setError(err?.message ?? "Failed to connect Gmail.");
            }
          }}
          error={error}
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      {/* Top bar */}
      <header className="sticky top-0 z-50 border-b border-zinc-800/40 bg-zinc-950 supports-[backdrop-filter]:bg-zinc-950/95">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-lime-500/10 border border-lime-500/20 flex items-center justify-center">
              <span className="text-lime-400 text-sm font-bold">W</span>
            </div>
            <span className="font-semibold text-sm text-zinc-200">WhereDidIApply</span>
          </div>
          <div className="flex items-center gap-4">
            {cachedMeta && (
              <span className="text-[11px] text-zinc-600 hidden sm:inline">
                Last scan: {formatScannedAt(cachedMeta.scannedAt)} · {cachedMeta.emailCount} emails · {cachedMeta.daysBack}d
              </span>
            )}
            <button
              onClick={() => {
                setAccessToken(null);
                tokenExpiresAt.current = 0;
                setItems([]);
                setPhase("idle");
                setError(null);
              }}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Disconnect
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Scan controls */}
        <ScanControls
          phase={phase}
          progress={progress}
          skippedCount={skippedCount}
          error={error}
          days={days}
          maxEmails={maxEmails}
          concurrency={concurrency}
          onDaysChange={setDays}
          onMaxEmailsChange={setMaxEmails}
          onConcurrencyChange={setConcurrency}
          onScan={runScan}
        />

        {/* Stats bar */}
        {displayRows.length > 0 && <StatsBar rows={displayRows} />}

        {/* Results table — visible during scanning (live) and after */}
        {displayRows.length > 0 && (
          <ResultsTable
            rows={displayRows}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        )}

        {/* Empty state */}
        {phase === "done" && displayRows.length === 0 && (
          <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-12 text-center space-y-3">
            <p className="text-zinc-400 text-lg">No job application emails found</p>
            <p className="text-zinc-600 text-sm">
              Try increasing the time range or check that you have application emails in Gmail.
            </p>
          </div>
        )}

        {/* Cached results banner (when showing old data before a new scan) */}
        {phase === "idle" && cachedRows.length > 0 && rows.length === 0 && cachedMeta && (
          <div className="flex items-center justify-between rounded-lg border border-zinc-800/40 bg-zinc-900/20 px-4 py-2.5">
            <p className="text-xs text-zinc-500">
              Showing cached results from {formatScannedAt(cachedMeta.scannedAt)}
            </p>
            <button
              onClick={() => {
                clearResults();
                setCachedRows([]);
                setCachedMeta(null);
                setUserEdits({});
              }}
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Clear cache
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-zinc-800/40 mt-12">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between text-xs text-zinc-600">
          <span>WhereDidIApply — Your emails stay in your browser</span>
          <span>Built with Next.js & Gemini</span>
        </div>
      </footer>
    </main>
  );
}