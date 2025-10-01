# Troubleshooting Guide

Common issues and solutions for the OTel AI platform.

## Quick Diagnostics

```bash
# Check all services are running
docker compose ps

# View service logs
docker compose logs backend
docker compose logs clickhouse
docker compose logs otel-collector

# Test basic connectivity
curl http://localhost:4319/api/storage/health  # Backend
curl http://localhost:8123/ping                # ClickHouse
curl http://localhost:4318/v1/traces          # OTel Collector
```

## Common Issues

### Service Topology Not Showing Historical Data

**Problem**: UI time range picker shows no services for historical time periods (e.g., seed data from earlier replays).

**Cause**: ClickHouse queries were using relative time (`now() - INTERVAL X HOUR`) instead of absolute timestamps.

**Solution**: Fixed in v1.0.1 (2025-10-01). The topology endpoint now properly supports absolute time ranges using `parseDateTimeBestEffort()` for ISO 8601 timestamps.

**Verification**:
```bash
# Test with absolute time range
curl -X POST http://localhost:4319/api/topology/visualization \
  -H "Content-Type: application/json" \
  -d '{"timeRange":{"startTime":"2025-10-01T01:00:00.000Z","endTime":"2025-10-01T02:00:00.000Z"}}'
```

**Related**: See [Topology Analyzer Troubleshooting](src/topology-analyzer/README.md#troubleshooting) for more details.

---

### Replay Hanging with 0 Files Processed

**Problem**: Record-replay hangs indefinitely showing "0 files processed" despite finding session files.

**Cause**: Default endpoint `http://otel-collector:4318` is a Docker internal hostname unreachable from host machine.

**Solution**: Fixed in v1.0.1 (2025-10-01). Default endpoint changed to `http://localhost:4318` (host accessible).

**Verification**:
```bash
# Test endpoint connectivity
curl http://localhost:4318/v1/traces

# Replay should now work
pnpm replay
```

**Related**: See [Record-Replay Troubleshooting](src/record-replay/README.md#troubleshooting) for more details.

---

### Services Not Running

**Problem**: Platform fails to start or endpoints are unreachable.

**Diagnosis**:
```bash
# Check all services are running
docker compose ps

# Check for failed containers
docker compose ps -a | grep -E "Exit|unhealthy"

# View recent logs for errors
docker compose logs --tail=50
```

**Solution**:
```bash
# Restart all services
pnpm dev:down
pnpm dev:up

# Check specific service logs
docker compose logs backend
docker compose logs clickhouse
docker compose logs otel-collector

# If issues persist, rebuild
pnpm dev:rebuild
```

---

### ClickHouse Connection Errors

**Problem**: "Connection refused" or "Cannot connect to ClickHouse" errors.

**Diagnosis**:
```bash
# Verify ClickHouse is healthy
docker compose ps clickhouse

# Check ClickHouse logs
docker compose logs clickhouse

# Test connection directly
curl http://localhost:8123/ping

# Try query
curl 'http://localhost:8123/?query=SELECT%201'
```

**Common Causes**:
1. **ClickHouse not started**: `docker compose up clickhouse -d`
2. **Port conflict**: Check if port 8123 is in use
3. **Initialization errors**: Check logs for schema migration issues

**Solution**:
```bash
# Restart ClickHouse
docker compose restart clickhouse

# If needed, rebuild and restart
pnpm dev:down
docker compose build clickhouse
pnpm dev:up

# Wait for initialization
sleep 10

# Verify data is accessible
docker exec otel-ai-clickhouse-1 clickhouse-client \
  --user=otel --password=otel123 \
  --query "SELECT COUNT(*) FROM otel.traces"
```

---

### No Data in UI After Demo Setup

**Problem**: UI shows empty topology after running demo.

**Diagnosis**:
```bash
# Ensure demo is running
docker compose -f opentelemetry-demo/docker-compose.yml ps

# Check if traces are flowing to collector
curl http://localhost:4318/v1/traces

# Verify ClickHouse has received data
docker exec otel-ai-clickhouse-1 clickhouse-client \
  --user=otel --password=otel123 \
  --query "SELECT COUNT(*) FROM otel.traces"

# Check for recent traces
docker exec otel-ai-clickhouse-1 clickhouse-client \
  --user=otel --password=otel123 \
  --query "SELECT service_name, COUNT(*) FROM otel.traces GROUP BY service_name"
```

**Solution**:
```bash
# Wait 30-60 seconds for data ingestion
sleep 60

# Refresh the UI
open http://localhost:5173

# If still no data, check collector logs
docker compose logs otel-collector

# Verify collector is sending to ClickHouse
docker compose logs backend | grep "Traces stored"
```

**Common Causes**:
1. **Demo not configured**: Run `pnpm demo:setup` first
2. **Collector misconfigured**: Check `config/otel-collector/config.yaml`
3. **Network issues**: Verify demo can reach collector on port 4318
4. **Time range**: UI may default to "Last 5 minutes" - increase to "Last 1 hour"

---

### Out of Memory Errors

**Problem**: Backend or ClickHouse crashes with OOM errors.

**Diagnosis**:
```bash
# Check Docker memory limits
docker stats

# Check ClickHouse memory usage
docker exec otel-ai-clickhouse-1 clickhouse-client \
  --user=otel --password=otel123 \
  --query "SELECT * FROM system.metrics WHERE metric LIKE '%Memory%'"
```

**Solutions**:

1. **Increase Docker Memory**:
   - Docker Desktop → Settings → Resources → Memory
   - Recommended: 16GB for full platform
   - Minimum: 8GB for basic operation

2. **Reduce Query Scope**:
   ```bash
   # Use shorter time ranges in UI
   # Instead of "Last 24 hours", use "Last 1 hour"

   # Limit topology node count
   # Aggregated tables already configured with LIMIT 500
   ```

3. **Optimize ClickHouse**:
   ```bash
   # Query memory limits are already configured
   # See config in src/topology-analyzer/queries.ts:
   # - max_memory_usage = 1000000000 (1GB)
   # - max_execution_time = 30 seconds
   ```

4. **Clear Old Data**:
   ```bash
   # Retention is configured for 30 days
   # Manually clear if needed
   docker exec otel-ai-clickhouse-1 clickhouse-client \
     --user=otel --password=otel123 \
     --query "TRUNCATE TABLE otel.traces"
   ```

---

### MinIO Connection Failures

**Problem**: Record-replay cannot connect to MinIO for session storage.

**Diagnosis**:
```bash
# Check MinIO is running
docker compose ps minio

# Test MinIO health
curl http://localhost:9010/minio/health/live

# Check MinIO logs
docker compose logs minio
```

**Solution**:
```bash
# Restart MinIO
docker compose restart minio

# Verify bucket exists
docker exec otel-ai-minio-1 mc ls local/otel-data/

# Recreate bucket if needed
docker exec otel-ai-minio-1 mc mb local/otel-data/

# Test access
docker exec otel-ai-minio-1 mc ls local/otel-data/sessions/
```

---

### TypeScript Compilation Errors

**Problem**: Build fails with TypeScript errors.

**Solution**:
```bash
# Check for errors
pnpm typecheck

# Fix automatically where possible
pnpm typecheck:fix

# Check specific package
pnpm typecheck  # Backend
pnpm typecheck:ui  # Frontend

# Rebuild after fixes
pnpm build
```

---

### Port Conflicts

**Problem**: "Port already in use" errors on startup.

**Diagnosis**:
```bash
# Check what's using common ports
lsof -i :5173  # UI dev server
lsof -i :4318  # OTel Collector HTTP
lsof -i :4319  # Backend API
lsof -i :8123  # ClickHouse HTTP
lsof -i :9010  # MinIO Console
```

**Solution**:
```bash
# Stop conflicting processes
kill <PID>

# Or use different ports (update docker-compose.yml and .env)
```

---

## Package-Specific Troubleshooting

For detailed troubleshooting of specific components:

- **Record-Replay**: [src/record-replay/README.md#troubleshooting](src/record-replay/README.md#troubleshooting)
  - Seed generation issues
  - MinIO storage problems
  - Replay endpoint configuration
  - Session management

- **Topology Analyzer**: [src/topology-analyzer/README.md#troubleshooting](src/topology-analyzer/README.md#troubleshooting)
  - Query timeouts
  - Missing dependencies
  - Insufficient data
  - Time range issues

- **Storage**: [src/storage/README.md](src/storage/README.md)
  - ClickHouse schema issues
  - OTLP ingestion problems
  - Query performance

- **LLM Manager**: [src/llm-manager/README.md](src/llm-manager/README.md)
  - API key configuration
  - Model availability
  - Portkey gateway issues

## Getting Help

If you encounter issues not covered here:

1. **Search Existing Issues**: [GitHub Issues](https://github.com/clayroach/otel-ai/issues)

2. **Create a New Issue** with:
   - Platform version: `git describe --tags`
   - Environment: Docker/Node.js versions
   - Full error logs: `docker compose logs > logs.txt`
   - Steps to reproduce
   - Expected vs actual behavior

3. **Check Documentation**:
   - [Main README](README.md)
   - Package READMEs in `src/*/README.md`
   - [Development Blog](https://dev.to/clayroach)

4. **Community Support**:
   - [GitHub Discussions](https://github.com/clayroach/otel-ai/discussions)
   - Questions about OpenTelemetry, ClickHouse, or Effect-TS

## Debug Mode

Enable verbose logging for troubleshooting:

```bash
# Backend debug mode
DEBUG=* pnpm dev:backend

# ClickHouse query logging
docker compose logs clickhouse -f | grep -i select

# OTel Collector debug
# Edit config/otel-collector/config.yaml:
# service:
#   telemetry:
#     logs:
#       level: debug
```

## Performance Troubleshooting

See [Performance Section](README.md#performance) in main README for:
- Benchmarking tools
- Query optimization tips
- Scalability guidelines
- Resource requirements

---

**Last Updated**: 2025-10-01 (v1.0.1)
