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
import { motion, AnimatePresence, Variants } from "framer-motion";
import { MailSearch, Link2, ShieldCheck, Code2, Search, LayoutDashboard } from "lucide-react";

import ScanControls from "./components/ScanControls";
import StatsBar from "./components/StatsBar";
import ResultsTable from "./components/ResultsTable";

// Define Google OAuth types
interface GoogleOAuth2 {
    initTokenClient: (config: any) => any;
}
interface GoogleAccounts {
    oauth2?: GoogleOAuth2;
}
interface GoogleGlobal {
    accounts?: GoogleAccounts;
}

declare global {
    interface Window {
        google?: GoogleGlobal;
    }
}

type ParsedItem = {
    parsed: ParseEmailResponse;
    subject: string;
    from: string;
    internalDate?: string;
};


const fadeUp: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.5, ease: "easeInOut" },
    },
};

const staggerContainer: Variants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.12, delayChildren: 0.4 },
    },
};

const cardVariant: Variants = {
    hidden: { opacity: 0, y: 16 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.45, ease: "easeInOut" },
    },
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

    const [cachedMeta, setCachedMeta] = useState<{ scannedAt: string; daysBack: number; emailCount: number } | null>(null);
    const [cachedRows, setCachedRows] = useState<AppRow[]>([]);

    const [userEdits, setUserEdits] = useState<Record<string, Partial<AppRow> | "__deleted__">>({});

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

    const baseRows = rows.length > 0 || phase === "scanning" || phase === "done" ? rows : cachedRows;
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

    useEffect(() => {
        const stored = loadResults();
        if (stored) {
            setCachedRows(stored.rows);
            setCachedMeta({ scannedAt: stored.scannedAt, daysBack: stored.daysBack, emailCount: stored.emailCount });
        }
        const edits = loadEdits();
        if (edits) setUserEdits(edits);
    }, []);

    useEffect(() => {
        if (phase === "done" && rows.length > 0) {
            saveResults(rows, days, items.length);
            setCachedMeta({ scannedAt: new Date().toISOString(), daysBack: days, emailCount: items.length });
            setCachedRows(rows);
        }
    }, [phase, rows, days, items.length]);

    const requestToken = useCallback((): Promise<string> => {
        return new Promise((resolve, reject) => {
            // @ts-ignore
            const google = window.google as GoogleGlobal;
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

    async function runScan() {
        setError(null);
        setItems([]);
        setPhase("scanning");
        setProgress({ done: 0, total: 0 });
        setSkippedCount(0);

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
                (result) => {
                    if (result !== null) {
                        pendingItems.current.push(result as ParsedItem);
                        scheduleFlush();
                    }
                }
            );

            if (flushTimer.current) { clearTimeout(flushTimer.current); flushTimer.current = null; }
            flushPending();

            setPhase("done");
        } catch (e: any) {
            if (e instanceof GmailAuthError) {
                setAccessToken(null);
                tokenExpiresAt.current = 0;
                setError("Gmail session expired. Please reconnect.");
            } else {
                setError(e?.message ?? "Something went wrong");
            }
            setPhase("error");
        }
    }

    // Landing page

    if (!accessToken) {
        return (
            <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
                {/* Nav */}
                <motion.nav
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                    className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-5 sm:py-6 flex items-center justify-between"
                >
                    <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-lg bg-lime-500/10 border border-lime-500/20 flex items-center justify-center">
                            <MailSearch className="h-4 w-4 text-lime-400" />
                        </div>
                        <span className="font-medium text-[15px] text-zinc-300 tracking-tight">WhereDidIApply</span>
                    </div>
                    <div className="flex items-center gap-4 sm:gap-5">
                        <a
                            href="https://github.com/10xDeVv/WhereDidIApply"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[13px] text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                            GitHub
                        </a>
                        <a
                            href="https://github.com/10xDeVv/WhereDidIApply/blob/main/PRIVACY.md"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[13px] text-zinc-500 hover:text-zinc-300 transition-colors hidden sm:inline"
                        >
                            Privacy
                        </a>
                    </div>
                </motion.nav>

                {/* Hero */}
                <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 -mt-8 sm:-mt-16">
                    <div className="max-w-2xl w-full text-center space-y-7 sm:space-y-8">
                        {/* Badge */}
                        <motion.div
                            custom={0}
                            variants={fadeUp}
                            initial="hidden"
                            animate="visible"
                            className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3.5 py-1.5"
                        >
                            <span className="h-1.5 w-1.5 rounded-full bg-lime-500 animate-pulse" />
                            <span className="text-[12px] text-zinc-400 tracking-wide">Read-only Gmail access</span>
                        </motion.div>

                        {/* Headline */}
                        <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible" className="space-y-4">
                            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-zinc-50 leading-[1.1]">
                                Lost track of
                                <br />
                                <span className="text-zinc-500">how many you applied to?</span>
                            </h1>
                            <p className="text-[15px] sm:text-[16px] md:text-[17px] text-zinc-400 leading-relaxed max-w-lg mx-auto px-2">
                                WhereDidIApply connects to Gmail, finds job application emails, classifies them with
                                pattern matching and AI, and lays it all out in a sortable dashboard. No sign-up, no data stored.
                            </p>
                        </motion.div>

                        {/* CTA */}
                        <motion.div custom={2} variants={fadeUp} initial="hidden" animate="visible" className="space-y-4">
                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={async () => {
                                    try {
                                        await requestToken();
                                    } catch (err: any) {
                                        setError(err?.message ?? "Failed to connect Gmail.");
                                    }
                                }}
                                className="inline-flex items-center rounded-xl bg-lime-500 px-7 py-3.5 text-[15px] font-semibold text-zinc-950 transition-colors hover:bg-lime-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
                            >
                                Connect Gmail
                            </motion.button>

                            <AnimatePresence>
                                {error && (
                                    <motion.p
                                        initial={{ opacity: 0, y: 6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -6 }}
                                        className="text-[13px] text-red-400/90"
                                    >
                                        {error}
                                    </motion.p>
                                )}
                            </AnimatePresence>
                        </motion.div>

                        {/* Trust signals */}
                        <motion.div
                            custom={3}
                            variants={fadeUp}
                            initial="hidden"
                            animate="visible"
                            className="pt-2 sm:pt-4 flex flex-col sm:flex-row items-center justify-center gap-x-8 gap-y-2.5 sm:gap-y-3 text-[13px] text-zinc-600"
                        >
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" />
                Gmail token stays in the browser
              </span>
                            <span className="flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5" />
                Nothing stored server-side
              </span>
                            <span className="flex items-center gap-1.5">
                <Code2 className="h-3.5 w-3.5" />
                Fully open source
              </span>
                        </motion.div>
                    </div>
                </div>

                {/* How it works */}
                <motion.div
                    variants={staggerContainer}
                    initial="hidden"
                    animate="visible"
                    className="w-full max-w-3xl mx-auto px-4 sm:px-6 pb-16 sm:pb-20 pt-6 sm:pt-8"
                >
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                        {[
                            { step: "01", title: "Connect", desc: "Google OAuth. Read-only.", icon: Link2 },
                            { step: "02", title: "Scan", desc: "Regex + Gemini AI classify each email.", icon: Search },
                            { step: "03", title: "Track", desc: "Sortable. Editable. Exportable.", icon: LayoutDashboard },
                        ].map((card) => (
                            <motion.div
                                key={card.step}
                                variants={cardVariant}
                                whileHover={{ y: -2, transition: { duration: 0.2 } }}
                                className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-4 sm:p-5 space-y-2 cursor-default"
                            >
                                <div className="flex items-center gap-2.5">
                                    <card.icon className="h-3.5 w-3.5 text-zinc-600" />
                                    <span className="text-[12px] font-medium text-zinc-600">{card.step}</span>
                                </div>
                                <h3 className="text-[15px] font-semibold text-zinc-200">{card.title}</h3>
                                <p className="text-[13px] text-zinc-500 leading-relaxed">{card.desc}</p>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>

                {/* Footer */}
                <footer className="border-t border-zinc-800/40">
                    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between text-[12px] text-zinc-600">
                        <span>WhereDidIApply</span>
                        <div className="flex items-center gap-4">
                            <a
                                href="https://github.com/10xDeVv/WhereDidIApply/blob/main/PRIVACY.md"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-zinc-400 transition-colors"
                            >
                                Privacy
                            </a>
                            <a
                                href="https://github.com/10xDeVv/WhereDidIApply"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-zinc-400 transition-colors"
                            >
                                Source
                            </a>
                        </div>
                    </div>
                </footer>
            </main>
        );
    }

    // Dashboard

    return (
        <main className="min-h-screen">
            <header className="sticky top-0 z-50 border-b border-zinc-800/40 bg-zinc-950 supports-[backdrop-filter]:bg-zinc-950/95">
                <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 py-3">
                    <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-lg bg-lime-500/10 border border-lime-500/20 flex items-center justify-center">
                            <MailSearch className="h-3.5 w-3.5 text-lime-400" />
                        </div>
                        <span className="font-medium text-sm text-zinc-200 tracking-tight">WhereDidIApply</span>
                    </div>
                    <div className="flex items-center gap-3 sm:gap-4">
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

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6"
            >
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

                {displayRows.length > 0 && <StatsBar rows={displayRows} />}

                <AnimatePresence>
                    {displayRows.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3 }}
                        >
                            <ResultsTable
                                rows={displayRows}
                                onEdit={handleEdit}
                                onDelete={handleDelete}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>

                <AnimatePresence>
                    {phase === "done" && displayRows.length === 0 && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.98 }}
                            className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-8 sm:p-12 text-center space-y-3"
                        >
                            <p className="text-zinc-400 text-base sm:text-lg">No job application emails found</p>
                            <p className="text-zinc-600 text-sm">
                                Try increasing the time range or check that there are application emails in Gmail.
                            </p>
                        </motion.div>
                    )}
                </AnimatePresence>

                {phase === "idle" && cachedRows.length > 0 && rows.length === 0 && cachedMeta && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 rounded-lg border border-zinc-800/40 bg-zinc-900/20 px-4 py-2.5"
                    >
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
                    </motion.div>
                )}
            </motion.div>

            <footer className="border-t border-zinc-800/40 mt-12">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between text-[12px] text-zinc-600">
                    <span>WhereDidIApply</span>
                    <div className="flex items-center gap-4">
                        <a
                            href="https://github.com/10xDeVv/WhereDidIApply/blob/main/PRIVACY.md"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-zinc-400 transition-colors"
                        >
                            Privacy
                        </a>
                        <a
                            href="https://github.com/10xDeVv/WhereDidIApply"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-zinc-400 transition-colors"
                        >
                            Source
                        </a>
                    </div>
                </div>
            </footer>
        </main>
    );
}