---
id: packages
title: Package Documentation
desc: 'Index of all package documentation'
---

# Package Documentation

## Overview
Each package in `src/` has corresponding documentation here.
Package notes serve as both specification and living documentation.

## Core Packages

### [[packages.tracer]]
Distributed tracing implementation with:
- Span creation and management
- Context propagation
- Sampling strategies
- Batch processing

### [[packages.metrics]]
Metrics collection and aggregation:
- Counter, Histogram, and Gauge instruments
- Multiple aggregation temporalities
- Efficient memory management
- Prometheus and OTLP export

### [[packages.exporter]]
Export implementations:
- OTLP (HTTP and gRPC)
- Jaeger
- Prometheus
- Console (for debugging)

## Workflow
1. **Specify** - Write package requirements in markdown
2. **Generate** - Use Copilot to create implementation
3. **Test** - Ensure 80% coverage minimum
4. **Document** - Update notes from implementation
5. **Review** - Record decisions in ADRs

## Package Template
New packages use [[templates.package-template]]

## Best Practices
- Start with documentation, then code
- Keep specifications and code in sync
- Follow OpenTelemetry semantic conventions
- Document all public APIs with TypeScript types
- Include usage examples in package notes
