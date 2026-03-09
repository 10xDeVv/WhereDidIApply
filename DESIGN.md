# WhereDidIApply — Design Overview

---

> **Note:** This document is written from the perspective of a solo developer. All design, implementation, and decisions are the result of individual work. Where the text previously referred to "our" or "we," it now uses "I" or "my" to reflect this.

## Table of Contents

1. [Introduction](#1-introduction)
2. [Guiding Principles](#2-guiding-principles)
3. [Architecture Overview](#3-architecture-overview)
4. [Data Flow](#4-data-flow)
5. [Privacy Model](#5-privacy-model)
6. [Security Model](#6-security-model)
7. [Contributing](#7-contributing)
8. [Contact](#8-contact)

---

# 1. Introduction

WhereDidIApply is a privacy-first, open-source job application tracker that turns your Gmail inbox into a job search dashboard. I designed and built this project to help job seekers organize and analyze their job search process, with a strong emphasis on user privacy and transparency.

---

# 2. Guiding Principles

- **Privacy-first:** Your Gmail credentials never touch any server except Google. Email text is sent to the backend only for classification, never stored or logged. You can self-host the entire stack for maximum privacy.
- **Solo-built:** All code, design, and documentation are authored and maintained by a single developer (me).
- **Transparency:** Every data flow and processing step is documented. See [PRIVACY.md](PRIVACY.md) for a plain-English explanation.
- **No vendor lock-in:** You can run everything locally, modify, or fork as you wish.

---

# 3. Architecture Overview

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

# 4. Data Flow

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

# 5. Privacy Model

I take privacy seriously. The backend is stateless, and no email content is ever stored or logged. If you self-host, no data ever leaves your infrastructure (except for Gemini API calls, if enabled).

---

# 6. Security Model

As a solo developer, I have implemented HMAC-signed run tokens, in-memory rate limiting, and strict input validation. See [SECURITY.md](SECURITY.md) for details on how to report vulnerabilities.

---

# 7. Contributing

I welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines. Note that all code reviews and merges are handled by me.

---

# 8. Contact

If you have questions, suggestions, or want to report a bug, please open an issue on GitHub. As the sole maintainer, I will respond as quickly as possible.

---

*This document reflects the architecture as of March 2026. For setup instructions, see the [README](README.md).*
