package tech.wheredidiapply.proxy.error;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.Instant;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ApiError> handle(ApiException ex) {
        log.warn("API Exception {}: {}", ex.getCode(), ex.getMessage());
        ApiError err = new ApiError(Instant.now(), ex.getStatus().value(), ex.getCode(), ex.getMessage());
        return ResponseEntity.status(ex.getStatus()).body(err);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException ex) {
        log.info("Validation error: {}", ex.getMessage());
        ApiError err = new ApiError(Instant.now(), 400, "VALIDATION_ERROR", "Invalid request.");
        return ResponseEntity.badRequest().body(err);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> handleGeneric(Exception ex) {
        log.error("Unhandled exception", ex);
        ApiError err = new ApiError(Instant.now(), 500, "INTERNAL_ERROR", "Something went wrong.");
        return ResponseEntity.status(500).body(err);
    }
}
