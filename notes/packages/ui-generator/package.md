---
id: packages.ui-generator
title: UI Generator Package
desc: 'LLM-powered React component generation with Apache ECharts integration'
updated: 2025-08-13
created: 2025-08-13
---

# UI Generator Package

## Package Overview

<!-- COPILOT_CONTEXT: This note describes the ui-generator package -->

### Purpose

Generates dynamic React components and Apache ECharts visualizations using LLMs based on telemetry data patterns, user interactions, and role-based preferences. This is the key differentiator that replaces traditional dashboarding tools like Grafana with AI-native, personalized user interfaces.

### Architecture

- **LLM-Driven Generation**: Use GPT/Claude/Llama to generate React components from specifications
- **Component Templates**: Base templates for common visualization patterns
- **Real-Time Adaptation**: Components that adapt based on user interaction patterns
- **Role-Based UIs**: Tailored interfaces for DevOps, SRE, Developer roles
- **Apache ECharts Integration**: Advanced charting capabilities with full customization

## API Surface

<!-- COPILOT_GENERATE: Based on this description, generate TypeScript interfaces -->

### Public Interfaces

```typescript
import { Effect, Context, Layer, Stream } from 'effect'
import { Schema } from '@effect/schema'

// Effect-TS Schema definitions for UI generation
const ComponentRequestSchema = Schema.Struct({
  type: Schema.Literal('dashboard', 'chart', 'table', 'card', 'alert'),
  data: Schema.Struct({
    source: Schema.String, // Query or data source identifier
    timeRange: Schema.optional(TimeRangeSchema),
    filters: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
    aggregation: Schema.optional(Schema.String)
  }),
  user: Schema.Struct({
    id: Schema.String,
    role: Schema.Literal('devops', 'sre', 'developer', 'admin'),
    preferences: Schema.optional(UserPreferencesSchema),
    recentInteractions: Schema.optional(Schema.Array(InteractionSchema))
  }),
  context: Schema.optional(
    Schema.Struct({
      existingComponents: Schema.optional(Schema.Array(Schema.String)),
      pageLayout: Schema.optional(Schema.String),
      theme: Schema.optional(Schema.Literal('light', 'dark', 'auto'))
    })
  ),
  requirements: Schema.optional(
    Schema.Struct({
      responsive: Schema.optional(Schema.Boolean),
      accessibility: Schema.optional(Schema.Boolean),
      realtime: Schema.optional(Schema.Boolean),
      interactive: Schema.optional(Schema.Boolean)
    })
  )
})

const GeneratedComponentSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  code: Schema.Struct({
    tsx: Schema.String, // React TSX component code
    css: Schema.optional(Schema.String), // Optional CSS styles
    types: Schema.optional(Schema.String) // TypeScript type definitions
  }),
  props: Schema.Record(Schema.String, PropDefinitionSchema),
  dependencies: Schema.Array(Schema.String),
  metadata: Schema.Struct({
    generated: Schema.Number, // timestamp
    model: Schema.String, // which LLM generated it
    version: Schema.String,
    description: Schema.String,
    tags: Schema.Array(Schema.String)
  }),
  chart: Schema.optional(EChartsConfigSchema),
  validation: ComponentValidationSchema
})

const UserPreferencesSchema = Schema.Struct({
  colorScheme: Schema.optional(Schema.String),
  chartTypes: Schema.optional(Schema.Array(Schema.String)),
  density: Schema.optional(Schema.Literal('compact', 'comfortable', 'spacious')),
  animations: Schema.optional(Schema.Boolean),
  autoRefresh: Schema.optional(Schema.Boolean)
})

const EChartsConfigSchema = Schema.Struct({
  type: Schema.Literal('line', 'bar', 'pie', 'scatter', 'heatmap', 'graph', 'tree'),
  options: Schema.Record(Schema.String, Schema.Unknown),
  responsive: Schema.Boolean,
  interactions: Schema.optional(Schema.Array(InteractionConfigSchema))
})

const ComponentValidationSchema = Schema.Struct({
  syntaxValid: Schema.Boolean,
  compilable: Schema.Boolean,
  performance: Schema.optional(
    Schema.Struct({
      renderTime: Schema.Number,
      memoryUsage: Schema.Number,
      bundleSize: Schema.Number
    })
  ),
  accessibility: Schema.optional(AccessibilityScoreSchema),
  errors: Schema.Array(Schema.String),
  warnings: Schema.Array(Schema.String)
})

type ComponentRequest = Schema.Schema.Type<typeof ComponentRequestSchema>
type GeneratedComponent = Schema.Schema.Type<typeof GeneratedComponentSchema>
type UserPreferences = Schema.Schema.Type<typeof UserPreferencesSchema>
type EChartsConfig = Schema.Schema.Type<typeof EChartsConfigSchema>

// UI Generation Error ADT
type UIGenerationError =
  | { _tag: 'GenerationFailed'; message: string; prompt: string }
  | { _tag: 'ValidationFailed'; errors: string[]; component: string }
  | { _tag: 'CompilationFailed'; message: string; code: string }
  | { _tag: 'DataSourceError'; message: string; source: string }
  | { _tag: 'TemplateError'; message: string; template: string }
```

