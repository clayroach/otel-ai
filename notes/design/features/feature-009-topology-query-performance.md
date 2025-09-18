# Feature-009: Service Topology Query Performance Optimization

**Feature ID**: FEAT-009
**Status**: In Development
**Created**: 2025-09-17
**Author**: Claude Code with Human Architect
**Priority**: Critical
**Target Release**: Hotfix
**Issue**: [#57](https://github.com/clayroach/otel-ai/issues/57)

## Executive Summary

Critical performance optimization for service topology queries that cause ClickHouse Out of Memory (OOM) errors when processing large trace datasets (>3M traces). This feature implements query optimization, materialized views, and resource management to ensure stable performance at scale.

## Problem Statement

The current service topology visualization implementation has severe performance issues:

### Current Issues
1. **Memory Explosion**: Self-joins in dependency queries create cartesian products
2. **Missing Indexes**: No composite indexes for (trace_id, parent_span_id) lookups
3. **No Resource Limits**: Queries can consume unlimited memory
4. **Full Table Scans**: CTEs materialize entire result sets
5. **No Caching**: Every request recomputes from scratch

### Impact
- ClickHouse crashes with OOM on ~3M traces
- UI becomes unresponsive for large datasets
- E2E tests fail intermittently
- Poor user experience with timeouts

## Solution Philosophy: Pattern-Based Intelligence Over Sampling

### Why No Sampling?
Random sampling fundamentally breaks distributed trace analysis because:
1. **Lost Context**: Sampling loses critical parent-child relationships
2. **Incomplete Paths**: Service call chains become fragmented
3. **Statistical Bias**: Random selection doesn't represent actual usage patterns
4. **Missing Anomalies**: Rare but critical issues get filtered out

### Pattern-Based Approach
Instead of sampling, we leverage the inherent patterns in service communication:
1. **Service Boundaries**: Most spans within a service are implementation details; focus on where services communicate
2. **Common Patterns**: In production, services follow predictable communication patterns (e.g., API Gateway → Auth → Service)
3. **Critical Paths**: Not all paths are equal - identify and prioritize high-frequency, high-latency, or high-error paths
4. **Incremental Aggregation**: Build understanding progressively from patterns rather than random samples

## Solution Design

### 1. Query Optimization Strategy

#### Pattern-Based Intelligent Filtering (No Sampling!)
Instead of random sampling which loses critical trace context, we use intelligent pattern-based filtering that identifies standard service communication patterns:

```sql
-- Identify common service communication patterns
WITH service_patterns AS (
    SELECT
        s1.service_name as source_service,
        s2.service_name as target_service,
        COUNT(DISTINCT s1.trace_id) as trace_count,
        COUNT(*) as call_count,
        groupArray(DISTINCT (s1.operation_name, s2.operation_name)) as operation_pairs
    FROM traces s1
    INNER JOIN traces s2 ON
        s2.trace_id = s1.trace_id
        AND s2.parent_span_id = s1.span_id
    WHERE s1.start_time >= now() - INTERVAL 1 HOUR
        AND s1.service_name != s2.service_name  -- Only service boundaries
    GROUP BY source_service, target_service
    HAVING call_count > 100  -- Focus on established patterns
)
SELECT * FROM service_patterns
```

#### Service Boundary Optimization
Focus queries on service boundary spans rather than all internal spans:

```sql
-- Query only boundary spans for topology
WITH boundary_spans AS (
    SELECT
        trace_id,
        span_id,
        parent_span_id,
        service_name,
        operation_name,
        span_kind,
        duration_ns
    FROM traces
    WHERE span_kind IN ('SPAN_KIND_SERVER', 'SPAN_KIND_CLIENT')  -- Entry/exit points
        OR parent_span_id = ''  -- Root spans
        OR span_id IN (  -- Spans that cross service boundaries
            SELECT DISTINCT parent_span_id
            FROM traces t2
            WHERE t2.service_name != traces.service_name
        )
)
SELECT * FROM boundary_spans
```

#### Replace Self-Joins with Window Functions
```sql
-- OLD: Inefficient self-join creating cartesian product
SELECT
    parent.service_name,
    child.service_name as dependent_service
FROM traces parent
INNER JOIN traces child ON
    child.parent_span_id = parent.span_id

-- NEW: Window function approach with pattern filtering
WITH span_relationships AS (
    SELECT
        trace_id,
        service_name,
        span_id,
        parent_span_id,
        LAG(service_name) OVER (PARTITION BY trace_id ORDER BY start_time) as prev_service,
        LEAD(service_name) OVER (PARTITION BY trace_id ORDER BY start_time) as next_service
    FROM traces
    WHERE start_time >= now() - INTERVAL 1 HOUR
)
SELECT
    service_name as source_service,
    next_service as target_service,
    COUNT(*) as call_count
FROM span_relationships
WHERE service_name != next_service  -- Only cross-service calls
    AND next_service IS NOT NULL
GROUP BY source_service, target_service
HAVING call_count > 10  -- Filter noise
```

### 2. Materialized Views Architecture

#### Service Dependencies MV
```sql
CREATE MATERIALIZED VIEW mv_service_dependencies
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMMDD(window_start)
ORDER BY (window_start, source_service, target_service)
AS SELECT
    toStartOfFiveMinute(start_time) as window_start,
    service_name as source_service,
    dependent_service as target_service,
    count() as call_count,
    avg(duration_ns) as avg_duration_ns,
    countIf(status_code = 'ERROR') as error_count
FROM traces
GROUP BY window_start, source_service, target_service;

-- Service Metrics MV
CREATE MATERIALIZED VIEW mv_service_metrics
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMMDD(window_start)
ORDER BY (window_start, service_name, operation_name)
AS SELECT
    toStartOfMinute(start_time) as window_start,
    service_name,
    operation_name,
    count() as request_count,
    avg(duration_ns) as avg_duration,
    quantile(0.95)(duration_ns) as p95_duration,
    quantile(0.99)(duration_ns) as p99_duration,
    countIf(status_code = 'ERROR') as error_count
FROM traces
GROUP BY window_start, service_name, operation_name;
```

### 3. Resource Management

#### Query Limits Configuration
```typescript
// storage/clickhouse.ts
const querySettings = {
  max_execution_time: 30,           // 30 seconds max
  max_memory_usage: 1073741824,     // 1GB per query
  max_rows_to_read: 10000000,       // 10M rows max
  max_bytes_to_read: 5368709120,    // 5GB max
  max_threads: 4,                    // Limit parallelism
  max_block_size: 65536,             // Optimize block size
  use_uncompressed_cache: 1,         // Enable caching
  query_profiler_real_time_period_ns: 1000000000  // 1s profiling
}
```

#### Fail-Fast Query Validation (Effect-TS Implementation)

**See detailed design**: `notes/design/features/feature-009-fail-fast-query-validation.md`

```typescript
// QueryValidator service using Effect-TS patterns
export const QueryValidatorLive = Layer.effect(
  QueryValidatorTag,
  Effect.gen(function* (_) {
    const clickhouse = yield* _(ClickHouseService)

    const limits = {
      maxRows: 10_000_000,
      maxMemoryMB: 1000,
      maxDurationMs: 30000
    }

    return {
      executeWithValidation: <R, E, A>(
        query: TopologyQuery,
        executor: () => Effect.Effect<A, E, R>
      ) =>
        Effect.gen(function* (_) {
          // Pre-flight validation
          const validation = yield* _(validateTopologyQuery(query))

          if (!validation.valid) {
            return yield* _(Effect.fail(
              new QueryTooComplexError({
                message: "Query exceeds resource limits",
                estimatedRows: validation.estimate.estimatedRows,
                estimatedMemoryMB: validation.estimate.estimatedMemoryMB,
                suggestion: validation.recommendations[0] || "Reduce query scope"
              })
            ))
          }

          // Execute with strict timeout - fail fast
          return yield* _(
            pipe(
              executor(),
              Effect.timeout(Duration.millis(limits.maxDurationMs)),
              Effect.mapError((error) => {
                if (error._tag === 'TimeoutException') {
                  return new QueryTimeoutError({
                    message: "Query execution timeout",
                    timeoutMs: limits.maxDurationMs,
                    suggestion: "Reduce time range or use materialized views"
                  })
                }
                return error
              })
            )
          )
        })
    }
  })
)
```

### 4. Progressive Data Loading with Pattern Recognition

#### Pattern-Based Progressive Loading (Effect-TS)
```typescript
const loadTopologyProgressive = (timeRange: TimeRange) =>
  Effect.gen(function* (_) {
    // Step 1: Load service patterns first (lightweight)
    const patterns = yield* _(loadServicePatterns(timeRange))

    // Step 2: Identify critical service paths
    const criticalPaths = identifyCriticalPaths(patterns)

    // Step 3: Load boundary spans for critical paths only
    const boundarySpans = yield* _(loadBoundarySpans(criticalPaths, timeRange))

    // Step 4: Build topology from boundary data
    return buildTopologyFromBoundaries(boundarySpans)
  })

const identifyCriticalPaths = (patterns: ServicePattern[]): ServicePath[] => {
  // Identify paths based on:
  // - High frequency (common patterns)
  // - High error rates (problematic paths)
  // - High latency (performance bottlenecks)
  // - User-specified services of interest
  return patterns
    .filter(p =>
      p.frequency > CRITICAL_FREQUENCY_THRESHOLD ||
      p.errorRate > ERROR_THRESHOLD ||
      p.p95Latency > LATENCY_THRESHOLD
    )
    .map(p => p.servicePath)
}

const loadServicePatterns = (timeRange: TimeRange) =>
  Effect.gen(function* (_) {
    const storage = yield* _(StorageServiceTag)

    const query = `
      SELECT
        source_service,
        target_service,
        COUNT(*) as frequency,
        AVG(duration_ns) as avg_latency,
        countIf(status_code = 'ERROR') / COUNT(*) as error_rate
      FROM service_dependencies_mv
      WHERE window_start >= toDateTime(${timeRange.start.getTime() / 1000})
        AND window_start <= toDateTime(${timeRange.end.getTime() / 1000})
      GROUP BY source_service, target_service
      HAVING frequency > 10
      ORDER BY frequency DESC
    `

    return yield* _(storage.queryRaw(query))
  })
```

#### Intelligent Query Strategy (No Sampling!)
```typescript
function determineQueryStrategy(traceCount: number): QueryStrategy {
  if (traceCount < 100_000) {
    return {
      strategy: 'full',
      filter: 'none',
      usePatterns: false
    }
  } else if (traceCount < 1_000_000) {
    return {
      strategy: 'boundary_only',
      filter: 'service_boundaries',
      usePatterns: true
    }
  } else if (traceCount < 10_000_000) {
    return {
      strategy: 'pattern_based',
      filter: 'critical_paths',
      usePatterns: true,
      patternThreshold: 100
    }
  } else {
    return {
      strategy: 'materialized_only',
      filter: 'pre_aggregated',
      usePatterns: true,
      useMaterializedViews: true
    }
  }
}
```

### 5. Caching Layer

#### Multi-Level Cache Strategy
```typescript
class TopologyCache {
  private l1Cache = new Map() // In-memory, 5 min TTL
  private l2Cache: Redis       // Redis, 1 hour TTL

  async get(key: string): Promise<TopologyData | null> {
    // Check L1 cache
    if (this.l1Cache.has(key)) {
      return this.l1Cache.get(key)
    }

    // Check L2 cache
    const l2Result = await this.l2Cache.get(key)
    if (l2Result) {
      this.l1Cache.set(key, l2Result)
      return l2Result
    }

    return null
  }

  async set(key: string, data: TopologyData) {
    this.l1Cache.set(key, data)
    await this.l2Cache.setex(key, 3600, data)
  }
}
```

## Implementation Plan

### Phase 1: Critical Fixes (Day 1)
- [ ] Add query timeouts and memory limits
- [ ] Implement basic sampling for large datasets
- [ ] Add composite index on (trace_id, parent_span_id)
- [ ] Fix self-join in getServiceDependencies

### Phase 2: Materialized Views (Day 2)
- [ ] Create service dependencies MV
- [ ] Create service metrics MV
- [ ] Update queries to use MVs when available
- [ ] Add MV refresh scheduling

### Phase 3: Progressive Loading (Day 3)
- [ ] Implement time range chunking
- [ ] Add adaptive sampling logic
- [ ] Create result merging algorithms
- [ ] Add progress indicators to UI

### Phase 4: Caching & Monitoring (Day 4)
- [ ] Implement multi-level cache
- [ ] Add query performance metrics
- [ ] Create monitoring dashboard
- [ ] Add alerting for slow queries

## Testing Requirements

### Performance Tests
```typescript
describe('Topology Performance', () => {
  it('should handle 1M traces in < 5 seconds', async () => {
    await generateTraces(1_000_000)
    const start = Date.now()
    const result = await getTopology()
    expect(Date.now() - start).toBeLessThan(5000)
    expect(result.nodes.length).toBeGreaterThan(0)
  })

  it('should not OOM with 10M traces', async () => {
    await generateTraces(10_000_000)
    const memBefore = process.memoryUsage().heapUsed
    const result = await getTopology()
    const memAfter = process.memoryUsage().heapUsed
    expect(memAfter - memBefore).toBeLessThan(1_000_000_000) // < 1GB
  })
})
```

### Load Tests
- Concurrent users: 100
- Traces per test: 5M
- Expected response time: < 5s p95
- Memory usage: < 2GB per query

## Success Metrics

### Performance KPIs
- **Query Latency**: p95 < 5 seconds for 1M traces
- **Memory Usage**: < 1GB per query
- **Success Rate**: > 99.9% query success
- **Cache Hit Rate**: > 80% for repeated queries

### User Experience
- No timeouts in UI
- Smooth graph rendering
- Progressive data loading indication
- Graceful degradation messaging

## Rollout Strategy

1. **Canary Deployment**: 10% traffic for 24 hours
2. **Monitor Metrics**: Query times, memory usage, error rates
3. **Progressive Rollout**: 25% → 50% → 100%
4. **Rollback Plan**: Feature flag to revert to old queries

## Documentation Updates

- Update API documentation with new query parameters
- Add performance tuning guide
- Document sampling thresholds
- Create troubleshooting guide

## Related Issues

- [#57](https://github.com/clayroach/otel-ai/issues/57) - Original bug report
- [#45](https://github.com/clayroach/otel-ai/issues/45) - E2E test failures
- [#38](https://github.com/clayroach/otel-ai/issues/38) - UI timeout issues

## Test Data Management

### Problem Reproduction Dataset

To ensure we can reliably reproduce and test the performance issue, we'll create a standardized test dataset that simulates the problematic scenario.

#### Dataset Structure
```
test-data/
├── clickhouse-dumps/          # ClickHouse backup files
│   ├── small/                 # 100K traces for quick tests
│   │   ├── traces.parquet     # Parquet format for efficiency
│   │   └── metadata.json      # Dataset metadata
│   ├── medium/                # 1M traces for performance tests
│   │   ├── traces.parquet
│   │   └── metadata.json
│   └── large/                 # 10M traces for stress tests
│       ├── traces.parquet.gz  # Compressed for Git LFS
│       └── metadata.json
├── generators/                # Data generation scripts
│   ├── generate-topology-stress.ts
│   └── generate-service-mesh.ts
└── README.md                  # Dataset documentation
```

#### ClickHouse Backup/Restore Strategy

##### Export Current Data (Backup)
```bash
# Export to Parquet format (efficient and portable)
docker exec otel-ai-clickhouse clickhouse-client \
  --user=otel --password=otel123 --database=otel \
  --query="SELECT * FROM traces WHERE start_time >= now() - INTERVAL 1 DAY
           FORMAT Parquet" > test-data/clickhouse-dumps/current.parquet

# Export with compression for large datasets
docker exec otel-ai-clickhouse clickhouse-client \
  --user=otel --password=otel123 --database=otel \
  --query="SELECT * FROM traces FORMAT Parquet" | \
  gzip > test-data/clickhouse-dumps/large/traces.parquet.gz

# Create metadata file
echo '{
  "export_date": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",
  "row_count": '$(docker exec otel-ai-clickhouse clickhouse-client \
    --user=otel --password=otel123 --database=otel \
    --query="SELECT count() FROM traces")',
  "date_range": {
    "start": "'$(docker exec otel-ai-clickhouse clickhouse-client \
      --user=otel --password=otel123 --database=otel \
      --query="SELECT min(start_time) FROM traces")'",
    "end": "'$(docker exec otel-ai-clickhouse clickhouse-client \
      --user=otel --password=otel123 --database=otel \
      --query="SELECT max(start_time) FROM traces")'"
  },
  "services": '$(docker exec otel-ai-clickhouse clickhouse-client \
    --user=otel --password=otel123 --database=otel \
    --query="SELECT count(DISTINCT service_name) FROM traces")',
  "avg_trace_complexity": '$(docker exec otel-ai-clickhouse clickhouse-client \
    --user=otel --password=otel123 --database=otel \
    --query="SELECT avg(cnt) FROM (SELECT trace_id, count() as cnt FROM traces GROUP BY trace_id)")'
}' > test-data/clickhouse-dumps/metadata.json
```

##### Import Test Data (Restore)
```bash
# Import from Parquet
cat test-data/clickhouse-dumps/medium/traces.parquet | \
docker exec -i otel-ai-clickhouse clickhouse-client \
  --user=otel --password=otel123 --database=otel \
  --query="INSERT INTO traces FORMAT Parquet"

# Import compressed data
gunzip -c test-data/clickhouse-dumps/large/traces.parquet.gz | \
docker exec -i otel-ai-clickhouse clickhouse-client \
  --user=otel --password=otel123 --database=otel \
  --query="INSERT INTO traces FORMAT Parquet"

# Update timestamps to recent (for time-based queries)
docker exec otel-ai-clickhouse clickhouse-client \
  --user=otel --password=otel123 --database=otel \
  --query="ALTER TABLE traces UPDATE
           start_time = start_time + (now() - max(start_time)),
           end_time = end_time + (now() - max(start_time))
           WHERE 1=1"
```

#### Git LFS Configuration

For large test datasets, we'll use Git LFS to avoid bloating the repository.

##### Setup Git LFS
```bash
# Install Git LFS
git lfs install

# Track large test data files
git lfs track "test-data/clickhouse-dumps/large/*.gz"
git lfs track "test-data/clickhouse-dumps/large/*.parquet"
git lfs track "*.parquet" # Track all Parquet files > 100MB

# Add .gitattributes to repo
git add .gitattributes
git commit -m "feat: Configure Git LFS for test datasets"
```

##### .gitattributes Content
```
# Git LFS tracking for large test datasets
test-data/clickhouse-dumps/large/*.gz filter=lfs diff=lfs merge=lfs -text
test-data/clickhouse-dumps/large/*.parquet filter=lfs diff=lfs merge=lfs -text
*.parquet filter=lfs diff=lfs merge=lfs -text
```

#### NPM Scripts for Test Data Management

Add to package.json:
```json
{
  "scripts": {
    // Backup commands
    "test-data:backup:small": "scripts/backup-clickhouse.sh small 100000",
    "test-data:backup:medium": "scripts/backup-clickhouse.sh medium 1000000",
    "test-data:backup:large": "scripts/backup-clickhouse.sh large 10000000",
    "test-data:backup:current": "scripts/backup-clickhouse.sh current",

    // Restore commands
    "test-data:restore:small": "scripts/restore-clickhouse.sh small",
    "test-data:restore:medium": "scripts/restore-clickhouse.sh medium",
    "test-data:restore:large": "scripts/restore-clickhouse.sh large",

    // Generation commands
    "test-data:generate:stress": "tsx scripts/generate-topology-stress.ts",
    "test-data:generate:mesh": "tsx scripts/generate-service-mesh.ts",

    // Performance testing
    "perf:test:small": "pnpm test-data:restore:small && pnpm test:integration topology",
    "perf:test:medium": "pnpm test-data:restore:medium && pnpm test:integration topology",
    "perf:test:large": "pnpm test-data:restore:large && pnpm test:integration topology",

    // Benchmark suite
    "perf:benchmark": "pnpm perf:test:small && pnpm perf:test:medium && pnpm perf:test:large"
  }
}
```

#### Synthetic Data Generator

Create a stress test data generator that creates the problematic topology pattern:

```typescript
// scripts/generate-topology-stress.ts
import { Effect } from 'effect'

interface GeneratorConfig {
  totalTraces: number
  servicesCount: number
  avgSpansPerTrace: number
  errorRate: number
  deepNestingProbability: number
}

function generateStressTopology(config: GeneratorConfig) {
  // Generate a complex service mesh with:
  // - Deep call chains (10+ levels)
  // - High fan-out (services calling many others)
  // - Circular dependencies
  // - Mixed span kinds
  // - Varying latencies
}
```

### Performance Testing Suite

#### Automated Performance Tests
```typescript
// test/performance/topology-stress.test.ts
describe('Topology Performance Under Stress', () => {
  const datasets = [
    { name: 'small', traces: 100_000, expectedTime: 1000 },
    { name: 'medium', traces: 1_000_000, expectedTime: 5000 },
    { name: 'large', traces: 10_000_000, expectedTime: 30000 }
  ]

  datasets.forEach(dataset => {
    it(`should handle ${dataset.name} dataset within ${dataset.expectedTime}ms`, async () => {
      // Restore test dataset
      await exec(`pnpm test-data:restore:${dataset.name}`)

      // Warm up ClickHouse cache
      await warmupQueries()

      // Measure query performance
      const start = performance.now()
      const result = await getServiceTopology({ hours: 24 })
      const duration = performance.now() - start

      expect(duration).toBeLessThan(dataset.expectedTime)
      expect(result).toBeDefined()
      expect(result.nodes.length).toBeGreaterThan(0)

      // Check memory usage
      const memoryUsage = await getClickHouseMemoryUsage()
      expect(memoryUsage).toBeLessThan(2_000_000_000) // 2GB max
    })
  })
})
```

#### CI/CD Integration
```yaml
# .github/workflows/performance-tests.yml
name: Performance Tests
on:
  pull_request:
    paths:
      - 'src/ai-analyzer/queries.ts'
      - 'src/storage/**'
      - 'migrations/**'

jobs:
  performance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          lfs: true  # Pull LFS files

      - name: Setup environment
        run: |
          pnpm install
          pnpm dev:up

      - name: Run performance benchmarks
        run: pnpm perf:benchmark

      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: performance-results
          path: test-results/performance/
```

## References

- [ClickHouse Query Optimization](https://clickhouse.com/docs/en/sql-reference/statements/select/sample)
- [Materialized Views Best Practices](https://clickhouse.com/docs/en/guides/developer/cascading-materialized-views)
- [Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html)
- [Git LFS Documentation](https://git-lfs.github.com/)
- [ClickHouse Backup Strategies](https://clickhouse.com/docs/en/operations/backup)