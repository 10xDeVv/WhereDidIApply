package tech.wheredidiapply.proxy.limits;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import tech.wheredidiapply.proxy.error.ApiException;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class RateLimitService {

    private final int rpm;
    private final Map<String, Window> perRunWindow = new ConcurrentHashMap<>();

    public RateLimitService(@Value("${proxy.limits.requests-per-minute-per-run}") int rpm) {
        this.rpm = rpm;
    }

    public void check(String runId, String ip) {
        Window w = perRunWindow.computeIfAbsent(runId, k -> new Window());
        w.rotateIfNeeded();
        if (w.count >= rpm) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMITED",
                    "Too many requests. Slow down.");
        }
        w.count++;
    }

    private static class Window {
        long startSec = Instant.now().getEpochSecond();
        int count = 0;

        void rotateIfNeeded() {
            long now = Instant.now().getEpochSecond();
            if (now - startSec >= 60) {
                startSec = now;
                count = 0;
            }
        }
    }
}
