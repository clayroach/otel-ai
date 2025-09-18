# Feature 007 - Dual LLM Model Selection

## Overview
Enable users to select different LLM models for general analysis tasks vs SQL generation tasks.

## Model Options

### General Analysis Models (Fixed)
- **Claude** (via Anthropic API) - For trace analysis, anomaly detection, insights
- **GPT** (via OpenAI API) - Alternative for general analysis

### SQL Generation Models (Dynamic)
- **Dynamically discovered from multiple sources**:
  - ClickHouse AI functions (if available)
  - Local models from LMStudio (port 1234)
  - Local models from Ollama (port 11434)
  - Any SQL-capable models from Portkey
  - Custom endpoints configured by user
- **Auto-refresh** when new models become available
- **Filtered by capability** - only shows models that support SQL generation

## Implementation Components

### 1. UI Components
- Add two dropdowns to `AnalysisConfiguration` component with availability indicators
- `GeneralModelSelector.tsx` - Dropdown for Claude/GPT selection with status
- `SQLModelSelector.tsx` - Dropdown for SQL model selection with status
- Model status indicators:
  - 🟢 **Green** - Model available and responding
  - 🟡 **Yellow** - Model loading or slow response
  - 🔴 **Red** - Model unavailable or error

### 2. State Management
```typescript
interface ModelSelection {
  general: 'claude' | 'gpt'  // Fixed options
  sql: string                 // Dynamic - any discovered SQL-capable model
}

interface ModelInfo {
  id: string
  name: string
  provider: 'clickhouse' | 'lmstudio' | 'ollama' | 'portkey' | 'custom'
  endpoint?: string
  capabilities: string[]  // ['sql', 'code', 'general', etc.]
  status: 'available' | 'loading' | 'unavailable'
  latency?: number
  lastChecked: Date
}

interface ModelState {
  selection: ModelSelection
  generalModels: ModelInfo[]      // Fixed: Claude, GPT
  sqlModels: ModelInfo[]          // Dynamic: discovered SQL-capable models
  discoveryInProgress: boolean
}
```

### 3. LLM Manager Updates
- Route general analysis to selected general model
- Route SQL generation to selected SQL model
- Use existing Portkey integration for routing

### 4. Integration Points
- Extend LLMManagerService to support model selection routing
- Pass model selection from UI to analysis pipeline via Portkey
- Store selection in user preferences

## Technical Approach

1. **Extend Analysis Configuration**
   - Add model selection state
   - Create dropdown components
   - Wire up onChange handlers

2. **Update LLM Manager**
   ```typescript
   import { Effect, Layer, Context, Duration, pipe } from 'effect'
   import { ModelAvailability, ModelSelectionError } from './types'

   // Dynamic SQL model discovery using Effect
   const discoverSQLModels = () =>
     Effect.gen(function* () {
       const discoveries = yield* Effect.all([
         // Check ClickHouse AI availability
         discoverClickHouseAI(),
         // Check LMStudio models
         discoverLMStudioModels(),
         // Check Ollama models
         discoverOllamaModels(),
         // Check Portkey SQL-capable models
         discoverPortkeySQLModels(),
         // Check custom configured endpoints
         discoverCustomEndpoints()
       ], { concurrency: "unbounded" })

       // Flatten and filter for SQL capability
       const allModels = discoveries.flat()
       return allModels.filter(m =>
         m.capabilities.includes('sql') ||
         m.capabilities.includes('code')
       )
     })

   const discoverLMStudioModels = () =>
     Effect.gen(function* () {
       const httpClient = yield* HttpClient

       const models = yield* httpClient.get('http://localhost:1234/v1/models').pipe(
         Effect.map(response => response.json),
         Effect.map(data =>
           data.models.map(m => ({
             id: `lmstudio-${m.id}`,
             name: `LMStudio: ${m.id}`,
             provider: 'lmstudio' as const,
             endpoint: 'http://localhost:1234/v1',
             capabilities: ['sql', 'code', 'general'],
             status: 'available' as const,
             lastChecked: new Date()
           }))
         ),
         Effect.catchAll(() => Effect.succeed([]))
       )

       return models
     })

   const checkModelHealth = (model: string) =>
     Effect.gen(function* () {
       const startTime = Date.now()

       // Simple health check query with timeout
       const result = yield* pipe(
         queryModel(model, 'test'),
         Effect.timeout(Duration.seconds(3)),
         Effect.map(() => ({
           model,
           status: 'available' as const,
           latency: Date.now() - startTime,
           lastChecked: new Date()
         })),
         Effect.catchAll(() =>
           Effect.succeed({
             model,
             status: 'unavailable' as const,
             latency: Date.now() - startTime,
             lastChecked: new Date()
           })
         )
       )

       return result
     })

   const generateResponse = (prompt: string) =>
     Effect.gen(function* () {
       const modelSelection = yield* ModelSelectionRef.get
       const model = modelSelection.general

       // Check availability before routing
       const availability = yield* checkModelHealth(model)

       if (availability.status !== 'available') {
         return yield* Effect.fail(new ModelSelectionError({
           message: `Model ${model} is unavailable`,
           model,
           provider: 'unknown',
           cause: 'unavailable'
         }))
       }

       return yield* (
         model === 'claude'
           ? callClaude(prompt)
           : callGPT(prompt)
       )
     })

   const generateSQL = (description: string) =>
     Effect.gen(function* () {
       const modelSelection = yield* ModelSelectionRef.get
       const model = modelSelection.sql

       if (model.startsWith('clickhouse-')) {
         return yield* (
           model === 'clickhouse-gpt'
             ? callClickHouseGPT(description)
             : callClickHouseClaude(description)
         )
       } else {
         // Local model selected from dynamic list
         return yield* callLocalLLM(model, description)
       }
     })
   ```

