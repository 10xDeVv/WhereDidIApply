export type GmailMessageList = {
    messages?: { id: string; threadId: string }[];
    nextPageToken?: string;
    resultSizeEstimate?: number;
};

export type GmailMessage = {
    id: string;
    threadId: string;
    internalDate?: string;
    payload?: any;
};

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

/**
 * Thrown when the Gmail API returns 401 — signals the access token is expired/invalid.
 */
export class GmailAuthError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "GmailAuthError";
    }
}

/**
 * Build a targeted Gmail search query that returns only job-application-related emails.
 * This is the single biggest accuracy improvement — reduces noise by 80-90%.
 * 
 * Gmail search has a practical query length limit (~1500 chars).
 * We stay within it by using the most distinctive phrases.
 */
export function buildJobEmailQuery(days: number): string {
    // Body/subject phrase signals — exact phrases in quotes for precision
    const phrases = [
        // ── Application confirmations ──
        '"your application"',
        '"thank you for applying"',
        '"thanks for applying"',
        '"thank you for your interest"',
        '"thanks for your interest"',
        '"application received"',
        '"application confirmation"',
        '"application status"',
        '"application for the"',
        '"we received your application"',
        '"successfully submitted"',
        '"successfully applied"',
        '"confirming your application"',
        // ── Review / status updates ──
        '"under review"',
        '"being reviewed"',
        '"reviewing your"',
        '"your candidacy"',
        '"regarding your application"',
        '"update on your application"',
        '"status of your application"',
        // ── Interview ──
        '"interview invitation"',
        '"interview scheduled"',
        '"phone screen"',
        '"phone interview"',
        '"technical interview"',
        '"virtual interview"',
        '"on-site interview"',
        '"schedule your interview"',
        '"next steps in"',
        '"move forward with your"',
        '"like to invite you"',
        '"advance to the next"',
        // ── Assessment / OA ──
        '"online assessment"',
        '"coding challenge"',
        '"coding test"',
        '"technical assessment"',
        '"hirevue"',
        '"hackerrank"',
        '"codesignal"',
        '"codility"',
        // ── Offer ──
        '"offer letter"',
        '"job offer"',
        '"offer of employment"',
        '"pleased to offer"',
        '"excited to offer"',
        // ── Rejection ──
        '"not moving forward"',
        '"after careful consideration"',
        '"we regret to"',
        '"not selected"',
        '"decided not to proceed"',
        '"position has been filled"',
        '"pursuing other candidates"',
        '"will not be moving"',
        // ── ATS platforms (these send from unique domains) ──
        '"workday"',
        '"greenhouse"',
        '"lever.co"',
        '"taleo"',
        '"icims"',
        '"smartrecruiters"',
    ].join(" OR ");

    // From-address signals (common recruiting sender patterns)
    const fromFilters = [
        "from:careers",
        "from:career",
        "from:recruiting",
        "from:recruitment",
        "from:talent",
        "from:hiring",
        "from:jobs",
        "from:hr@",
        "from:noreply@greenhouse",
        "from:noreply@lever",
        "from:no-reply@ashbyhq",
        "from:workday",
        "from:smartrecruiters",
        "from:icims",
        "from:taleo",
        "from:myworkday",
        "from:jobvite",
    ].join(" OR ");

    return `newer_than:${days}d (${phrases} OR ${fromFilters})`;
}

export async function listMessageIds(
    accessToken: string,
    query: string,
    maxResults = 100,
    pageToken?: string
): Promise<GmailMessageList> {
    const url = new URL(`${GMAIL_BASE}/messages`);
    url.searchParams.set("q", query);
    url.searchParams.set("maxResults", String(maxResults));
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
        const t = await res.text();
        if (res.status === 401) throw new GmailAuthError(`Gmail auth expired: ${t}`);
        throw new Error(`Gmail list failed: ${res.status} ${t}`);
    }
    return res.json();
}

export async function getMessage(
    accessToken: string,
    id: string
): Promise<GmailMessage> {
    const url = `${GMAIL_BASE}/messages/${id}?format=full`;
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
        const t = await res.text();
        if (res.status === 401) throw new GmailAuthError(`Gmail auth expired: ${t}`);
        throw new Error(`Gmail get failed: ${res.status} ${t}`);
    }
    return res.json();
}

export function getHeader(payload: any, name: string): string | null {
    const headers = payload?.headers || [];
    const h = headers.find((x: any) => (x.name || "").toLowerCase() === name.toLowerCase());
    return h?.value ?? null;
}

function base64UrlDecode(input: string): string {
    const pad = "=".repeat((4 - (input.length % 4)) % 4);
    const b64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

function findPart(payload: any, mimeType: string): any | null {
    if (!payload) return null;
    if (payload.mimeType === mimeType && payload.body?.data) return payload;
    const parts = payload.parts || [];
    for (const p of parts) {
        const found = findPart(p, mimeType);
        if (found) return found;
    }
    return null;
}

export function extractPlainText(payload: any): { text: string; isHtml: boolean } {
    const plain = findPart(payload, "text/plain");
    if (plain?.body?.data) return { text: base64UrlDecode(plain.body.data), isHtml: false };

    const html = findPart(payload, "text/html");
    if (html?.body?.data) return { text: base64UrlDecode(html.body.data), isHtml: true };

    // fallback: sometimes body is directly on payload
    if (payload?.body?.data) return { text: base64UrlDecode(payload.body.data), isHtml: payload.mimeType === "text/html" };

    return { text: "", isHtml: false };
}

export function htmlToText(html: string): string {
    // Try DOM-based conversion first (works in browser)
    if (typeof document !== "undefined") {
        const tmp = document.createElement("div");
        tmp.innerHTML = html;
        return (tmp.textContent || tmp.innerText || "").trim();
    }
    // Fallback: regex-based stripping
    return html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(?:p|div|tr|li|h[1-6])>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&#?\w+;/g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}
