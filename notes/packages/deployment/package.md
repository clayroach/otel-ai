---
id: packages.deployment
title: Deployment Package
desc: 'Bazel build system and single-command deployment with OTel demo'
updated: 2025-08-13
created: 2025-08-13
---

# Deployment Package

## Package Overview
<!-- COPILOT_CONTEXT: This note describes the deployment package -->

### Purpose
Provides single-command deployment capabilities using Bazel build system. Integrates the OpenTelemetry demo application as a standard component and orchestrates the entire AI-native observability platform across Docker, Kubernetes, OpenShift, and Rancher environments.

### Architecture
- **Bazel Build System**: Reproducible builds with dependency management
- **OTel Demo Integration**: Standard OpenTelemetry demo application included
- **Multi-Environment Support**: Docker, K8s, OpenShift, Rancher k3d/RKE2
- **Infrastructure as Code**: Declarative deployment configurations
- **Health Monitoring**: Built-in health checks and readiness probes

## API Surface
<!-- COPILOT_GENERATE: Based on this description, generate TypeScript interfaces -->

### Public Interfaces
```typescript
interface DeploymentConfig {
  environment: 'docker' | 'kubernetes' | 'openshift' | 'rancher';
  platform: {
    clickhouse: ClickhouseConfig;
    s3: S3Config;
    otelCollector: OtelCollectorConfig;
    aiPlatform: AIPlatformConfig;
  };
  resources: {
    cpu: string;
    memory: string;
    storage: string;
  };
  scaling: {
    replicas: number;
    autoscaling: boolean;
    maxReplicas?: number;
  };
}

interface OtelCollectorConfig {
  version: string;
  exporters: string[];
  processors: string[];
  receivers: string[];
  customConfig?: any;
}

interface AIPlatformConfig {
  models: {
    enabled: string[]; // ['gpt', 'claude', 'llama']
    apiKeys?: Record<string, string>;
    localModels?: LocalModelConfig[];
  };
  features: {
    realtimeAnalysis: boolean;
    batchProcessing: boolean;
    uiGeneration: boolean;
    selfHealing: boolean;
  };
}

interface DeploymentResult {
  success: boolean;
  services: ServiceStatus[];
  urls: {
    ui: string;
    api: string;
    metrics: string;
    traces: string;
  };
  healthChecks: HealthCheck[];
}
```

### Public Classes
```typescript
class DeploymentOrchestrator {
  constructor(config: DeploymentConfig);
  
  // Main deployment commands
  async deploy(): Promise<DeploymentResult>;
  async undeploy(): Promise<void>;
  async upgrade(version: string): Promise<DeploymentResult>;
  async rollback(): Promise<DeploymentResult>;
  
  // Health and monitoring
  async getStatus(): Promise<ServiceStatus[]>;
  async getHealthChecks(): Promise<HealthCheck[]>;
  async getLogs(service: string): Promise<string[]>;
}

class BazelBuilder {
  // Build management
  async buildAll(): Promise<void>;
  async buildPackage(packageName: string): Promise<void>;
  async runTests(): Promise<TestResults>;
  async createContainers(): Promise<void>;
  
  // Dependency management
  async updateDependencies(): Promise<void>;
  async checkDependencies(): Promise<DependencyStatus[]>;
}

class EnvironmentManager {
  constructor(environment: string);
  
  async setupEnvironment(): Promise<void>;
  async validateEnvironment(): Promise<ValidationResult>;
  async generateManifests(): Promise<string[]>;
  async applyManifests(): Promise<void>;
}
```

## Implementation Notes
<!-- COPILOT_SYNC: Analyze code in src/deployment and update this section -->

### Core Components
- **DeploymentOrchestrator**: Main deployment controller with environment detection
- **BazelBuilder**: Bazel integration for reproducible builds and dependency management
- **EnvironmentManager**: Environment-specific deployment logic (Docker/K8s/OpenShift/Rancher)
- **OtelDemoIntegrator**: Integration layer for OpenTelemetry demo application
- **HealthMonitor**: Comprehensive health checking and readiness validation

### Dependencies
- Internal dependencies: All packages (builds complete platform)
- External dependencies:
  - `@bazel/buildtools` - Bazel integration
  - `kubernetes-client` - K8s API client
  - `dockerode` - Docker API client
  - `yaml` - YAML manifest generation
  - `commander` - CLI interface

## Code Generation Prompts

### Generate Base Implementation
Use this in Copilot Chat:
```
@workspace Based on the package overview in notes/packages/deployment/package.md, generate the initial implementation for:
- DeploymentOrchestrator in src/deployment/orchestrator.ts with multi-environment support
- BazelBuilder in src/deployment/bazel.ts with build and test automation
- Environment managers in src/deployment/environments/ for Docker, K8s, OpenShift, Rancher
- OTel demo integration in src/deployment/otel-demo.ts
- CLI interface in src/deployment/cli.ts with single-command deployment
- Deployment manifests in deployments/ for each environment
- Comprehensive testing with deployment validation
```

### Update from Code
Use this in Copilot Chat:
```
@workspace Analyze the code in src/deployment and update notes/packages/deployment/package.md with:
- Current deployment capabilities and supported environments
- Bazel build configuration and dependency management
- OTel demo integration details and configurations
- Health checking and monitoring capabilities
- Recent deployment optimizations and improvements
```

## Bazel Configuration

### WORKSPACE File
```python
workspace(name = "otel_ai_platform")

# Rules for TypeScript/Node.js
load("@bazel_tools//tools/build_defs/repo:http.bzl", "http_archive")

http_archive(
    name = "build_bazel_rules_nodejs",
    sha256 = "...",
    urls = ["https://github.com/bazelbuild/rules_nodejs/releases/..."],
)

# OpenTelemetry dependencies
http_archive(
    name = "opentelemetry_demo",
    sha256 = "...",
    urls = ["https://github.com/open-telemetry/opentelemetry-demo/archive/..."],
)

# Container rules for Docker builds
http_archive(
    name = "io_bazel_rules_docker",
    sha256 = "...",
    urls = ["https://github.com/bazelbuild/rules_docker/releases/..."],
)
```

