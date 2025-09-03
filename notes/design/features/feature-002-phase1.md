# Feature 002 - Phase 1: Query Generation

## Goal
Implement the CriticalPathQueryGenerator that transforms critical paths into ClickHouse queries.

## Core Interface

```typescript
interface CriticalPathQueryGenerator {
  generateQueries(path: CriticalPath): GeneratedQuery[]
  generateQueryThunk(path: CriticalPath): () => Promise<QueryResult>
}

interface GeneratedQuery {
  id: string
  name: string
  sql: string
  executeThunk: () => Promise<QueryResult>
}
```

## Implementation Requirements

1. Create Effect-TS service for query generation
2. Support 5 query patterns:
   - Service latency analysis
   - Error distribution
   - Bottleneck detection
   - Volume/throughput
   - Time-based comparison
3. Use thunk pattern for lazy evaluation
4. Integration with existing storage package

## Test Requirements
- Unit tests for each query pattern
- Validate SQL generation
- Test thunk execution

## Success Criteria
- Generates valid ClickHouse SQL
- Thunks execute only when called
- 100% test coverage