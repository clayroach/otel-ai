# Simple Migration Container for ClickHouse
# Provides schema management and migration capabilities

FROM alpine:latest

# Install required tools including curl for HTTP requests to ClickHouse
RUN apk add --no-cache bash curl jq

# Create migration directory structure
WORKDIR /migrations

# Copy migration files
COPY atlas.hcl .
COPY schema/ ./schema/
COPY clickhouse/ ./clickhouse/
COPY scripts/ ./scripts/

# Copy and setup entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh scripts/*.sh

# Default environment variables
ENV CLICKHOUSE_HOST=clickhouse \
    CLICKHOUSE_PORT=9000 \
    CLICKHOUSE_DATABASE=otel \
    CLICKHOUSE_USER=otel \
    CLICKHOUSE_PASSWORD=otel123 \
    MIGRATION_MODE=migrate

# Health check - validates schema is ready
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD /entrypoint.sh validate || exit 1

# Use the self-contained entrypoint
ENTRYPOINT ["/entrypoint.sh"]