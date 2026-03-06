package tech.wheredidiapply.proxy.limits;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import tech.wheredidiapply.proxy.error.ApiException;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class RunQuotaService {

    private final int maxEmailsPerRun;
    private final Map<String, Integer> used = new ConcurrentHashMap<>();

    public RunQuotaService(@Value("${proxy.limits.max-emails-per-run}") int maxEmailsPerRun) {
        this.maxEmailsPerRun = maxEmailsPerRun;
    }

    public void checkAndConsume(String runId, int emails) {
        int cur = used.getOrDefault(runId, 0);
        if (cur + emails > maxEmailsPerRun) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "RUN_QUOTA_EXCEEDED",
                    "Run quota exceeded. Narrow date range and try again.");
        }
        used.put(runId, cur + emails);
    }
}
