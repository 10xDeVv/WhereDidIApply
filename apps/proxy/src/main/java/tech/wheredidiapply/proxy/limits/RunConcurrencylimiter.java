package tech.wheredidiapply.proxy.limits;

import org.springframework.stereotype.Component;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;

@Component
public class RunConcurrencylimiter {
    private final ConcurrentHashMap<String, Semaphore> locks = new ConcurrentHashMap<>();

    public void acquire(String runId) {
        locks.computeIfAbsent(runId, k -> new Semaphore(4)).acquireUninterruptibly();
    }

    public void release(String runId) {
        Semaphore s = locks.get(runId);
        if (s != null) s.release();
    }
}
