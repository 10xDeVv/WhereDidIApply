package tech.wheredidiapply.proxy.security;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import tech.wheredidiapply.proxy.error.ApiException;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;

@Component
public class TokenCodec {

    private static final Logger log = LoggerFactory.getLogger(TokenCodec.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private final byte[] secretKeyBytes;

    public TokenCodec(@Value("${proxy.token.secret}") String secret) {
        if (secret == null || secret.length() < 32) {
            log.error("Token secret is too short or missing! Must be at least 32 chars.");
            throw new IllegalStateException("Weak token secret configured.");
        }
        this.secretKeyBytes = secret.getBytes(StandardCharsets.UTF_8);
    }

    public String sign(Payload payload) {
        try {
            String headerJson = "{\"alg\":\"HS256\",\"typ\":\"RUN\"}";
            String payloadJson = MAPPER.writeValueAsString(payload);

            String header = b64Url(headerJson.getBytes(StandardCharsets.UTF_8));
            String body = b64Url(payloadJson.getBytes(StandardCharsets.UTF_8));

            String toSign = header + "." + body;
            String signature = b64Url(hmacSha256(toSign.getBytes(StandardCharsets.UTF_8)));

            return toSign + "." + signature;
        } catch (JsonProcessingException e) {
            log.error("Failed to serialize token payload", e);
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "TOKEN_SIGN_FAILED", "Token signing failed.");
        } catch (Exception e) {
             log.error("Unexpected error signing token", e);
             throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "TOKEN_SIGN_FAILED", "Token signing failed.");
        }
    }

    public Payload verify(String token) {
        if (token == null) throw new ApiException(HttpStatus.UNAUTHORIZED, "MISSING_TOKEN", "Token is missing.");

        try {
            String[] parts = token.split("\\.");
            if (parts.length != 3) {
                 throw new ApiException(HttpStatus.UNAUTHORIZED, "BAD_TOKEN_FORMAT", "Invalid token format.");
            }

            String contentToSign = parts[0] + "." + parts[1];
            String expectedSig = b64Url(hmacSha256(contentToSign.getBytes(StandardCharsets.UTF_8)));

            if (!constantTimeEquals(expectedSig, parts[2])) {
                log.warn("Token signature mismatch.");
                throw new ApiException(HttpStatus.UNAUTHORIZED, "BAD_TOKEN_SIG", "Invalid token signature.");
            }

            byte[] payloadBytes = Base64.getUrlDecoder().decode(parts[1]);
            return MAPPER.readValue(payloadBytes, Payload.class);

        } catch (ApiException ae) {
            throw ae;
        } catch (IllegalArgumentException e) {
            log.warn("Token Base64 decoding failed: {}", e.getMessage());
             throw new ApiException(HttpStatus.UNAUTHORIZED, "BAD_TOKEN_B64", "Invalid token encoding.");
        } catch (Exception e) {
            log.error("Token verification failed", e);
            throw new ApiException(HttpStatus.UNAUTHORIZED, "BAD_TOKEN", "Invalid token.");
        }
    }

    private byte[] hmacSha256(byte[] data) throws NoSuchAlgorithmException, InvalidKeyException {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secretKeyBytes, "HmacSHA256"));
        return mac.doFinal(data);
    }

    private String b64Url(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private boolean constantTimeEquals(String a, String b) {
        if (a == null || b == null) return false;
        if (a.length() != b.length()) return false;
        int res = 0;
        for (int i = 0; i < a.length(); i++) res |= a.charAt(i) ^ b.charAt(i);
        return res == 0;
    }

    public record Payload(String runId, String ip, long expEpochSec) {}
}
