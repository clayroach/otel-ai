# Default Model Configuration

## Overview

The LLM Manager supports flexible default model configuration using both custom task-specific defaults and native Portkey configuration features.

## Configuration Structure

The configuration in `config/portkey/config.json` combines:

1. **Custom `defaults` section** - Task-specific model defaults
2. **Native Portkey `override_params`** - Default request parameters including model
3. **Native Portkey `strategy`** - Fallback and load balancing configuration

## Default Model Resolution Order

When determining which model to use, the system follows this precedence:

1. **Explicit request preference** - `request.preferences?.model`
2. **Task-specific default** - `config.defaults[taskType]` (general, sql, code)
3. **Portkey override default** - `config.override_params.model`
4. **Capability-based selection** - First model with matching capability
5. **Ultimate fallback** - `'gpt-3.5-turbo'`

## Configuration Example

```json
{
  "version": "1.0",
  "defaults": {
    "general": "claude-3-haiku-20240307",
    "sql": "codellama-7b-instruct",
    "code": "deepseek-coder-v2-lite-instruct"
  },
  "override_params": {
    "model": "claude-3-haiku-20240307",
    "temperature": 0.7,
    "max_tokens": 2048
  },
  "strategy": {
    "mode": "fallback",
    "on_status_codes": [429, 500, 503],
    "targets": [
      {
        "provider": "anthropic",
        "override_params": {
          "model": "claude-3-haiku-20240307"
        }
      },
      {
        "provider": "openai",
        "override_params": {
          "model": "gpt-3.5-turbo"
        }
      }
    ]
  }
}
```

## Usage Examples

### General Task (Default)
```typescript
// No model specified, uses config.defaults.general
const response = await llmManager.generate({
  prompt: "Analyze this data",
  taskType: "general"
})
// Uses: claude-3-haiku-20240307
```

### SQL Generation
```typescript
// Task-specific default for SQL
const response = await llmManager.generate({
  prompt: "Generate SQL query",
  taskType: "sql"
})
// Uses: codellama-7b-instruct
```

### Explicit Model Selection
```typescript
// Explicit model overrides all defaults
const response = await llmManager.generate({
  prompt: "Generate code",
  preferences: { model: "gpt-4" }
})
// Uses: gpt-4
```

## Fallback Strategy

The native Portkey `strategy` section enables automatic fallback:

- Primary attempts use the default model
- On failure (429, 500, 503 status codes), falls back to configured targets
- Targets are tried in order until one succeeds

## Benefits

1. **Flexibility** - Different defaults for different task types
2. **Compatibility** - Works with native Portkey features
3. **Resilience** - Automatic fallback on failures
4. **Simplicity** - Clear precedence order
5. **Extensibility** - Easy to add new task types

## API Integration

The `getDefaultModel` API method exposes default selection:

```typescript
// Get default model for a specific task type
const sqlModel = await llmManager.getDefaultModel('sql')
// Returns: "codellama-7b-instruct"

// Get general default
const defaultModel = await llmManager.getDefaultModel()
// Returns: "claude-3-haiku-20240307"
```

## Environment Variable Support

All configuration values support environment variable substitution:

```json
{
  "providers": [
    {
      "id": "openai",
      "apiKey": "${OPENAI_API_KEY}",
      "baseURL": "${OPENAI_BASE_URL:-https://api.openai.com/v1}"
    }
  ]
}
```

## Best Practices

1. **Set task-specific defaults** in the `defaults` section for clarity
2. **Use `override_params.model`** as a general fallback
3. **Configure strategy targets** for production resilience
4. **Test fallback chains** to ensure smooth degradation
5. **Monitor model usage** to optimize defaults over time