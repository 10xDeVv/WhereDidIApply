import Papa from "papaparse";
import type { AppRow } from "./merge";

export function downloadCsv(rows: AppRow[], filename = "where-did-i-apply.csv") {
    const data = rows.map((r) => ({
        Company: r.company,
        Role: r.role,
        Status: r.status,
        LastSeen: r.lastSeenDate ?? "",
        Link: r.bestLink ?? "",
        Sources: r.sources.join(" | "),
    }));

    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);
}
