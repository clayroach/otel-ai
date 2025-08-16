---
id: inception
title: Project Inception and Goals
desc: 'Initial vision, goals, and motivation for the OpenTelemetry AI project'
updated: 2025-08-11
created: 2025-08-11
---

# Project Inception and Goals

## Project Vision

Create an OpenTelemetry product that is infused with AI model learning from its core. This is not just observability with AI features bolted on, but a fundamentally AI-native observability platform that learns, adapts, and proactively manages system health.

The platform will continuously analyze telemetry data to identify patterns that impact performance and find (or fix) issues before they impact application functionality. It features user-specific UIs driven by LLMs that adapt based on user interactions and develop knowledge of usage patterns to suggest new ways to view data.

## Primary Goals

### Core Platform

- **AI-Native Observability**: LLMs integrated at the core, not as an afterthought
- **Proactive Issue Resolution**: Find and fix problems before they impact functionality
- **Adaptive User Experience**: LLM-driven UIs that learn from user behavior
- **Universal Deployment**: Easy installation across standalone, Docker, or Kubernetes environments

### Technical Architecture - Dual Ingestion Design

- **Dual Schema Architecture**: 
  - OTLP native (`otel_traces`) for ecosystem compatibility
  - AI-optimized custom schema (`traces`) for ML workloads
  - Unified view (`ai_traces_unified`) for cross-path analysis
- **Clickhouse Backend**: Primary analytics engine with materialized views
- **S3-Compatible Storage**: Raw data storage with S3/MinIO backend
- **Dual Ingestion Paths**:
  - OTel Collector → ClickHouse (standard OTLP)
  - Direct OTLP → Storage Package (AI-optimized)
- **TypeScript Implementation**: Universal consumption and contribution
- **React + Apache ECharts UI**: Rich, interactive data visualization

### AI-Powered Operations - Enhanced with Dual Path Analysis

- **Unified AI Processing**: Analysis across both ingestion paths simultaneously
- **Cross-Path Correlation**: Detect patterns spanning collector and direct ingestion
- **Ingestion Path Optimization**: AI recommends optimal path per service
- **Continuous Analysis**: LLMs constantly analyzing telemetry for patterns
- **Autonomous Agents**: Opinionated modules using AI agents for condition evaluation
- **Pattern Recognition**: Learning from historical data to predict issues
- **Self-Healing Capabilities**: Automated remediation based on learned patterns

## Problem Statement

[What problems are you solving?]

## Success Criteria

[How will you measure success?]

## Key Architectural Discoveries

### Dual Schema Architecture (Day 3 Discovery)

**Major architectural insight discovered during implementation**: The OpenTelemetry Collector's ClickHouse exporter creates native OTLP schema tables (`otel_traces`) instead of using custom schema definitions. This led to the **dual ingestion architecture**:

#### The Discovery
- **Expected**: Single custom schema for all telemetry data
- **Reality**: Collector uses OTLP native schema, direct ingestion uses custom schema
- **Opportunity**: Leverage both schemas for enhanced AI capabilities

#### Architectural Benefits
1. **Ecosystem Compatibility**: OTLP native schema maintains tool compatibility
2. **AI Optimization**: Custom schema optimized for ML workloads and feature extraction
3. **Cross-Path Analysis**: Unique AI capabilities comparing ingestion methods
4. **Fault Tolerance**: Redundant ingestion paths provide resilience
5. **Gradual Migration**: Flexibility to transition between approaches

#### Implementation Strategy
- **Unified View**: `ai_traces_unified` materialized view harmonizes both schemas
- **AI-First**: AI analyzer processes unified data stream for richer insights
- **Path-Aware Models**: ML models can learn path-specific patterns
- **Performance Analysis**: Compare collector vs direct ingestion characteristics

This discovery fundamentally enhances the AI-native vision by providing richer data contexts and unique analytical capabilities not possible with single-path architectures.

## Key Decisions Made

### Documentation-Driven Development

- Chose Dendron for living documentation
- Specifications written before code
- Bidirectional sync between notes and implementation

### Technology Choices

- OpenTelemetry as the observability standard
- Clickhouse as the backend storage
- TypeScript for type safety

## Technical Deep Dive

### AI Model Strategy

- **Multi-Model Support**: Support for GPT, Claude, and local models (Llama family)
- **Training Approach**: Autoencoders for primary pattern recognition + daily batch processing for usage pattern evolution
- **AIOpsLab Integration**: Research and potentially implement Microsoft's agent architectures for autonomous operations

### User Experience Architecture

