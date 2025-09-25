# Annotations Package Integration Tests

This directory contains integration tests that connect to real services (flagd, ClickHouse) to validate end-to-end functionality.

## Prerequisites

### For Feature Flag Controller Tests

The Feature Flag Controller integration tests require a running flagd service on port 8013.

**Option 1: Run with OTel Demo (Recommended)**
```bash
# Start the demo which includes flagd
pnpm demo:up

# Verify flagd is accessible
docker ps | grep flagd
# Should show flagd container with port 8013 exposed

# Access flagd-ui to manage feature flags
open http://localhost:8080/feature     # Via frontend-proxy
```

**Service Ports:**
- `8013` - flagd gRPC API (for OpenFeature SDK)
- `8016` - flagd HTTP/REST API
- `8080/feature` - flagd-ui via frontend-proxy

**Option 2: Run flagd standalone**
```bash
# Run flagd with example flags
docker run -p 8013:8013 ghcr.io/open-feature/flagd:latest \
  start --uri https://raw.githubusercontent.com/open-feature/flagd/main/samples/example_flags.json
```

### For Diagnostics Session Tests

The Diagnostics Session integration tests require both flagd and ClickHouse. These tests use testcontainers to spin up a temporary ClickHouse instance automatically.

```bash
# Ensure Docker is running
docker info

# Start flagd (if not already running via demo)
pnpm demo:up
```

## Running Integration Tests

### Run All Integration Tests
```bash
# Run all annotations integration tests
pnpm test:integration annotations

# Run all integration tests in the project
pnpm test:integration
```

### Run Specific Integration Tests
```bash
# Feature Flag Controller only
pnpm test:integration feature-flag-controller

# Diagnostics Session only
pnpm test:integration diagnostics-session

# Run by package
pnpm test:integration src/annotations
```

## Test Organization

### feature-flag-controller.integration.test.ts
Tests the Feature Flag Controller with real flagd service:
- Connection and flag listing
- Flag evaluation with different contexts
- Error handling for connection failures
- Concurrent flag evaluations

### diagnostics-session.integration.test.ts
Tests the full session orchestration:
- Session lifecycle with real services
- Annotation persistence to ClickHouse
- Flag enable/disable orchestration
- Multiple concurrent sessions

## Managing Feature Flags

With the demo running, you can manage feature flags through the flagd-ui:

1. **Access the UI**: http://localhost:8080/feature
2. **Toggle Flags**: Click on any flag to enable/disable it
3. **Available Flags**:
   - `productCatalogFailure` - Simulate product catalog service failures
   - `recommendationCacheFailure` - Simulate cache failures
   - `cartFailure` - Simulate cart service failures
   - `paymentFailure` - Simulate payment processing failures
   - `adFailure` - Simulate ad service failures
   - And more...

Changes made in the UI are immediately reflected in the flagd service and will be picked up by the integration tests.

## Environment Variables

- `FLAGD_HOST` - Override flagd host (default: localhost)
- `FLAGD_PORT` - Override flagd port (default: 8013)

## Troubleshooting

### flagd Connection Issues

If tests fail with connection errors:

1. **Verify flagd is running:**
   ```bash
   docker ps | grep flagd
   ```

2. **Check port mapping:**
   ```bash
   docker port flagd
   # Should show: 8013/tcp -> 0.0.0.0:8013
   ```

3. **If ports are not mapped, regenerate demo config:**
   ```bash
   pnpm demo:setup
   pnpm demo:up
   ```

4. **Test flagd connectivity directly:**
   ```bash
   # The gRPC port should be accessible
   nc -zv localhost 8013
   ```

### ClickHouse Issues

The tests use testcontainers which require:
- Docker running locally
- Sufficient memory (at least 2GB free)
- No port conflicts on random high ports

### Running Without Real Services

If you can't run the real services, the unit tests provide comprehensive coverage with mocks:

```bash
# Run unit tests only (no services required)
pnpm test src/annotations
```

## CI/CD Integration

In CI environments, these tests run automatically when:
- `CI=true` environment variable is set
- Docker is available
- The demo services are started first

Example GitHub Actions workflow:
```yaml
- name: Start demo services
  run: pnpm demo:up

- name: Run integration tests
  run: CI=true pnpm test:integration
```