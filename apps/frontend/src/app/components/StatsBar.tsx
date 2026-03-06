"use client";

import React, { useMemo } from "react";
import type { AppRow } from "@/lib/merge";

const STAT_CONFIG: { key: string; label: string; color: string }[] = [
  { key: "OFFER",           label: "Offers",       color: "text-emerald-400" },
  { key: "INTERVIEW",       label: "Interviews",   color: "text-blue-400" },
  { key: "OA",              label: "Assessments",  color: "text-violet-400" },
  { key: "IN_REVIEW",       label: "In Review",    color: "text-amber-400" },
  { key: "APPLIED",         label: "Applied",      color: "text-sky-400" },
  { key: "ACTION_REQUIRED", label: "Action Needed",color: "text-orange-400" },
  { key: "REJECTED",        label: "Rejected",     color: "text-red-400" },
];

const StatsBar = React.memo(function StatsBar({ rows }: { rows: AppRow[] }) {
  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of rows) {
      map[r.status] = (map[r.status] || 0) + 1;
    }
    return map;
  }, [rows]);

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-zinc-800/60 bg-zinc-900/30 px-5 py-3">
      {/* Total */}
      <div className="pr-4 border-r border-zinc-800">
        <p className="text-2xl font-bold text-zinc-100 tabular-nums">{rows.length}</p>
        <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Total</p>
      </div>

      {/* Per-status counts */}
      {STAT_CONFIG.map(({ key, label, color }) => {
        const count = counts[key];
        if (!count) return null;
        return (
          <div key={key} className="text-center min-w-[60px]">
            <p className={`text-lg font-semibold tabular-nums ${color}`}>{count}</p>
            <p className="text-[11px] text-zinc-500">{label}</p>
          </div>
        );
      })}
    </div>
  );
});

export default StatsBar;