- **Role-Based Foundation**: Out-of-the-box configurations for DevOps, SRE, Developer roles
- **Individual Personalization**: Fine-tuning capabilities for specific user preferences and workflows
- **Dynamic Component Generation**: LLMs generate actual React/Apache ECharts components, not just configurations
- **Grafana Replacement**: Key differentiator - no need for external dashboarding tools

### Deployment & Infrastructure

- **Single Command Install**: One-command deployment across all environments
- **Container-Native**: Full Docker container architecture
- **Kubernetes Universal**: Native support for standard K8s, OpenShift, Rancher k3d, and RKE2
- **Real-Time Pipeline**: S3 ↔ Clickhouse with real-time data streaming

### Self-Healing Scope

- **Configuration Focus**: Primarily automated configuration changes (most error-prone area)
- **Proactive Remediation**: Detect and correct misconfigurations before they cause outages
- **Pattern-Based Fixes**: Learn from historical incidents to prevent similar issues

## Open Questions

### Research Areas

1. **AIOpsLab Architecture**: Deep dive into Microsoft's agent framework implementation details
2. **Component Generation**: Technical approach for LLM → React component pipeline
3. **Multi-Model Orchestration**: How to efficiently manage and route requests across different AI models
4. **Real-Time Learning**: Balancing real-time analysis with model training performance

### Technical Decisions Needed

1. **Local vs Cloud Models**: Strategy for supporting both cloud APIs and local model deployment
2. **Component Caching**: How to cache and version LLM-generated UI components
3. **Configuration Validation**: Safety mechanisms for automated configuration changes
4. **Data Retention**: S3 storage strategy for different data types and retention policies

## Timeline and Milestones

### Phase 1: MVP Foundation (30 Days - Target: Sept 12, 2025)

**Goal**: Core OpenTelemetry platform with basic AI integration

## ⚡ **REVISED TIMELINE - ACCELERATED PROGRESS** (Updated Day 3)

**Original 30-day plan exceeded - developing at ~2x expected pace!**

### **WEEK 1** ✅ **COMPLETED** (Days 1-3)

**Planned**: Infrastructure & Core OTel
**Actual Achievement**: Infrastructure + Core OTel + **Bonus Week 2 UI Features**

✅ **COMPLETED**:
- OpenTelemetry packages (tracer, metrics, exporter) using LLM code generation
- Clickhouse schema and integration **+ dual-ingestion architecture**
- S3/MinIO storage setup 
- Basic Docker containerization **+ production Docker Compose**
- **BONUS**: Professional Monaco SQL editor interface
- **BONUS**: Dual-ingestion visualization working
- **BONUS**: 42 comprehensive tests passing
- **BONUS**: End-to-end validation complete

### **WEEK 2** 🏃 **IN PROGRESS** (Days 4-10) - AHEAD OF SCHEDULE

**Focus**: Advanced UI + Real-time Features (originally Week 3 scope)

🎯 **PLANNED**:
- Enhanced UI components with real-time updates
- Advanced query interfaces and visualization
- Multi-model LLM integration (GPT/Claude/Llama) 
- WebSocket streaming for live data
- User interaction tracking and personalization

### **WEEK 3** 🎯 **READY TO START EARLY** (Days 11-17)

**Focus**: AI/ML Integration (originally Week 2 scope)

🎯 **PLANNED**:
- Basic autoencoder for anomaly detection  
- Real-time data pipeline optimization
- Pattern recognition and learning models
- Cross-path analysis capabilities

### **WEEK 4** 🚀 **ENHANCED SCOPE OPPORTUNITY** (Days 18-25)

**Focus**: Advanced Features + Production (originally Week 4 + extras)

🎯 **PLANNED**:
- LLM → React component generation pipeline
- Role-based dashboard templates
- Configuration management automation
- Advanced self-healing capabilities
- **BONUS SCOPE**: Enterprise features due to time savings

**MVP Deliverables**:

- Working AI-native observability platform
- LLM-generated dashboards
- Single-command deployment
- Basic proactive issue detection
- Kubernetes deployment support

### Phase 2: Advanced Features (Days 31-60)

**Goal**: Enhanced AI capabilities and enterprise deployment

- AIOpsLab-inspired agent architecture
- Advanced personalization and learning
- OpenShift/Rancher support
- Advanced pattern recognition
- Enterprise-grade security and scaling

### Phase 3: Production Hardening (Days 61-90)

**Goal**: Production-ready enterprise platform

- Advanced self-healing capabilities
- Sophisticated analytics and forecasting
- Integration ecosystem
- Performance optimization
- Enterprise support features

## Related Notes

- [[design]] - Architecture and design decisions
- [[packages]] - Package specifications
- [[root]] - Project overview