3. **Persist Selection**
   - Save to localStorage or user preferences
   - Load on app initialization
   - Default to Claude/ClickHouse-GPT

## Files to Modify

1. `src/ui/components/analysis-configuration/AnalysisConfiguration.tsx` - Add selectors
2. `src/llm-manager/llm-manager-service.ts` - Extend with model routing and health checks
3. `src/ui/components/analysis-configuration/types.ts` - Add model types
4. Create new files:
   - `src/ui/components/analysis-configuration/GeneralModelSelector.tsx`
   - `src/ui/components/analysis-configuration/SQLModelSelector.tsx`
   - `src/ui/components/analysis-configuration/ModelStatusIndicator.tsx`
   - `src/ui/hooks/useModelHealth.ts` - Hook for periodic health checks

## Health Check Implementation

### Periodic Health Checks
```typescript
// useModelHealth.ts - React hook for health monitoring with Effect
import { Effect, Runtime, Schedule, Duration } from 'effect'
import { LLMManagerService } from '../services/llm-manager'

function useModelHealth(models: string[], interval = 30000) {
  const [health, setHealth] = useState<Map<string, ModelAvailability>>()
  const runtime = useRuntime() // Custom hook to get Effect runtime

  useEffect(() => {
    // Create Effect program for health checks
    const healthCheckProgram = Effect.gen(function* () {
      const llmManager = yield* LLMManagerService

      // Check all models in parallel using Effect.all
      const results = yield* Effect.all(
        models.map(model =>
          llmManager.checkModelHealth(model).pipe(
            Effect.map(h => [model, h] as const),
            Effect.catchAll(() =>
              Effect.succeed([model, {
                model,
                status: 'unavailable' as const,
                lastChecked: new Date()
              }] as const)
            )
          )
        ),
        { concurrency: "unbounded" }
      )

      return new Map(results)
    })

    // Run health check with schedule
    const scheduled = healthCheckProgram.pipe(
      Effect.tap(result => Effect.sync(() => setHealth(result))),
      Effect.repeat(Schedule.fixed(Duration.millis(interval))),
      Effect.fork
    )

    // Execute and store fiber for cleanup
    const fiber = Runtime.runFork(runtime)(scheduled)

    return () => {
      Runtime.runFork(runtime)(fiber.interrupt)
    }
  }, [models, interval, runtime])

  return health
}

// UI Component usage
function ModelSelector({ type }: { type: 'general' | 'sql' }) {
  const { generalModels, sqlModels, health, refreshSQLModels } = useModels()
  const models = type === 'general' ? generalModels : sqlModels

  useEffect(() => {
    if (type === 'sql') {
      // Refresh SQL models periodically to catch newly started local models
      const interval = setInterval(refreshSQLModels, 30000)
      return () => clearInterval(interval)
    }
  }, [type])

  return (
    <div>
      <Select>
        {models.map(model => (
          <Option key={model.id} value={model.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ModelStatusIndicator status={health?.get(model.id)?.status} />
              <span>{model.name}</span>
              <Badge>{model.provider}</Badge>
            </div>
          </Option>
        ))}
      </Select>
      {type === 'sql' && (
        <Button onClick={refreshSQLModels} size="small">
          Refresh Models
        </Button>
      )}
    </div>
  )
}
```

### Status Thresholds
- **Green (Available)**: Response time < 1000ms
- **Yellow (Loading)**: Response time 1000-3000ms or first check pending
- **Red (Unavailable)**: Response time > 3000ms, timeout, or error

## Environment Variables

```bash
# Existing
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...

# Add for ClickHouse AI
CLICKHOUSE_AI_ENABLED=true

# For local LLM (LMStudio/Ollama)
PORTKEY_LOCAL_LLM_ENDPOINT=http://localhost:11434
LMSTUDIO_API_ENDPOINT=http://localhost:1234/v1
OLLAMA_API_ENDPOINT=http://localhost:11434

# Health check configuration
MODEL_HEALTH_CHECK_INTERVAL=30000  # 30 seconds
MODEL_HEALTH_CHECK_TIMEOUT=3000    # 3 seconds
```

## Testing

- Test model selection persistence
- Test routing to correct models
- Test fallback if model unavailable
- Test UI updates reflect in analysis results

## Success Criteria

- [x] Two separate model selectors in UI
- [x] Analysis uses selected general model
- [x] SQL generation uses selected SQL model
- [x] Selection persists across sessions
- [x] All existing functionality continues working