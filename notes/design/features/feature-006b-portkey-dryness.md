# Feature 006b: Portkey Configuration DRYness

## Overview
Simplify and consolidate the LLM configuration by making Portkey the single source of truth for model routing and configuration, removing all hardcoded model references and environment-based model configurations.

## Problem Statement

### 1. Configuration Duplication
- Model configurations exist in both `.env` files and `config/portkey/config.json`
- Environment variables define models: `LLM_GENERAL_MODEL_1`, `LLM_SQL_MODEL_1`, etc.
- Portkey config also defines models and routing
- This creates confusion about which configuration takes precedence

### 2. Hardcoded Model Detection
Found hardcoded model detection in multiple files:
- `src/llm-manager/response-extractor.ts`: Lines 43-94 contain hardcoded model name checks
- `src/llm-manager/portkey-gateway-client.ts`: Line 45 has default model hardcoded
- `src/server.ts` and `src/ui-generator/api-client.ts`: Hardcoded fallback to 'sqlcoder-7b-2'
- Test files contain hardcoded model references

### 3. Environment Variables to Remove
From `.env.default` and `.env.github`:
- `OPENAI_MODEL`, `OPENAI_MAX_TOKENS`, `OPENAI_TEMPERATURE`, `OPENAI_ENDPOINT`
- `CLAUDE_MODEL`, `CLAUDE_MAX_TOKENS`, `CLAUDE_TEMPERATURE`, `CLAUDE_ENDPOINT`
- `LLM_GENERAL_MODEL_1`, `LLM_GENERAL_MODEL_2`
- `LLM_SQL_MODEL_1`, `LLM_SQL_MODEL_2`, `LLM_SQL_MODEL_3`, `LLM_SQL_MODEL_4`
- `LLM_ENDPOINT`, `LM_STUDIO_ENDPOINT`

Keep only API keys:
- `OPENAI_API_KEY`
- `CLAUDE_API_KEY` / `ANTHROPIC_API_KEY`

## Implementation Plan

### Phase 1: Enhance Portkey Gateway Client

#### 1.1 Create Model Discovery API
```typescript
interface ModelInfo {
  id: string
  name: string
  provider: 'openai' | 'anthropic' | 'lm-studio' | 'ollama' | 'custom'
  capabilities: ('general' | 'sql' | 'code' | 'embedding')[]
  metadata: {
    contextLength: number
    maxTokens: number
    temperature: number
    responseFormat?: 'json' | 'markdown' | 'text'
    requiresWrapping?: boolean
  }
  status?: 'available' | 'loading' | 'unavailable'
  lastChecked?: Date
}

interface PortkeyGatewayManager {
  // Existing methods...

  // New discovery methods
  getModelInfo: (modelId: string) => Effect.Effect<ModelInfo, LLMError, never>
  getModelsByCapability: (capability: string) => Effect.Effect<ModelInfo[], LLMError, never>
  getModelsByProvider: (provider: string) => Effect.Effect<ModelInfo[], LLMError, never>
  getDefaultModelForTask: (taskType: 'general' | 'sql' | 'code') => Effect.Effect<string, LLMError, never>
  getAllModels: () => Effect.Effect<ModelInfo[], LLMError, never>
}
```

