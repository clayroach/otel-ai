#!/bin/bash
# Self-contained entrypoint for migration container
# Works in both Docker Compose and Kubernetes environments

set -e

# Color output for better visibility
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[migrate]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[migrate]${NC} $1"; }
log_error() { echo -e "${RED}[migrate]${NC} $1"; }

# Environment variables with defaults
CLICKHOUSE_HOST=${CLICKHOUSE_HOST:-"clickhouse"}
CLICKHOUSE_PORT=${CLICKHOUSE_PORT:-"9000"}
CLICKHOUSE_DATABASE=${CLICKHOUSE_DATABASE:-"otel"}
CLICKHOUSE_USER=${CLICKHOUSE_USER:-"otel"}
CLICKHOUSE_PASSWORD=${CLICKHOUSE_PASSWORD:-"otel123"}
MIGRATION_MODE=${MIGRATION_MODE:-"migrate"}  # migrate | init | validate | wait
MAX_RETRIES=${MAX_RETRIES:-30}
RETRY_INTERVAL=${RETRY_INTERVAL:-2}

# Build connection string
DATABASE_URL="clickhouse://${CLICKHOUSE_USER}:${CLICKHOUSE_PASSWORD}@${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}/${CLICKHOUSE_DATABASE}?secure=false"

# Function to check ClickHouse connectivity via HTTP
check_clickhouse() {
    curl -s --fail \
        --user "${CLICKHOUSE_USER}:${CLICKHOUSE_PASSWORD}" \
        "http://${CLICKHOUSE_HOST}:8123/?query=SELECT%201" >/dev/null 2>&1
}

# Function to ensure database exists
ensure_database() {
    log_info "Ensuring database '${CLICKHOUSE_DATABASE}' exists..."
    curl -s --fail \
        --user "${CLICKHOUSE_USER}:${CLICKHOUSE_PASSWORD}" \
        "http://${CLICKHOUSE_HOST}:8123/" \
        --data "CREATE DATABASE IF NOT EXISTS ${CLICKHOUSE_DATABASE}" >/dev/null
}

# Function to execute SQL via HTTP
execute_sql() {
    local sql="$1"
    local allow_failure="${2:-false}"
    
    local response
    response=$(curl -s --fail \
        --user "${CLICKHOUSE_USER}:${CLICKHOUSE_PASSWORD}" \
        --data "${sql}" \
        "http://${CLICKHOUSE_HOST}:8123/?database=${CLICKHOUSE_DATABASE}")
    
    local exit_code=$?
    if [ $exit_code -ne 0 ] && [ "$allow_failure" = "false" ]; then
        log_error "SQL execution failed: ${sql:0:100}..."
        return 1
    fi
    
    echo "$response"
    return $exit_code
}

# Function to execute SQL file by splitting into statements  
execute_sql_file() {
    local file_path="$1"
    local allow_failure="${2:-false}"
    
    if [ ! -f "$file_path" ]; then
        log_error "SQL file not found: $file_path"
        return 1
    fi
    
    log_info "Executing SQL file: $file_path"
    
    # Create temporary file with cleaned SQL
    local temp_file="/tmp/clean_sql.sql"
    # Remove comments and empty lines
    sed '/^[[:space:]]*--/d; /^[[:space:]]*$/d' "$file_path" > "$temp_file"
    
    # Split by semicolon and execute each statement
    local statement_count=0
    local failed_count=0
    local current_statement=""
    
    while IFS= read -r line; do
        current_statement="${current_statement}${line}"$'\n'
        
        # Check if line ends with semicolon (statement complete)
        if [[ "$line" =~ \;[[:space:]]*$ ]]; then
            statement_count=$((statement_count + 1))
            log_info "Executing statement $statement_count..."
            
            if ! execute_sql "$current_statement" "$allow_failure"; then
                failed_count=$((failed_count + 1))
                if [ "$allow_failure" = "false" ]; then
                    log_error "Failed to execute statement $statement_count"
                    rm -f "$temp_file"
                    return 1
                fi
            fi
            current_statement=""
        fi
    done < "$temp_file"
    
    # Execute any remaining statement
    if [ -n "$(echo "$current_statement" | tr -d '[:space:]')" ]; then
        statement_count=$((statement_count + 1))
        log_info "Executing final statement $statement_count..."
        
        if ! execute_sql "$current_statement" "$allow_failure"; then
            failed_count=$((failed_count + 1))
            if [ "$allow_failure" = "false" ]; then
                log_error "Failed to execute final statement"
                rm -f "$temp_file"
                return 1
            fi
        fi
    fi
    
    rm -f "$temp_file"
    log_info "Executed $statement_count statements, $failed_count failed"
    return 0
}

