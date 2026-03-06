package tech.wheredidiapply.proxy.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import tech.wheredidiapply.proxy.error.ApiException;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

@Component
public class TokenCodec {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private final byte[] secret;

    public TokenCodec(@Value("${proxy.token.secret}") String secret) {
        this.secret = secret.getBytes(StandardCharsets.UTF_8);
    }

    public String sign(Payload payload) {
        try {
            String headerJson = "{\"alg\":\"HS256\",\"typ\":\"RUN\"}";
            String payloadJson = MAPPER.writeValueAsString(payload);

            String header = b64Url(headerJson.getBytes(StandardCharsets.UTF_8));
            String body = b64Url(payloadJson.getBytes(StandardCharsets.UTF_8));

            String toSign = header + "." + body;
            String sig = b64Url(hmacSha256(toSign.getBytes(StandardCharsets.UTF_8)));

            return toSign + "." + sig;
        } catch (Exception e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "TOKEN_SIGN_FAILED", "Token signing failed.");
        }
    }

    public Payload verify(String token) {
        try {
            String[] parts = token.split("\\.");
            if (parts.length != 3) throw new ApiException(HttpStatus.UNAUTHORIZED, "BAD_TOKEN", "Invalid token.");

            String toSign = parts[0] + "." + parts[1];
            String expectedSig = b64Url(hmacSha256(toSign.getBytes(StandardCharsets.UTF_8)));

            if (!constantTimeEquals(expectedSig, parts[2])) {
                throw new ApiException(HttpStatus.UNAUTHORIZED, "BAD_TOKEN", "Invalid token.");
            }

            byte[] payloadBytes = Base64.getUrlDecoder().decode(parts[1]);
            return MAPPER.readValue(payloadBytes, Payload.class);
        } catch (ApiException ae) {
            throw ae;
        } catch (Exception e) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "BAD_TOKEN", "Invalid token.");
        }
    }

    private byte[] hmacSha256(byte[] data) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret, "HmacSHA256"));
        return mac.doFinal(data);
    }

    private String b64Url(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private boolean constantTimeEquals(String a, String b) {
        if (a.length() != b.length()) return false;
        int res = 0;
        for (int i = 0; i < a.length(); i++) res |= a.charAt(i) ^ b.charAt(i);
        return res == 0;
    }

    public record Payload(String runId, String ip, long expEpochSec) {}
}
