# ADR-015: Multi-Level Testing Strategy

## Status
Proposed

## Context

As our AI-native observability platform grows, we need a comprehensive testing strategy that balances:
- **Speed**: Fast feedback loops for developers
- **Reliability**: Tests that don't fail due to external dependencies
- **Realism**: Tests that catch real integration issues
- **Cost**: Minimizing resource usage and external API calls
- **Coverage**: Testing all layers from unit to end-to-end

The Effect-TS architecture with its Layer pattern provides natural boundaries for creating testable components with swappable implementations.

## Decision

We will implement a six-level testing pyramid that progressively increases in scope and realism:

### Level 1: Unit Tests (Isolated)
**Purpose**: Fast, deterministic tests of individual functions and components

**Characteristics**:
- Run time: < 100ms per test
- Dependencies: Mock Layers only
- External services: None
- Failure rate: 0% (deterministic)

**Implementation**:
```typescript
// src/llm-manager/test/unit/simple-manager.test.ts
import { Effect, Layer, TestContext } from 'effect'
import { LLMManager } from '../src/service'
import { MockOpenAILayer, MockClaudeLayer } from './mocks'

describe('LLMManager Unit Tests', () => {
  const TestLayer = Layer.mergeAll(
    MockOpenAILayer,
    MockClaudeLayer,
    TestContext.TestContext
  )
  
  it('should route requests to appropriate model', () =>
    Effect.gen(function* () {
      const manager = yield* LLMManager
      const result = yield* manager.complete({
        model: 'gpt-4',
        prompt: 'test'
      })
      expect(result).toEqual({ text: 'mocked response' })
    }).pipe(
      Effect.provide(TestLayer),
      Effect.runPromise
    )
  )
})
```

**When to use**:
- Testing business logic
- Testing error handling
- Testing state machines
- Testing pure transformations

### Level 2: Unit Tests (Connected)
**Purpose**: Validate mock accuracy against real services

**Characteristics**:
- Run time: < 5s per test
- Dependencies: Real Layers with rate limiting
- External services: 99.999% uptime services only (e.g., OpenAI API)
- Failure rate: < 0.1% (network issues)

**Implementation**:
```typescript
// src/llm-manager/test/unit-connected/simple-manager.connected.test.ts
import { Effect, Layer } from 'effect'
import { LLMManager } from '../src/service'
import { OpenAILive, ClaudeLive } from '../src/layers'

describe('LLMManager Connected Tests', () => {
  const LiveLayer = Layer.mergeAll(
    OpenAILive.pipe(Layer.provide(RateLimiterLayer)),
    ClaudeLive.pipe(Layer.provide(RateLimiterLayer))
  )
  
  it.skipIf(!process.env.OPENAI_API_KEY)(
    'should match mock behavior with real service',
    () => Effect.gen(function* () {
      const manager = yield* LLMManager
      const result = yield* manager.complete({
        model: 'gpt-4',
        prompt: 'Say "hello" and nothing else'
      })
      // Verify the mock's response pattern matches reality
      expect(result.text.toLowerCase()).toContain('hello')
    }).pipe(
      Effect.provide(LiveLayer),
      Effect.runPromise
    )
  )
})
```

**When to use**:
- Validating mock accuracy
- Testing with new API versions
- Catching API contract changes
- Limited smoke testing

### Level 3: Integration Tests (Replayed)
**Purpose**: Test component interactions with real data patterns

**Characteristics**:
- Run time: < 30s per test
- Dependencies: Test containers, replayed data
- External services: None (using recorded data)
- Failure rate: 0% (deterministic)

