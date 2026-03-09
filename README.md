<div align="center">
  <h1>WhereDidIApply</h1>
  <p><strong>AI-powered job application tracker — turns your inbox into a job search dashboard.</strong></p>
  <p><strong>Your Gmail credentials never touch any server except Google.</strong> Email text is sent to the backend only for classification — never stored, never logged.</p>
  <a href="https://wheredidiapply.tech">Live App</a> · <a href="#quick-start">Quick Start</a> · <a href="DESIGN.md">Architecture</a> · <a href="PRIVACY.md">Privacy Policy</a>
</div>

---

> ### 🔒 Privacy Promise
>
> Your Gmail access token **never leaves your browser**. The backend receives only email text (subject, sender, body) for classification — it is processed in memory and immediately discarded. ~20% of ambiguous emails are forwarded to Google's Gemini API for AI classification. Nothing is stored server-side. Ever.
>
> **Don't trust this? Run it yourself.**
>
> ```bash
> docker compose up --build
> ```
>
> The entire application runs on your machine. See the [Privacy Policy](PRIVACY.md) for the full details.

---

## What It Does

WhereDidIApply connects to your Gmail (read-only), finds job application emails, and classifies them using a **hybrid rules-engine + Gemini LLM pipeline** — then presents everything in a searchable, sortable dashboard.

- ✅ Application confirmations — "We received your application"
- 📝 Assessments / OAs — HackerRank, CodeSignal invites
- 🎤 Interview invitations — phone screens, on-sites, virtuals
- 🎉 Offers — offer letters, congratulations emails
- ❌ Rejections — "We've decided to move forward with other candidates"
- ⚡ Action required — "Complete your application"

---

## Architecture

```mermaid
graph TD
  A[Browser (Next.js)] -->|Gmail OAuth| B[Fetch emails]
  B --> C[Send to backend for parsing]
  C -->|Results streamed back| A
  C --> D[Backend Proxy (Spring Boot)]
  D --> E[Run tokens (HMAC)]
  E --> F[Rate limiting]
  F --> G[Quota check]
  D --> H[Email text]
  H --> I[Rules engine (regex patterns)]
  I -->|High confidence| J[Return result]
  I -->|Low confidence| K[Gemini API call]
  K --> L[Smart merge (rules + LLM)]
  L --> J
```

**Key design decisions:**

- **Privacy-first** — Emails are fetched client-side via the Gmail API. The backend only receives email text for classification. Nothing is stored server-side.
- **Hybrid classification** — Deterministic regex rules handle ~80% of emails without touching the LLM, reducing latency and API costs. Gemini is the fallback for ambiguous cases.
- **Stateless backend** — No database. Run tokens are HMAC-signed and self-contained. Rate limits and quotas are in-memory per run.

---

## Tech Stack

| Layer        | Tech                                                                 |
|--------------|----------------------------------------------------------------------|
| Frontend     | Next.js 15, React 19, TypeScript, Tailwind CSS                      |
| Backend      | Java 21, Spring Boot 3.4, Spring WebFlux (WebClient)                |
| AI/LLM       | Google Gemini 2.0 Flash (structured JSON output)                    |
| Auth         | Google OAuth 2.0 (Gmail read-only scope)                            |
| Security     | HMAC-signed run tokens, per-run rate limiting, concurrency semaphores|
| DevOps       | GitHub Actions CI/CD, Google Cloud Run, Workload Identity Federation |
| Observability| Logback (Structured JSON Logging), Spring Boot Actuator, Swagger/OpenAPI |
| Resilience   | Resilience4j (Circuit Breaker)                                      |

---

## Quick Start

### Prerequisites