### Effect-TS Service Definitions

```typescript
// Service tags for dependency injection
class UIGeneratorService extends Context.Tag('UIGeneratorService')<
  UIGeneratorService,
  {
    // Core generation
    generateComponent: (
      request: ComponentRequest
    ) => Effect.Effect<GeneratedComponent, UIGenerationError, never>
    generateFromTemplate: (
      template: string,
      data: unknown
    ) => Effect.Effect<GeneratedComponent, UIGenerationError, never>

    // User adaptation
    personalizeComponent: (
      component: GeneratedComponent,
      userId: string
    ) => Effect.Effect<GeneratedComponent, UIGenerationError, never>
    learnFromInteraction: (
      userId: string,
      interaction: UserInteraction
    ) => Effect.Effect<void, UIGenerationError, never>

    // Component management
    validateComponent: (
      code: string
    ) => Effect.Effect<ComponentValidationSchema, UIGenerationError, never>
    optimizeComponent: (
      component: GeneratedComponent
    ) => Effect.Effect<GeneratedComponent, UIGenerationError, never>
    versionComponent: (
      component: GeneratedComponent
    ) => Effect.Effect<string, UIGenerationError, never>
  }
>() {}

class ComponentTemplateService extends Context.Tag('ComponentTemplateService')<
  ComponentTemplateService,
  {
    getTemplate: (
      type: string,
      role: string
    ) => Effect.Effect<ComponentTemplate, UIGenerationError, never>
    createTemplate: (
      component: GeneratedComponent
    ) => Effect.Effect<ComponentTemplate, UIGenerationError, never>
    updateTemplate: (
      id: string,
      usage: TemplateUsage
    ) => Effect.Effect<void, UIGenerationError, never>
  }
>() {}

// Main UI Generator implementation
const makeUIGenerator = (config: UIGeneratorConfig) =>
  Effect.gen(function* (_) {
    const llm = yield* _(LLMManagerService)
    const templates = yield* _(ComponentTemplateService)
    const storage = yield* _(ClickhouseStorageService)

    return {
      generateComponent: (request: ComponentRequest) =>
        Effect.gen(function* (_) {
          // Validate request
          const validatedRequest = yield* _(Schema.decodeUnknown(ComponentRequestSchema)(request))

          // Get user's data and preferences
          const userData = yield* _(getUserData(validatedRequest.user.id))
          const recentPatterns = yield* _(analyzeUserPatterns(userData))

          // Select appropriate template
          const template = yield* _(
            templates.getTemplate(validatedRequest.type, validatedRequest.user.role)
          )

          // Fetch actual data for the component
          const componentData = yield* _(
            storage.queryForUI(validatedRequest.data).pipe(
              Effect.timeout('30 seconds'),
              Effect.catchAll((error) =>
                Effect.fail({
                  _tag: 'DataSourceError' as const,
                  message: error.message,
                  source: validatedRequest.data.source
                })
              )
            )
          )

          // Generate LLM prompt based on template, data, and user preferences
          const prompt = yield* _(
            buildGenerationPrompt({
              template,
              data: componentData,
              userPreferences: validatedRequest.user.preferences,
              recentPatterns,
              requirements: validatedRequest.requirements
            })
          )

          // Generate component using LLM
          const llmResponse = yield* _(
            llm
              .generate({
                prompt,
                taskType: 'ui-generation',
                preferences: { model: 'gpt' } // GPT best for code generation
              })
              .pipe(
                Effect.retry(
                  Schedule.exponential('2 seconds').pipe(Schedule.compose(Schedule.recurs(2)))
                ),
                Effect.timeout('60 seconds'),
                Effect.catchAll((error) =>
                  Effect.fail({ _tag: 'GenerationFailed' as const, message: error.message, prompt })
                )
              )
          )

          // Parse and validate generated component
          const parsedComponent = yield* _(parseGeneratedComponent(llmResponse.content))
          const validation = yield* _(validateComponent(parsedComponent.code.tsx))

          if (!validation.syntaxValid || !validation.compilable) {
            // Attempt to fix common issues
            const fixedComponent = yield* _(attemptAutoFix(parsedComponent, validation.errors))
            const revalidation = yield* _(validateComponent(fixedComponent.code.tsx))

            if (!revalidation.syntaxValid) {
              return Effect.fail({
                _tag: 'ValidationFailed' as const,
                errors: revalidation.errors,
                component: fixedComponent.code.tsx
              })
            }

            return { ...fixedComponent, validation: revalidation }
          }

          // Optimize for performance if needed
          const optimizedComponent = yield* _(
            validation.performance && validation.performance.renderTime > 100
              ? optimizeComponent(parsedComponent)
              : Effect.succeed(parsedComponent)
          )

          return { ...optimizedComponent, validation }
        }),

      personalizeComponent: (component: GeneratedComponent, userId: string) =>
        Effect.gen(function* (_) {
          // Get user's interaction history
          const userHistory = yield* _(getUserInteractionHistory(userId))
          const preferences = yield* _(inferUserPreferences(userHistory))

          // Generate personalization prompt
          const personalizationPrompt = buildPersonalizationPrompt(
            component,
            preferences,
            userHistory
          )

          // Use LLM to personalize the component
          const personalizedResponse = yield* _(
            llm.generate({
              prompt: personalizationPrompt,
              taskType: 'ui-generation',
              context: { originalComponent: component.id, userId }
            })
          )

          const personalizedComponent = yield* _(
            parseGeneratedComponent(personalizedResponse.content)
          )
          const validation = yield* _(validateComponent(personalizedComponent.code.tsx))

          if (!validation.syntaxValid) {
            // Fallback to original component if personalization fails
            yield* _(
              Effect.logWarning(
                `Personalization failed for user ${userId}, using original component`
              )
            )
            return component
          }

          return { ...personalizedComponent, validation }
        }),

      learnFromInteraction: (userId: string, interaction: UserInteraction) =>
        Effect.gen(function* (_) {
          // Store interaction for future personalization
          yield* _(storeUserInteraction(userId, interaction))

          // Update user preferences based on interaction
          yield* _(updateUserPreferences(userId, interaction))

          // If interaction indicates dissatisfaction, trigger component regeneration
          if (
            interaction.type === 'negative_feedback' ||
            interaction.type === 'component_dismissed'
          ) {
            yield* _(
              Effect.logInfo(
                `Negative interaction detected for user ${userId}, marking for regeneration`
              ).pipe(Effect.zipRight(markForRegeneration(interaction.componentId, userId)))
            )
          }
        })
    }
  })

// ECharts integration helpers
const generateEChartsConfig = (data: unknown[], chartType: string, preferences: UserPreferences) =>
  Effect.gen(function* (_) {
    const baseConfig = getBaseChartConfig(chartType)
    const styledConfig = applyUserStyling(baseConfig, preferences)
    const dataConfig = bindDataToChart(styledConfig, data)

    return {
      type: chartType as any,
      options: dataConfig,
      responsive: true,
      interactions: generateInteractionConfig(chartType)
    }
  })

// Component streaming for real-time updates
const createRealtimeComponent = (
  componentId: string,
  dataStream: Stream.Stream<unknown, never, never>
) =>
  Stream.unwrap(
    Effect.gen(function* (_) {
      const component = yield* _(getComponentById(componentId))

      return dataStream.pipe(
        // Throttle updates to avoid overwhelming the UI
        Stream.throttle(Duration.seconds(1)),

        // Transform data for the component
        Stream.mapEffect((data) => transformDataForComponent(component, data)),

        // Generate updated component props
        Stream.map((transformedData) => ({
          componentId,
          props: { data: transformedData },
          timestamp: Date.now()
        }))
      )
    })
  )

// Layers for dependency injection
const UIGeneratorLayer = Layer.effect(
  UIGeneratorService,
  Effect.gen(function* (_) {
    const config = yield* _(Effect.service(ConfigService))
    return makeUIGenerator(config.uiGenerator)
  })
)

const ComponentTemplateLayer = Layer.effect(
  ComponentTemplateService,
  Effect.gen(function* (_) {
    return makeComponentTemplateService()
  })
)
```

