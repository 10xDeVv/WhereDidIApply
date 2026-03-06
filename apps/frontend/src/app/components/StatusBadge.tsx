"use client";

import React from "react";

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  OFFER:           { label: "Offer",           bg: "bg-emerald-500/15", text: "text-emerald-400", dot: "bg-emerald-400" },
  INTERVIEW:       { label: "Interview",       bg: "bg-blue-500/15",    text: "text-blue-400",    dot: "bg-blue-400" },
  OA:              { label: "Assessment",      bg: "bg-violet-500/15",  text: "text-violet-400",  dot: "bg-violet-400" },
  IN_REVIEW:       { label: "In Review",       bg: "bg-amber-500/15",   text: "text-amber-400",   dot: "bg-amber-400" },
  APPLIED:         { label: "Applied",         bg: "bg-sky-500/15",     text: "text-sky-400",     dot: "bg-sky-400" },
  ACTION_REQUIRED: { label: "Action Needed",   bg: "bg-orange-500/15",  text: "text-orange-400",  dot: "bg-orange-400" },
  REJECTED:        { label: "Rejected",        bg: "bg-red-500/15",     text: "text-red-400",     dot: "bg-red-400" },
  UNKNOWN:         { label: "Unknown",         bg: "bg-zinc-500/15",    text: "text-zinc-400",    dot: "bg-zinc-500" },
};

const StatusBadge = React.memo(function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.UNKNOWN;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cfg.bg} ${cfg.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
});

export default StatusBadge;
export { STATUS_CONFIG };