- Java 21+
- Node.js 18+
- A [Google Gemini API key](https://aistudio.google.com/apikey)
- A [Google OAuth Client ID](https://console.cloud.google.com/apis/credentials) with Gmail API enabled
- Docker (recommended)

### Docker (recommended)

```bash
# Copy the env template and fill in your values
cp .env.example .env

# Build and start both services
docker compose up --build
```

The frontend will be at `http://localhost:3000` and the backend at `http://localhost:8080`.

### Manual Setup

#### Backend

```bash
cd apps/proxy

# Set environment variables
export GEMINI_API_KEY=your-gemini-key
export RUN_TOKEN_SECRET=some-random-secret

# Run
./mvnw spring-boot:run
```

The backend starts on `http://localhost:8080`.

#### Frontend

```bash
cd apps/frontend

# Copy env template and fill in your values
cp .env.example .env.local
# Edit .env.local with your Google OAuth Client ID

npm install
npm run dev
```

The frontend starts on `http://localhost:3000`.

---

## Project Structure

```mermaid
graph TD
  A[WhereDidIApply]
  A --> B[apps/]
  B --> C[frontend/ (Next.js 15)]
  C --> D[src/app/ (Pages & components)]
  C --> E[src/lib/ (Gmail, proxy, merge, storage utils)]
  C --> F[Dockerfile]
  C --> G[package.json]
  B --> H[proxy/ (Spring Boot 3.4)]
  H --> I[src/main/java/tech/wheredidiapply/proxy/]
  I --> J[controller/ (REST endpoints)]
  I --> K[service/ (Parsing pipeline, Gemini client)]
  I --> L[security/ (Run token HMAC codec)]
  I --> M[limits/ (Rate limiting, quotas, concurrency)]
  I --> N[model/ (Request/response DTOs)]
  H --> O[Dockerfile]
  H --> P[pom.xml]
  A --> Q[docker-compose.yml]
  A --> R[PRIVACY.md]
  A --> S[CONTRIBUTING.md]
  A --> T[SECURITY.md]
  A --> U[DESIGN.md]
  A --> V[README.md]
```

---

## Environment Variables

### Backend (`apps/proxy/.env.example`)

| Variable           | Description                                 |
|--------------------|---------------------------------------------|
| `GEMINI_API_KEY`   | Google Gemini API key                       |
| `RUN_TOKEN_SECRET` | Secret for signing run tokens (any string)  |

### Frontend (`apps/frontend/.env.example`)

| Variable                      | Description                              |
|-------------------------------|------------------------------------------|
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID`| Google OAuth 2.0 Client ID               |
| `NEXT_PUBLIC_PROXY_BASE_URL`  | Backend URL (default: http://localhost:8080) |

---

## How the Classification Pipeline Works

1. **Gmail fetch** — Client-side, using the Gmail API with a targeted search query that pre-filters for job-related emails
2. **Pre-filter** — Backend checks if the email is even job-related using keyword signals
3. **Marketing skip** — Obvious marketing/promo emails are rejected before any classification
4. **Rules engine** — 30+ regex patterns attempt to classify the email (rejection, interview, offer, etc.)
5. **Confidence check** — If rules are ≥90% confident AND extracted both company + role → return immediately
6. **Circuit Breaker** — If Google's API is slow or down, Resilience4j immediately intercepts the request and falls back to a safe "Unknown" status, preventing system hangs.
7. **Gemini fallback** — For everything else, the email is sent to Gemini with a structured JSON schema
8. **Smart merge** — Rules and Gemini results are merged, preferring whichever source is more confident
9. **Dedup & merge** — Frontend merges multiple emails about the same company+role into a single row

---

## Production & Observability Features

To ensure reliability at scale, the backend includes:
- **Interactive API Docs (OpenAPI/Swagger):** Available at `/api/swagger-ui.html` for easy testing and integration.
- **Structured JSON Logging:** Logs are emitted in Logstash JSON format for seamless ingestion into Datadog, Splunk, or Google Cloud Logging.
- **Automated CI/CD:** GitHub Actions pipeline automatically runs tests and deploys to Google Cloud Run using Workload Identity Federation (keyless authentication).
- **Health Metrics:** Spring Boot Actuator endpoints (`/actuator/health`, `/actuator/metrics`) are exposed for uptime monitoring.

---

## Privacy & Security

WhereDidIApply is designed to handle your email data responsibly:

- Gmail credentials stay in your browser — the server never sees your access token.
- Email text is sent to the backend over HTTPS for classification, processed in memory, and immediately discarded. Nothing is stored or logged.
- ~20% of emails are forwarded to Google's Gemini API when the rules engine isn't confident. Google's API data policies apply.
- Self-hosting eliminates all third-party server involvement (except Google's APIs). One command: `docker compose up --build`.
- 📄 [Full Privacy Policy](PRIVACY.md) — Plain-English explanation of every data flow.
- 🔐 [Security Policy](SECURITY.md) — How to report vulnerabilities.

---

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for:

- Development setup instructions
- How to run tests
- Code style guidelines
- Pull request process
- Privacy rules for contributors (no email content in logs — ever)

---

## License

MIT — see [LICENSE](LICENSE).