/**
 * Example: Using the LLM Manager Service with Effect-TS Layers
 *
 * This example demonstrates how to use the LLM Manager Service with
 * dependency injection through Effect-TS layers.
 */

import { Effect, Console, Stream } from 'effect'
import {
  LLMManagerService,
  LLMManagerServiceLive,
  LLMManagerServiceMock,
  createTestLLMManagerService
} from '../service.js'
import type { LLMRequest } from '../types.js'

// Example 1: Using the Live Service
const liveExample = Effect.gen(function* () {
  const manager = yield* LLMManagerService

  // Check service health
  const isHealthy = yield* manager.isHealthy()
  yield* Console.log(`Service health: ${isHealthy}`)

  // Get status
  const status = yield* manager.getStatus()
  yield* Console.log(`Available models: ${status.models.join(', ')}`)

  // Generate a response
  const request: LLMRequest = {
    prompt: 'What is observability in software engineering?',
    taskType: 'analysis'
  }

  const response = yield* manager.generate(request)
  yield* Console.log(`Response: ${response.content.substring(0, 200)}...`)
  yield* Console.log(`Model used: ${response.model}`)
  yield* Console.log(`Tokens: ${response.usage.totalTokens}, Cost: $${response.usage.cost}`)

  return response
}).pipe(Effect.provide(LLMManagerServiceLive))

// Example 2: Using the Mock Service for Testing
const mockExample = Effect.gen(function* () {
  const manager = yield* LLMManagerService

  const response = yield* manager.generate({
    prompt: 'Test prompt',
    taskType: 'general'
  })

  yield* Console.log(`Mock response: ${response.content}`)

  // Model selection with mock
  const selectedModel = manager.selectModel('ui-generation')
  yield* Console.log(`Mock selected model: ${selectedModel}`)

  return response
}).pipe(Effect.provide(LLMManagerServiceMock))

// Example 3: Using Custom Test Service
const testExample = Effect.gen(function* () {
  const manager = yield* LLMManagerService

  const response = yield* manager.generate({
    prompt: 'Custom test',
    taskType: 'analysis'
  })

  yield* Console.log(`Test response: ${response.content}`)
  yield* Console.log(`Test model: ${response.model}`)

  return response
}).pipe(
  Effect.provide(
    createTestLLMManagerService({
      generateResponse: {
        content: 'This is a custom test response for analysis',
        model: 'test-analysis-model',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, cost: 0 },
        metadata: { latencyMs: 100, retryCount: 0, cached: false }
      },
      modelSelection: {
        analysis: 'test-analysis-model',
        general: 'test-general-model'
      }
    })
  )
)

// Example 4: Error Handling
const errorHandlingExample = Effect.gen(function* () {
  const manager = yield* LLMManagerService

  const response = yield* manager.generate({
    prompt: 'This will fail',
    taskType: 'general'
  })

  return response
}).pipe(
  Effect.provide(
    createTestLLMManagerService({
      shouldFail: true,
      errorMessage: 'Simulated failure for testing'
    })
  ),
  Effect.catchAll((error) =>
    Effect.gen(function* () {
      yield* Console.error(`Caught error: ${error}`)
      return {
        content: 'Fallback response',
        model: 'fallback',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 },
        metadata: { latencyMs: 0, retryCount: 0, cached: false }
      }
    })
  )
)

// Example 5: Streaming
const streamingExample = Effect.gen(function* () {
  const manager = yield* LLMManagerService

  const stream = manager.generateStream({
    prompt: 'Count from 1 to 5',
    taskType: 'general'
  })

  yield* Console.log('Streaming response:')
  yield* Stream.runForEach(stream, (chunk) => Console.log(`  Chunk: ${chunk}`))

  return 'Streaming complete'
}).pipe(Effect.provide(LLMManagerServiceMock))

// Run examples
if (require.main === module) {
  console.log('=== LLM Manager Service Examples ===\n')

  // Run with mock service (always works)
  console.log('1. Mock Service Example:')
  Effect.runPromise(mockExample)
    .then(() => console.log('\n'))
    .catch(console.error)

  // Run with test service
  console.log('2. Test Service Example:')
  Effect.runPromise(testExample)
    .then(() => console.log('\n'))
    .catch(console.error)

  // Run error handling example
  console.log('3. Error Handling Example:')
  Effect.runPromise(errorHandlingExample)
    .then((result) => {
      console.log(`  Result: ${result.content}`)
      console.log('\n')
    })
    .catch(console.error)

  // Run streaming example
  console.log('4. Streaming Example:')
  Effect.runPromise(streamingExample)
    .then(() => console.log('\n'))
    .catch(console.error)

  // Run with live service (requires LLM to be available)
  console.log('5. Live Service Example (requires LLM):')
  Effect.runPromise(liveExample)
    .then(() => console.log('\n'))
    .catch((error) => {
      console.log(`  Live service not available: ${error.message}`)
      console.log('\n')
    })
}

export { liveExample, mockExample, testExample, errorHandlingExample, streamingExample }
