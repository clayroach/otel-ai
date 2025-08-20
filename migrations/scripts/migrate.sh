#!/bin/bash
set -e

# Migration script for ClickHouse schemas
# Uses Atlas for schema versioning and migration management

echo "🚀 Starting ClickHouse schema migration..."

# Environment variables with defaults
CLICKHOUSE_HOST=${CLICKHOUSE_HOST:-"clickhouse"}
CLICKHOUSE_PORT=${CLICKHOUSE_PORT:-"9000"}
CLICKHOUSE_DATABASE=${CLICKHOUSE_DATABASE:-"otel"}
CLICKHOUSE_USER=${CLICKHOUSE_USER:-"otel"}
CLICKHOUSE_PASSWORD=${CLICKHOUSE_PASSWORD:-"otel123"}
MIGRATION_ENV=${MIGRATION_ENV:-"local"}

# Build database URL
DATABASE_URL="clickhouse://${CLICKHOUSE_USER}:${CLICKHOUSE_PASSWORD}@${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}/${CLICKHOUSE_DATABASE}?secure=false"

echo "📍 Database: ${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}/${CLICKHOUSE_DATABASE}"
echo "🔧 Environment: ${MIGRATION_ENV}"

# Wait for ClickHouse to be ready
echo "⏳ Waiting for ClickHouse to be ready..."
for i in {1..30}; do
    if clickhouse-client --host="${CLICKHOUSE_HOST}" --port="${CLICKHOUSE_PORT}" --user="${CLICKHOUSE_USER}" --password="${CLICKHOUSE_PASSWORD}" --query="SELECT 1" >/dev/null 2>&1; then
        echo "✅ ClickHouse is ready!"
        break
    fi
    echo "   Attempt $i/30..."
    sleep 2
done

# Ensure database exists
echo "📦 Ensuring database exists..."
clickhouse-client \
    --host="${CLICKHOUSE_HOST}" \
    --port="${CLICKHOUSE_PORT}" \
    --user="${CLICKHOUSE_USER}" \
    --password="${CLICKHOUSE_PASSWORD}" \
    --query="CREATE DATABASE IF NOT EXISTS ${CLICKHOUSE_DATABASE}"

# Run Atlas migrations
echo "🔄 Running Atlas migrations..."
export DATABASE_URL

# Check if we need to initialize
if [ "$1" = "init" ]; then
    echo "🎬 Initializing migration history..."
    atlas migrate apply \
        --env="${MIGRATION_ENV}" \
        --url="${DATABASE_URL}" \
        --dir="file:///migrations/clickhouse" \
        --baseline="20250819000000"
fi

# Apply pending migrations
echo "📝 Applying pending migrations..."
atlas migrate apply \
    --env="${MIGRATION_ENV}" \
    --url="${DATABASE_URL}" \
    --dir="file:///migrations/clickhouse"

# Get migration status
echo "📊 Migration status:"
atlas migrate status \
    --env="${MIGRATION_ENV}" \
    --url="${DATABASE_URL}" \
    --dir="file:///migrations/clickhouse"

# Apply views (these are idempotent)
echo "👁️ Creating/updating views..."
clickhouse-client \
    --host="${CLICKHOUSE_HOST}" \
    --port="${CLICKHOUSE_PORT}" \
    --user="${CLICKHOUSE_USER}" \
    --password="${CLICKHOUSE_PASSWORD}" \
    --database="${CLICKHOUSE_DATABASE}" \
    --multiquery < /migrations/schema/views.sql

echo "✅ Migration completed successfully!"

# Optional: Validate schema
if [ "$2" = "validate" ]; then
    echo "🔍 Validating schema..."
    
    # Check required tables exist
    TABLES=(
        "otel_traces"
        "ai_traces_direct"
        "ai_anomalies"
        "ai_service_baselines"
    )
    
    for table in "${TABLES[@]}"; do
        if clickhouse-client \
            --host="${CLICKHOUSE_HOST}" \
            --port="${CLICKHOUSE_PORT}" \
            --user="${CLICKHOUSE_USER}" \
            --password="${CLICKHOUSE_PASSWORD}" \
            --database="${CLICKHOUSE_DATABASE}" \
            --query="EXISTS TABLE ${table}" | grep -q "1"; then
            echo "   ✅ Table ${table} exists"
        else
            echo "   ❌ Table ${table} missing!"
            exit 1
        fi
    done
    
    # Check views exist
    VIEWS=(
        "traces_unified_view"
        "service_summary_view"
        "operation_performance_view"
        "anomaly_candidates_view"
    )
    
    for view in "${VIEWS[@]}"; do
        if clickhouse-client \
            --host="${CLICKHOUSE_HOST}" \
            --port="${CLICKHOUSE_PORT}" \
            --user="${CLICKHOUSE_USER}" \
            --password="${CLICKHOUSE_PASSWORD}" \
            --database="${CLICKHOUSE_DATABASE}" \
            --query="EXISTS VIEW ${view}" | grep -q "1"; then
            echo "   ✅ View ${view} exists"
        else
            echo "   ❌ View ${view} missing!"
            exit 1
        fi
    done
    
    echo "✅ Schema validation passed!"
fi