## Implementation Notes

<!-- COPILOT_SYNC: Analyze code in src/ui-generator and update this section -->

### Core Components

- **UIGeneratorService**: Main service for component generation and personalization
- **ComponentTemplateService**: Template management for different roles and component types
- **ComponentValidator**: Syntax and performance validation for generated components
- **EChartsIntegrator**: Apache ECharts configuration generation and data binding
- **PersonalizationEngine**: User behavior analysis and component adaptation
- **RealtimeUpdater**: Real-time component updates based on streaming data

### Dependencies

- Internal dependencies: `llm-manager`, `storage`, `ai-analyzer` packages
- External dependencies:
  - `@effect/platform` - Effect-TS platform abstractions
  - `@effect/schema` - Schema validation and transformation
  - `react` - React framework for component generation
  - `echarts` - Apache ECharts for advanced visualizations
  - `@babel/parser` - Code parsing and validation
  - `typescript` - TypeScript compilation and validation

## Component Generation Strategy

### Role-Based Templates

```typescript
const roleTemplates = {
  devops: {
    dashboard: 'Infrastructure overview with service health, resource usage, alerts',
    chart: 'Time-series metrics with deployment markers and capacity planning',
    table: 'Service inventory with status, versions, and resource allocation'
  },
  sre: {
    dashboard: 'SLI/SLO tracking with error budgets and incident timelines',
    chart: 'Reliability metrics with trend analysis and anomaly detection',
    table: 'Service dependencies with failure rates and recovery times'
  },
  developer: {
    dashboard: 'Application performance with code deployment impacts',
    chart: 'Request traces with performance bottlenecks and error patterns',
    table: 'API endpoints with latency percentiles and error rates'
  }
}
```

