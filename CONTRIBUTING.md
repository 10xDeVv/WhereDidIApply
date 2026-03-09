# Contributing to WhereDidIApply

Thank you for your interest in contributing! This guide will help you get started.

---

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [How to Contribute](#how-to-contribute)
3. [Development Setup](#development-setup)
4. [Project Architecture](#project-architecture)
5. [Running Tests](#running-tests)
6. [Code Style](#code-style)
7. [Pull Request Process](#pull-request-process)
8. [Reporting Bugs](#reporting-bugs)
9. [Requesting Features](#requesting-features)
10. [Privacy Considerations](#privacy-considerations)

---

## Code of Conduct

Be kind, be constructive, be respectful. We're all here to build something useful. Harassment, discrimination, or hostile behavior of any kind will not be tolerated.

---

## How to Contribute

### Good First Contributions

- **Bug reports** — Found something broken? [Open an issue](#reporting-bugs).
- **Documentation improvements** — Typos, unclear explanations, missing examples.
- **New regex patterns** — Got a job email that wasn't classified correctly? Add a pattern to `TextRules.java`.
- **UI/UX improvements** — Better mobile layout, accessibility fixes, design polish.

### Larger Contributions

- **New classification categories** — e.g., "background check," "onboarding"
- **New ATS integrations** — Patterns for specific applicant tracking systems
- **Internationalization** — Support for non-English job emails
- **Alternative LLM backends** — OpenAI, Claude, Ollama/local models

For larger changes, **please open an issue first** to discuss the approach before writing code. This saves everyone time.

---

## Development Setup

### Prerequisites

- **Java 21+** (for the backend)
- **Node.js 18+** (for the frontend)
- **Docker** (recommended, for one-command setup)
- A **Google OAuth Client ID** with Gmail API enabled
- A **Google Gemini API key** (optional — the rules engine works without it)

### Quick Start (Docker)

```bash
# Clone the repository
git clone https://github.com/yourusername/WhereDidIApply.git
cd WhereDidIApply

# Copy and fill in environment variables
cp .env.example .env
# Edit .env with your Google OAuth Client ID and Gemini API key

# Build and start everything
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend: http://localhost:8080
- Swagger UI: http://localhost:8080/api/swagger-ui.html

### Manual Setup

#### Backend

```bash
cd apps/proxy

export GEMINI_API_KEY=your-gemini-key        # Optional
export RUN_TOKEN_SECRET=any-random-string

./mvnw spring-boot:run
# Starts on http://localhost:8080
```

#### Frontend

```bash
cd apps/frontend

cp .env.example .env.local
# Edit .env.local with your NEXT_PUBLIC_GOOGLE_CLIENT_ID

npm install
npm run dev
# Starts on http://localhost:3000
```

---

## Project Architecture

```
apps/
├── proxy/          # Spring Boot 3.4 backend (Java 21)
│   └── src/main/java/tech/wheredidiapply/proxy/
│       ├── controller/    # REST endpoints
│       ├── service/       # Core logic (rules engine, Gemini client, parsing pipeline)
│       ├── security/      # Run token HMAC signing/verification
│       ├── limits/        # Rate limiting, quotas, concurrency
│       ├── model/         # Request/response DTOs
│       └── error/         # Exception handling
│
└── frontend/       # Next.js 15 (React 19, TypeScript, Tailwind)
    └── src/
        ├── app/           # Pages and React components
        └── lib/           # Gmail client, proxy client, merge logic, utilities
```

For a deep dive, see [DESIGN.md](DESIGN.md).

---

## Running Tests

### Backend

```bash
cd apps/proxy

# Run all tests
./mvnw test

# Run a specific test class
./mvnw test -Dtest=TextRulesTest

# Run with verbose output
./mvnw test -Dtest=TextRulesTest -Dsurefire.useFile=false
```

### Frontend

```bash
cd apps/frontend

# Run all tests
npm test

# Run in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

### What to Test

| Area                | What to test                                         | Example                                   |
|---------------------|------------------------------------------------------|-------------------------------------------|
| TextRules patterns  | New regex patterns match intended emails and don't false-positive | Add test cases to TextRulesTest.java      |
| Merge logic         | Deduplication produces correct results when emails overlap | Add test cases to merge.test.ts           |
| Token codec         | Tokens sign and verify correctly, expired tokens are rejected | TokenCodecTest.java                       |
| API endpoints       | Controllers return correct status codes and error shapes | ParseEmailControllerTest.java             |

All pull requests must pass existing tests. If you add new functionality, add corresponding tests.

---

## Code Style

### Java (Backend)
- Follow existing conventions in the codebase.
- Use meaningful variable and method names.
- Keep methods short — if a method exceeds ~30 lines, consider extracting.
- Use `final` for variables that don't change.
- All public API methods should have Javadoc.

### TypeScript (Frontend)
- Use TypeScript strictly — avoid `any` unless absolutely necessary.
- Follow the existing Tailwind CSS patterns for styling.
- Components should be functional (hooks, not classes).
- Use `React.memo` for components that receive stable props and are expensive to render.

### General
- **No email content in logs.** This is a hard rule. See PRIVACY.md. If you add logging, ensure that email subjects, bodies, and sender addresses are never included.
- Keep dependencies minimal. Justify new dependencies in your PR description.
- Write descriptive commit messages. Use the imperative mood: "Add rejection pattern for Workday emails" not "Added patterns."

---

## Pull Request Process

1. Fork the repository and create a feature branch from `main`.

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes. Follow the code style guidelines above.
3. Add or update tests for your changes.
4. Run the full test suite and make sure everything passes.

   ```bash
   # Backend
   cd apps/proxy && ./mvnw test

   # Frontend
   cd apps/frontend && npm test
   ```

5. Write a clear PR description that explains:
   - What you changed
   - Why you changed it
   - How to test it
   - Any privacy implications (does your change touch email content in a new way?)
6. Submit the PR against `main`.
7. A maintainer will review your PR. We aim to review within 48 hours. We may request changes — this is normal and not a rejection.

### PR Checklist

- [ ] Tests pass (`./mvnw test` and `npm test`)
- [ ] No email content is logged or persisted
- [ ] New dependencies are justified
- [ ] Code follows existing style conventions
- [ ] PR description explains what, why, and how to test

---

## Reporting Bugs

Open an issue with:

- What you expected to happen
- What actually happened (include screenshots if it's a UI bug)
- Steps to reproduce — be as specific as possible
- Environment — browser, OS, Node/Java version
- Sample email (if it's a classification bug) — redact any personal information before sharing. Replace company names, your name, and any identifying details with placeholders.

> ⚠️ Never paste raw email content into a public issue. Always redact personal details first.

---

## Requesting Features

Open an issue with:

- The problem you're trying to solve
- Your proposed solution (if you have one)
- Alternatives you've considered

---

## Privacy Considerations

This project handles sensitive data (email content). Every contributor must understand and respect this:

- **Never log email content.** Not in `System.out.println`, not in `logger.debug()`, not in error messages. If you need to debug email parsing, log the result (classification, confidence), not the input (email text).
- **Never persist email content.** Not to a file, not to a database, not to a cache. Email text must exist in memory only for the duration of the request.
- **Minimize data transmission.** If your feature doesn't need the full email body, don't send it. If it only needs the subject line, only send the subject line.
- **Document data flows.** If your change introduces a new place where email data flows (e.g., a new third-party API), update PRIVACY.md.
- **Think about self-hosters.** Changes should work for people running the app entirely locally, not just on the hosted version.

---

## Questions?

If anything in this guide is unclear, open an issue and we'll improve it. Thank you for contributing!