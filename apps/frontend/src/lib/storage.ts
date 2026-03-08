import type { AppRow } from "./merge";

const STORAGE_KEY = "wdia_results";
const STORAGE_META_KEY = "wdia_meta";
const STORAGE_EDITS_KEY = "wdia_edits";

type StoredData = {
    rows: AppRow[];
    scannedAt: string;   // ISO date string
    daysBack: number;
    emailCount: number;
};

export function saveResults(
    rows: AppRow[],
    daysBack: number,
    emailCount: number
): void {
    try {
        const data: StoredData = {
            rows,
            scannedAt: new Date().toISOString(),
            daysBack,
            emailCount,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn("Failed to save results to localStorage:", e);
    }
}

export function loadResults(): StoredData | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const data: StoredData = JSON.parse(raw);
        // Basic validation
        if (!Array.isArray(data.rows) || !data.scannedAt) return null;
        return data;
    } catch {
        return null;
    }
}

export function clearResults(): void {
    try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_META_KEY);
        localStorage.removeItem(STORAGE_EDITS_KEY);
    } catch {
        // ignore
    }
}


type EditsMap = Record<string, Partial<AppRow> | "__deleted__">;

export function saveEdits(edits: EditsMap): void {
    try {
        localStorage.setItem(STORAGE_EDITS_KEY, JSON.stringify(edits));
    } catch {
        // ignore
    }
}

export function loadEdits(): EditsMap | null {
    try {
        const raw = localStorage.getItem(STORAGE_EDITS_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

/**
 * Format "2026-03-04T10:30:00.000Z" → "Mar 4, 2026 at 10:30 AM"
 */
export function formatScannedAt(iso: string): string {
    try {
        const d = new Date(iso);
        return d.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        }) + " at " + d.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
        });
    } catch {
        return iso;
    }
}
