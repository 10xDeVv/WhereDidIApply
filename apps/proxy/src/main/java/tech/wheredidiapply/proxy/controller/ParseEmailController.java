package tech.wheredidiapply.proxy.controller;

import com.fasterxml.jackson.core.JsonProcessingException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import tech.wheredidiapply.proxy.limits.RateLimitService;
import tech.wheredidiapply.proxy.limits.RunConcurrencylimiter;
import tech.wheredidiapply.proxy.limits.RunQuotaService;
import tech.wheredidiapply.proxy.model.ParseEmailRequest;
import tech.wheredidiapply.proxy.model.ParseEmailResponse;
import tech.wheredidiapply.proxy.security.RunTokenService;
import tech.wheredidiapply.proxy.service.EmailParsingService;

@RestController
@RequestMapping("/api")
public class ParseEmailController {

    private final EmailParsingService emailParsingService;
    private final RunTokenService runTokenService;
    private final RateLimitService rateLimitService;
    private final RunQuotaService runQuotaService;
    private final RunConcurrencylimiter limiter;
    private static final int MAX_CHARS = 20_000;


    public ParseEmailController(
            EmailParsingService emailParsingService,
            RunTokenService runTokenService,
            RateLimitService rateLimitService,
            RunQuotaService runQuotaService, RunConcurrencylimiter limiter
    ) {
        this.emailParsingService = emailParsingService;
        this.runTokenService = runTokenService;
        this.rateLimitService = rateLimitService;
        this.runQuotaService = runQuotaService;
        this.limiter = limiter;
    }

    @PostMapping("/parse-email")
    public ResponseEntity<ParseEmailResponse> parseEmail(
            @RequestHeader("Authorization") String authorization,
            @RequestBody @Valid ParseEmailRequest request,
            HttpServletRequest http
    ) throws JsonProcessingException {

        String ip = clientIp(http);

        // 1) Validate run token
        var run = runTokenService.verify(authorization);

        // 2) Rate limit + quota
        rateLimitService.check(run.runId(), ip);
        runQuotaService.checkAndConsume(run.runId(), 1);

        // 3) Normalize + truncate
        String cleaned = normalizeEmail(request.getEmailContent());
        if (cleaned.length() > MAX_CHARS) {
            cleaned = cleaned.substring(0, MAX_CHARS);
        }
        request.setEmailContent(cleaned);

        // 4) Skip obvious marketing
        if (looksLikeMarketing(request.getSubject(), request.getFrom(), cleaned)) {
            return ResponseEntity.ok(ParseEmailResponse.marketingSkip(request.getMessageId()));
        }

        // 5) Parse via rules → Gemini fallback
        limiter.acquire(run.runId());
        try {
            ParseEmailResponse response = emailParsingService.parseEmailContent(request);
            return ResponseEntity.ok(response);
        } finally {
            limiter.release(run.runId());
        }
    }

    private String clientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) return xff.split(",")[0].trim();
        return request.getRemoteAddr();
    }

    private String normalizeEmail(String s) {
        if (s == null) return "";
        s = s.replaceAll("(?is)<style.*?>.*?</style>", " ");
        s = s.replaceAll("(?is)<script.*?>.*?</script>", " ");
        s = s.replaceAll("(?is)<[^>]+>", " ");
        s = s.replaceAll("[\\t\\x0B\\f\\r ]+", " ");
        s = s.replaceAll("\\n{3,}", "\n\n");
        return s.trim();
    }

    private boolean looksLikeMarketing(String subject, String from, String body) {
        String s = (subject == null ? "" : subject).toLowerCase();
        String f = (from == null ? "" : from).toLowerCase();
        String b = (body == null ? "" : body).toLowerCase();

        // Count marketing / non-job signals — require at least 2 to skip
        int signals = 0;
        if (b.contains("view in browser") || b.contains("view this email in")) signals++;
        if (s.contains("deal") || s.contains("sale") || s.contains("newsletter") || s.contains("% off")
                || s.contains("order confirmed") || s.contains("shipping") || s.contains("receipt")) signals++;
        if (f.contains("noreply@marketing") || f.contains("promo") || f.contains("newsletter")
                || f.contains("store") || f.contains("shop")) signals++;
        if (b.contains("unsubscribe") && !b.contains("application") && !b.contains("apply")
                && !b.contains("position") && !b.contains("role")) signals++;
        if (b.contains("privacy statement") && !b.contains("application") && !b.contains("apply")
                && !b.contains("position") && !b.contains("candidate")) signals++;
        // Social media notifications
        if (f.contains("facebookmail") || f.contains("twitter.com") || f.contains("instagram")
                || f.contains("tiktok") || f.contains("reddit") || f.contains("discord")) signals += 2;
        // Subscription / billing
        if (s.contains("subscription") || s.contains("invoice") || s.contains("payment")
                || s.contains("billing")) signals++;

        return signals >= 2;
    }


}
