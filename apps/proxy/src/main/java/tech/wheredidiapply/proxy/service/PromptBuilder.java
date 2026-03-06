package tech.wheredidiapply.proxy.service;

import org.springframework.stereotype.Component;
import tech.wheredidiapply.proxy.model.ParseEmailRequest;

@Component
public class PromptBuilder {

    public String build(ParseEmailRequest req) {
        String from = safe(req.getFrom());
        String subject = safe(req.getSubject());
        String body = safe(req.getEmailContent());

        return """
You are a precise structured-data extractor for job-application emails.

TASK: Determine whether the email below is related to a job application, and if so, extract structured fields.

══════════════════════════════════════════
CLASSIFICATION (pick exactly one):
  APPLICATION_CONFIRMATION — confirms receipt of a job application
  OA_ASSESSMENT            — online assessment, coding challenge, or technical test invitation
  INTERVIEW                — interview invitation, scheduling, or confirmation
  OFFER                    — formal job offer or offer letter
  REJECTION                — application rejected / "not moving forward"
  ACTION_REQUIRED          — candidate must complete something (finish application, submit documents)
  OTHER                    — NOT a job-application email (newsletter, marketing, receipt, social, personal, etc.)

STATUS (pick exactly one):
  APPLIED           — application submitted / received
  IN_REVIEW         — application is being reviewed
  OA                — online assessment stage
  INTERVIEW         — interview stage
  OFFER             — offer extended
  REJECTED          — application rejected
  ACTION_REQUIRED   — action needed from candidate
  UNKNOWN           — cannot determine, or email is not job-related

══════════════════════════════════════════
EXTRACTION RULES:
• company  — The HIRING company name. Do NOT return the job board (LinkedIn, Indeed, Glassdoor, Greenhouse, Lever, Workday). Look for the company in: the From display name, the email signature, or the body text. If a recruiter from "BigCorp Talent Acquisition <noreply@bigcorp.com>" sends the email, the company is "BigCorp".
• role     — The specific job title exactly as written (e.g. "Software Engineer Intern", "Senior Data Analyst"). Do NOT invent generic titles.
• location — City, state/province, country if mentioned. Empty string if absent.
• eventDate — A specific upcoming date (interview date, assessment deadline, start date). Format: YYYY-MM-DD. Empty string if none.
• links    — Relevant actionable URLs (application portal, scheduling link). EXCLUDE tracking/pixel URLs, unsubscribe links, and social media links.
• confidence — 0.0–1.0 how certain you are about the classification.

CRITICAL: If the email is NOT about a job application (e.g. marketing promo, purchase receipt, shipping notification, social media alert, newsletter, personal message), you MUST return classification="OTHER" and status="UNKNOWN". Do NOT force-fit non-job emails.

══════════════════════════════════════════
EMAIL TO ANALYZE:
From: %s
Subject: %s
Body:
%s
""".formatted(from, subject, body);
    }

    private String safe(String s) {
        if (s == null) return "";
        // Keep up to 10,000 chars to leave room for prompt overhead
        if (s.length() > 10_000) return s.substring(0, 10_000);
        return s;
    }
}