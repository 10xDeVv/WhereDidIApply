package tech.wheredidiapply.proxy.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;
import tech.wheredidiapply.proxy.model.CreateRunResponse;
import tech.wheredidiapply.proxy.security.RunTokenService;

import java.util.Map;

@RestController
@RequestMapping("/api")
public class RunController {

    private final RunTokenService runTokenService;

    public RunController(RunTokenService runTokenService) {
        this.runTokenService = runTokenService;
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of("ok", true);
    }

    @PostMapping("/runs")
    public CreateRunResponse createRun(HttpServletRequest request) {
        String ip = clientIp(request);
        return runTokenService.createRun(ip);
    }

    private String clientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) return xff.split(",")[0].trim();
        return request.getRemoteAddr();
    }
}
