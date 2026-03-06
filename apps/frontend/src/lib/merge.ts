import type { ParseEmailResponse } from "./proxy";

export type AppRow = {
    key: string;
    company: string;
    role: string;
    status: string;
    lastSeenDate: string | null;
    bestLink: string | null;
    sources: string[];
};

const STATUS_PRIORITY: Record<string, number> = {
    OFFER: 100,
    INTERVIEW: 90,
    OA: 80,
    IN_REVIEW: 70,
    APPLIED: 60,
    ACTION_REQUIRED: 50,
    REJECTED: 10,
    UNKNOWN: 0,
};

/**
 * Normalize a company name for dedup key generation.
 * Strips common suffixes, punctuation, and normalizes whitespace/case.
 */
function normCompany(s: string | null | undefined): string {
    if (!s) return "";
    let n = s.trim().toLowerCase();
    // Strip common corporate suffixes
    n = n.replace(/[,.]?\s*\b(inc\.?|llc\.?|ltd\.?|limited|corp\.?|corporation|co\.?|company|plc|group|gmbh|sa|ag)\b\.?/gi, "");
    // Strip punctuation and normalize whitespace
    n = n.replace(/[.,'"()]/g, "").replace(/\s+/g, " ").trim();
    return n;
}

function norm(s: string | null | undefined): string {
    return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function pickBestStatus(a: string, b: string): string {
    const pa = STATUS_PRIORITY[a] ?? 0;
    const pb = STATUS_PRIORITY[b] ?? 0;
    return pb > pa ? b : a;
}

export function mergeResults(results: {
    parsed: ParseEmailResponse;
    subject: string;
    from: string;
    internalDate?: string;
}[]): AppRow[] {
    const map = new Map<string, AppRow>();

    for (const r of results) {
        const ex = r.parsed.extracted;

        // Skip marketing/OTHER results entirely — they're noise
        if (r.parsed.classification === "MARKETING" || r.parsed.classification === "OTHER") {
            continue;
        }

        const company = ex.company || "(unknown company)";
        const role = ex.role || "(unknown role)";
        const status = ex.status || "UNKNOWN";

        // Use normalized company + role for dedup key
        const key = `${normCompany(company)}__${norm(role)}`;

        const link = ex.links?.[0]?.url ?? null;
        const date = r.internalDate ? new Date(Number(r.internalDate)).toISOString().slice(0, 10) : null;

        const row = map.get(key);
        if (!row) {
            map.set(key, {
                key,
                company,
                role,
                status,
                lastSeenDate: date,
                bestLink: link,
                sources: [r.from],
            });
            continue;
        }

        row.status = pickBestStatus(row.status, status);

        // Keep the "best" company name (longest, most complete version)
        if (company.length > row.company.length && company !== "(unknown company)") {
            row.company = company;
        }

        // keep newest date
        if (!row.lastSeenDate || (date && date > row.lastSeenDate)) row.lastSeenDate = date;

        // keep a link if missing
        if (!row.bestLink && link) row.bestLink = link;

        // add source
        if (!row.sources.includes(r.from)) row.sources.push(r.from);
    }

    return Array.from(map.values()).sort((a, b) => (b.lastSeenDate || "").localeCompare(a.lastSeenDate || ""));
}
