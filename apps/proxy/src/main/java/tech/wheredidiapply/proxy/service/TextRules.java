package tech.wheredidiapply.proxy.service;

import java.util.Locale;
import java.util.regex.Pattern;

public final class TextRules {
    private TextRules() {}

    // ─── Rejection patterns (contextual — not bare "unfortunately") ───
    private static final Pattern REJECT_1 = Pattern.compile(
            "\\bnot\\s+(?:going\\s+to\\s+)?move\\s+forward\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern REJECT_2 = Pattern.compile(
            "\\bafter\\s+careful\\s+(?:review|consideration)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern REJECT_3 = Pattern.compile(
            "\\b(?:we\\s+have\\s+)?filled\\s+(?:this|the)\\s+(?:position|role)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern REJECT_4 = Pattern.compile(
            "\\bunfortunately[,.]?\\s+(?:we|your|the\\s+position|this\\s+position|at\\s+this\\s+time|after)", Pattern.CASE_INSENSITIVE);
    private static final Pattern REJECT_5 = Pattern.compile(
            "\\bdecided\\s+not\\s+to\\s+proceed\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern REJECT_6 = Pattern.compile(
            "\\bwe\\s+regret\\s+to\\s+inform\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern REJECT_7 = Pattern.compile(
            "\\bnot\\s+(?:been?\\s+)?selected\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern REJECT_8 = Pattern.compile(
            "\\bpursuing\\s+other\\s+candidates\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern REJECT_9 = Pattern.compile(
            "\\bwill\\s+not\\s+be\\s+(?:moving|proceeding)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern REJECT_10 = Pattern.compile(
            "\\bunable\\s+to\\s+offer\\s+you\\b", Pattern.CASE_INSENSITIVE);

