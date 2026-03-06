"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  Search, ArrowUpDown, ExternalLink, Download,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ChevronDown, Pencil, Trash2, X, Check, Mail,
} from "lucide-react";
import type { AppRow } from "@/lib/merge";
import StatusBadge from "./StatusBadge";
import { downloadCsv } from "@/lib/csv";

const ALL_STATUSES = ["APPLIED", "IN_REVIEW", "OA", "INTERVIEW", "OFFER", "ACTION_REQUIRED", "REJECTED", "UNKNOWN"];
const STATUS_LABELS: Record<string, string> = {
  APPLIED: "Applied",
  IN_REVIEW: "In Review",
  OA: "Assessment",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  ACTION_REQUIRED: "Action Needed",
  REJECTED: "Rejected",
  UNKNOWN: "Unknown",
};

type SortField = "company" | "role" | "status" | "lastSeenDate";
type SortDir = "asc" | "desc";
const PAGE_SIZE_OPTIONS = [25, 50, 100];

const ResultsTable = React.memo(function ResultsTable({
  rows,
  onEdit,
  onDelete,
}: {
  rows: AppRow[];
  onEdit?: (key: string, updates: Partial<Pick<AppRow, "company" | "role" | "status">>) => void;
  onDelete?: (key: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeStatus, setActiveStatus] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("lastSeenDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);

  // Edit form state
  const [editCompany, setEditCompany] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editStatus, setEditStatus] = useState("");

  // Derive which status filters to show
  const availableStatuses = useMemo(() => {
    const present = new Set(rows.map((r) => r.status));
    return ALL_STATUSES.filter((s) => present.has(s));
  }, [rows]);

  // Filter
  const filtered = useMemo(() => {
    let result = rows;
    if (activeStatus) {
      result = result.filter((r) => r.status === activeStatus);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (r) =>
          r.company.toLowerCase().includes(q) ||
          r.role.toLowerCase().includes(q) ||
          r.status.toLowerCase().includes(q)
      );
    }
    return result;
  }, [rows, activeStatus, query]);

  // Sort
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortField] ?? "";
      const bv = b[sortField] ?? "";
      const cmp = String(av).localeCompare(String(bv));
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [filtered, sortField, sortDir]);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [query, activeStatus, sortField, sortDir, pageSize]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pageEnd = pageStart + pageSize;
  const paged = sorted.slice(pageStart, pageEnd);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "lastSeenDate" ? "desc" : "asc");
    }
  }

  function startEdit(row: AppRow) {
    setEditingKey(row.key);
    setExpandedKey(row.key);
    setEditCompany(row.company);
    setEditRole(row.role);
    setEditStatus(row.status);
  }

  function cancelEdit() {
    setEditingKey(null);
  }

  function saveEdit() {
    if (editingKey && onEdit) {
      onEdit(editingKey, {
        company: editCompany.trim(),
        role: editRole.trim(),
        status: editStatus,
      });
    }
    setEditingKey(null);
  }

  function handleDelete(key: string) {
    onDelete?.(key);
    if (expandedKey === key) setExpandedKey(null);
    if (editingKey === key) setEditingKey(null);
  }

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <th
      className="text-left py-3 px-4 cursor-pointer select-none group"
      onClick={() => toggleSort(field)}
    >
      <span className="inline-flex items-center gap-1 text-zinc-400 group-hover:text-zinc-200 transition-colors">
        {children}
        <ArrowUpDown className={`h-3 w-3 ${sortField === field ? "text-lime-400" : "opacity-0 group-hover:opacity-40"} transition-all`} />
      </span>
    </th>
  );

  return (
    <div className="space-y-4">
      {/* Header: title + search + export */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold">Applications</h2>
          <span className="text-sm text-zinc-500 bg-zinc-800/60 rounded-full px-2.5 py-0.5">
            {filtered.length}{filtered.length !== rows.length ? ` / ${rows.length}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search company or role..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-64 rounded-lg bg-zinc-900/80 border border-zinc-800 pl-9 pr-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 transition-all"
            />
          </div>
          <button
            onClick={() => downloadCsv(rows)}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3.5 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
        </div>
      </div>

      {/* Status filter pills */}
      {availableStatuses.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveStatus(null)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
              !activeStatus
                ? "bg-zinc-100 text-zinc-900"
                : "bg-zinc-800/60 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300"
            }`}
          >
            All
          </button>
          {availableStatuses.map((s) => {
            const count = rows.filter((r) => r.status === s).length;
            return (
              <button
                key={s}
                onClick={() => setActiveStatus(activeStatus === s ? null : s)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                  activeStatus === s
                    ? "bg-zinc-100 text-zinc-900"
                    : "bg-zinc-800/60 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300"
                }`}
              >
                {STATUS_LABELS[s] ?? s} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-zinc-800/60 bg-zinc-900/30" style={{ contain: "content" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800/60">
              {/* Expand column */}
              <th className="w-8 py-3 px-2" />
              <SortHeader field="company">Company</SortHeader>
              <SortHeader field="role">Role</SortHeader>
              <SortHeader field="status">Status</SortHeader>
              <SortHeader field="lastSeenDate">Last Seen</SortHeader>
              <th className="text-left py-3 px-4 text-zinc-400">Link</th>
              {/* Actions column */}
              <th className="w-20 py-3 px-2" />
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-zinc-500">
                  {query || activeStatus ? "No applications match your filters." : "No applications found."}
                </td>
              </tr>
            )}
            {paged.map((r) => {
              const isExpanded = expandedKey === r.key;
              const isEditing = editingKey === r.key;

              return (
                <React.Fragment key={r.key}>
                  {/* Main row */}
                  <tr
                    className={`group/row border-b border-zinc-800/30 transition-colors cursor-pointer ${
                      isExpanded ? "bg-zinc-800/20" : "hover:bg-zinc-800/10"
                    }`}
                    onClick={() => {
                      if (!isEditing) setExpandedKey(isExpanded ? null : r.key);
                    }}
                  >
                    {/* Chevron */}
                    <td className="py-3 px-2 text-center">
                      <ChevronDown
                        className={`h-3.5 w-3.5 text-zinc-600 transition-transform duration-200 inline-block ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                      />
                    </td>
                    <td className="py-3 px-4 font-medium text-zinc-200">{r.company}</td>
                    <td className="py-3 px-4 text-zinc-300 max-w-[280px] truncate">{r.role}</td>
                    <td className="py-3 px-4">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="py-3 px-4 text-zinc-400 tabular-nums">
                      {r.lastSeenDate ? formatDate(r.lastSeenDate) : "—"}
                    </td>
                    <td className="py-3 px-4">
                      {r.bestLink ? (
                        <a
                          className="inline-flex items-center gap-1 text-lime-400 hover:text-lime-300 transition-colors"
                          href={r.bestLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span className="text-xs">Open</span>
                        </a>
                      ) : (
                        <span className="text-zinc-700">—</span>
                      )}
                    </td>
                    {/* Action buttons */}
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); startEdit(r); }}
                          className="h-7 w-7 flex items-center justify-center rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(r.key); }}
                          className="h-7 w-7 flex items-center justify-center rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded detail / edit panel */}
                  {isExpanded && (
                    <tr className="bg-zinc-800/10">
                      <td colSpan={7} className="px-6 py-4">
                        {isEditing ? (
                          /* ── Edit form ── */
                          <div className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-zinc-400">Company</label>
                                <input
                                  type="text"
                                  value={editCompany}
                                  onChange={(e) => setEditCompany(e.target.value)}
                                  className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-lime-500/50 focus:ring-1 focus:ring-lime-500/30"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-zinc-400">Role</label>
                                <input
                                  type="text"
                                  value={editRole}
                                  onChange={(e) => setEditRole(e.target.value)}
                                  className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-lime-500/50 focus:ring-1 focus:ring-lime-500/30"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-zinc-400">Status</label>
                                <select
                                  value={editStatus}
                                  onChange={(e) => setEditStatus(e.target.value)}
                                  className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-lime-500/50"
                                >
                                  {ALL_STATUSES.map((s) => (
                                    <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={saveEdit}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-lime-500 text-zinc-900 px-3 py-1.5 text-xs font-medium hover:bg-lime-400 transition-colors"
                              >
                                <Check className="h-3.5 w-3.5" />
                                Save
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-800 text-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-700 transition-colors"
                              >
                                <X className="h-3.5 w-3.5" />
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* ── Detail view ── */
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Left: info */}
                            <div className="space-y-3">
                              <DetailField label="Company" value={r.company} />
                              <DetailField label="Role" value={r.role} />
                              <DetailField label="Status">
                                <StatusBadge status={r.status} />
                              </DetailField>
                              <DetailField label="Last Seen" value={r.lastSeenDate ? formatDate(r.lastSeenDate) : "—"} />
                              {r.bestLink && (
                                <DetailField label="Link">
                                  <a
                                    href={r.bestLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-lime-400 hover:text-lime-300 break-all"
                                  >
                                    {r.bestLink}
                                  </a>
                                </DetailField>
                              )}
                            </div>
                            {/* Right: sources */}
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                                <Mail className="h-3.5 w-3.5" />
                                Email sources ({r.sources.length})
                              </p>
                              <div className="space-y-1 max-h-32 overflow-y-auto">
                                {r.sources.map((src, i) => (
                                  <p key={i} className="text-xs text-zinc-500 truncate" title={src}>
                                    {src}
                                  </p>
                                ))}
                              </div>
                              {/* Quick actions */}
                              <div className="flex gap-2 pt-2">
                                <button
                                  onClick={() => startEdit(r)}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-800 transition-colors"
                                >
                                  <Pencil className="h-3 w-3" />
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDelete(r.key)}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-900/40 bg-red-950/20 text-red-400 px-3 py-1.5 text-xs font-medium hover:bg-red-950/40 transition-colors"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  Remove
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>

        {/* Pagination footer */}
        {sorted.length > PAGE_SIZE_OPTIONS[0] && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-zinc-800/60 px-4 py-3">
            <p className="text-xs text-zinc-500">
              Showing{" "}
              <span className="text-zinc-300 font-medium">{pageStart + 1}</span>
              –
              <span className="text-zinc-300 font-medium">{Math.min(pageEnd, sorted.length)}</span>
              {" "}of{" "}
              <span className="text-zinc-300 font-medium">{sorted.length}</span>
            </p>
            <div className="flex items-center gap-1">
              <PaginationBtn onClick={() => setPage(1)} disabled={safePage <= 1} aria-label="First page">
                <ChevronsLeft className="h-3.5 w-3.5" />
              </PaginationBtn>
              <PaginationBtn onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} aria-label="Previous page">
                <ChevronLeft className="h-3.5 w-3.5" />
              </PaginationBtn>
              {getPageNumbers(safePage, totalPages).map((p, i) =>
                p === "..." ? (
                  <span key={`dot-${i}`} className="px-1 text-zinc-600 text-xs select-none">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p as number)}
                    className={`h-8 min-w-[2rem] rounded-md px-2 text-xs font-medium transition-all ${
                      safePage === p
                        ? "bg-lime-500 text-zinc-900"
                        : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
              <PaginationBtn onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} aria-label="Next page">
                <ChevronRight className="h-3.5 w-3.5" />
              </PaginationBtn>
              <PaginationBtn onClick={() => setPage(totalPages)} disabled={safePage >= totalPages} aria-label="Last page">
                <ChevronsRight className="h-3.5 w-3.5" />
              </PaginationBtn>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">Per page</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="rounded-md bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 px-2 py-1.5 focus:outline-none focus:border-zinc-600"
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default ResultsTable;

// ── Helper components ──────────────────────────────────────

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-0.5">{label}</p>
      {children ?? <p className="text-sm text-zinc-200">{value || "—"}</p>}
    </div>
  );
}

function PaginationBtn({ children, disabled, onClick, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="h-8 w-8 flex items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      {...rest}
    >
      {children}
    </button>
  );
}

function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "...")[] = [];
  const addPage = (p: number) => { if (!pages.includes(p)) pages.push(p); };
  addPage(1);
  const windowStart = Math.max(2, current - 1);
  const windowEnd = Math.min(total - 1, current + 1);
  if (windowStart > 2) pages.push("...");
  for (let i = windowStart; i <= windowEnd; i++) addPage(i);
  if (windowEnd < total - 1) pages.push("...");
  addPage(total);
  return pages;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return iso; }
}