**Implementation**:
```typescript
// src/test/integration/trace-ingestion.integration.test.ts
import { Effect } from 'effect'
import { ReplayedOTLPServer } from './fixtures/replayed-server'
import { StorageService } from '../storage/src/service'

describe('Trace Ingestion Integration Tests', () => {
  const replayServer = new ReplayedOTLPServer({
    dataFile: './fixtures/demo-traces.protobuf'
  })
  
  beforeAll(() => replayServer.start())
  afterAll(() => replayServer.stop())
  
  it('should process replayed OTLP data', () =>
    Effect.gen(function* () {
      const storage = yield* StorageService
      
      // Replay captured demo traces
      yield* replayServer.replay()
      
      // Verify processing
      const traces = yield* storage.queryTraces({
        service: 'cartservice'
      })
      expect(traces.length).toBeGreaterThan(0)
    }).pipe(
      Effect.provide(StorageTestLayer),
      Effect.runPromise
    )
  )
})
```

**Replay Data Management**:
```bash
# Capture data from live demo
pnpm test:capture --service=demo --output=fixtures/demo-traces.protobuf

# Replay in tests
pnpm test:integration
```

### Level 4: Integration Tests (Live Services)
**Purpose**: Validate against actual running services

**Characteristics**:
- Run time: < 2min per test
- Dependencies: Live demo environment
- External services: Controlled environments
- Failure rate: < 5% (service availability)

**Implementation**:
```typescript
// src/test/integration-live/end-to-end.live.test.ts
describe('Live Integration Tests', () => {
  beforeAll(async () => {
    await exec('pnpm demo:up')
    await waitForHealthy('http://localhost:8080/health')
  })
  
  afterAll(async () => {
    await exec('pnpm demo:down')
  })
  
  it('should process live demo telemetry', () =>
    Effect.gen(function* () {
      // Trigger load in demo
      yield* triggerDemoLoad({ requests: 100 })
      
      // Wait for processing
      yield* Effect.sleep('5 seconds')
      
      // Verify in our system
      const traces = yield* storage.queryTraces({
        timeRange: 'last-1m'
      })
      expect(traces.length).toBeGreaterThan(90)
    }).pipe(Effect.runPromise)
  )
})
```

### Level 5: E2E Tests (UI with Replayed Data)
**Purpose**: Test UI workflows without external dependencies

**Characteristics**:
- Run time: < 1min per test
- Dependencies: Replayed backend, headless browser
- External services: None
- Failure rate: < 1% (timing issues)

**Implementation**:
```typescript
// src/ui/test/e2e/dashboard.test.ts
import { test, expect } from '@playwright/test'

test.describe('Dashboard E2E Tests', () => {
  test.beforeAll(async () => {
    // Start backend with replayed data
    await startReplayedBackend()
  })
  
  test('should display service topology', async ({ page }) => {
    await page.goto('http://localhost:5173')
    
    // Wait for data to load
    await page.waitForSelector('[data-testid="service-node"]')
    
    // Verify topology
    const services = await page.locator('[data-testid="service-node"]').count()
    expect(services).toBeGreaterThan(5)
    
    // Test interaction
    await page.click('[data-testid="service-node-cartservice"]')
    await expect(page.locator('[data-testid="service-details"]')).toBeVisible()
  })
})
```

### Level 6: E2E Tests (UI with Live Services)
**Purpose**: Full system validation in production-like environment

**Characteristics**:
- Run time: < 5min per test
- Dependencies: Full live environment
- External services: All systems running
- Failure rate: < 10% (complex dependencies)

**Implementation**:
```typescript
// src/ui/test/e2e-live/full-system.live.test.ts
test.describe('Full System E2E Tests', () => {
  test.beforeAll(async () => {
    await exec('pnpm dev:up')
    await exec('pnpm demo:up')
    await waitForAllHealthy()
  })
  
  test('should show real-time updates', async ({ page }) => {
    await page.goto('http://localhost:5173')
    
    // Capture initial state
    const initialCount = await page.locator('[data-testid="trace-count"]').textContent()
    
    // Generate new load
    await generateDemoTraffic({ duration: '10s' })
    
    // Verify real-time update
    await expect(page.locator('[data-testid="trace-count"]')).not.toHaveText(initialCount)
  })
})
```

## Test Execution Strategy

### Local Development (CI=false)
```bash
# Fast feedback loop (Level 1)
pnpm test:unit              # < 10s

# Before committing (Levels 1 & 3)
pnpm test:pre-commit        # < 1min
```