### Personalization Patterns

- **Interaction Learning**: Track clicks, hovers, filters, time spent
- **Visual Preferences**: Color schemes, chart types, layout density
- **Data Preferences**: Preferred time ranges, aggregation levels, filters
- **Workflow Adaptation**: Common navigation patterns and task sequences

## Code Generation Prompts

### Generate Base Implementation

Use this in Copilot Chat:

```
@workspace Based on the package overview in notes/packages/ui-generator/package.md, generate the initial implementation for:
- UIGeneratorService in src/ui-generator/generator.ts with LLM-powered component generation
- ComponentTemplateService in src/ui-generator/templates.ts with role-based templates
- ComponentValidator in src/ui-generator/validator.ts with syntax and performance validation
- EChartsIntegrator in src/ui-generator/echarts.ts with advanced chart generation
- PersonalizationEngine in src/ui-generator/personalization.ts with user behavior analysis
- Real-time component updating in src/ui-generator/realtime.ts
- Comprehensive unit tests with component generation validation
- Integration tests with actual React rendering
```

### Update from Code

Use this in Copilot Chat:

```
@workspace Analyze the code in src/ui-generator and update notes/packages/ui-generator/package.md with:
- Current component generation capabilities and success rates
- Template library and role-based customizations
- Personalization algorithms and user adaptation patterns
- ECharts integration patterns and chart types
- Recent improvements and optimizations
```

## Testing Strategy

<!-- Test coverage and testing approach -->

### Unit Tests

- Coverage target: 80%
- Key test scenarios:
  - Component generation from various data sources
  - Template selection and role-based customization
  - Component validation and error handling
  - Personalization based on user interactions
  - ECharts configuration generation

### Integration Tests

- Test with React Test Renderer for component compilation
- Visual regression testing for generated components
- Performance benchmarks:
  - <5 seconds for component generation
  - <2 seconds for personalization
  - <1 second for template application
  - Generated components render in <100ms

## Performance Characteristics

### Generation Performance

- **Component Generation**: 3-8 seconds depending on complexity
- **Template Application**: <1 second
- **Personalization**: 1-3 seconds
- **Validation**: <500ms

### Runtime Performance

- **Generated Components**: Optimized for <100ms render time
- **Real-time Updates**: <50ms for data binding updates
- **Memory Usage**: <10MB per generated component
- **Bundle Impact**: <50KB additional per component

## Change Log

<!-- Auto-updated by Copilot when code changes -->

### 2025-08-13

- Initial package creation
- Defined LLM-powered React component generation
- Specified role-based templates and personalization
- Added Apache ECharts integration and real-time updates