# Function to run migrations using SQL files
run_migrations() {
    log_info "Running SQL schema migrations..."
    
    # Check if this is first run or clean slate
    TABLES_COUNT=$(execute_sql "SELECT count(*) FROM system.tables WHERE database = '${CLICKHOUSE_DATABASE}'" true || echo "0")
    
    # Apply all SQL migrations in order
    log_info "Applying SQL migrations..."
    local migration_count=0
    local failed_count=0

    for migration_file in /migrations/clickhouse/*.sql; do
        if [ -f "$migration_file" ]; then
            log_info "Applying migration: $(basename "$migration_file")"
            if execute_sql_file "$migration_file"; then
                migration_count=$((migration_count + 1))
                log_info "Migration applied successfully: $(basename "$migration_file")"
            else
                failed_count=$((failed_count + 1))
                log_error "Failed to apply migration: $(basename "$migration_file")"
            fi
        fi
    done

    if [ "$failed_count" -gt 0 ]; then
        log_error "Failed to apply $failed_count migrations"
        return 1
    fi

    log_info "Applied $migration_count migrations successfully"
    
    # Apply views (idempotent - safe to run multiple times)
    log_info "Creating/updating views..."
    if execute_sql_file "/migrations/schema/views.sql" true; then
        log_info "Views created/updated successfully"
    else
        log_warn "Some views may have failed (this might be normal on first run)"
    fi
    
    return 0
}

# Function to validate schema
validate_schema() {
    log_info "Validating database schema..."
    
    # Check core tables from original schema
    REQUIRED_TABLES=(
        "traces"
        "ai_anomalies"
        "ai_service_baselines"
    )
    
    local all_valid=true
    
    for table in "${REQUIRED_TABLES[@]}"; do
        EXISTS=$(execute_sql "EXISTS TABLE ${table}" true || echo "0")
        
        if [ "$EXISTS" = "1" ]; then
            log_info "✓ Table ${table} exists"
        else
            log_error "✗ Table ${table} missing"
            all_valid=false
        fi
    done
    
    # Check critical views
    REQUIRED_VIEWS=(
        "traces_view"
        "service_summary_view"
    )
    
    for view in "${REQUIRED_VIEWS[@]}"; do
        EXISTS=$(execute_sql "EXISTS VIEW ${view}" true || echo "0")
        
        if [ "$EXISTS" = "1" ]; then
            log_info "✓ View ${view} exists"
        else
            log_warn "✗ View ${view} missing (will be created on first data)"
        fi
    done
    
    if [ "$all_valid" = true ]; then
        log_info "Schema validation passed!"
        return 0
    else
        log_error "Schema validation failed!"
        return 1
    fi
}

# Main execution
main() {
    log_info "Starting ClickHouse migration service"
    log_info "Target: ${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}/${CLICKHOUSE_DATABASE}"
    log_info "Mode: ${MIGRATION_MODE}"
    
    # Wait for ClickHouse to be ready
    log_info "Waiting for ClickHouse to be ready..."
    retry_count=0
    while [ $retry_count -lt $MAX_RETRIES ]; do
        if check_clickhouse; then
            log_info "ClickHouse is ready!"
            break
        fi
        retry_count=$((retry_count + 1))
        log_warn "ClickHouse not ready, attempt $retry_count/$MAX_RETRIES..."
        sleep $RETRY_INTERVAL
    done
    
    if [ $retry_count -eq $MAX_RETRIES ]; then
        log_error "ClickHouse failed to become ready after $MAX_RETRIES attempts"
        exit 1
    fi
    
    # Handle different modes
    case "$MIGRATION_MODE" in
        wait)
            log_info "Wait mode - ClickHouse is ready, exiting successfully"
            exit 0
            ;;
        validate)
            ensure_database
            validate_schema
            exit $?
            ;;
        init)
            ensure_database
            run_migrations
            validate_schema
            exit $?
            ;;
        migrate|*)
            ensure_database
            run_migrations
            if [ $? -eq 0 ]; then
                validate_schema
                exit $?
            else
                log_error "Migration failed"
                exit 1
            fi
            ;;
    esac
}

# Handle signals gracefully
trap 'log_warn "Received signal, exiting..."; exit 0' SIGTERM SIGINT

# Run main function
main "$@"