### CI Pipeline (CI=true)
```yaml
jobs:
  fast-tests:  # Levels 1 & 3
    runs-on: ubuntu-latest
    steps:
      - run: pnpm test:unit
      - run: pnpm test:integration
  
  connected-tests:  # Level 2
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - run: pnpm test:connected
    secrets:
      - OPENAI_API_KEY
      - CLAUDE_API_KEY
  
  e2e-tests:  # Level 5
    runs-on: ubuntu-latest
    steps:
      - run: pnpm test:e2e
  
  live-tests:  # Levels 4 & 6
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - run: pnpm test:live
```

### Test Configuration

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    projects: [
      {
        name: 'unit',
        include: ['**/test/unit/**/*.test.ts'],
        environment: 'node',
        testTimeout: 5000,
      },
      {
        name: 'unit-connected',
        include: ['**/test/unit-connected/**/*.test.ts'],
        environment: 'node',
        testTimeout: 30000,
        retry: 2,
      },
      {
        name: 'integration',
        include: ['**/test/integration/**/*.test.ts'],
        environment: 'node',
        testTimeout: 60000,
        setupFiles: ['./test/setup-containers.ts'],
      },
      {
        name: 'integration-live',
        include: ['**/test/integration-live/**/*.test.ts'],
        environment: 'node',
        testTimeout: 180000,
        retry: 1,
      },
      {
        name: 'e2e',
        include: ['**/test/e2e/**/*.test.ts'],
        environment: 'node',
        testTimeout: 120000,
      },
      {
        name: 'e2e-live',
        include: ['**/test/e2e-live/**/*.test.ts'],
        environment: 'node',
        testTimeout: 300000,
      },
    ],
  },
})
```

### Package.json Scripts

```json
{
  "scripts": {
    "test": "vitest run --project=unit",
    "test:unit": "vitest run --project=unit",
    "test:connected": "vitest run --project=unit-connected",
    "test:integration": "vitest run --project=integration",
    "test:integration:live": "vitest run --project=integration-live",
    "test:e2e": "playwright test test/e2e",
    "test:e2e:live": "playwright test test/e2e-live",
    "test:pre-commit": "pnpm test:unit && pnpm test:integration",
    "test:ci": "pnpm test:pre-commit && pnpm test:e2e",
    "test:all": "vitest run",
    "test:capture": "tsx scripts/capture-replay-data.ts",
    "test:replay": "tsx scripts/replay-server.ts"
  }
}
```

## Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Set up test directory structure
- [ ] Create mock Layer generators
- [ ] Implement replay data capture tooling
- [ ] Configure Vitest projects

### Phase 2: Unit Testing (Week 2)
- [ ] Migrate existing tests to Level 1
- [ ] Create Level 2 connected tests for critical paths
- [ ] Document mock vs real discrepancies

### Phase 3: Integration Testing (Week 3)
- [ ] Build replay server infrastructure
- [ ] Capture demo application data
- [ ] Create Level 3 & 4 integration tests

### Phase 4: E2E Testing (Week 4)
- [ ] Set up Playwright with replay backend
- [ ] Create Level 5 UI tests
- [ ] Add Level 6 live system tests

## Consequences

### Positive
- **Fast feedback**: Level 1 tests run in seconds
- **Reliability**: Most tests don't depend on external services
- **Coverage**: Every integration point can be tested
- **Cost control**: Limited API calls in Level 2 tests
- **Confidence**: Level 6 tests validate the full system

### Negative
- **Complexity**: Six test levels to maintain
- **Storage**: Replay data files can be large
- **Maintenance**: Mocks need updates when APIs change
- **Time**: Full test suite takes longer to run

### Mitigations
- Use Effect-TS Layers to minimize mock complexity
- Compress and rotate replay data regularly
- Run connected tests weekly to catch API changes
- Parallelize test execution in CI

## References
- [Testing Trophy](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications)
- [Effect-TS Testing Guide](https://effect.website/docs/guides/testing)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Contract Testing](https://martinfowler.com/bliki/ContractTest.html)