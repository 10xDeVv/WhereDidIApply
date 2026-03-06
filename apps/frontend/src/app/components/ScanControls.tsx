"use client";

import React from "react";
import { Play, Loader2, AlertCircle } from "lucide-react";

type Phase = "idle" | "scanning" | "done" | "error";

const ScanControls = React.memo(function ScanControls({
  phase,
  progress,
  skippedCount,
  error,
  days,
  maxEmails,
  concurrency,
  onDaysChange,
  onMaxEmailsChange,
  onConcurrencyChange,
  onScan,
}: {
  phase: Phase;
  progress: { done: number; total: number };
  skippedCount: number;
  error: string | null;
  days: number;
  maxEmails: number;
  concurrency: number;
  onDaysChange: (v: number) => void;
  onMaxEmailsChange: (v: number) => void;
  onConcurrencyChange: (v: number) => void;
  onScan: () => void;
}) {
  const isScanning = phase === "scanning";
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-5 space-y-4">
      {/* Controls row */}
      <div className="flex flex-wrap items-end gap-4">
        {/* Days */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-400">Time range</label>
          <select
            value={days}
            onChange={(e) => onDaysChange(Number(e.target.value))}
            disabled={isScanning}
            className="block rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-600 disabled:opacity-50"
          >
            {[30, 60, 90, 180, 365].map((d) => (
              <option key={d} value={d}>
                Last {d} days
              </option>
            ))}
          </select>
        </div>

        {/* Max emails */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-400">Max emails</label>
          <select
            value={maxEmails}
            onChange={(e) => onMaxEmailsChange(Number(e.target.value))}
            disabled={isScanning}
            className="block rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-600 disabled:opacity-50"
          >
            {[100, 250, 500, 1000].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        {/* Concurrency */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-400">Concurrency</label>
          <select
            value={concurrency}
            onChange={(e) => onConcurrencyChange(Number(e.target.value))}
            disabled={isScanning}
            className="block rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-600 disabled:opacity-50"
          >
            {[1, 2, 4, 8].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        {/* Scan button */}
        <button
          onClick={onScan}
          disabled={isScanning}
          className="inline-flex items-center gap-2 rounded-lg bg-lime-500 hover:bg-lime-400 disabled:opacity-60 disabled:cursor-not-allowed text-zinc-900 font-semibold px-5 py-2 text-sm transition-colors"
        >
          {isScanning ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Scanning…
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Scan Emails
            </>
          )}
        </button>
      </div>

      {/* Progress bar */}
      {isScanning && progress.total > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>
              Processing {progress.done} / {progress.total} emails
              {skippedCount > 0 && (
                <span className="text-amber-400 ml-2">({skippedCount} skipped)</span>
              )}
            </span>
            <span className="tabular-nums">{pct}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-lime-500 transition-all duration-300 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2.5 rounded-lg border border-red-900/40 bg-red-950/20 px-4 py-3 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Done message */}
      {phase === "done" && (
        <p className="text-xs text-zinc-500">
          Scan complete — {progress.done} emails processed
          {skippedCount > 0 && <span className="text-amber-400"> ({skippedCount} skipped)</span>}
        </p>
      )}
    </div>
  );
});

export default ScanControls;