#### 1.2 Extend config.json Structure
```json
{
  "version": "1.0",
  "defaults": {
    "general": "claude-3-haiku-20240307",
    "sql": "codellama-7b-instruct",
    "code": "deepseek-coder-v2-lite-instruct",
    "embedding": "text-embedding-ada-002"
  },
  "providers": [
    {
      "id": "openai",
      "name": "OpenAI",
      "apiKey": "${OPENAI_API_KEY}",
      "baseURL": "https://api.openai.com/v1"
    },
    {
      "id": "anthropic",
      "name": "Anthropic",
      "apiKey": "${ANTHROPIC_API_KEY}",
      "baseURL": "https://api.anthropic.com"
    },
    {
      "id": "lm-studio",
      "name": "LM Studio (Local)",
      "apiKey": "no-key-needed",
      "baseURL": "http://host.docker.internal:1234/v1"
    }
  ],
  "routes": [
    {
      "name": "local-models",
      "models": [
        "codellama-7b-instruct",
        "sqlcoder-7b-2",
        "deepseek-coder-v2-lite-instruct",
        "qwen/qwen3-coder-30b"
      ],
      "provider": "lm-studio",
      "strategy": "single",
      "capabilities": ["sql", "code"],
      "metadata": {
        "contextLength": 8192,
        "maxTokens": 4096,
        "temperature": 0.7,
        "responseFormat": "markdown",
        "requiresWrapping": true
      }
    },
    {
      "name": "openai-models",
      "models": [
        "gpt-3.5-turbo",
        "gpt-4",
        "gpt-4-turbo"
      ],
      "provider": "openai",
      "strategy": "single",
      "capabilities": ["general", "code", "sql"],
      "metadata": {
        "contextLength": 16384,
        "maxTokens": 4096,
        "temperature": 0.7,
        "responseFormat": "json"
      }
    },
    {
      "name": "anthropic-models",
      "models": [
        "claude-3-haiku-20240307",
        "claude-3-sonnet-20240229",
        "claude-3-opus"
      ],
      "provider": "anthropic",
      "strategy": "single",
      "capabilities": ["general", "code", "sql"],
      "metadata": {
        "contextLength": 200000,
        "maxTokens": 4096,
        "temperature": 0.7,
        "responseFormat": "json"
      }
    }
  ]
}
```

### Phase 2: Remove Hardcoded Model Detection

#### 2.1 Update response-extractor.ts
Replace hardcoded model detection with capability-based approach:

```typescript
// OLD: Hardcoded model detection
if (modelName.toLowerCase().includes('deepseek')) {
  processed = removeThinkingTags(processed)
}

// NEW: Capability-based detection
const modelInfo = await getModelInfo(modelName)
if (modelInfo.metadata.responseFormat === 'markdown') {
  processed = extractFromMarkdownBlock(processed, 'sql')
}
if (modelInfo.capabilities.includes('sql') && modelInfo.metadata.requiresWrapping) {
  // Handle SQL-specific response processing
}
```

#### 2.2 Update portkey-gateway-client.ts
- Remove inline config reading (lines 84-108)
- Use centralized config management
- Remove hardcoded default model
- Load config once at initialization

#### 2.3 Update API endpoints
- Remove hardcoded fallbacks in server.ts and api-client.ts
- Get defaults from Portkey config using the new APIs

### Phase 3: Clean Environment Variables

#### 3.1 Update .env files
```bash
# Keep only these LLM-related variables
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
PORTKEY_API_KEY=portkey-virtual-key
PORTKEY_GATEWAY_URL=http://localhost:8787

# Local model endpoints (for Docker containers to access host services)
LM_STUDIO_ENDPOINT=http://host.docker.internal:1234/v1
OLLAMA_ENDPOINT=http://host.docker.internal:11434

# Remove all these
# OPENAI_MODEL=...
# OPENAI_MAX_TOKENS=...
# CLAUDE_MODEL=...
# LLM_GENERAL_MODEL_1=...
# LLM_SQL_MODEL_1=...
# etc.
```

#### 3.2 Update Docker Compose Configuration

##### Portkey Gateway Service
```yaml
portkey-gateway:
  image: portkeyai/gateway:latest
  container_name: otel-ai-portkey
  ports:
    - '8787:8787'
  environment:
    - OPENAI_API_KEY=${OPENAI_API_KEY}
    - ANTHROPIC_API_KEY=${CLAUDE_API_KEY}
    # ADD: Local model endpoints for Portkey to access
    - LM_STUDIO_ENDPOINT=http://host.docker.internal:1234/v1
    - OLLAMA_ENDPOINT=http://host.docker.internal:11434
    - PORT=8787
    - LOG_LEVEL=debug
    - CACHE_ENABLED=true
    - CACHE_TTL=3600
    - CONFIG_PATH=/config/config.json
  volumes:
    - ./config/portkey:/config:ro
```

