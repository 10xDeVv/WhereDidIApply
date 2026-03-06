package tech.wheredidiapply.proxy.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class ParseEmailRequest {

    // Optional but useful for debugging without leaking content
    private String messageId;
    private String subject;
    private String from;

    @NotBlank
    @Size(max = 500_000)
    private String emailContent;

    public String getMessageId() { return messageId; }
    public void setMessageId(String messageId) { this.messageId = messageId; }

    public String getSubject() { return subject; }
    public void setSubject(String subject) { this.subject = subject; }

    public String getFrom() { return from; }
    public void setFrom(String from) { this.from = from; }

    public String getEmailContent() { return emailContent; }
    public void setEmailContent(String emailContent) { this.emailContent = emailContent; }
}
