package tech.wheredidiapply.proxy.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import tech.wheredidiapply.proxy.error.ApiException;
import tech.wheredidiapply.proxy.model.CreateRunResponse;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;

@Service
public class RunTokenService {

    private final TokenCodec codec;
    private final int ttlMinutes;
    private final Map<String, Object> limits;

    public RunTokenService(
            TokenCodec codec,
            @Value("${proxy.token.ttl-minutes}") int ttlMinutes,
            @Value("${proxy.limits.max-emails-per-run}") int maxEmailsPerRun,
            @Value("${proxy.limits.max-chars-per-email}") int maxCharsPerEmail,
            @Value("${proxy.limits.requests-per-minute-per-run}") int rpm
    ) {
        this.codec = codec;
        this.ttlMinutes = ttlMinutes;
        this.limits = Map.of(
                "maxEmails", maxEmailsPerRun,
                "maxCharsPerEmail", maxCharsPerEmail,
                "requestsPerMinute", rpm
        );
    }

    public CreateRunResponse createRun(String ip) {
        String runId = "run_" + UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        Instant expiresAt = Instant.now().plus(ttlMinutes, ChronoUnit.MINUTES);

        String token = codec.sign(new TokenCodec.Payload(runId, ip, expiresAt.getEpochSecond()));
        return new CreateRunResponse(runId, token, expiresAt, limits);
    }

    public VerifiedRun verify(String authorizationHeader) {
        String token = extractBearer(authorizationHeader);
        TokenCodec.Payload payload = codec.verify(token);

        long now = Instant.now().getEpochSecond();
        if (payload.expEpochSec() < now) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "TOKEN_EXPIRED", "Run token expired. Start a new run.");
        }
        return new VerifiedRun(payload.runId(), payload.ip());
    }

    private String extractBearer(String header) {
        if (header == null) throw new ApiException(HttpStatus.UNAUTHORIZED, "MISSING_AUTH", "Missing Authorization header.");
        if (!header.startsWith("Bearer ")) throw new ApiException(HttpStatus.UNAUTHORIZED, "BAD_AUTH", "Invalid Authorization header.");
        return header.substring("Bearer ".length()).trim();
    }

    public record VerifiedRun(String runId, String ip) {}
}
