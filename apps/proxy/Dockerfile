# ── Stage 1: Build ──
FROM maven:3.9-eclipse-temurin-21 AS builder
WORKDIR /app

# Copy pom first (layer caching for deps)
COPY pom.xml ./
RUN mvn dependency:go-offline -B

# Copy source and build
COPY src ./src
RUN mvn package -DskipTests -B

# ── Stage 2: Production runner ──
FROM eclipse-temurin:21-jre AS runner
WORKDIR /app

# Copy the fat JAR
COPY --from=builder /app/target/*.jar app.jar

ENV GEMINI_API_KEY=""
ENV RUN_TOKEN_SECRET="change-me-in-production"

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
