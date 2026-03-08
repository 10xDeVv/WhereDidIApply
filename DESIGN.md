# WhereDidIApply — Design Documentation

> **Version:** 1.0  
> **Author:** Adebowale Adebayo  
> **Last Updated:** March 2026

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Request Lifecycle — One Email's Journey](#3-request-lifecycle--one-emails-journey)
4. [Email Filtering Funnel](#4-email-filtering-funnel)
5. [Classification Pipeline (Backend)](#5-classification-pipeline-backend)
6. [Security Model — Run Tokens](#6-security-model--run-tokens)
7. [Abuse Prevention Layers](#7-abuse-prevention-layers)
8. [Frontend Architecture & Data Flow](#8-frontend-architecture--data-flow)
9. [Gemini Integration & Resilience](#9-gemini-integration--resilience)
10. [Merge & Deduplication Logic](#10-merge--deduplication-logic)
11. [Observability & DevOps](#11-observability--devops)
12. [Project Structure](#12-project-structure)
13. [Technology Decisions & Trade-offs](#13-technology-decisions--trade-offs)

---

## 1. System Overview

WhereDidIApply scans a user's Gmail inbox, identifies job-application-related emails, classifies them (applied, interview, rejected, offer, etc.), and presents a searchable dashboard of every application.

**Core design principles:**

| Principle | Implementation |
|-----------|---------------|
| **Privacy-first** | Gmail access tokens never leave the browser. The backend only receives email text for parsing — no tokens, no storage. |
| **Cost-efficient AI** | A deterministic rules engine handles ~80% of emails without touching the LLM. Gemini is a fallback, not the default. |
| **Stateless backend** | No database. Run tokens are self-validating (HMAC-signed). Rate limits and quotas are in-memory per session. |
| **Resilient** | Retries with exponential backoff at every network boundary. Graceful degradation — if Gemini fails, rules still produce results. |

---

## 2. High-Level Architecture

```mermaid
graph TB
    subgraph Browser["Browser (Next.js)"]
        UI["React UI<br/>page.tsx"]
        GmailLib["Gmail Module<br/>gmail.ts"]
        ProxyLib["Proxy Client<br/>proxy.ts"]
        MergeLib["Merge Engine<br/>merge.ts"]
        StorageLib["Local Cache<br/>storage.ts"]
        ConcLib["Concurrency Pool<br/>concurrency.ts"]
    end

    subgraph Google["Google Cloud"]
        OAuth["Google OAuth 2.0"]
        GmailAPI["Gmail REST API"]
        GeminiAPI["Gemini 2.0 Flash API"]
    end

    subgraph Backend["Spring Boot Backend"]
        Controller["ParseEmailController"]
        TokenSvc["RunTokenService"]
        RateLimit["RateLimitService"]
        Quota["RunQuotaService"]
        Semaphore["RunConcurrencyLimiter"]
        Pipeline["EmailParsingService"]
        Rules["TextRules Engine"]
        Gemini["GeminiClient"]
        Prompt["PromptBuilder"]
    end

    UI -->|"1. OAuth consent"| OAuth
    OAuth -->|"2. Access token"| UI
    UI --> GmailLib
    GmailLib -->|"3. Search + fetch emails"| GmailAPI
    GmailAPI -->|"4. Email data"| GmailLib
    GmailLib --> ConcLib
    ConcLib --> ProxyLib
    ProxyLib -->|"5. POST /api/parse-email<br/>(email text only)"| Controller
    Controller --> TokenSvc
    Controller --> RateLimit
    Controller --> Quota
    Controller --> Semaphore
    Controller --> Pipeline
    Pipeline --> Rules
    Pipeline --> Gemini
    Gemini --> Prompt
    Gemini -->|"6. LLM call (if needed)"| GeminiAPI
    GeminiAPI -->|"7. Structured JSON"| Gemini
    Gemini -.->|"Circuit Breaker Open"| Pipeline
    Pipeline -->|"8. Classification result"| Controller
    Controller -->|"9. Response"| ProxyLib
    ProxyLib --> MergeLib
    MergeLib --> StorageLib
    MergeLib --> UI

    style Browser fill:#1a1a2e,stroke:#16213e,color:#eee
    style Backend fill:#0f3460,stroke:#16213e,color:#eee
    style Google fill:#533483,stroke:#16213e,color:#eee
```

**Data flow summary:**
- The **browser** holds the Gmail token and fetches emails directly — the backend never sees the token.
- The **backend** receives only email text (subject, from, body) and returns a classification.
- **Gemini** is called by the backend only when the rules engine isn't confident enough.

---

## 3. Request Lifecycle — One Email's Journey

```mermaid
sequenceDiagram
    participant U as User Browser
    participant G as Gmail API
    participant B as Backend
    participant R as Rules Engine
    participant LLM as Gemini API

    Note over U: User clicks "Scan Emails"

    U->>B: POST /api/runs
    B-->>U: { runId, runToken, expiresAt, limits }

    U->>G: GET /messages?q="your application" OR ...
    G-->>U: [messageId1, messageId2, ...]

    loop For each email (4 concurrent)
        U->>G: GET /messages/{id}?format=full
        G-->>U: { payload, headers, body }

        Note over U: Extract subject, from, body<br/>Decode base64url MIME parts<br/>Convert HTML → plain text

        U->>B: POST /api/parse-email<br/>Authorization: Bearer {runToken}<br/>{ messageId, subject, from, emailContent }

        Note over B: 1. Verify HMAC token<br/>2. Rate limit check<br/>3. Quota check<br/>4. Normalize + truncate

        alt Looks like marketing (≥2 signals)
            B-->>U: { classification: "MARKETING" }
        else Passes marketing filter
            B->>R: classify(subject, from, body)
            R-->>B: { classification, status, confidence }

            alt Rules ≥90% confident + has company & role
                B-->>U: { classification, extracted, engine: "rules" }
            else Needs LLM
                B->>LLM: generateContent(prompt + schema)
                LLM-->>B: { classification, company, role, ... }

                Note over B: Smart merge:<br/>rules + Gemini → best result

                B-->>U: { classification, extracted, engine: "gemini" }
            end
        end

        Note over U: Buffer result → flush every 250ms<br/>Merge into deduplicated rows
    end

    Note over U: Scan complete → save to localStorage
```

---

## 4. Email Filtering Funnel

Each stage eliminates emails before reaching the next, more expensive stage. This is the key cost optimization — only a fraction of emails ever reach the LLM.

```mermaid
graph TD
    A["📬 User's Gmail Inbox<br/><i>Thousands of emails</i>"] --> B

    B["🔍 Gmail Search Query<br/><i>~70 exact phrases + ATS domain filters</i><br/><code>newer_than:90d ('your application' OR 'interview invitation' OR ...)</code>"]
    B -->|"~300-500 emails"| C

    C["🛡️ Marketing Filter<br/><i>Controller-level, ≥2 marketing signals</i><br/><code>'view in browser' + 'unsubscribe' (no job keywords) → skip</code>"]
    C -->|"~250-400 emails"| D

    D["🎯 Job-Email Pre-filter<br/><i>TextRules.isLikelyJobEmail()</i><br/><code>Checks subject patterns, from-address, ATS domains, keyword count</code>"]
    D -->|"~150-300 emails"| E

    E["⚡ Rules Engine Classification<br/><i>TextRules.classify() — 30+ regex patterns</i><br/><code>Returns classification + confidence (0.0-1.0)</code>"]
    E -->|"≥90% confident<br/>+ has company & role"| F["✅ Rules-Only Result<br/><i>~80% of job emails</i><br/><b>No LLM call needed</b>"]
    E -->|"Low confidence<br/>or missing fields"| G

    G["🤖 Gemini 2.0 Flash<br/><i>Structured JSON output with schema</i><br/><code>~20% of job emails</code>"]
    G --> H["🔀 Smart Merge<br/><i>Best of rules + Gemini</i>"]

    H --> I["📊 Frontend Display"]
    F --> I

    style A fill:#374151,stroke:#4b5563,color:#f3f4f6
    style B fill:#1e3a5f,stroke:#2563eb,color:#dbeafe
    style C fill:#3b2f2f,stroke:#dc2626,color:#fecaca
    style D fill:#3b2f2f,stroke:#f59e0b,color:#fef3c7
    style E fill:#1a2e1a,stroke:#22c55e,color:#dcfce7
    style F fill:#064e3b,stroke:#10b981,color:#d1fae5
    style G fill:#312e81,stroke:#8b5cf6,color:#ede9fe
    style H fill:#312e81,stroke:#8b5cf6,color:#ede9fe
    style I fill:#374151,stroke:#4b5563,color:#f3f4f6
```

**Approximate numbers for a typical scan (500 matched emails):**

| Stage | Emails | Cost |
|-------|--------|------|
| Gmail search query | ~500 | Free (Gmail API) |
| Marketing filter | ~50 skipped | Microseconds each |
| Pre-filter (not job-related) | ~100 skipped | Microseconds each |
| Rules engine (high confidence) | ~280 classified | Microseconds each |
| Gemini API calls | ~70 | ~1-3 seconds each |

**Result:** Only ~20% of emails touch the LLM, saving significant latency and API cost.

---

## 5. Classification Pipeline (Backend)

```mermaid
flowchart TD
    START["📧 Incoming Email<br/><i>subject, from, body</i>"] --> NORM

    NORM["Normalize<br/><i>Strip HTML, collapse whitespace,<br/>truncate to 20K chars</i>"] --> MKT

    MKT{"Marketing<br/>Filter?"}
    MKT -->|"≥2 marketing signals<br/>(unsubscribe + no job keywords,<br/>social media sender, etc.)"| MKT_SKIP["Return MARKETING<br/><i>Skip entirely</i>"]
    MKT -->|"< 2 signals"| PRE

    PRE{"isLikelyJobEmail?<br/><i>Subject patterns +<br/>from-address signals +<br/>≥2 job keywords</i>"}
    PRE -->|"No"| OTHER["Return OTHER / UNKNOWN<br/><i>engine: rules_prefilter</i>"]
    PRE -->|"Yes"| RULES

    RULES["TextRules.classify()<br/><i>30+ regex patterns<br/>Priority: offer > interview > OA ><br/>rejection > action > review > received</i>"]
    RULES --> EXTRACT

    EXTRACT["Cheap Extraction<br/><i>Company: From header → domain → text patterns<br/>Role: 5 regex patterns on subject + body</i>"]
    EXTRACT --> DECIDE

    DECIDE{"confidence ≥ 0.90<br/>AND company ≠ null<br/>AND role ≠ null?"}
    DECIDE -->|"Yes"| RULES_ONLY["Return rules result<br/><i>engine: rules</i><br/>⚡ No LLM call"]
    DECIDE -->|"No"| PROMPT

    PROMPT["PromptBuilder.build()<br/><i>Structured prompt with<br/>classification options +<br/>extraction rules + email text</i>"] --> GEMINI

    GEMINI["GeminiClient.parse()<br/><i>POST to Gemini 2.0 Flash<br/>JSON schema enforced<br/>Retry with backoff<br/>Resilience4j Circuit Breaker</i>"]
    GEMINI -->|"Success"| MERGE
    GEMINI -->|"Failure / Timeout / Circuit Open"| FALLBACK["Return rules result<br/><i>engine: rules_fallback</i>"]

    MERGE["Smart Merge<br/><i>Classification: higher confidence wins<br/>(unless one says OTHER — prefer specific)<br/>Extraction: prefer Gemini<br/>(better contextual understanding)</i>"]
    MERGE --> RESULT["Return merged result<br/><i>engine: gemini</i>"]

    style START fill:#374151,stroke:#6b7280,color:#f9fafb
    style RULES_ONLY fill:#064e3b,stroke:#10b981,color:#d1fae5
    style RESULT fill:#312e81,stroke:#8b5cf6,color:#ede9fe
    style FALLBACK fill:#78350f,stroke:#f59e0b,color:#fef3c7
    style MKT_SKIP fill:#7f1d1d,stroke:#ef4444,color:#fecaca
    style OTHER fill:#7f1d1d,stroke:#ef4444,color:#fecaca
```

### Rules Engine Detail — Pattern Categories

```mermaid
graph LR
    subgraph Rejection["❌ Rejection (10 patterns)"]
        R1["'not move forward'"]
        R2["'after careful consideration'"]
        R3["'position has been filled'"]
        R4["'unfortunately, we/your...'"]
        R5["'not selected'"]
        R6["...5 more"]
    end

    subgraph Interview["🎤 Interview (5 patterns)"]
        I1["'invite you to interview'"]
        I2["'schedule an interview'"]
        I3["'interview scheduled'"]
        I4["'next round of hiring'"]
        I5["'like to invite you'"]
    end

    subgraph OA["📝 Assessment (3 patterns)"]
        O1["'online assessment'"]
        O2["'hackerrank/codesignal/...'"]
        O3["'complete the assessment'"]
    end

    subgraph Offer["🎉 Offer (4 patterns)"]
        OF1["'pleased to offer'"]
        OF2["'offer of employment'"]
        OF3["'congratulations...offer'"]
        OF4["'offer letter'"]
    end

    subgraph Received["✅ Applied (5 patterns)"]
        RC1["'received your application'"]
        RC2["'application submitted'"]
        RC3["'thanks for applying'"]
        RC4["'confirming your application'"]
        RC5["'thank you for your interest'"]
    end

    Priority["Classification Priority"]
    Priority --> Offer
    Priority --> Interview
    Priority --> OA
    Priority --> Rejection
    Priority --> Received

    style Rejection fill:#7f1d1d,stroke:#ef4444,color:#fecaca
    style Interview fill:#1e3a5f,stroke:#3b82f6,color:#dbeafe
    style OA fill:#3b1f6e,stroke:#8b5cf6,color:#ede9fe
    style Offer fill:#064e3b,stroke:#10b981,color:#d1fae5
    style Received fill:#0c4a6e,stroke:#0ea5e9,color:#e0f2fe
```

---

## 6. Security Model — Run Tokens

```mermaid
sequenceDiagram
    participant C as Client
    participant B as Backend
    participant H as HMAC-SHA256

    Note over C,B: Phase 1 — Token Creation

    C->>B: POST /api/runs
    Note over B: Generate runId = "run_" + random(10)<br/>expiresAt = now + 120 minutes<br/>ip = client IP

    B->>H: sign(header.payload)
    Note over H: header = {"alg":"HS256","typ":"RUN"}<br/>payload = {"runId","ip","expEpochSec"}<br/>signature = HMAC(header.payload, SERVER_SECRET)

    H-->>B: base64url(header).base64url(payload).base64url(signature)
    B-->>C: { runId, runToken, expiresAt, limits }

    Note over C,B: Phase 2 — Token Verification (every /parse-email call)

    C->>B: POST /api/parse-email<br/>Authorization: Bearer {token}

    Note over B: 1. Split token into 3 parts<br/>2. Recompute HMAC over parts[0].parts[1]<br/>3. Constant-time compare with parts[2]<br/>4. Decode payload → check expEpochSec

    alt Signature mismatch
        B-->>C: 401 { code: "BAD_TOKEN" }
    else Token expired
        B-->>C: 401 { code: "TOKEN_EXPIRED" }
    else Valid
        Note over B: Extract runId → use for rate limits & quotas
        B-->>C: 200 { classification result }
    end
```

**Token structure (similar to JWT, purpose-built):**

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IlJVTiJ9.eyJydW5JZCI6InJ1bl9hYmMxMjMiLC...
├── header (base64url) ──────┤├── payload (base64url) ──────────────────────...
                                                          ├── signature (base64url)
```

| Field | Purpose |
|-------|---------|
| `runId` | Unique session identifier — scopes all rate limits and quotas |
| `ip` | Client IP at creation time — available for future IP pinning |
| `expEpochSec` | Expiry timestamp — tokens live 120 minutes |

**Why not a library (e.g., `java-jwt`)?** The payload is 3 fields. A custom implementation avoids a dependency for something trivial. The cryptographic primitive (`HmacSHA256`) comes from the JDK's `javax.crypto` package. Signature comparison uses a constant-time algorithm to prevent timing attacks.

---

## 7. Abuse Prevention Layers

```mermaid
graph TD
    REQ["Incoming Request<br/><code>POST /api/parse-email</code>"] --> TOKEN

    TOKEN{"Token Valid?<br/><i>HMAC signature + expiry</i>"}
    TOKEN -->|"Invalid/Expired"| REJECT_401["❌ 401 Unauthorized"]
    TOKEN -->|"Valid"| RATE

    RATE{"Rate Limit OK?<br/><i>≤ 200 requests/minute/run</i><br/><code>ConcurrentHashMap + sliding window</code>"}
    RATE -->|"Exceeded"| REJECT_429A["❌ 429 Too Many Requests<br/><code>RATE_LIMITED</code>"]
    RATE -->|"OK"| QUOTA

    QUOTA{"Quota OK?<br/><i>≤ 1500 emails/run</i><br/><code>ConcurrentHashMap counter</code>"}
    QUOTA -->|"Exceeded"| REJECT_429B["❌ 429 Too Many Requests<br/><code>RUN_QUOTA_EXCEEDED</code>"]
    QUOTA -->|"OK"| SEM

    SEM{"Semaphore Available?<br/><i>≤ 4 concurrent Gemini calls/run</i><br/><code>ConcurrentHashMap + Semaphore(4)</code>"}
    SEM -->|"All 4 in use"| WAIT["⏳ Block until slot opens"]
    SEM -->|"Slot available"| PROCESS["✅ Process Email"]
    WAIT --> PROCESS

    PROCESS --> RELEASE["Release semaphore<br/><i>(in finally block)</i>"]

    style REQ fill:#374151,stroke:#6b7280,color:#f9fafb
    style REJECT_401 fill:#7f1d1d,stroke:#ef4444,color:#fecaca
    style REJECT_429A fill:#78350f,stroke:#f59e0b,color:#fef3c7
    style REJECT_429B fill:#78350f,stroke:#f59e0b,color:#fef3c7
    style PROCESS fill:#064e3b,stroke:#10b981,color:#d1fae5
```

| Layer | Mechanism | Scope | Data Structure | Purpose |
|-------|-----------|-------|----------------|---------|
| **Token Verification** | HMAC-SHA256 signature | Per request | Stateless (cryptographic) | Prevents unauthorized access |
| **Rate Limiter** | Sliding window counter | Per run, per minute | `ConcurrentHashMap<runId, Window>` | Prevents request flooding |
| **Quota** | Absolute counter | Per run, lifetime | `ConcurrentHashMap<runId, Integer>` | Caps total emails per session |
| **Concurrency Limiter** | Java `Semaphore(4)` | Per run, concurrent | `ConcurrentHashMap<runId, Semaphore>` | Prevents Gemini API overload |

**Why all in-memory?** Every limit is scoped to a `runId`, which lives at most 120 minutes. There's no need to persist rate limit state across server restarts. If the server restarts, all run tokens are effectively invalidated anyway (clients must create a new run).

---

## 8. Frontend Architecture & Data Flow

```mermaid
flowchart TD
    subgraph Auth["Authentication"]
        GSI["Google Identity Services<br/><i>Loaded via script tag</i>"]
        TOKEN["Access Token<br/><i>Stored in React state</i><br/><i>Never sent to backend</i>"]
    end

    subgraph Scan["Scan Pipeline"]
        QUERY["buildJobEmailQuery(days)<br/><i>~70 phrases + from: filters</i>"]
        LIST["listMessageIds()<br/><i>Paginate through Gmail results</i>"]
        POOL["mapWithConcurrency(4)<br/><i>Worker pool pattern</i>"]
        FETCH["getMessage()<br/><i>Fetch full MIME message</i>"]
        EXTRACT["extractPlainText()<br/><i>Walk MIME tree → decode base64url</i>"]
        PARSE["parseEmail()<br/><i>POST to backend proxy</i>"]
    end

    subgraph Buffer["Streaming Buffer"]
        PENDING["pendingItems (useRef)<br/><i>Accumulates results</i>"]
        TIMER["setTimeout(250ms)<br/><i>Batched flush</i>"]
        SETITEMS["setItems(prev.concat(batch))<br/><i>Single state update</i>"]
    end

    subgraph Transform["Data Transform"]
        MERGE["mergeResults()<br/><i>Dedup by company+role<br/>Pick best status<br/>Keep newest date</i>"]
        EDITS["userEdits overlay<br/><i>Manual corrections +<br/>deletions from localStorage</i>"]
        DISPLAY["displayRows<br/><i>Final array for rendering</i>"]
    end

    subgraph UI["UI Components"]
        HERO["HeroConnect<br/><i>Landing / connect screen</i>"]
        CONTROLS["ScanControls<br/><i>Days, max emails, concurrency</i>"]
        STATS["StatsBar<br/><i>Per-status counts</i>"]
        TABLE["ResultsTable<br/><i>Sortable, filterable,<br/>paginated, editable</i>"]
    end

    subgraph Persist["Persistence"]
        LS["localStorage<br/><i>wdia_results — cached rows<br/>wdia_edits — user corrections</i>"]
    end

    GSI --> TOKEN
    TOKEN --> QUERY --> LIST --> POOL
    POOL --> FETCH --> EXTRACT --> PARSE
    PARSE --> PENDING --> TIMER --> SETITEMS
    SETITEMS --> MERGE --> EDITS --> DISPLAY
    DISPLAY --> STATS
    DISPLAY --> TABLE
    MERGE --> LS
    LS -->|"On mount"| MERGE

    style Auth fill:#312e81,stroke:#6366f1,color:#e0e7ff
    style Scan fill:#1e3a5f,stroke:#3b82f6,color:#dbeafe
    style Buffer fill:#78350f,stroke:#f59e0b,color:#fef3c7
    style Transform fill:#064e3b,stroke:#10b981,color:#d1fae5
    style UI fill:#374151,stroke:#6b7280,color:#f3f4f6
    style Persist fill:#4a1d6a,stroke:#a855f7,color:#f3e8ff
```

### Performance Optimizations

| Optimization | Problem It Solves |
|-------------|-------------------|
| **Batched streaming** (250ms timer) | Without batching, 500 emails × 4 concurrent = hundreds of `setState` calls per second, each triggering a full re-render |
| **`React.memo`** on all components | Parent state changes (progress, items) don't re-render children whose props haven't changed |
| **Stable `useCallback` handlers** | `onEdit` and `onDelete` are stable references — `ResultsTable` doesn't re-render when parent state changes |
| **CSS `content-visibility: auto`** on table rows | Browser skips layout/paint for off-screen rows — massive win for large tables |
| **`will-change: transform`** on sticky header | Promotes header to its own GPU compositor layer — scroll doesn't trigger header repaint |
| **No `backdrop-blur`** on scrolling elements | `backdrop-blur` forces re-composite on every scroll frame — removed from all scroll-visible elements |

---

## 9. Gemini Integration & Resilience

```mermaid
flowchart TD
    CALL["GeminiClient.parse(prompt)"] --> CHECK{"API key<br/>configured?"}
    CHECK -->|"No"| THROW_KEY["Throw GEMINI_KEY_MISSING"]
    CHECK -->|"Yes"| BUILD

    BUILD["Build request<br/><i>temperature: 0.0<br/>maxOutputTokens: 4096<br/>responseMimeType: application/json<br/>responseSchema: enum-constrained</i>"]
    BUILD --> POST

    POST["WebClient POST<br/><i>Gemini generateContent endpoint</i>"]
    POST --> STATUS

    STATUS{"Response<br/>Status?"}
    STATUS -->|"429"| RETRY{"Retry<br/>attempt ≤ 4?"}
    STATUS -->|"5xx"| RETRY
    STATUS -->|"Timeout"| RETRY
    STATUS -->|"4xx (not 429)"| THROW_4XX["Throw GEMINI_4XX"]
    STATUS -->|"200 OK"| EXTRACT_TEXT

    RETRY -->|"Yes"| BACKOFF["Exponential backoff<br/><i>base: 2s, max: 30s, jitter: 0.3</i>"]
    RETRY -->|"No (exhausted)"| THROW_RETRY["Throw last error"]
    BACKOFF --> POST

    EXTRACT_TEXT["extractCandidateText()<br/><i>Parse JSON → navigate to<br/>candidates[0].content.parts[].text</i>"]
    EXTRACT_TEXT --> BLOCKED{"Prompt<br/>blocked?"}
    BLOCKED -->|"SAFETY / RECITATION"| RETURN_NULL["Return null<br/><i>Pipeline falls back to rules</i>"]
    BLOCKED -->|"No"| EXTRACT_JSON

    EXTRACT_JSON["extractJsonObject()<br/><i>1. Strip markdown fences<br/>2. Try full parse<br/>3. Fallback: find { } boundaries</i>"]
    EXTRACT_JSON --> PARSE_FIELDS

    PARSE_FIELDS["Parse fields<br/><i>classification, confidence, company,<br/>role, location, status, eventDate, links</i>"]
    PARSE_FIELDS --> RETURN["Return GeminiParsed"]

    style CALL fill:#374151,stroke:#6b7280,color:#f9fafb
    style RETURN fill:#064e3b,stroke:#10b981,color:#d1fae5
    style RETURN_NULL fill:#78350f,stroke:#f59e0b,color:#fef3c7
    style THROW_KEY fill:#7f1d1d,stroke:#ef4444,color:#fecaca
    style THROW_4XX fill:#7f1d1d,stroke:#ef4444,color:#fecaca
    style THROW_RETRY fill:#7f1d1d,stroke:#ef4444,color:#fecaca
```

### Structured Output Schema

The Gemini request includes a `responseSchema` that enforces:

```json
{
  "type": "OBJECT",
  "properties": {
    "classification": { "type": "STRING", "enum": ["APPLICATION_CONFIRMATION", "OA_ASSESSMENT", "INTERVIEW", "OFFER", "REJECTION", "ACTION_REQUIRED", "OTHER"] },
    "confidence":     { "type": "NUMBER" },
    "company":        { "type": "STRING" },
    "role":           { "type": "STRING" },
    "location":       { "type": "STRING" },
    "status":         { "type": "STRING", "enum": ["APPLIED", "IN_REVIEW", "OA", "INTERVIEW", "OFFER", "REJECTED", "ACTION_REQUIRED", "UNKNOWN"] },
    "eventDate":      { "type": "STRING" },
    "links":          { "type": "ARRAY", "items": { "type": "OBJECT", "properties": { "type": { "type": "STRING" }, "url": { "type": "STRING" } } } }
  },
  "required": ["classification", "confidence", "status", "links"]
}
```

This eliminates freeform text parsing. Gemini is forced to return valid JSON matching the schema, with enum values constrained to the exact set we support.

---

## 10. Merge & Deduplication Logic

A single job application often generates multiple emails (confirmation → review → interview → rejection). The merge engine collapses these into one row.

```mermaid
flowchart TD
    INPUT["Parsed Results<br/><i>Array of { classification, company, role, status, date, ... }</i>"]
    INPUT --> FILTER

    FILTER["Filter out OTHER + MARKETING<br/><i>These are noise, not applications</i>"]
    FILTER --> LOOP

    LOOP["For each result:"]
    LOOP --> KEY["Generate dedup key<br/><code>normalize(company) + '__' + normalize(role)</code><br/><i>Strips: Inc, LLC, Ltd, Corp, punctuation<br/>Lowercases, collapses whitespace</i>"]
    KEY --> EXISTS{"Key exists<br/>in map?"}

    EXISTS -->|"No"| INSERT["Insert new row<br/><i>{ company, role, status, lastSeenDate, bestLink, sources }</i>"]
    EXISTS -->|"Yes"| MERGE_ROW

    MERGE_ROW["Merge into existing row"]
    MERGE_ROW --> M1["Status: pick highest priority<br/><code>OFFER(100) > INTERVIEW(90) > OA(80) ><br/>IN_REVIEW(70) > APPLIED(60) > REJECTED(10)</code>"]
    MERGE_ROW --> M2["Company: keep longest name<br/><i>'Amazon' → 'Amazon Web Services'</i>"]
    MERGE_ROW --> M3["Date: keep newest<br/><i>Most recent email interaction</i>"]
    MERGE_ROW --> M4["Link: keep first non-null<br/><i>Application portal or scheduling link</i>"]
    MERGE_ROW --> M5["Sources: append unique senders"]

    INSERT --> SORT
    M1 & M2 & M3 & M4 & M5 --> SORT

    SORT["Sort by lastSeenDate descending<br/><i>Most recent applications first</i>"]
    SORT --> OUTPUT["Final AppRow[]<br/><i>One row per unique application</i>"]

    style INPUT fill:#374151,stroke:#6b7280,color:#f9fafb
    style OUTPUT fill:#064e3b,stroke:#10b981,color:#d1fae5
```

**Example:** Three emails from Amazon about the same role:

| Email | Classification | Status |
|-------|---------------|--------|
| "Thank you for applying to SWE Intern" | APPLICATION_CONFIRMATION | APPLIED |
| "Your application is being reviewed" | APPLICATION_UNDER_REVIEW | IN_REVIEW |
| "We will not be moving forward" | REJECTION | REJECTED |

**Dedup key:** `"amazon__software engineer intern"`

**Merged row:** Company: Amazon, Role: Software Engineer Intern, Status: **REJECTED** (highest priority event, though negative), Last Seen: date of the rejection email.

---

## 11. Observability & DevOps

WhereDidIApply is built for production readiness, utilizing standard cloud-native operational patterns.

### Structured Logging (JSON)
All backend logs are emitted in **Logstash JSON format** via `logback-spring.xml`. 
This allows cloud logging platforms (GCP Cloud Logging, Datadog) to instantly index fields (e.g., `logger`, `level`, `timestamp`) rather than relying on brittle regex parsing of plain text logs.

### Circuit Breaker (Resilience4j)
To protect the backend from hanging threads when the Gemini API degrades, a **Circuit Breaker** is applied to `GeminiClient`:
1. If the LLM fails or times out repeatedly (e.g., 50% failure rate over a sliding window), the circuit **Opens**.
2. Subsequent requests immediately fail fast, returning a `503 Service Unavailable` without attempting the network call.
3. The `EmailParsingService` catches this and gracefully degrades to returning the **Rules-Only** classification, ensuring the user still gets results (even if slightly less accurate) rather than a crashed request.

### API Documentation (OpenAPI/Swagger)
The backend exposes interactive API documentation via Springdoc OpenAPI. In development, it is available at `/api/swagger-ui.html`.

### CI/CD Pipeline
Deployment is fully automated via **GitHub Actions**:
1. **CI**: On Pull Request, the code is compiled and tested (`mvn test`).
2. **CD**: On push to `main`, a Docker image is built and pushed to Google Artifact Registry.
3. **Deployment**: The image is deployed to **Google Cloud Run** (serverless).
4. **Security**: The pipeline uses **Workload Identity Federation** to authenticate with GCP, eliminating the need to store long-lived Service Account JSON keys in GitHub Secrets.

---

## 12. Project Structure

```
WhereDidIApply/
├── README.md                          # Project overview + setup guide
├── DESIGN.md                          # This document
├── LICENSE                            # MIT
├── docker-compose.yml                 # One-command local deployment
├── .env.example                       # Template for Docker Compose env vars
│
├── apps/
│   ├── proxy/                         # Spring Boot backend
│   │   ├── pom.xml                    # Maven dependencies
│   │   ├── Dockerfile                 # Multi-stage Docker build
│   │   ├── src/main/
│   │   │   ├── resources/
│   │   │   │   └── application.yaml   # Config (ports, limits, API URLs)
│   │   │   └── java/tech/wheredidiapply/proxy/
│   │   │       ├── ProxyApplication.java  # Spring Boot entry point
│   │   │       ├── config/
│   │   │       │   └── CorsConfig.java    # CORS for localhost + production domain
│   │   │       ├── controller/
│   │   │       │   ├── RunController.java        # POST /api/runs — create run token
│   │   │       │   └── ParseEmailController.java # POST /api/parse-email — main pipeline
│   │   │       ├── model/
│   │   │       │   ├── ParseEmailRequest.java    # Inbound DTO (validated)
│   │   │       │   ├── ParseEmailResponse.java   # Outbound DTO (with factory helpers)
│   │   │       │   └── CreateRunResponse.java    # Run creation response
│   │   │       ├── security/
│   │   │       │   ├── TokenCodec.java           # HMAC sign/verify (low-level crypto)
│   │   │       │   └── RunTokenService.java      # Token lifecycle (create, verify)
│   │   │       ├── limits/
│   │   │       │   ├── RateLimitService.java     # Sliding-window rate limiter
│   │   │       │   ├── RunQuotaService.java      # Per-run email quota
│   │   │       │   └── RunConcurrencyLimiter.java # Semaphore-based concurrency cap
│   │   │       ├── service/
│   │   │       │   ├── EmailParsingService.java  # Core pipeline (rules → Gemini → merge)
│   │   │       │   ├── TextRules.java            # 30+ regex patterns + pre-filter
│   │   │       │   ├── GeminiClient.java         # HTTP client for Gemini API
│   │   │       │   └── PromptBuilder.java        # LLM prompt construction
│   │   │       └── error/
│   │   │           ├── ApiException.java         # Custom exception (status + code)
│   │   │           ├── ApiError.java             # Error response DTO
│   │   │           └── GlobalExceptionHandler.java # @RestControllerAdvice
│   │   └── src/test/
│   │
│   └── frontend/                      # Next.js frontend
│       ├── package.json
│       ├── Dockerfile                 # Multi-stage Docker build (standalone)
│       ├── next.config.ts             # Next.js config (standalone output)
│       ├── src/
│       │   ├── app/
│       │   │   ├── layout.tsx         # Root layout (fonts, GSI script, providers)
│       │   │   ├── page.tsx           # Main page (auth, scan, render)
│       │   │   ├── Providers.tsx      # Google OAuth provider wrapper
│       │   │   ├── globals.css        # Tailwind + performance CSS
│       │   │   └── components/
│       │   │       ├── HeroConnect.tsx     # Landing screen (connect Gmail)
│       │   │       ├── ScanControls.tsx    # Scan parameters + progress bar
│       │   │       ├── StatsBar.tsx        # Status count summary
│       │   │       ├── ResultsTable.tsx    # Sortable, paginated, editable table
│       │   │       └── StatusBadge.tsx     # Color-coded status pills
│       │   └── lib/
│       │       ├── gmail.ts           # Gmail API client (search, fetch, parse MIME)
│       │       ├── proxy.ts           # Backend API client (createRun, parseEmail)
│       │       ├── concurrency.ts     # Worker pool (mapWithConcurrency)
│       │       ├── merge.ts           # Dedup + merge logic
│       │       ├── storage.ts         # localStorage persistence
│       │       └── csv.ts             # CSV export (via papaparse)
│       └── public/
```

---

## 13. Technology Decisions & Trade-offs

| Decision | Alternatives Considered | Why This Choice |
|----------|------------------------|-----------------|
| **Client-side Gmail fetch** | Backend fetches via Gmail API with stored tokens | Privacy. The user's OAuth token never touches our server. We can't leak what we don't have. |
| **Hybrid rules + LLM** | LLM-only, rules-only | LLM-only: 3x slower, 5x more expensive. Rules-only: misses ambiguous/complex emails. Hybrid gives best of both. |
| **Custom HMAC tokens** (not JWT library) | `java-jwt`, Spring Security | Payload is 3 fields. A library adds a dependency for 50 lines of code. `javax.crypto.Mac` is JDK-standard. |
| **No database** | PostgreSQL, Redis | Nothing needs persistence. Run tokens are self-validating. Rate limits are ephemeral (120 min max). Adding a DB adds operational complexity for zero benefit. |
| **Spring WebFlux WebClient** (not RestTemplate) | `RestTemplate`, `HttpClient` | WebClient supports non-blocking I/O and reactive retry (`.retryWhen()`). RestTemplate is synchronous and deprecated for new projects. |
| **Gemini 2.0 Flash** (not GPT-4, Claude) | OpenAI GPT-4, Claude 3.5 | Free tier with generous limits. Structured JSON output mode eliminates parsing issues. Low latency (~1-2s). |
| **Resilience4j Circuit Breaker** | Manual try/catch timeouts | Standardized way to handle cascading failures in distributed systems. Prevents thread exhaustion when upstream APIs degrade. |
| **JSON Logging (Logback)** | Standard console text logs | JSON logs are machine-readable, making observability and querying in cloud environments (like GCP/Datadog) trivial. |
| **localStorage** (not server-side cache) | Redis, cookies, IndexedDB | Results are private (never leave the browser). localStorage is simple, synchronous, and sufficient for the data size. |
| **250ms flush batching** (not requestAnimationFrame) | `requestAnimationFrame`, no batching | 250ms is fast enough to feel real-time but slow enough to batch 4-10 results per flush. `rAF` would fire 60x/sec (overkill). |
| **CSS `content-visibility: auto`** on table rows | Virtual scrolling (react-virtual) | Zero-dependency solution. Browser natively skips layout/paint for off-screen rows. Virtual scrolling adds complexity and library weight. |

---

*This document reflects the architecture as of March 2026. For setup instructions, see the [README](README.md).*
