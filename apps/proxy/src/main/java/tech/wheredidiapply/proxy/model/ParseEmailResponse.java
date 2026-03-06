package tech.wheredidiapply.proxy.model;

import java.util.List;
import java.util.Map;

public record ParseEmailResponse(
        String messageId,
        String classification,
        double confidence,
        Extracted extracted,
        Map<String, Object> signals
) {
    public record Extracted(
            String company,
            String role,
            String location,
            String status,
            String eventDate,
            List<Link> links
    ) {}

    public record Link(String type, String url) {}

    /* =========================
       Factory helpers
       ========================= */

    public static ParseEmailResponse marketingSkip(String messageId) {
        return new ParseEmailResponse(
                messageId,
                "MARKETING",
                1.0,
                new Extracted(
                        null,
                        null,
                        null,
                        "SKIPPED",
                        null,
                        List.of()
                ),
                Map.of(
                        "engine", "rules",
                        "reason", "marketing_detected"
                )
        );
    }

    public static ParseEmailResponse unknown(String messageId, String engine) {
        return new ParseEmailResponse(
                messageId,
                "OTHER",
                0.0,
                new Extracted(
                        null,
                        null,
                        null,
                        "UNKNOWN",
                        null,
                        List.of()
                ),
                Map.of("engine", engine)
        );
    }
}
