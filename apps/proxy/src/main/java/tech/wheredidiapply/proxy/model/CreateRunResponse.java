package tech.wheredidiapply.proxy.model;

import java.time.Instant;
import java.util.Map;

public record CreateRunResponse(
        String runId,
        String runToken,
        Instant expiresAt,
        Map<String, Object> limits
) {}
