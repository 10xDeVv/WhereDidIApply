package tech.wheredidiapply.proxy.limits;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
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
        w.updateLastAccess();
        w.rotateIfNeeded();
        if (w.count >= rpm) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMITED",
                    "Too many requests. Slow down.");
        }
        w.count++;
    }

    @Scheduled(fixedRate = 3600000)
    public void cleanup() {
        long threshold = Instant.now().minusSeconds(7200).getEpochSecond();
        perRunWindow.entrySet().removeIf(entry -> entry.getValue().lastAccess < threshold);
    }

    private static class Window {
        long startSec = Instant.now().getEpochSecond();
        long lastAccess = Instant.now().getEpochSecond();
        int count = 0;

        void updateLastAccess() {
            this.lastAccess = Instant.now().getEpochSecond();
        }

        void rotateIfNeeded() {
            long now = Instant.now().getEpochSecond();
            if (now - startSec >= 60) {
                startSec = now;
                count = 0;
            }
        }
    }
}
