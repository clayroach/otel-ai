# Storage Package Testing

The storage package uses a two-tier testing approach for comprehensive coverage:

## Unit Tests (`*.test.ts`)

These tests focus on individual components and logic without requiring external dependencies:

- **No external dependencies**: Tests run without needing ClickHouse, S3, or other backends
- **Fast execution**: Complete in seconds
- **CI/CD friendly**: Suitable for continuous integration pipelines
- **Error handling**: Gracefully handle connection failures and validate behavior

Run unit tests:
```bash
npm test src/storage/
```

## Integration Tests (`*.integration.test.ts`)

These tests use TestContainers to provide real backend services:

- **Real dependencies**: Use actual ClickHouse and MinIO containers
- **End-to-end testing**: Validate complete workflows with real databases
- **Longer execution**: May take 1-3 minutes due to container startup
- **Docker required**: Need Docker daemon running

Run integration tests:
```bash
npm run test:integration:storage
```

## TestContainers Benefits

TestContainers provides:

1. **Isolated environments**: Each test run gets fresh containers
2. **Consistent setup**: Same environment across different machines
3. **Real backend behavior**: Tests against actual ClickHouse/MinIO, not mocks
4. **Automatic cleanup**: Containers are destroyed after tests complete
5. **Deterministic tests**: No interference from external state

## Test Categories

### Unit Tests Cover:
- Configuration validation
- Error handling
- Type safety
- API contracts
- Edge cases

### Integration Tests Cover:
- Database schema creation
- Data insertion and querying
- Performance characteristics
- Real-world workflows
- Container orchestration

## Running Tests in CI/CD

For CI/CD pipelines, use this pattern:

```yaml
# Fast feedback (unit tests)
- name: Unit Tests
  run: npm test

# Comprehensive validation (integration tests)  
- name: Integration Tests
  run: npm run test:integration:storage
  # Only on important branches or releases
  if: github.ref == 'refs/heads/main'
```

This approach provides fast feedback for development while ensuring comprehensive validation when needed.