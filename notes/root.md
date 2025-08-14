---
id: root
title: OpenTelemetry Project Documentation
desc: 'Root of the documentation hierarchy'
---

# OpenTelemetry Project Documentation

## Quick Links

- [[daily]] - Daily development journal
- [[packages]] - Package documentation
- [[design]] - Design decisions and ADRs

## Project Overview

This project implements OpenTelemetry instrumentation with integrated Dendron documentation.

### Key Features

- Distributed tracing with W3C Trace Context
- Metrics collection with multiple aggregation types
- Log correlation with trace IDs
- Context propagation across services
- Multiple exporter support (OTLP, Jaeger, Prometheus)

## Documentation Structure

```
notes/
├── daily/          # Daily development journals
├── packages/       # Package-specific documentation
│   ├── tracer/    # Tracing implementation
│   ├── metrics/   # Metrics implementation
│   └── exporter/  # Export implementations
├── design/        # Architectural decisions
│   └── adr/      # Architecture Decision Records
└── templates/     # Note templates
```

## Keyboard Shortcuts

- `Ctrl+Alt+N` - Create daily note
- `Ctrl+Alt+G` - Generate code from package note
- `Ctrl+Alt+D` - Update note from code
- `Ctrl+Alt+S` - Sync all package notes

## Getting Started

1. Define package specifications in [[packages]]
2. Generate code using Copilot (Ctrl+Alt+G)
3. Document daily progress in [[daily]]
4. Record design decisions in [[design.adr]]

## Copilot Integration

Use `@workspace` prefix in Copilot Chat for context-aware assistance.
See [Copilot Instructions](.github/copilot-instructions.md) for examples.
