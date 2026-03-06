export type CreateRunResponse = {
    runId: string;
    runToken: string;
    expiresAt: string;
    limits: Record<string, any>;
};

export type ParseEmailResponse = {
    messageId: string;
    classification: string;
    confidence: number;
    extracted: {
        company: string | null;
        role: string | null;
        location: string | null;
        status: string | null;
        eventDate: string | null;
        links: { type: string | null; url: string }[];
    };
    signals: Record<string, any>;
};

const BASE = process.env.NEXT_PUBLIC_PROXY_BASE_URL!;

export async function createRun(): Promise<CreateRunResponse> {
    const res = await fetch(`${BASE}/api/runs`, { method: "POST" });
    if (!res.ok) throw new Error(`createRun failed: ${res.status} ${await res.text()}`);
    return res.json();
}

export async function parseEmail(runToken: string, payload: any): Promise<ParseEmailResponse> {
    const res = await fetch(`${BASE}/api/parse-email`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${runToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(`parseEmail failed: ${res.status} ${await res.text()}`);
    return res.json();
}