##### Backend Service
```yaml
backend:
  environment:
    # Keep: Database and core config
    - CLICKHOUSE_HOST=clickhouse
    - CLICKHOUSE_PORT=8123
    - CLICKHOUSE_DATABASE=otel
    - CLICKHOUSE_USERNAME=otel
    - CLICKHOUSE_PASSWORD=otel123

    # Keep: API Keys only
    - OPENAI_API_KEY=${OPENAI_API_KEY}
    - CLAUDE_API_KEY=${CLAUDE_API_KEY}

    # Keep: Portkey configuration
    - PORTKEY_GATEWAY_URL=http://portkey-gateway:8787
    - USE_PORTKEY_GATEWAY=true  # Change default to true

    # ADD: Local model endpoints
    - LM_STUDIO_ENDPOINT=http://host.docker.internal:1234/v1
    - OLLAMA_ENDPOINT=http://host.docker.internal:11434

    # REMOVE: All model-specific configurations
    # - OPENAI_MODEL=${OPENAI_MODEL:-gpt-3.5-turbo}
    # - CLAUDE_MODEL=${CLAUDE_MODEL:-claude-3-haiku-20240307}
    # - OPENAI_ENDPOINT=${OPENAI_ENDPOINT:-https://api.openai.com/v1}
    # - CLAUDE_ENDPOINT=${CLAUDE_ENDPOINT:-https://api.anthropic.com}
    # - LLM_SQL_MODEL_1=${LLM_SQL_MODEL_1:-codellama-7b-instruct}
    # - LLM_GENERAL_MODEL_1=${LLM_GENERAL_MODEL_1:-claude-3-haiku-20240307}
    # - LLM_GENERAL_MODEL_2=${LLM_GENERAL_MODEL_2:-gpt-3.5-turbo}
    # - LLM_ENDPOINT=http://host.docker.internal:1234/v1
```

#### 3.3 Update Portkey Config for Local Models
Update `config/portkey/config.json` to use environment variables for local endpoints:

```json
{
  "providers": [
    {
      "id": "lm-studio",
      "name": "LM Studio (Local)",
      "apiKey": "no-key-needed",
      "baseURL": "${LM_STUDIO_ENDPOINT:-http://host.docker.internal:1234/v1}"
    },
    {
      "id": "ollama",
      "name": "Ollama (Local)",
      "apiKey": "no-key-needed",
      "baseURL": "${OLLAMA_ENDPOINT:-http://host.docker.internal:11434}"
    }
  ]
}
```

