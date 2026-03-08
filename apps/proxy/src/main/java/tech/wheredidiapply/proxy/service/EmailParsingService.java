package tech.wheredidiapply.proxy.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import org.springframework.stereotype.Service;
import tech.wheredidiapply.proxy.model.ParseEmailRequest;
import tech.wheredidiapply.proxy.model.ParseEmailResponse;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Service
public class EmailParsingService {

    private static final Logger log = LoggerFactory.getLogger(EmailParsingService.class);

    private final GeminiClient geminiClient;
    private final PromptBuilder promptBuilder;

    // ── Role extraction patterns ──
    private static final Pattern ROLE_PAT_1 = Pattern.compile(
            "appl(?:ying|ied|ication)\\s+(?:to|for)\\s+(?:the\\s+)?(.+?)\\s+(?:position|role|job)\\b",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern ROLE_PAT_2 = Pattern.compile(
            "(?:position|role|job\\s+title)[:\\s]+(.+?)(?:\\s+at\\b|\\s+in\\b|\\s*[\\n,.(]|$)",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern ROLE_PAT_3 = Pattern.compile(
            "received\\s+your\\s+application\\s+for\\s+(?:the\\s+)?(.+?)(?:\\s+position|\\s+role|\\s*[.!,\\n]|$)",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern ROLE_PAT_4 = Pattern.compile(
            "(?:regarding|about)\\s+(?:your|the)\\s+(.+?)\\s+(?:position|role|application)\\b",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern ROLE_PAT_5 = Pattern.compile(
            "interest\\s+in\\s+(?:the\\s+)?(.+?)\\s+(?:position|role|opportunity)\\b",
            Pattern.CASE_INSENSITIVE);

    // ── From-header parsing ──
    private static final Pattern FROM_DISPLAY_NAME = Pattern.compile("^\\s*\"?(.+?)\"?\\s*<.+>\\s*$");
    private static final Pattern FROM_EMAIL_DOMAIN = Pattern.compile("@([A-Za-z0-9.-]+)");

    // ── Known domain → company mappings (popular platforms to EXCLUDE) ──
    private static final Set<String> JOB_BOARD_DOMAINS = Set.of(
            "linkedin.com", "indeed.com", "glassdoor.com", "greenhouse.io",
            "lever.co", "myworkdayjobs.com", "smartrecruiters.com",
            "icims.com", "jobvite.com", "applytojob.com", "ashbyhq.com",
            "gmail.com", "outlook.com", "yahoo.com", "hotmail.com"
    );

    // Noise words to strip from company names extracted from From display name
    private static final Pattern COMPANY_NOISE = Pattern.compile(
            "\\b(?:careers?|recruiting|recruitment|talent\\s*(?:acquisition)?|hiring|team|hr|" +
            "jobs?|no-?reply|notifications?|support|info)\\b",
            Pattern.CASE_INSENSITIVE);

    public EmailParsingService(GeminiClient geminiClient, PromptBuilder promptBuilder) {
        this.geminiClient = geminiClient;
        this.promptBuilder = promptBuilder;
    }

    public ParseEmailResponse parseEmailContent(ParseEmailRequest request) throws JsonProcessingException {
        String subject = nz(request.getSubject());
        String from = nz(request.getFrom());
        String body = sanitizeEmail(nz(request.getEmailContent()), 12000);

        // ── STEP 1: Pre-filter — is this even a job email? ──
        if (!TextRules.isLikelyJobEmail(subject, from, body)) {
            return ParseEmailResponse.unknown(request.getMessageId(), "rules_prefilter");
        }

        // ── STEP 2: Rules-based classification ──
        TextRules.RuleResult rule = TextRules.classify(subject, from, body);

        // ── STEP 3: Cheap extraction — company + role ──
        String company = extractCompany(from, subject, body);
        String role = extractRole(subject, body);
        String location = null;
        String eventDate = null;

        // ── STEP 4: Only skip Gemini if VERY confident AND we have BOTH company AND role ──
        boolean veryConfident = rule.confidence() >= 0.90
                && !"OTHER".equals(rule.classification());
        boolean hasBothFields = notBlank(company) && notBlank(role);

        if (veryConfident && hasBothFields) {
            return buildResponse(request, rule.classification(), rule.status(), rule.confidence(),
                    company, role, location, eventDate, Collections.emptyList(),
                    Map.of("engine", "rules"));
        }

        // ── STEP 5: Call Gemini for everything else ──
        String prompt = promptBuilder.build(request);
        GeminiClient.GeminiParsed parsed;
        try {
            parsed = geminiClient.parse(prompt);
        } catch (Exception e) {
            // Gemini failed — fall back to rules rather than crashing
            log.warn("Gemini failed for messageId={} ({}: {}). Using rules-only.",
                    request.getMessageId(), e.getClass().getSimpleName(), e.getMessage());
            return buildResponse(request, rule.classification(), rule.status(), rule.confidence(),
                    company, role, location, eventDate, Collections.emptyList(),
                    Map.of("engine", "rules_fallback", "gemini_error",
                            e.getMessage() != null ? e.getMessage() : "unknown"));
        }

        // ── STEP 6: Smart merge — prefer Gemini for extraction, rules for signals ──
        String mergedClassification = mergeField(rule.classification(), parsed.classification(),
                rule.confidence(), parsed.confidence());
        String mergedStatus = mergeField(rule.status(), parsed.status(),
                rule.confidence(), parsed.confidence());

        // For extraction fields, prefer Gemini (it understands context better)
        String mergedCompany = preferGemini(company, parsed.company());
        String mergedRole = preferGemini(role, parsed.role());
        String mergedLocation = firstNonBlank(location, parsed.location());
        String mergedEventDate = firstNonBlank(eventDate, parsed.eventDate());
        double mergedConfidence = Math.max(rule.confidence(), parsed.confidence());

        return buildResponse(
                request,
                mergedClassification,
                mergedStatus,
                mergedConfidence,
                mergedCompany,
                mergedRole,
                mergedLocation,
                mergedEventDate,
                parsed.links(),
                Map.of("engine", "gemini", "model", "gemini-2.0-flash")
        );
    }

    // ──────────────────────────────────────────────────────────────────
    // Company extraction
    // ──────────────────────────────────────────────────────────────────

    private String extractCompany(String from, String subject, String body) {
        // 1) Try parsing the display name from From header
        //    e.g. "Amazon Careers <noreply@amazon.com>" → "Amazon"
        String fromCompany = extractCompanyFromDisplayName(from);
        if (notBlank(fromCompany)) return fromCompany;

        // 2) Try extracting from domain (skip job boards / generic providers)
        String domain = extractDomain(from);
        if (domain != null && !isJobBoardOrGeneric(domain)) {
            String domainCompany = domainToCompanyName(domain);
            if (notBlank(domainCompany)) return domainCompany;
        }

        // 3) Try "at {Company}" or "from {Company}" patterns in subject
        String subjectCompany = extractCompanyFromText(subject);
        if (notBlank(subjectCompany)) return subjectCompany;

        return null;
    }

    private String extractCompanyFromDisplayName(String from) {
        if (from == null) return null;
        Matcher m = FROM_DISPLAY_NAME.matcher(from);
        if (!m.matches()) return null;

        String displayName = m.group(1).trim();
        if (displayName.isEmpty()) return null;

        // Strip noise words like "Careers", "Recruiting", "Team", etc.
        String cleaned = COMPANY_NOISE.matcher(displayName).replaceAll("").trim();
        // Strip leading/trailing punctuation and whitespace
        cleaned = cleaned.replaceAll("^[\\s\\-–—:,]+|[\\s\\-–—:,]+$", "").trim();

        if (cleaned.isEmpty() || cleaned.length() < 2) return null;

        // Skip if what remains looks like a generic sender ("no-reply", "notifications")
        if (cleaned.toLowerCase(Locale.ROOT).matches("no-?reply|info|notifications?|support")) return null;

        return cleaned;
    }

    private String domainToCompanyName(String domain) {
        if (domain == null) return null;
        // Strip common TLDs and subdomains
        // e.g. "mail.google.com" → "google", "careers.amazon.ca" → "amazon"
        String[] parts = domain.split("\\.");
        if (parts.length < 2) return null;

        // Take the second-to-last part (the core domain name)
        String core = parts[parts.length - 2];
        if (core.length() < 2) return null;

        // Skip if it's a generic mail provider or job board
        if (Set.of("gmail", "outlook", "yahoo", "hotmail", "mail", "email").contains(core.toLowerCase())) {
            return null;
        }

        // Capitalize first letter
        return core.substring(0, 1).toUpperCase(Locale.ROOT) + core.substring(1);
    }

    private static final Pattern AT_COMPANY = Pattern.compile(
            "\\bat\\s+([A-Z][A-Za-z0-9&.\\-']+(?:\\s+[A-Z][A-Za-z0-9&.\\-']+){0,4})\\b");
    private static final Pattern FROM_COMPANY = Pattern.compile(
            "\\bfrom\\s+([A-Z][A-Za-z0-9&.\\-']+(?:\\s+[A-Z][A-Za-z0-9&.\\-']+){0,4})\\b");

    private String extractCompanyFromText(String text) {
        if (text == null) return null;
        Matcher m = AT_COMPANY.matcher(text);
        if (m.find()) return m.group(1).trim();
        m = FROM_COMPANY.matcher(text);
        if (m.find()) return m.group(1).trim();
        return null;
    }

    private boolean isJobBoardOrGeneric(String domain) {
        if (domain == null) return true;
        return JOB_BOARD_DOMAINS.stream().anyMatch(domain::endsWith);
    }

    // ──────────────────────────────────────────────────────────────────
    // Role extraction
    // ──────────────────────────────────────────────────────────────────

    private String extractRole(String subject, String body) {
        // Try subject first (highest signal)
        String role = matchFirstGroup(subject, ROLE_PAT_1, ROLE_PAT_2, ROLE_PAT_3, ROLE_PAT_4, ROLE_PAT_5);
        if (notBlank(role)) return cleanRole(role);

        // Then body
        role = matchFirstGroup(body, ROLE_PAT_3, ROLE_PAT_1, ROLE_PAT_4, ROLE_PAT_5);
        if (notBlank(role)) return cleanRole(role);

        return null;
    }

    private String cleanRole(String role) {
        if (role == null) return null;
        role = role.replaceAll("\\s+", " ").trim();
        // Remove trailing IDs like (210835) or #12345
        role = role.replaceAll("\\s*[\\(#]\\s*\\d+\\s*\\)?$", "").trim();
        // Remove trailing "at CompanyName" if accidentally captured
        role = role.replaceAll("\\s+at\\s+.*$", "").trim();
        if (role.length() > 120) role = role.substring(0, 120).trim();
        return role.isEmpty() ? null : role;
    }

    // ──────────────────────────────────────────────────────────────────
    // Merge helpers
    // ──────────────────────────────────────────────────────────────────

    /**
     * For classification/status: prefer whichever source is more confident,
     * but if Gemini says OTHER and rules say something specific, trust rules
     * (and vice versa).
     */
    private String mergeField(String rulesValue, String llmValue, double rulesConf, double llmConf) {
        boolean rulesUnknown = "OTHER".equalsIgnoreCase(rulesValue) || "UNKNOWN".equalsIgnoreCase(rulesValue);
        boolean llmUnknown = "OTHER".equalsIgnoreCase(llmValue) || "UNKNOWN".equalsIgnoreCase(llmValue);

        // If one says OTHER/UNKNOWN and the other has a real value, prefer the real value
        if (rulesUnknown && !llmUnknown && notBlank(llmValue)) return llmValue;
        if (llmUnknown && !rulesUnknown && notBlank(rulesValue)) return rulesValue;

        // Both have values — prefer higher confidence, bias towards Gemini on ties
        if (llmConf >= rulesConf && notBlank(llmValue)) return llmValue;
        return rulesValue;
    }

    /**
     * For extraction fields (company, role): prefer Gemini output since it
     * has better contextual understanding, falling back to rules extraction.
     */
    private String preferGemini(String rulesValue, String geminiValue) {
        if (notBlank(geminiValue)) return geminiValue;
        if (notBlank(rulesValue)) return rulesValue;
        return null;
    }

    // ──────────────────────────────────────────────────────────────────
    // Response builder
    // ──────────────────────────────────────────────────────────────────

    private ParseEmailResponse buildResponse(
            ParseEmailRequest request,
            String classification,
            String status,
            double confidence,
            String company,
            String role,
            String location,
            String eventDate,
            List<ParseEmailResponse.Link> links,
            Map<String, Object> signals
    ) {
        return new ParseEmailResponse(
                request.getMessageId(),
                classification,
                confidence,
                new ParseEmailResponse.Extracted(
                        blankToNull(company),
                        blankToNull(role),
                        blankToNull(location),
                        blankToNull(status),
                        blankToNull(eventDate),
                        links == null ? List.of() : links
                ),
                signals
        );
    }

    // ──────────────────────────────────────────────────────────────────
    // Utility
    // ──────────────────────────────────────────────────────────────────

    private String extractDomain(String from) {
        if (from == null) return null;
        Matcher m = FROM_EMAIL_DOMAIN.matcher(from);
        if (m.find()) return m.group(1).toLowerCase(Locale.ROOT);
        return null;
    }

    private String matchFirstGroup(String text, Pattern... patterns) {
        if (text == null) return null;
        for (Pattern p : patterns) {
            Matcher m = p.matcher(text);
            if (m.find()) return m.group(1);
        }
        return null;
    }

    private String firstNonBlank(String a, String b) {
        if (notBlank(a)) return a;
        if (notBlank(b)) return b;
        return null;
    }

    private boolean notBlank(String s) {
        return s != null && !s.trim().isEmpty();
    }

    private String blankToNull(String s) {
        return notBlank(s) ? s.trim() : null;
    }

    private String nz(String s) {
        return s == null ? "" : s;
    }

    private String sanitizeEmail(String raw, int maxChars) {
        if (raw == null) return "";

        String s = raw;

        // Strip HTML artifacts
        s = s.replaceAll("(?is)<style.*?>.*?</style>", " ");
        s = s.replaceAll("(?is)<script.*?>.*?</script>", " ");
        s = s.replaceAll("(?is)<[^>]+>", " ");

        // Collapse massive tracking URLs
        s = s.replaceAll("https?://\\S{100,}", "[LINK]");

        // Normalize whitespace but preserve paragraph breaks
        s = s.replaceAll("[\\t\\r\\f]+", " ");
        s = s.replaceAll(" {2,}", " ");
        s = s.replaceAll("\\n{3,}", "\n\n");
        s = s.trim();

        // Smart truncation: keep first 80% + last 20% to preserve both opening and closing
        if (s.length() > maxChars) {
            int headSize = (int) (maxChars * 0.80);
            int tailSize = maxChars - headSize - 20; // 20 chars for separator
            String head = s.substring(0, headSize);
            String tail = s.substring(s.length() - tailSize);
            s = head + "\n[...truncated...]\n" + tail;
        }

        return s;
    }
}