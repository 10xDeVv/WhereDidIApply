# Privacy Policy — WhereDidIApply

> **Last Updated:** March 2026  
> **Version:** 1.0

WhereDidIApply helps you track job applications by searching your Gmail for job-related emails. Because this involves access to your email, you deserve a clear, honest explanation of exactly what happens with your data.

---

## The Short Version

1. **Your Gmail login credentials and access tokens never touch any server except Google.**
2. Email text (subject, sender, body) **is sent to the backend only for classification**, but it is **never stored, never logged, and never persisted anywhere**.
3. Approximately 20% of emails are forwarded to **Google's Gemini API** for AI classification. Google's data policies apply to that step.
4. **You can self-host the entire application** and eliminate any third-party server involvement (except Google's APIs).

---

## Where Does Your Data Go?

Here is exactly what happens when you click "Scan Emails," in plain English:

### Step 1: You log in with Google
- Your browser gets a temporary access token directly from Google.
- This token stays in your browser's memory. The backend never sees it.

### Step 2: Your browser fetches emails from Gmail
- Your browser talks directly to Gmail's API using that token.
- The backend is not involved in this step at all.

### Step 3: Your browser sends email text to the backend for classification
- For each job-related email, your browser sends the subject line, sender address, and body text to the backend server.
- This is the **ONLY** data the backend receives.
- The backend does **NOT** receive your Gmail password, access token, attachments, or any emails you didn't scan.

### Step 4: The backend classifies the email
- ~80% of emails are classified using pattern matching (regex rules) that runs entirely on the backend. No third party is involved.
- ~20% of ambiguous emails are sent to Google's Gemini AI API for classification. See "Google Gemini & Your Data" below.

### Step 5: The result comes back to your browser
- The backend returns a classification (e.g., "rejection," "interview") plus extracted details (company name, role, date).
- The email text is immediately discarded from server memory.
- Nothing is written to a database, file, or log.

### Step 6: Results are saved locally in your browser
- Your application tracker data is stored in your browser's localStorage. It never leaves your device unless you export it.

---

## What Is Collected

| Data                        | Collected? | Stored?         | Details                                                                                 |
|-----------------------------|------------|-----------------|-----------------------------------------------------------------------------------------|
| Gmail password              | ❌ Never   | —               | Google OAuth is used. Your password is never seen.                                      |
| Gmail access token          | ❌ Never reaches the backend | Browser memory only | Token stays in your browser and is used to talk directly to Gmail.                      |
| Email subject, sender, body | ✅ Sent to the backend | ❌ Never stored | Transmitted over HTTPS for classification, then immediately discarded.                   |
| Email attachments           | ❌ Never   | —               | Attachments are not requested or processed.                                             |
| Non-job emails              | ❌ Never sent to the backend | —               | Your browser pre-filters emails using Gmail search queries. Only job-related emails sent.|
| Classification results      | ❌ Not on the backend | ✅ Your browser only | Results are saved in your browser's localStorage.                                       |
| IP address                  | ✅ Seen by the backend | ❌ Not logged | Like any web request, your IP reaches the backend. It is not logged or stored.           |
| Usage analytics / tracking  | ❌ None    | —               | No analytics, no cookies, no fingerprinting, no telemetry.                              |

---

## Google Gemini & Your Data

When the rules engine isn't confident enough to classify an email (~20% of the time), the email text is sent to **Google's Gemini 2.0 Flash API** for AI-powered classification.

**What this means for your privacy:**

- The email subject, sender, and body text are transmitted to Google's Gemini API servers.
- Google processes this data under their [Gemini API Terms of Service](https://ai.google.dev/gemini-api/terms).
- **If you are using the hosted version of WhereDidIApply**, the Gemini API is accessed through my API key. As of March 2026, Google's policy for paid API tiers states that input data is **not used for model training**. However, Google may retain inputs for up to 30 days for abuse monitoring and safety purposes.
- **If you self-host**, you provide your own Gemini API key, and Google's terms for your specific plan apply.

**You are encouraged to review Google's data policies directly:**

- [Google Gemini API Terms of Service](https://ai.google.dev/gemini-api/terms)
- [Google API Data Usage Policy](https://ai.google.dev/gemini-api/terms#data-use-policy)
- [Google Cloud Data Processing Terms](https://cloud.google.com/terms/data-processing-terms)

> ⚠️ **If you are uncomfortable with email text being processed by Google's AI**, you can self-host the application with the Gemini integration disabled, relying solely on the rules engine. Classification accuracy will be lower (~80% vs. ~95%), but no data will leave your own infrastructure.

---

## Self-Hosting: Maximum Privacy

The strongest privacy guarantee I can offer is: **don't trust me — run it yourself.**

WhereDidIApply is fully open source and can be self-hosted with a single command:

```bash
docker compose up --build
```

When you self-host:

| Concern                                      | Hosted Version                                 | Self-Hosted                                                      |
|-----------------------------------------------|------------------------------------------------|------------------------------------------------------------------|
| Email text transits a third-party server      | ✅ My server (but not stored)                   | ❌ Stays on your machine                                         |
| Gemini API sees email text                    | ✅ ~20% of emails                               | ✅ ~20% of emails (your API key) OR ❌ disable Gemini entirely     |
| You must trust the operator                   | Yes (me)                                       | No (you are the operator)                                       |
| Results stored on third-party infrastructure  | ❌ Browser only                                 | ❌ Browser only                                                  |

To disable Gemini entirely (rules-only mode), simply don't set the `GEMINI_API_KEY` environment variable. The backend will classify all emails using the regex rules engine only.

See the README for full self-hosting instructions.

---

## Data Retention

| System                  | Retention                                                                                                   |
|-------------------------|------------------------------------------------------------------------------------------------------------|
| Backend server          | Zero. No database exists. No logs contain email content. Email text exists in server memory only for the duration of the HTTP request (typically < 3 seconds), then is garbage collected. |
| Your browser (localStorage) | Until you clear it. You can clear your data at any time by clicking "Clear Data" in the app or clearing your browser's localStorage for the site. |
| Google Gemini API       | Per Google's terms, inputs may be retained for up to 30 days for abuse monitoring. See Google's policies linked above. |
| Google Gmail API        | Your emails remain in your Gmail account. Nothing is modified, deleted, or archived. The OAuth scope is read-only. |

---

## Logging Guarantee

The backend uses structured JSON logging for operational monitoring (error rates, latency, health checks). Email content is explicitly excluded from all log output.

Specifically:

- Email subjects are not logged.
- Email bodies are not logged.
- Sender addresses are not logged.
- The only request-level data that appears in logs is: timestamp, run ID, classification result, engine used (rules/gemini), and processing duration.

This is enforced at the code level, not by policy alone. You can verify this by searching the source code — the `ParseEmailController` and `EmailParsingService` never pass email content to any logger.

---

## OAuth Scope

WhereDidIApply requests the following Google OAuth scope:

```
https://www.googleapis.com/auth/gmail.readonly
```

This grants read-only access to your Gmail messages. The application cannot:

- Send emails on your behalf
- Delete or modify emails
- Access Google Drive, Calendar, or any other Google service
- Access your Gmail password

You can revoke this access at any time at [https://myaccount.google.com/permissions](https://myaccount.google.com/permissions).

---

## Children's Privacy

WhereDidIApply is not directed at children under 13 and does not knowingly process data from children.

---

## Changes to This Policy

If I make material changes to how data is handled, I will update this document and the "Last Updated" date at the top. Since this is an open-source project, all changes are visible in the Git history.

---

## Contact

If you have questions about this privacy policy or how your data is handled, please open an issue on GitHub.

---

## Summary

| Question                                 | Answer                                                                                 |
|-------------------------------------------|----------------------------------------------------------------------------------------|
| Do you see my Gmail password?             | No. Never.                                                                            |
| Do you see my Gmail access token?         | No. It never leaves your browser.                                                     |
| Do you see my email content?              | Yes — the subject, sender, and body are sent to the backend for classification.        |
| Do you store my email content?            | No. It is processed in memory and immediately discarded.                              |
| Does anyone else see my email content?    | Google Gemini sees ~20% of your job-related emails. You can disable this by self-hosting without a Gemini API key. |
| Can I run everything myself?              | Yes. `docker compose up --build` and everything runs on your machine.                 |
| Can I delete my data?                     | Yes. Click "Clear Data" in the app or clear your browser's localStorage. There is nothing to delete on the backend because nothing was stored. |

---

