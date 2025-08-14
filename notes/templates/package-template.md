---
id: packages.{{name}}
title: {{name}} Package
desc: 'Package documentation and code generation'
updated: {{date}}
created: {{date}}
---

# {{name}} Package

## Package Overview

<!-- COPILOT_CONTEXT: This note describes the {{name}} package -->

### Purpose

<!-- Describe what this package does -->

### Architecture

<!-- Key design decisions for this package -->

## API Surface

<!-- COPILOT_GENERATE: Based on this description, generate TypeScript interfaces -->

### Public Interfaces

```typescript
// Define your interfaces here
```

### Public Classes

```typescript
// Define your classes here
```

## Implementation Notes

<!-- COPILOT_SYNC: Analyze code in src/{{name}} and update this section -->

### Core Components

- Component 1: Description
- Component 2: Description

### Dependencies

- Internal dependencies:
- External dependencies:

## Code Generation Prompts

### Generate Base Implementation

Use this in Copilot Chat:

```
@workspace Based on the package overview in notes/packages/{{name}}/package.md, generate the initial implementation for:
- Main class structure in src/{{name}}/index.ts
- Core interfaces in src/{{name}}/types.ts
- Basic unit tests in src/{{name}}/__tests__/index.test.ts
```

### Update from Code

Use this in Copilot Chat:

```
@workspace Analyze the code in src/{{name}} and update notes/packages/{{name}}/package.md with:
- Current API surface
- Key methods and their purposes
- Dependencies
- Recent changes
```

## OpenTelemetry Integration

<!-- Specific OpenTelemetry patterns used in this package -->

### Instrumentation

- Spans created:
- Metrics emitted:
- Context propagation:

## Testing Strategy

<!-- Test coverage and testing approach -->

### Unit Tests

- Coverage target: 80%
- Key test scenarios:

### Integration Tests

- Test with real collectors:
- Performance benchmarks:

## Change Log

<!-- Auto-updated by Copilot when code changes -->

### {{date}}

- Initial package creation
