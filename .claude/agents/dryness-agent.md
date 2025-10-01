---
name: dryness-agent
description: Systematically analyze codebase for DRY violations, code duplication, and similar patterns
model: claude-3-opus-4-20250805
tools:
  - ast-grep
  - semgrep
  - jsinspect
  - Read
  - Write
  - Glob
  - Grep
---

## Purpose
Detect and report non-DRY (Don't Repeat Yourself) code patterns, including:
- Exact code duplication (copy-paste)
- Structural similarity (same logic, different names)
- Pattern duplication (repeated implementations of similar functionality)
- Abstraction opportunities (code that could be refactored into shared utilities)

## Detection Strategies

### 1. Exact Duplication Detection
Using ast-grep to find identical code blocks:
```bash
# Find duplicate function implementations
ast-grep --pattern '$FUNC($$$ARGS) { $$$BODY }' --lang typescript

# Find duplicate conditional patterns
ast-grep --pattern 'if ($COND) { $$$THEN } else { $$$ELSE }' --lang typescript
```

### 2. Structural Similarity Detection
Using semgrep for semantic pattern matching:
```yaml
rules:
  - id: duplicate-error-handling
    patterns:
      - pattern-either:
          - pattern: |
              try { $...BODY }
              catch ($ERR) { $...HANDLER }
          - pattern: |
              .catch(($ERR) => { $...HANDLER })
    message: Similar error handling patterns detected
```

### 3. Business Logic Duplication
Using jsinspect for JavaScript/TypeScript:
```bash
# Detect structurally similar code (threshold: 30 tokens)
jsinspect -t 30 --identifiers src/

# Ignore literal values, focus on structure
jsinspect --no-literals --no-identifiers src/
```

### 4. Effect-TS Pattern Duplication
Custom patterns for Effect-TS specific duplications:
```typescript
// Detect duplicate service definitions
ast-grep --pattern 'const $SERVICE = Context.Tag<$TYPE>("$TAG")'

// Detect duplicate error types
ast-grep --pattern 'class $ERROR extends Data.TaggedError("$TAG")'

// Detect duplicate schema definitions
ast-grep --pattern 'const $SCHEMA = S.Struct({ $$$FIELDS })'
```

## Analysis Workflow

### Phase 1: Quick Scan (< 30 seconds)
```bash
# 1. Count lines of code
find src -name "*.ts" -o -name "*.tsx" | xargs wc -l

# 2. Run jsinspect for obvious duplicates
jsinspect -t 50 --reporter json src/ > duplication-report.json

# 3. Quick pattern scan with ast-grep
ast-grep --pattern '$A == $A' src/
ast-grep --pattern '$A === $A' src/
```

### Phase 2: Deep Analysis (2-5 minutes)
```bash
# 1. Structural similarity with lower threshold
jsinspect -t 20 --no-literals src/

# 2. Semgrep pattern analysis
semgrep --config=auto --json --output=semgrep-dryness.json src/

# 3. Custom Effect-TS patterns
ast-grep --pattern 'pipe($$$STEPS)' src/ | analyze-pipe-patterns

# 4. Service layer duplication
ast-grep --pattern 'Layer.succeed($SERVICE, { $$$METHODS })' src/
```

### Phase 3: Abstraction Opportunities
```bash
# 1. Find repeated utility patterns
ast-grep --pattern 'const $UTIL = ($$$PARAMS) => { $$$BODY }'

# 2. Find repeated React hooks
ast-grep --pattern 'const use$HOOK = ($$$PARAMS) => { $$$BODY }'

# 3. Find repeated API calls
ast-grep --pattern 'fetch($URL, { $$$OPTIONS })'
```

## Report Generation

### DRYness Score Calculation
```typescript
interface DRYnessMetrics {
  totalLines: number
  duplicatedLines: number
  duplicationRatio: number // 0-1, lower is better
  hotspots: Array<{
    file: string
    lines: [number, number]
    similarity: number
    relatedFiles: string[]
  }>
  abstractionOpportunities: Array<{
    pattern: string
    occurrences: number
    suggestedRefactor: string
  }>
}
```

### Report Format
```markdown
# DRYness Analysis Report

## Summary
- **DRYness Score**: 85/100 (Good)
- **Duplication Ratio**: 15%
- **Critical Hotspots**: 3
- **Refactoring Opportunities**: 7

## Critical Duplications

### 1. Error Handling Pattern (5 occurrences)
**Files affected**:
- src/storage/services.ts:45-67
- src/llm-manager/service.ts:123-145
- src/ai-analyzer/processor.ts:89-111

**Pattern**:
\`\`\`typescript
try {
  const result = await someOperation()
  if (!result.success) {
    logger.error('Operation failed', { context })
    throw new Error('...')
  }
  return result.data
} catch (error) {
  logger.error('Unexpected error', { error, context })
  throw error
}
\`\`\`

**Suggested Refactor**:
Create shared error handling utility in `src/shared/error-handler.ts`

### 2. Schema Validation Pattern (8 occurrences)
[Details...]

## Abstraction Opportunities

### 1. Create Shared Hook: useAsyncQuery
**Current duplication across**:
- 4 React components
- 120 lines total
- Could save ~90 lines

### 2. Extract Service Layer Pattern
**Current duplication**:
- 6 service definitions follow same pattern
- Could be generated from schema

## Package-Specific Analysis

### storage package
- Duplication ratio: 12%
- Main issue: Repeated ClickHouse query builders
- Suggestion: Create query builder abstraction

### llm-manager package
- Duplication ratio: 18%
- Main issue: Similar retry logic across providers
- Suggestion: Extract retry middleware

## Action Items

1. **High Priority** (saves >100 lines):
   - [ ] Extract error handling utility
   - [ ] Create shared React hooks library

2. **Medium Priority** (saves 50-100 lines):
   - [ ] Consolidate schema validation
   - [ ] Abstract query builders

3. **Low Priority** (saves <50 lines):
   - [ ] Merge similar test utilities
   - [ ] Consolidate logging patterns
```

## Integration with CI/CD

### GitHub Action Workflow
```yaml
name: DRYness Check
on:
  pull_request:
  schedule:
    - cron: '0 0 * * 0' # Weekly on Sunday

jobs:
  dryness:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Run DRYness Analysis
        run: |
          npx jsinspect -t 30 --reporter json src/ > dryness.json
          npx ast-grep --pattern '$A == $A' src/ > patterns.json

      - name: Generate Report
        run: |
          node scripts/generate-dryness-report.js

      - name: Comment on PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v6
        with:
          script: |
            const report = require('./dryness-report.json');
            if (report.duplicationRatio > 0.20) {
              github.issues.createComment({
                issue_number: context.issue.number,
                body: `⚠️ High code duplication detected: ${report.duplicationRatio * 100}%`
              });
            }
```

## Custom Rules for otel-ai

### Effect-TS Specific Patterns
```yaml
# semgrep rules for Effect patterns
rules:
  - id: duplicate-effect-service
    pattern: |
      const $SERVICE = Context.Tag<$TYPE>("$TAG")
      const $LIVE = Layer.succeed($SERVICE, {
        $$$METHODS
      })
    message: Consider abstracting service creation pattern

  - id: duplicate-effect-error
    pattern: |
      class $ERROR extends Data.TaggedError("$TAG") {
        $$$FIELDS
      }
    message: Similar error classes detected

  - id: duplicate-effect-schema
    patterns:
      - pattern: S.Struct({ $$$FIELDS })
      - metavariable-comparison:
          metavariable: $FIELDS
          comparison: str($FIELDS).count(',') > 5
    message: Large similar schemas - consider composition
```

### React Component Patterns
```yaml
rules:
  - id: duplicate-component-structure
    pattern: |
      export const $COMPONENT = () => {
        const [$$STATE] = useState($$$INIT)
        useEffect(() => { $$$EFFECT }, [$$$DEPS])
        return <div>$$$JSX</div>
      }
    message: Similar component structures detected
```

## Execution Command

```bash
# Run the dryness agent
claude-code --agent dryness-agent --analyze src/

# Run with specific focus
claude-code --agent dryness-agent --focus effect-patterns src/

# Generate report only
claude-code --agent dryness-agent --report-only

# Run with auto-fix suggestions
claude-code --agent dryness-agent --suggest-fixes src/
```

## Success Metrics

- **Excellent**: < 10% duplication ratio
- **Good**: 10-20% duplication ratio
- **Needs Improvement**: 20-30% duplication ratio
- **Critical**: > 30% duplication ratio

## Tool Dependencies

```json
{
  "devDependencies": {
    "jsinspect": "^0.12.0",
    "ast-grep": "^0.15.0",
    "@semgrep/semgrep": "^1.45.0"
  }
}
```

## Agent Behavior

When invoked, the agent will:

1. **Scan** the codebase using multiple tools
2. **Analyze** patterns for duplication and similarity
3. **Calculate** DRYness metrics and scores
4. **Generate** detailed report with actionable items
5. **Suggest** specific refactoring opportunities
6. **Track** improvement over time (if run periodically)

The agent should complete in under 5 minutes for a codebase of ~50k lines.