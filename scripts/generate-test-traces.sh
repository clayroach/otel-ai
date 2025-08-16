#!/bin/bash

# Test trace generator for direct ingestion
# Generates realistic test traces and inserts them into ai_traces_direct table

SERVICES=("user-api" "payment-gateway" "notification-service" "audit-logger" "cache-service")
OPERATIONS=("authenticate" "process-payment" "send-email" "log-event" "cache-get" "cache-set" "validate-token")
SPAN_KINDS=("SPAN_KIND_SERVER" "SPAN_KIND_CLIENT" "SPAN_KIND_INTERNAL")
STATUS_CODES=("STATUS_CODE_OK" "STATUS_CODE_ERROR")

# Generate random traces
generate_trace() {
    local trace_id=$(openssl rand -hex 16)
    local span_id=$(openssl rand -hex 8)
    local service=${SERVICES[$RANDOM % ${#SERVICES[@]}]}
    local operation=${OPERATIONS[$RANDOM % ${#OPERATIONS[@]}]}
    local span_kind=${SPAN_KINDS[$RANDOM % ${#SPAN_KINDS[@]}]}
    local status_code=${STATUS_CODES[$RANDOM % ${#STATUS_CODES[@]}]}
    local duration=$((RANDOM % 5000 + 100))  # 100ms to 5s
    local timestamp=$(date -u +"%Y-%m-%d %H:%M:%S")
    
    # Create some realistic attributes
    local method="GET"
    local status="200"
    if [[ "$status_code" == "STATUS_CODE_ERROR" ]]; then
        status="500"
    fi
    
    local parent_span_id=""
    if [[ $RANDOM -gt 16384 ]]; then  # 50% chance of having parent
        parent_span_id=$(openssl rand -hex 8)
    fi

    # Insert trace into ClickHouse
    docker exec otel-ai-clickhouse clickhouse-client --user=otel --password=otel123 --database=otel --query="
    INSERT INTO ai_traces_direct VALUES (
        '$trace_id',
        '$span_id',
        '$parent_span_id',
        '$operation',
        '$timestamp',
        ${duration}000000,
        '$service',
        '$status_code',
        '',
        '$span_kind',
        {'http.method': '$method', 'http.status_code': '$status', 'test.generator': 'true'},
        {'service.name': '$service', 'service.version': '1.0.0', 'environment': 'test'}
    )"
    
    echo "Generated trace: $service.$operation ($status_code, ${duration}ms)"
}

echo "Starting test trace generator..."
echo "Generating traces for direct ingestion path..."

# Generate 20 test traces
for i in {1..20}; do
    generate_trace
    sleep 0.5  # Small delay between traces
done

echo "Generated 20 test traces in ai_traces_direct table"