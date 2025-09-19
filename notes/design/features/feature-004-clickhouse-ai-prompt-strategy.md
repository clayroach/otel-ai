# Feature 004: ClickHouse AI Prompt Strategy Optimization

**Status**: In Progress  
**Priority**: High  
**Category**: AI/LLM Integration  
**Owner**: Development Team  
**Created**: 2025-01-05  

## Overview

Optimize our AI-powered SQL query generation to align with official ClickHouse AI best practices while maintaining our enhanced diagnostic capabilities for observability use cases.

## Background

Analysis of the [official ClickHouse AI documentation](https://clickhouse.com/docs/use-cases/AI/ai-powered-sql-generation) reveals opportunities to improve our prompting strategies for both SQL-specific models and general LLMs, ensuring we follow established best practices while preserving our trace-level diagnostic enhancements.

## Current State Analysis

### ✅ Strengths (Aligned with ClickHouse AI Best Practices)
- **Complete Schema Information**: Full table schemas provided in each prompt
- **Self-Contained Queries**: Each generation is independent with full context
- **Specific Analysis Goals**: Clear objectives and time periods specified
- **Service Context**: Proper service filtering and context
- **Time Period Specification**: Specific time windows (15-minute intervals)

### 🚀 Our Enhanced Capabilities Beyond Standard ClickHouse AI
- **Trace-Level Filtering**: Focus on problematic traces first
- **Multi-Tiered Requirements**: Structured diagnostic requirements
- **Health Scoring**: CRITICAL/WARNING/HEALTHY operational triage
- **Error Analysis Integration**: Built-in error rate and failure pattern analysis
- **Bottleneck Detection**: Total time impact calculations for prioritization

### ⚠️ Areas for Improvement
1. **Prompt Length Differentiation**: SQL and General prompts too similar in complexity
2. **SQL Model Over-Engineering**: SQL-specific models get overly complex prompts
3. **Missing Dynamic Schema Discovery**: Could benefit from runtime schema inspection
4. **Inconsistent ClickHouse AI Pattern Adherence**: Not following their direct request pattern

## Feature Requirements

### FR-004-001: SQL Model Prompt Simplification
**Priority**: High

Simplify prompts for SQL-specific models to follow ClickHouse AI's direct approach:

```
"Analyze [specific request] for [services] over [time period]"
+ Essential Schema
+ Required SQL Patterns (concise)
+ "Generate ClickHouse SQL:"
```

**Acceptance Criteria**:
- SQL model prompts < 1500 characters
- Direct SQL pattern injection without extensive explanations
- Maintains essential diagnostic requirements
- Clear, actionable instructions

### FR-004-002: General LLM Prompt Enhancement
**Priority**: High

Enhance general LLM prompts with richer diagnostic context while following ClickHouse AI principles:

```
"You are a ClickHouse expert specializing in [domain] analysis"
+ Rich Context (Critical Path, Services, Goals)
+ Comprehensive Diagnostic Requirements
+ Detailed Schema Information
+ Validation Rules and Expected Outcomes
+ Structured Output Requirements
```

**Acceptance Criteria**:
- General LLM prompts > 2000 characters with rich context
- Comprehensive diagnostic requirements clearly specified
- Detailed validation criteria included
- Maintains self-contained nature

### FR-004-003: Dynamic Schema Discovery Integration
**Priority**: Medium

Implement dynamic schema discovery similar to ClickHouse AI's approach:

**Functions to Implement**:
- `discoverTableSchema(tableName: string)`
- `validateSchemaAgainstQuery(schema, query)`
- `getOptimalColumns(analysisType, schema)`

**Acceptance Criteria**:
- Runtime schema inspection capability
- Automatic column selection optimization
- Schema validation before query execution
- Fallback to static schema when discovery fails

### FR-004-004: Prompt Pattern Standardization
**Priority**: High

Standardize prompt patterns following ClickHouse AI best practices:

**SQL Model Pattern**:
```typescript
const sqlPattern = `
${analysisRequest}

Services: ${services.join(', ')}
Time Period: ${timeWindow}

Required Patterns:
${essentialSQLPatterns}

Schema: ${minimalSchema}

Generate ClickHouse SQL:
`
```

**General LLM Pattern**:
```typescript
const generalPattern = `
You are a ClickHouse expert specializing in ${domain}.

Context:
- Critical Path: ${path.name}
- Services: ${path.services.join(' → ')}
- Analysis Goal: ${analysisGoal}

Diagnostic Requirements:
${comprehensiveDiagnosticRequirements}

Schema: ${completeSchema}

Validation Rules:
${validationCriteria}

Generate diagnostic SQL query:
`
```

**Acceptance Criteria**:
- Consistent pattern application across all generators
- Clear separation of concerns between model types
- ClickHouse AI compliance validated
- Maintains diagnostic enhancement capabilities

### FR-004-005: Root Cause Analysis Patterns
**Priority**: High

Implement progressive investigation patterns based on ClickHouse's LLM observability challenge findings:

**Investigation Flow Pattern**:
```typescript
const rootCausePattern = `
Phase 1: Broad Analysis
- Identify all anomalies in the time window
- List affected services and operations
- Note error patterns and failure types

Phase 2: Multi-Source Correlation
- Correlate traces with error logs
- Match metrics spikes with trace anomalies
- Identify cascade effects between services

Phase 3: Hypothesis Validation
- Generate 3 potential root causes
- Validate each with specific queries
- Eliminate false hypotheses with data

Phase 4: Root Cause Confirmation
- Focus on validated hypothesis
- Trace back to originating service
- Identify trigger conditions
`
```

**Acceptance Criteria**:
- Progressive investigation from broad to specific
- Multi-data-source exploration (traces + logs + metrics)
- Hypothesis validation to prevent tunnel vision
- Trace ID and timestamp correlation guidance
- Clear distinction between symptoms and root causes

## Technical Implementation

### Architecture Changes

```
src/ui-generator/query-generator/
├── clickhouse-ai-patterns.ts          # New: ClickHouse AI compliant patterns
├── diagnostic-query-instructions.ts   # Updated: Simplified and optimized
├── schema-discovery.ts                 # New: Dynamic schema discovery
├── prompt-validators.ts                # New: Pattern validation
├── service-clickhouse-ai.ts           # Updated: Uses new patterns
└── llm-query-generator.ts             # Updated: Uses new patterns
```

### New Modules

#### clickhouse-ai-patterns.ts
```typescript
export interface ClickHouseAIPattern {
  modelType: 'sql' | 'general'
  promptTemplate: string
  maxLength: number
  requiredElements: string[]
}

export const SQL_MODEL_PATTERN: ClickHouseAIPattern = {
  modelType: 'sql',
  promptTemplate: '{request}\n\nServices: {services}\nTime: {timeWindow}\n\nPatterns:\n{patterns}\n\nSchema: {schema}\n\nGenerate ClickHouse SQL:',
  maxLength: 1500,
  requiredElements: ['request', 'services', 'schema']
}

export const GENERAL_LLM_PATTERN: ClickHouseAIPattern = {
  modelType: 'general', 
  promptTemplate: 'You are a ClickHouse expert...\n\nContext:\n{context}\n\nRequirements:\n{requirements}\n\nSchema:\n{schema}\n\nValidation:\n{validation}\n\nGenerate query:',
  maxLength: 4000,
  requiredElements: ['context', 'requirements', 'schema', 'validation']
}
```

#### schema-discovery.ts
```typescript
export interface TableSchema {
  tableName: string
  columns: ColumnDefinition[]
  indexes: string[]
  partitionKey?: string
  orderBy?: string[]
}

export class SchemaDiscoveryService {
  async discoverSchema(tableName: string): Promise<TableSchema>
  async validateQuery(query: string, schema: TableSchema): Promise<ValidationResult>
  async optimizeColumns(analysisType: string, schema: TableSchema): Promise<string[]>
}
```

### Migration Strategy

1. **Phase 1**: Implement new pattern modules alongside existing code
2. **Phase 2**: Update service-clickhouse-ai.ts to use new SQL patterns
3. **Phase 3**: Update llm-query-generator.ts to use new general patterns  
4. **Phase 4**: Add dynamic schema discovery integration
5. **Phase 5**: Deprecate old diagnostic-query-instructions.ts (maintain for backward compatibility)

## Testing Strategy

### Test Coverage Requirements

```typescript
// New test files to create
src/ui-generator/test/unit/clickhouse-ai-pattern-compliance.test.ts
src/ui-generator/test/unit/schema-discovery.test.ts  
src/ui-generator/test/integration/sql-vs-general-optimization.test.ts
```

### Validation Criteria

1. **Prompt Length Validation**:
   - SQL model prompts: < 1500 characters
   - General model prompts: > 2000 characters
   - Clear differentiation in complexity

2. **ClickHouse AI Compliance**:
   - Self-contained prompts ✅
   - Complete schema information ✅
   - Specific time periods ✅
   - Clear analysis goals ✅

3. **Diagnostic Enhancement Preservation**:
   - Trace-level filtering maintained ✅
   - Error analysis capabilities ✅
   - Health scoring functionality ✅
   - Bottleneck detection preserved ✅

4. **Performance Validation**:
   - SQL model response quality vs. prompt complexity
   - General model diagnostic accuracy
   - Query generation time improvements

## Success Metrics

### Quantitative Metrics
- **Prompt Efficiency**: SQL model prompts reduced by 40%+ in length
- **Response Quality**: Maintain or improve query validation scores
- **Generation Speed**: 20%+ improvement in SQL model response times
- **Pattern Compliance**: 100% ClickHouse AI pattern adherence
- **Root Cause Analysis Effectiveness**: LLM correctly identifies root causes in 75%+ of cases
- **Investigation Autonomy**: Reduce human guidance prompts from 5+ to <3 per investigation
- **Multi-Source Correlation**: Successfully correlate traces, logs, and metrics in 80%+ of queries
- **Time to Root Cause**: Achieve <10 minutes from anomaly detection to root cause identification

### Qualitative Metrics
- **SQL Model Usability**: Clearer, more direct prompts for SQL-specific models
- **General Model Richness**: Enhanced context for complex diagnostic scenarios
- **Maintainability**: Reduced code duplication and clearer separation of concerns
- **Diagnostic Capability**: Preserved trace-level analysis and health scoring
- **False Hypothesis Avoidance**: Reduce "stuck on wrong hypothesis" incidents by 50%
- **Investigation Path Quality**: Clear progression from symptoms to root causes

## Implementation Timeline

### Week 1: Foundation
- [ ] Create clickhouse-ai-patterns.ts module
- [ ] Implement basic pattern validation
- [ ] Create compliance test suite

### Week 2: SQL Model Optimization  
- [ ] Implement simplified SQL model patterns
- [ ] Update service-clickhouse-ai.ts
- [ ] Validate SQL model prompt reduction

### Week 3: General LLM Enhancement
- [ ] Enhance general LLM patterns
- [ ] Update llm-query-generator.ts  
- [ ] Comprehensive testing of both approaches

### Week 4: Schema Discovery & Polish
- [ ] Implement schema-discovery.ts
- [ ] Integration testing
- [ ] Documentation and migration guide

## Risks and Mitigation

### Risk: SQL Model Quality Degradation
**Mitigation**: Gradual rollout with A/B testing, fallback to existing approach

### Risk: Breaking Existing Diagnostic Capabilities
**Mitigation**: Comprehensive test coverage, backward compatibility layer

### Risk: Over-Engineering Schema Discovery
**Mitigation**: Start with simple static optimization, evolve incrementally

## Future Enhancements

### Phase 2 Considerations
- **Multi-table Analysis**: Extend beyond single `traces` table
- **Custom Schema Adapters**: Support for different observability data models  
- **AI Model Performance Profiling**: Optimize prompts based on model-specific performance data
- **Real-time Schema Updates**: Dynamic schema change detection and adaptation

## Related Features

- **Feature 002**: Dynamic UI Generation (uses these query patterns)
- **Feature 003**: Trace-Level Diagnostic Analysis (preserved and enhanced)
- **ADR-014**: LLM Management Service Layer (architectural foundation)

## References

- [ClickHouse AI Documentation](https://clickhouse.com/docs/use-cases/AI/ai-powered-sql-generation)
- [ClickHouse LLM Observability Challenge](https://clickhouse.com/blog/llm-observability-challenge)
- [Feature 002: Dynamic UI Generation](./feature-002-dynamic-ui-generation.md)
- [Feature 005: Diagnostics UI Fine-Tuning](./feature-005-diagnostics-ui-fine-tuning.md)
- [ADR-014: LLM Management Library Evaluation](../adr/adr-014-llm-library-evaluation.md)
- Analysis Document: [Feature 004 Analysis](./feature-004-analysis.md)