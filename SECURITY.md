# Security Policy

---

## Reporting a Vulnerability

If you discover a security vulnerability in WhereDidIApply, **please do not open a public issue.**

Instead, report it privately:

1. **Email:** [your-email@example.com]
2. **Subject line:** `[SECURITY] WhereDidIApply — Brief description`

I will acknowledge your report within **48 hours** and aim to provide a fix or mitigation plan within **7 days** for critical issues.

---

## What Counts as a Security Issue

- Authentication bypass (forging run tokens without the secret)
- Email content leaking into logs, error messages, or responses where it shouldn't appear
- Server-side storage of email content that contradicts the privacy policy
- Cross-site scripting (XSS) in the frontend
- Injection attacks against the backend
- OAuth token exfiltration
- Dependency vulnerabilities with a known exploit path

---

## What Is NOT a Security Issue

- Classification accuracy (wrong label on an email) — this is a bug, not a security issue
- Rate limit tuning (limits too high/low) — open a regular issue
- Feature requests

---

## Security Architecture

For details on how authentication, rate limiting, and data handling work, see:

- [PRIVACY.md](PRIVACY.md) — Data flow and retention policies
- [DESIGN.md](DESIGN.md) — Run token security model, abuse prevention layers

---

## Supported Versions

| Version        | Supported |
|---------------|-----------|
| Latest `main` | ✅        |
| Older commits | ❌        |

I only support the latest version. If you find a vulnerability, please verify it exists on the current `main` branch before reporting.

---

## Example Vulnerability Report

When reporting, please include as much detail as possible:

- **Subject:** [REDACTED SUBJECT]
- **From:** [REDACTED SENDER]
- **Body:** [REDACTED BODY]

```
text
```

### Environment

- **Browser:** [e.g., Chrome 120]
- **OS:** [e.g., macOS 14, Windows 11]
- **Self-hosted or hosted version?**
- **Node version (if applicable):**
- **Java version (if applicable):**
