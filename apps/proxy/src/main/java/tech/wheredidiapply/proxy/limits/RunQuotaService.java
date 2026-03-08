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
public class RunQuotaService {

    private final int maxEmailsPerRun;
    private final Map<String, Integer> used = new ConcurrentHashMap<>();
    private final Map<String, Long> lastAccess = new ConcurrentHashMap<>();

    public RunQuotaService(@Value("${proxy.limits.max-emails-per-run}") int maxEmailsPerRun) {
        this.maxEmailsPerRun = maxEmailsPerRun;
    }

    public void checkAndConsume(String runId, int emails) {
        lastAccess.put(runId, Instant.now().getEpochSecond());
        int cur = used.getOrDefault(runId, 0);
        if (cur + emails > maxEmailsPerRun) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "RUN_QUOTA_EXCEEDED",
                    "Run quota exceeded. Narrow date range and try again.");
        }
        used.put(runId, cur + emails);
    }

    @Scheduled(fixedRate = 3600000) // Run every hour
    public void cleanup() {
        long threshold = Instant.now().minusSeconds(7200).getEpochSecond(); // 2 hours
        lastAccess.entrySet().removeIf(entry -> {
            boolean expired = entry.getValue() < threshold;
            if (expired) {
                used.remove(entry.getKey());
            }
            return expired;
        });
    }
}