#### 3.4 Update CI configurations
- Update .github/workflows/*.yml files
- Remove obsolete environment variables from CI secrets

### Phase 4: Create Migration Utilities

#### 4.1 Config Migration Helper
Create a utility to help users migrate from env-based to config-based setup:

```typescript
// src/llm-manager/config-migration.ts
export const migrateEnvToConfig = () => {
  const oldConfig = {
    generalModels: [
      process.env.LLM_GENERAL_MODEL_1,
      process.env.LLM_GENERAL_MODEL_2
    ].filter(Boolean),
    sqlModels: [
      process.env.LLM_SQL_MODEL_1,
      process.env.LLM_SQL_MODEL_2,
      process.env.LLM_SQL_MODEL_3
    ].filter(Boolean)
  }

  if (oldConfig.generalModels.length || oldConfig.sqlModels.length) {
    console.warn('⚠️  Detected legacy environment variables for model configuration.')
    console.warn('   Please update your config/portkey/config.json with:')
    console.warn('   - Default general model:', oldConfig.generalModels[0])
    console.warn('   - Default SQL model:', oldConfig.sqlModels[0])
    console.warn('   Then remove these environment variables.')
  }
}
```


## Files to Modify

### Core Changes
1. **src/llm-manager/portkey-gateway-client.ts**
   - Add model discovery APIs
   - Remove hardcoded logic (lines 50-57, 84-108)
   - Centralize config loading
   - Support dynamic local model endpoint configuration

2. **src/llm-manager/response-extractor.ts**
   - Remove hardcoded model detection (lines 43-94)
   - Use capability-based detection

3. **config/portkey/config.json**
   - Add defaults section
   - Add capabilities and metadata to routes
   - Support environment variable interpolation for local endpoints
   - Add Ollama as a provider

4. **.env.default, .env.github, .env**
   - Remove all model configuration variables
   - Keep only API keys
   - Add LM_STUDIO_ENDPOINT and OLLAMA_ENDPOINT

### Secondary Changes
1. **src/server.ts** - Line 1565: Use Portkey for defaults
2. **src/ui-generator/api-client.ts** - Line 56: Use Portkey for defaults
3. **src/ui-generator/query-generator/llm-query-generator.ts** - Line 30: Use Portkey defaults
4. **docker-compose.yaml**
   - Remove LLM_SQL_MODEL_* and LLM_GENERAL_MODEL_* from backend service
   - Add LM_STUDIO_ENDPOINT and OLLAMA_ENDPOINT to both backend and portkey-gateway
   - Change USE_PORTKEY_GATEWAY default to true
   - Remove OPENAI_MODEL, CLAUDE_MODEL, OPENAI_ENDPOINT, CLAUDE_ENDPOINT
5. **.github/workflows/*.yml** - Update CI environment variables

### Test Updates
1. **src/ui-generator/test/integration/*.test.ts**
   - Update to use Portkey config
   - Remove env variable dependencies

2. **src/llm-manager/test/**.test.ts**
   - Create test fixtures with sample configs
   - Mock Portkey config instead of env variables

## Testing Strategy

### Unit Tests
- Test model discovery APIs
- Test capability-based detection
- Test config migration utilities

### Integration Tests
- Test with various Portkey configurations
- Test backward compatibility
- Test model routing with new config

### E2E Tests
- Verify UI still works with new config
- Test SQL generation with configured models
- Test general analysis with configured models

## Migration Plan

### Single-Phase Migration (Direct Cut-over)
1. **Update Portkey Configuration**
   - Extend config.json with defaults, capabilities, and metadata
   - Add support for environment variable interpolation
   - Add Ollama provider configuration

2. **Update All Code Simultaneously**
   - Add model discovery APIs to portkey-gateway-client
   - Remove all hardcoded model detection
   - Update all consumers to use new Portkey APIs
   - Update UI components to use Portkey for model selection

3. **Clean Environment and Docker**
   - Remove all model-specific environment variables
   - Update docker-compose.yaml configurations
   - Update CI/CD pipelines

4. **Testing and Validation**
   - Run full test suite with new configuration
   - Validate UI still functions correctly
   - Test with local models (LM Studio and Ollama)

## Benefits

1. **Single Source of Truth** - All model configuration in Portkey config
2. **Dynamic Discovery** - Models can be added/removed without code changes
3. **Cleaner Architecture** - No hardcoded model names in code
4. **Easier Testing** - Mock Portkey config instead of env variables
5. **Better Extensibility** - Easy to add new models and providers
6. **Reduced Configuration Errors** - No conflicting configurations
7. **Improved Maintainability** - Centralized configuration management

## Success Criteria

- [ ] All model configurations read from Portkey config only
- [ ] No hardcoded model names in source code
- [ ] Environment variables contain only API keys
- [ ] All tests pass with new configuration approach
- [ ] Backward compatibility maintained during transition
- [ ] Migration guide and utilities provided
- [ ] Documentation updated to reflect new approach
- [ ] Performance not degraded by config lookups

## Risks and Mitigations

### Risk: Breaking existing deployments
**Mitigation**: Implement backward compatibility layer with deprecation warnings

### Risk: Config file corruption or misconfiguration
**Mitigation**: Add config validation on startup with clear error messages

### Risk: Performance impact from config lookups
**Mitigation**: Cache config in memory, reload only on file change

### Risk: Confusion during migration period
**Mitigation**: Clear documentation, migration utilities, and helpful error messages