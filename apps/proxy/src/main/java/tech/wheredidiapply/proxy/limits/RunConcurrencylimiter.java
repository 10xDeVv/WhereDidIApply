package tech.wheredidiapply.proxy.limits;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;

@Component
public class RunConcurrencylimiter {
    private final ConcurrentHashMap<String, Semaphore> locks = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Long> lastAccess = new ConcurrentHashMap<>();

    public void acquire(String runId) {
        lastAccess.put(runId, Instant.now().getEpochSecond());
        locks.computeIfAbsent(runId, k -> new Semaphore(4)).acquireUninterruptibly();
    }

    public void release(String runId) {
        lastAccess.put(runId, Instant.now().getEpochSecond());
        Semaphore s = locks.get(runId);
        if (s != null) s.release();
    }

    @Scheduled(fixedRate = 3600000) // Run every hour
    public void cleanup() {
        long threshold = Instant.now().minusSeconds(7200).getEpochSecond(); // 2 hours
        lastAccess.entrySet().removeIf(entry -> {
            boolean expired = entry.getValue() < threshold;
            if (expired) {
                locks.remove(entry.getKey());
            }
            return expired;
        });
    }
}