    // ─── Interview patterns ───
    private static final Pattern INTERVIEW_1 = Pattern.compile(
            "\\binvit(?:e|ed|ing)\\s+(?:you\\s+)?(?:to|for)\\s+(?:an?\\s+)?(?:phone\\s+|video\\s+|virtual\\s+|technical\\s+|on-?site\\s+)?interview",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern INTERVIEW_2 = Pattern.compile(
            "\\bschedule\\s+(?:an?\\s+)?(?:phone\\s+|video\\s+|virtual\\s+|technical\\s+)?interview\\b",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern INTERVIEW_3 = Pattern.compile(
            "\\binterview\\s+(?:invitation|confirmation|scheduled|details)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern INTERVIEW_4 = Pattern.compile(
            "\\blike\\s+to\\s+(?:invite|schedule)\\s+(?:you\\b)?.*\\binterview\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern INTERVIEW_5 = Pattern.compile(
            "\\bnext\\s+(?:round|stage|step)\\s+(?:of\\s+)?(?:the\\s+)?(?:interview|hiring|selection)\\b",
            Pattern.CASE_INSENSITIVE);

    // ─── OA / Assessment patterns ───
    private static final Pattern OA_1 = Pattern.compile(
            "\\b(?:online|coding|technical)\\s+(?:assessment|challenge|test)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern OA_2 = Pattern.compile(
            "\\b(?:hackerrank|codesignal|codility|hirevue|karat|testgorilla)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern OA_3 = Pattern.compile(
            "\\bcomplete\\s+(?:the|your|an?)\\s+(?:online\\s+)?(?:assessment|challenge|test)\\b",
            Pattern.CASE_INSENSITIVE);

    // ─── Offer patterns ───
    private static final Pattern OFFER_1 = Pattern.compile(
            "\\bpleas(?:e|ed)\\s+to\\s+(?:extend|offer|present)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern OFFER_2 = Pattern.compile(
            "\\boffer\\s+(?:of\\s+)?employment\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern OFFER_3 = Pattern.compile(
            "\\bcongratulations\\b.*\\b(?:offer|position|role)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern OFFER_4 = Pattern.compile(
            "\\boffer\\s+letter\\b", Pattern.CASE_INSENSITIVE);

    // ─── Action required patterns ───
    private static final Pattern ACTION_1 = Pattern.compile(
            "\\bcomplete\\s+(?:your|the|our)\\s+(?:application|profile)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern ACTION_2 = Pattern.compile(
            "\\bsubmit\\s+(?:your|our|the)\\s+(?:official\\s+)?application\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern ACTION_3 = Pattern.compile(
            "\\bto\\s+proceed\\b.*\\bsubmit\\b", Pattern.CASE_INSENSITIVE);

    // ─── Under review patterns ───
    private static final Pattern REVIEW_1 = Pattern.compile(
            "\\b(?:application\\s+(?:is\\s+)?)?(?:currently\\s+)?under\\s+review\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern REVIEW_2 = Pattern.compile(
            "\\breviewing\\s+your\\s+(?:application|resume|profile|qualifications)\\b", Pattern.CASE_INSENSITIVE);

    // ─── Application received / confirmation ───
    private static final Pattern RECEIVED_1 = Pattern.compile(
            "\\b(?:we\\s+)?(?:have\\s+)?received\\s+your\\s+application\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern RECEIVED_2 = Pattern.compile(
            "\\bapplication\\s+(?:has\\s+been\\s+)?(?:successfully\\s+)?(?:received|submitted)\\b",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern RECEIVED_3 = Pattern.compile(
            "\\bthanks?\\s+(?:you\\s+)?for\\s+(?:your\\s+)?appl(?:ying|ication)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern RECEIVED_4 = Pattern.compile(
            "\\bconfirm(?:ing|ation)\\s+(?:of\\s+)?(?:your\\s+)?(?:application|submission)\\b",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern RECEIVED_5 = Pattern.compile(
            "\\bthank\\s+you\\s+for\\s+your\\s+interest\\b", Pattern.CASE_INSENSITIVE);

    // ─── Job-email detection signals (for isLikelyJobEmail) ───
    private static final Pattern JOB_FROM_PATTERN = Pattern.compile(
            "(?:career|recruit|talent|jobs?|hiring|hr|people|staffing)s?[@.]",
            Pattern.CASE_INSENSITIVE);

    // ATS platform domains — emails from these are always job-related
    private static final Pattern ATS_FROM_PATTERN = Pattern.compile(
            "(?:greenhouse|lever|ashbyhq|workday|myworkday|smartrecruiters|icims|taleo|jobvite|applytojob|breezy)",
            Pattern.CASE_INSENSITIVE);

    private static final String[] JOB_KEYWORDS = {
            "application", "applied", "applying", "applicant", "candidate",
            "position", "role", "job opening", "resume", "cv ",
            "hiring", "recruit", "interview", "offer letter",
            "onboarding", "background check", "start date",
            "greenhouse", "workday", "lever", "taleo", "icims",
            "hackerrank", "codesignal", "codility", "hirevue",
            "assessment", "coding challenge"
    };

    /**
     * Quick check: does this email look job-related at all?
     * Used for pre-filtering before expensive classification.
     */
    public static boolean isLikelyJobEmail(String subject, String from, String bodySnippet) {
        String subj = normalize(subject);
        String frm = normalize(from);
        // Only check first 2000 chars of body for speed
        String body = normalize(bodySnippet.length() > 2000 ? bodySnippet.substring(0, 2000) : bodySnippet);
        String combined = subj + " " + frm + " " + body;

        // Strong subject signals — if subject matches any known pattern, it's job-related
        if (matchesAny(subj,
                RECEIVED_1, RECEIVED_2, RECEIVED_3, RECEIVED_4, RECEIVED_5,
                REVIEW_1, REVIEW_2,
                INTERVIEW_1, INTERVIEW_2, INTERVIEW_3,
                OA_1, OA_2,
                OFFER_1, OFFER_2, OFFER_3, OFFER_4,
                REJECT_1, REJECT_2, REJECT_4, REJECT_5, REJECT_6, REJECT_7)) {
            return true;
        }

        // From address signals (careers@, recruiting@, etc.)
        if (JOB_FROM_PATTERN.matcher(frm).find()) {
            return true;
        }

        // ATS platform in From address — always job-related
        if (ATS_FROM_PATTERN.matcher(frm).find()) {
            return true;
        }

        // Count general job keywords — require at least 2 distinct matches in content
        int kwCount = 0;
        for (String kw : JOB_KEYWORDS) {
            if (combined.contains(kw)) {
                kwCount++;
                if (kwCount >= 2) return true;
            }
        }

        return false;
    }

    /**
     * Full classification via deterministic rules.
     * Returns a result with classification, status, and a confidence score.
     */
    public static RuleResult classify(String subject, String from, String body) {
        String text = normalize(subject) + "\n" + normalize(from) + "\n" + normalize(body);

        // Priority: offer > interview > OA > rejection > action > review > received

        if (matchesAny(text, OFFER_1, OFFER_2, OFFER_3, OFFER_4)) {
            return new RuleResult("OFFER", "OFFER", 0.85);
        }
        if (matchesAny(text, INTERVIEW_1, INTERVIEW_2, INTERVIEW_3, INTERVIEW_4, INTERVIEW_5)) {
            return new RuleResult("INTERVIEW", "INTERVIEW", 0.85);
        }
        if (matchesAny(text, OA_1, OA_2, OA_3)) {
            return new RuleResult("OA_ASSESSMENT", "OA", 0.83);
        }
        if (matchesAny(text, REJECT_1, REJECT_2, REJECT_3, REJECT_4, REJECT_5,
                REJECT_6, REJECT_7, REJECT_8, REJECT_9, REJECT_10)) {
            return new RuleResult("REJECTION", "REJECTED", 0.84);
        }
        if (matchesAny(text, ACTION_1, ACTION_2, ACTION_3)) {
            return new RuleResult("ACTION_REQUIRED", "ACTION_REQUIRED", 0.80);
        }
        if (matchesAny(text, REVIEW_1, REVIEW_2)) {
            return new RuleResult("APPLICATION_UNDER_REVIEW", "IN_REVIEW", 0.78);
        }
        if (matchesAny(text, RECEIVED_1, RECEIVED_2, RECEIVED_3, RECEIVED_4, RECEIVED_5)) {
            return new RuleResult("APPLICATION_CONFIRMATION", "APPLIED", 0.80);
        }

        return new RuleResult("OTHER", "UNKNOWN", 0.30);
    }

    private static boolean matchesAny(String text, Pattern... patterns) {
        for (Pattern p : patterns) {
            if (p.matcher(text).find()) return true;
        }
        return false;
    }

    private static String normalize(String s) {
        if (s == null) return "";
        return s.toLowerCase(Locale.ROOT);
    }

    public record RuleResult(String classification, String status, double confidence) {}
}