### BUILD.bazel for Main Package
```python
load("@build_bazel_rules_nodejs//:index.bzl", "nodejs_binary", "npm_package_bin")
load("@io_bazel_rules_docker//container:container.bzl", "container_image")

# Build the main application
nodejs_binary(
    name = "otel_ai_platform",
    data = [
        "//src/storage:storage_lib",
        "//src/ai-analyzer:analyzer_lib", 
        "//src/llm-manager:llm_lib",
        "//src/ui-generator:ui_lib",
        "@npm//package.json",
    ],
    entry_point = "src/main.ts",
)

# Container image with all components
container_image(
    name = "platform_image",
    base = "@nodejs_image//image",
    cmd = ["./otel_ai_platform"],
    files = [":otel_ai_platform"],
    ports = ["3000", "8080", "4317", "4318"],
)

# Integration with OTel demo
genrule(
    name = "otel_demo_integration",
    srcs = ["@opentelemetry_demo//:all"],
    outs = ["otel-demo-integrated.yaml"],
    cmd = "$(location //tools:integrate_demo) $< $@",
    tools = ["//tools:integrate_demo"],
)
```

## Single-Command Deployment

### CLI Interface
```bash
# Deploy everything with defaults
./deploy.sh

# Deploy to specific environment
./deploy.sh --env kubernetes --namespace otel-ai

# Deploy with custom configuration
./deploy.sh --config config/production.yaml

# Deploy with specific AI models
./deploy.sh --models gpt,claude --local-llama

# Deploy minimal version (no AI features)
./deploy.sh --minimal
```

### Deployment Script
```bash
#!/bin/bash
# Single-command deployment script

set -e

ENVIRONMENT=${1:-docker}
CONFIG_FILE=${2:-config/default.yaml}

echo "🚀 Deploying OTel AI Platform to $ENVIRONMENT"

# Step 1: Build with Bazel
echo "📦 Building platform with Bazel..."
bazel build //...

# Step 2: Run tests
echo "🧪 Running tests..."
bazel test //...

# Step 3: Create containers
echo "🐳 Creating container images..."
bazel run //:platform_image

# Step 4: Deploy to environment
echo "🎯 Deploying to $ENVIRONMENT..."
case $ENVIRONMENT in
  docker)
    docker-compose -f deployments/docker/docker-compose.yml up -d
    ;;
  kubernetes)
    kubectl apply -f deployments/k8s/
    ;;
  openshift)
    oc apply -f deployments/openshift/
    ;;
  rancher)
    kubectl apply -f deployments/rancher/
    ;;
esac

# Step 5: Wait for readiness
echo "⏳ Waiting for services to be ready..."
./scripts/wait-for-ready.sh

# Step 6: Display access information
echo "✅ Deployment complete!"
echo "🌐 UI: http://localhost:3000"
echo "📊 Metrics: http://localhost:8080/metrics"
echo "🔍 Traces: http://localhost:16686"

```

## Environment-Specific Configurations

### Docker Compose
```yaml
version: '3.8'
services:
  # Clickhouse for storage
  clickhouse:
    image: clickhouse/clickhouse-server:latest
    ports:
      - "8123:8123"
      - "9000:9000"
    volumes:
      - ./deployments/docker/clickhouse-config.xml:/etc/clickhouse-server/config.xml
      - clickhouse_data:/var/lib/clickhouse

  # MinIO for S3-compatible storage
  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - minio_data:/data

  # OpenTelemetry Collector
  otel-collector:
    image: otel/opentelemetry-collector-contrib:latest
    command: ["--config=/etc/otel-collector-config.yaml"]
    volumes:
      - ./deployments/docker/otel-collector-config.yaml:/etc/otel-collector-config.yaml
    ports:
      - "4317:4317"   # OTLP gRPC
      - "4318:4318"   # OTLP HTTP
    depends_on:
      - clickhouse

  # AI Platform (our main application)
  ai-platform:
    image: otel-ai-platform:latest
    ports:
      - "3000:3000"
      - "8080:8080"
    environment:
      CLICKHOUSE_HOST: clickhouse
      S3_ENDPOINT: http://minio:9000
      OTEL_COLLECTOR_ENDPOINT: http://otel-collector:4318
    depends_on:
      - clickhouse
      - minio
      - otel-collector

  # OTel Demo Application
  otel-demo:
    extends:
      file: ./otel-demo/docker-compose.yml
      service: all
    depends_on:
      - otel-collector

volumes:
  clickhouse_data:
  minio_data:
```

## Testing Strategy
<!-- Test coverage and testing approach -->

### Unit Tests
- Coverage target: 80%
- Key test scenarios:
  - Deployment orchestration logic
  - Environment-specific manifest generation
  - Health check validation
  - Bazel build integration
  - Configuration validation

### Integration Tests
- Full deployment testing in isolated environments
- OTel demo integration validation
- Cross-environment compatibility testing
- Performance benchmarks:
  - <5 minutes for complete deployment
  - <30 seconds for health check validation
  - <2 minutes for environment teardown

### End-to-End Tests
- Complete deployment lifecycle testing
- Multi-environment deployment validation
- Upgrade and rollback procedures
- Disaster recovery testing

## Change Log
<!-- Auto-updated by Copilot when code changes -->

### 2025-08-13
- Initial package creation
- Defined Bazel build system integration
- Specified single-command deployment across multiple environments
- Added OpenTelemetry demo application integration