# Port Configuration Strategy

> **Status**: Implemented  
> **Date**: 2025-08-26  
> **Related**: Docker Compose, Integration Testing, Developer Experience

## Context

During Day 13 development, we encountered port conflicts when running integration tests. Specifically, port 8123 (standard ClickHouse HTTP port) was occupied by another service on the developer's machine, causing authentication failures that were initially misdiagnosed.

## Problem

1. **Port Conflicts**: Standard database ports (8123, 9000) frequently conflict with existing services
2. **Developer Environment Issues**: Different developers may have different services running locally
3. **Authentication Confusion**: Port conflicts manifested as authentication errors, making diagnosis difficult
4. **Integration Test Reliability**: Tests failed inconsistently based on local environment

## Solution: Non-Standard Port Strategy

### Port Mappings

| Service | Standard Port | Our Configuration | Docker Mapping | Rationale |
|---------|---------------|-------------------|----------------|-----------|
| **ClickHouse HTTP** | 8123 | 8124 | `8124:8123` | Avoid ClickHouse conflicts |
| **ClickHouse Native** | 9000 | 9001 | `9001:9000` | Avoid MinIO/other conflicts |
| **OTLP gRPC** | 4317 | 4317 | `4317:4317` | Keep standard for compatibility |
| **OTLP HTTP** | 4318 | 4318 | `4318:4318` | Keep standard for compatibility |

### Key Principles

1. **Modify Storage Ports**: Change database/storage service ports to avoid conflicts
2. **Keep Telemetry Standards**: Maintain OpenTelemetry standard ports for compatibility
3. **Document Clearly**: Provide clear configuration guidance
4. **Test Port Conflicts**: Validate port availability in tests

### Implementation

#### Docker Compose Configuration
```yaml
clickhouse:
  ports:
    - '8124:8123' # HTTP interface (using 8124 to avoid conflicts)
    - '9001:9000'  # Native interface (using 9001 to avoid conflicts)
```

#### Environment Configuration
```bash
# .env file
CLICKHOUSE_HOST=localhost
CLICKHOUSE_PORT=8124  # Changed from standard 8123
CLICKHOUSE_DATABASE=otel
CLICKHOUSE_USERNAME=otel
CLICKHOUSE_PASSWORD=otel123
```

#### Container vs Host Communication
- **Internal**: Containers still use standard ports (8123, 9000)
- **External**: Host access uses modified ports (8124, 9001)
- **Benefits**: Maintains protocol compatibility while avoiding conflicts

### Testing Strategy

#### Port Conflict Detection
Created `src/test/integration/port-conflict-detection.test.ts` to:
1. Validate non-standard port usage
2. Test port availability
3. Document port strategy
4. Detect configuration issues

#### Integration Test Reliability
- Tests now consistently pass regardless of local environment
- Clear error messages for configuration issues
- Documentation of expected port usage

## Benefits

1. **Reliability**: Consistent test execution across developer environments
2. **Clarity**: Clear separation between internal and external access
3. **Compatibility**: OpenTelemetry tools continue to work on standard ports
4. **Flexibility**: Easy to modify ports if conflicts arise

## Developer Impact

### Positive Changes
- ✅ Integration tests run consistently
- ✅ Clear documentation of port usage
- ✅ No more mysterious authentication errors
- ✅ Easy local development setup

### Migration Required
- 🔄 Update `.env` files to use port 8124
- 🔄 Update any hardcoded references to port 8123
- 🔄 Restart docker-compose to pick up new ports

### Development Commands
```bash
# Test ClickHouse connection
curl -u otel:otel123 "http://localhost:8124/?query=SELECT%201"

# Start with correct port configuration
pnpm dev:down && pnpm dev:up

# Validate port configuration
pnpm test src/test/integration/port-conflict-detection.test.ts
```

## Lessons Learned

1. **Port conflicts manifest as authentication errors** - misleading diagnosis
2. **Layer-based configuration** - Consider Effect-TS Layers for environment-specific configs
3. **Integration test validation** - Test the environment, not just the application
4. **Documentation matters** - Clear port strategy prevents confusion

## Future Considerations

### Effect-TS Layer Integration
Consider implementing environment-specific configuration layers:
```typescript
const ClickHouseConfigLayer = {
  development: { port: 8124 },
  test: { port: TestContainerPort },
  production: { port: 8123 }
}
```

### Dynamic Port Detection
For TestContainer scenarios, consider dynamic port detection:
```typescript
const availablePort = await getAvailablePort(8124, 8130)
```

## Files Modified

- `docker-compose.yaml` - Port mappings updated
- `.env` - Port configuration changed
- `src/storage/simple-storage.ts` - Client configuration (host → url)
- `src/test/integration/port-conflict-detection.test.ts` - New validation tests

## Related Issues

- Authentication failures in integration tests (resolved)
- TestContainer vs docker-compose configuration differences
- Need for environment-specific configuration layers (future work)

This strategy successfully resolved the Day 13 integration test failures and provides a foundation for reliable local development across different environments.