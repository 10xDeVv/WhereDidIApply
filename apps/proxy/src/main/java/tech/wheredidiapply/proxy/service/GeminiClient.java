package tech.wheredidiapply.proxy.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import tech.wheredidiapply.proxy.error.ApiException;
import tech.wheredidiapply.proxy.model.ParseEmailResponse;

import java.time.Duration;
import java.util.*;

@Component
public class GeminiClient {

    private static final Logger log = LoggerFactory.getLogger(GeminiClient.class);

    private final WebClient webClient;
    private final ObjectMapper om = new ObjectMapper();

    private final String url;
    private final String apiKey;
    private final Duration timeout;

    public GeminiClient(
            @Value("${llm.api.url}") String url,
            @Value("${llm.api.key}") String apiKey,
            @Value("${llm.api.timeout-seconds}") int timeoutSeconds
    ) {
        this.url = url;
        this.apiKey = apiKey;
        this.timeout = Duration.ofSeconds(timeoutSeconds);
        this.webClient = WebClient.builder().build();
    }

    @CircuitBreaker(name = "gemini", fallbackMethod = "fallbackParse")
    public GeminiParsed parse(String prompt) {
        if (apiKey == null || apiKey.isBlank()) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "GEMINI_KEY_MISSING",
                    "Gemini API key missing. Set GEMINI_API_KEY.");
        }

        GeminiGenerateContentRequest req = new GeminiGenerateContentRequest(
                List.of(new Content(List.of(new Part(prompt)))),
                new GenerationConfig(
                        0.0,
                        4096,
                        "application/json",
                        responseSchema()
                )
        );

        String respBody = webClient.post()
                .uri(url + "?key=" + apiKey)
                .contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.APPLICATION_JSON)
                .bodyValue(req)
                .retrieve()
                .onStatus(s -> s.value() == 429, r -> Mono.error(
                        new ApiException(HttpStatus.TOO_MANY_REQUESTS, "GEMINI_RATE_LIMIT", "Gemini rate limited. Try again.")
                ))
                .onStatus(status -> status.is4xxClientError() && status.value() != 429,
                        r -> r.bodyToMono(String.class).defaultIfEmpty("")
                                .flatMap(body -> Mono.error(new ApiException(
                                        HttpStatus.BAD_GATEWAY,
                                        "GEMINI_4XX",
                                        "Gemini 4xx (" + r.statusCode().value() + "): " + body
                                )))
                )
                .onStatus(org.springframework.http.HttpStatusCode::is5xxServerError,
                        r -> r.bodyToMono(String.class).defaultIfEmpty("")
                                .flatMap(body -> Mono.error(new ApiException(
                                        HttpStatus.BAD_GATEWAY,
                                        "GEMINI_5XX",
                                        "Gemini 5xx: " + body
                                )))
                )
                .bodyToMono(String.class)
                .timeout(timeout)
                // Retry on: timeouts, 5xx, AND 429 rate limits (critical for Gemini free tier)
                .retryWhen(reactor.util.retry.Retry.backoff(4, Duration.ofSeconds(2))
                        .maxBackoff(Duration.ofSeconds(30))
                        .jitter(0.3)
                        .filter(ex ->
                                ex instanceof java.util.concurrent.TimeoutException ||
                                        (ex instanceof ApiException ae && (
                                                ae.getStatus().is5xxServerError() ||
                                                ae.getStatus().value() == 429
                                        ))
                        )
                )
                .block();

        String rawText = extractCandidateText(respBody);
        if (rawText == null || rawText.isBlank()) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "GEMINI_NO_TEXT", "Gemini returned no candidate text.");
        }

        String json = extractJsonObject(rawText);
        if (json == null) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "GEMINI_BAD_JSON",
                    "Gemini output did not contain a JSON object.");
        }

        try {
            JsonNode out = om.readTree(json);

            String classification = out.path("classification").asText("OTHER");
            double confidence = out.path("confidence").asDouble(0.0);
            String company = optText(out, "company");
            String role = optText(out, "role");
            String location = optText(out, "location");
            String status = Optional.ofNullable(optText(out, "status"))
                                    .filter(s -> !s.isBlank())
                                    .orElse("UNKNOWN");
            String eventDate = optText(out, "eventDate");

            List<ParseEmailResponse.Link> links = new ArrayList<>();
            JsonNode linksNode = out.path("links");
            if (linksNode.isArray()) {
                for (JsonNode ln : linksNode) {
                    String type = ln.path("type").asText(null);
                    String u = ln.path("url").asText(null);
                    if (u != null && !u.isBlank()) links.add(new ParseEmailResponse.Link(type, u));
                }
            }

            return new GeminiParsed(classification, confidence, company, role, location, status, eventDate, links);

        } catch (Exception e) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "GEMINI_BAD_JSON",
                    "Gemini output JSON could not be parsed.");
        }
    }

    public GeminiParsed fallbackParse(String prompt, Exception e) {
        // Log the reason
        log.warn("Gemini fallback triggered: {} ({})", e.getMessage(), e.getClass().getSimpleName());

        // If it's a specific API exception that is NOT a 5xx (e.g. Bad Request), rethrow it
        // so we don't hide client errors.
        if (e instanceof ApiException ae && !ae.getStatus().is5xxServerError()) {
             throw ae;
        }

        // Otherwise (Timeout, 500, CircuitOpen), throw a 503 so the caller knows the AI is down
        throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "GEMINI_DOWN", "AI Service unavailable.");
    }

    private String extractCandidateText(String respBody) {
        try {
            JsonNode resp = om.readTree(respBody);

            // Check if the prompt was blocked entirely
            JsonNode promptFeedback = resp.path("promptFeedback");
            if (promptFeedback.has("blockReason")) {
                String reason = promptFeedback.path("blockReason").asText("UNKNOWN");
                throw new ApiException(HttpStatus.BAD_GATEWAY, "GEMINI_BLOCKED",
                        "Gemini blocked the prompt: " + reason);
            }

            JsonNode candidates = resp.path("candidates");
            if (!candidates.isArray() || candidates.isEmpty()) return null;

            JsonNode candidate = candidates.get(0);

            // Check finish reason — SAFETY or RECITATION means the content was filtered
            String finishReason = candidate.path("finishReason").asText("");
            if ("SAFETY".equalsIgnoreCase(finishReason) || "RECITATION".equalsIgnoreCase(finishReason)) {
                log.warn("Gemini candidate blocked with finishReason={}", finishReason);
                return null;
            }

            JsonNode parts = candidate.path("content").path("parts");
            if (!parts.isArray() || parts.isEmpty()) return null;

            // Join all text parts (not just parts[0])
            StringBuilder sb = new StringBuilder();
            for (JsonNode p : parts) {
                String t = p.path("text").asText("");
                if (!t.isBlank()) {
                    if (!sb.isEmpty()) sb.append("\n");
                    sb.append(t);
                }
            }
            return sb.toString();

        } catch (ApiException ae) {
            throw ae;
        } catch (Exception e) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "GEMINI_BAD_RESPONSE",
                    "Gemini response was not valid JSON: " + safeSnippet(respBody));
        }
    }

    private String extractJsonObject(String text) {
        if (text == null) return null;

        // Strip markdown code fences that Gemini sometimes wraps around JSON
        String stripped = text.strip();
        if (stripped.startsWith("```")) {
            // Remove opening fence (```json or ```)
            int firstNewline = stripped.indexOf('\n');
            if (firstNewline != -1) {
                stripped = stripped.substring(firstNewline + 1);
            }
            // Remove closing fence
            if (stripped.endsWith("```")) {
                stripped = stripped.substring(0, stripped.length() - 3);
            }
            stripped = stripped.strip();
        }

        // Try parsing the whole thing as JSON first (most common case with responseMimeType)
        try {
            om.readTree(stripped);
            if (stripped.startsWith("{")) return stripped;
        } catch (Exception ignored) {}

        // Fallback: find first { and try to match with last }
        int firstBrace = stripped.indexOf('{');
        if (firstBrace == -1) {
            return null; // No opening brace, not a JSON object
        }

        // Start from the end and try to find a parseable JSON object
        for (int i = stripped.length() - 1; i >= firstBrace; i--) {
            if (stripped.charAt(i) == '}') {
                String candidateJson = stripped.substring(firstBrace, i + 1);
                try {
                    // Attempt to parse the candidate JSON string
                    om.readTree(candidateJson);
                    // If successful, this is a valid JSON object
                    return candidateJson.trim();
                } catch (Exception e) {
                    // Not a valid JSON, continue searching for an earlier closing brace
                }
            }
        }
        return null; // No parseable JSON object found
    }

    private String safeSnippet(String s) {
        if (s == null) return "";
        s = s.replaceAll("\\s+", " ").trim();
        return s.length() <= 300 ? s : s.substring(0, 300) + "...";
    }

    private String optText(JsonNode node, String key) {
        JsonNode v = node.get(key);
        if (v == null || v.isNull()) return null;
        String s = v.asText();
        return (s == null || s.isBlank()) ? null : s;
    }

    // JSON schema to force strict output with enum constraints
    private Map<String, Object> responseSchema() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("classification", Map.of(
                "type", "STRING",
                "enum", List.of("APPLICATION_CONFIRMATION", "OA_ASSESSMENT", "INTERVIEW",
                        "OFFER", "REJECTION", "ACTION_REQUIRED", "OTHER")
        ));
        props.put("confidence", Map.of("type", "NUMBER"));
        props.put("company", Map.of("type", "STRING"));
        props.put("role", Map.of("type", "STRING"));
        props.put("location", Map.of("type", "STRING"));
        props.put("status", Map.of(
                "type", "STRING",
                "enum", List.of("APPLIED", "IN_REVIEW", "OA", "INTERVIEW",
                        "OFFER", "REJECTED", "ACTION_REQUIRED", "UNKNOWN")
        ));
        props.put("eventDate", Map.of("type", "STRING"));
        props.put("links", Map.of(
                "type", "ARRAY",
                "items", Map.of(
                        "type", "OBJECT",
                        "properties", Map.of(
                                "type", Map.of("type", "STRING"),
                                "url", Map.of("type", "STRING")
                        ),
                        "required", List.of("url")
                )
        ));

        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "OBJECT");
        schema.put("properties", props);
        schema.put("required", List.of("classification", "confidence", "status", "links"));
        return schema;
    }

    public record GeminiParsed(
            String classification,
            double confidence,
            String company,
            String role,
            String location,
            String status,
            String eventDate,
            List<ParseEmailResponse.Link> links
    ) {}

    // Gemini request DTOs
    public record GeminiGenerateContentRequest(
            List<Content> contents,
            GenerationConfig generationConfig
    ) {}

    public record Content(List<Part> parts) {}
    public record Part(String text) {}

    public record GenerationConfig(
            double temperature,
            int maxOutputTokens,
            String responseMimeType,
            Map<String, Object> responseSchema
    ) {}
}
