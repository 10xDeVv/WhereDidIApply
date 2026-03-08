<div align="center">
  <h1>WhereDidIApply</h1>
  <p><strong>AI-powered job application tracker that scans your Gmail.</strong></p>
  <p>Your emails never leave your browser. Privacy-first by design.</p>

  <a href="https://wheredidiapply.tech">Live App</a> · <a href="#quick-start">Quick Start</a> · <a href="#architecture">Architecture</a> · <a href="DESIGN.md">Design Docs</a>
</div>

---

## What It Does

WhereDidIApply connects to your Gmail (read-only), finds job application emails, and classifies them using a **hybrid rules-engine + Gemini LLM pipeline** — then presents everything in a searchable, sortable dashboard.

- ✅ **Application confirmations** — "We received your application"
- 📝 **Assessments / OAs** — HackerRank, CodeSignal invites
- 🎤 **Interview invitations** — phone screens, on-sites, virtuals
- 🎉 **Offers** — offer letters, congratulations emails
- ❌ **Rejections** — "We've decided to move forward with other candidates"
- ⚡ **Action required** — "Complete your application"

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    Browser (Next.js)                  │
│                                                      │
│  Gmail OAuth ──► Fetch emails ──► Send to backend    │
│                                    for parsing       │
│  Results displayed live ◄── streamed back            │
└──────────────────────┬───────────────────────────────┘
                       │ HTTPS
┌──────────────────────▼───────────────────────────────┐
│               Backend Proxy (Spring Boot)            │
│                                                      │
│  Run tokens (HMAC) ──► Rate limiting ──► Quota check │
│                                                      │
│  Email text ──► Rules engine (regex patterns)        │
│       │              │                               │
│       │         High confidence? ──► Return result   │
│       │              │                               │
│       │         Low confidence? ──► Gemini API call  │
│       │                                │             │
│       └── Smart merge (rules + LLM) ◄─┘             │
└──────────────────────────────────────────────────────┘
```

**Key design decisions:**

- **Privacy-first** — Emails are fetched client-side via the Gmail API. The backend only receives email text for classification. Nothing is stored server-side.
- **Hybrid classification** — Deterministic regex rules handle ~80% of emails without touching the LLM, reducing latency and API costs. Gemini is the fallback for ambiguous cases.
- **Stateless backend** — No database. Run tokens are HMAC-signed and self-contained. Rate limits and quotas are in-memory per run.

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS |
| Backend | Java 21, Spring Boot 3.4, Spring WebFlux (WebClient) |
| AI/LLM | Google Gemini 2.0 Flash (structured JSON output) |
| Auth | Google OAuth 2.0 (Gmail read-only scope) |
| Security | HMAC-signed run tokens, per-run rate limiting, concurrency semaphores |
| DevOps | GitHub Actions CI/CD, Google Cloud Run, Workload Identity Federation |
| Observability | Logback (Structured JSON Logging), Spring Boot Actuator, Swagger/OpenAPI |
| Resilience | Resilience4j (Circuit Breaker) |

## Quick Start

### Prerequisites

- Java 21+
- Node.js 18+
- A [Google Gemini API key](https://aistudio.google.com/apikey)
- A [Google OAuth Client ID](https://console.cloud.google.com/apis/credentials) with Gmail API enabled

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

## Project Structure

```
WhereDidIApply/
├── apps/
│   ├── frontend/          # Next.js 15 (React 19, TypeScript, Tailwind)
│   │   ├── src/
│   │   │   ├── app/       # Pages & components
│   │   │   └── lib/       # Gmail, proxy, merge, storage utils
│   │   ├── Dockerfile
│   │   └── package.json
│   └── proxy/             # Spring Boot 3.4 (Java 21)
│       ├── src/main/java/tech/wheredidiapply/proxy/
│       │   ├── controller/   # REST endpoints
│       │   ├── service/      # Parsing pipeline, Gemini client
│       │   ├── security/     # Run token HMAC codec
│       │   ├── limits/       # Rate limiting, quotas, concurrency
│       │   └── model/        # Request/response DTOs
│       ├── Dockerfile
│       └── pom.xml
├── docker-compose.yml
├── DESIGN.md              # In-depth design documentation
└── README.md
```

### Environment Variables

#### Backend (`apps/proxy/.env.example`)

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Google Gemini API key |
| `RUN_TOKEN_SECRET` | Secret for signing run tokens (any random string) |

#### Frontend (`apps/frontend/.env.example`)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google OAuth 2.0 Client ID |
| `NEXT_PUBLIC_PROXY_BASE_URL` | Backend URL (default: `http://localhost:8080`) |

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

## Production & Observability Features

To ensure reliability at scale, the backend includes:
- **Interactive API Docs (OpenAPI/Swagger)**: Available at `/api/swagger-ui.html` for easy testing and integration.
- **Structured JSON Logging**: Logs are emitted in Logstash JSON format for seamless ingestion into Datadog, Splunk, or Google Cloud Logging.
- **Automated CI/CD**: GitHub Actions pipeline automatically runs tests and deploys to Google Cloud Run using Workload Identity Federation (keyless authentication).
- **Health Metrics**: Spring Boot Actuator endpoints (`/actuator/health`, `/actuator/metrics`) are exposed for uptime monitoring.

## License

MIT — see [LICENSE](LICENSE).