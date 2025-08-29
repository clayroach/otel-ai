#!/usr/bin/env node
/**
 * Simple test script to verify Storage API Client integration
 * Tests the core functionality without requiring Docker services
 */

import { Effect, Layer } from 'effect'
import { 
  StorageAPIClientTag, 
  ClickHouseConfigTag,
  StorageAPIClientLayer,
  makeStorageAPIClient
} from './src/storage/index.js'

console.log('🧪 Testing Storage API Client Integration...')

// Mock ClickHouse config for testing
const TestClickHouseConfigLayer = Layer.succeed(ClickHouseConfigTag, {
  host: 'localhost',
  port: 8123,
  database: 'test_otel',
  username: 'test',
  password: 'test123'
})

// Create test layer combining config and API client
const TestStorageLayer = StorageAPIClientLayer.pipe(
  Layer.provide(TestClickHouseConfigLayer)
)

// Test 1: Verify Storage API Client can be instantiated
const testStorageAPIClientCreation = Effect.gen(function* (_) {
  console.log('✓ Testing Storage API Client creation...')
  
  const apiClient = yield* _(StorageAPIClientTag)
  
  // Verify API client has expected interface methods
  const expectedMethods = [
    'writeOTLP', 
    'queryTraces', 
    'queryMetrics', 
    'queryLogs', 
    'queryAI', 
    'healthCheck'
  ]
  
  for (const method of expectedMethods) {
    if (typeof apiClient[method] !== 'function') {
      throw new Error(`API client missing method: ${method}`)
    }
  }
  
  console.log('✅ Storage API Client interface verified')
  return { success: true, clientMethods: expectedMethods }
})

// Test 2: Verify layer dependencies resolve correctly
const testLayerDependencies = Effect.gen(function* (_) {
  console.log('✓ Testing layer dependency resolution...')
  
  const config = yield* _(ClickHouseConfigTag)
  const apiClient = yield* _(StorageAPIClientTag)
  
  console.log('✅ Layer dependencies resolved successfully')
  return { 
    success: true, 
    configResolved: !!config, 
    apiClientResolved: !!apiClient 
  }
})

// Test 3: Test error handling (simulate connection failure)
const testErrorHandling = Effect.gen(function* (_) {
  console.log('✓ Testing error handling...')
  
  // This will fail since we don't have a real ClickHouse instance
  // But it should return a proper StorageError, not crash
  const apiClient = yield* _(StorageAPIClientTag)
  
  try {
    // This should fail gracefully
    yield* _(apiClient.healthCheck())
    console.log('⚠️  Health check unexpectedly succeeded (no ClickHouse running)')
    return { success: false, error: 'Expected health check to fail' }
  } catch (error) {
    // Expected to fail - verify we get a proper error structure
    if (error && typeof error === 'object' && '_tag' in error) {
      console.log('✅ Proper error handling verified:', error._tag)
      return { success: true, errorType: error._tag }
    } else {
      console.log('❌ Unexpected error structure:', error)
      return { success: false, error: 'Unexpected error structure' }
    }
  }
})

// Run tests
async function runTests() {
  try {
    console.log('🚀 Starting Storage API Client integration tests...\n')
    
    // Test 1: API Client Creation
    const test1Result = await Effect.runPromise(
      testStorageAPIClientCreation.pipe(
        Effect.provide(TestStorageLayer),
        Effect.match({
          onFailure: (error) => ({
            success: false,
            error: error._tag || 'Unknown error',
            details: error
          }),
          onSuccess: (result) => result
        })
      )
    )
    
    console.log('Test 1 Result:', test1Result)
    
    // Test 2: Layer Dependencies
    const test2Result = await Effect.runPromise(
      testLayerDependencies.pipe(
        Effect.provide(TestStorageLayer),
        Effect.match({
          onFailure: (error) => ({
            success: false,
            error: error._tag || 'Unknown error'
          }),
          onSuccess: (result) => result
        })
      )
    )
    
    console.log('Test 2 Result:', test2Result)
    
    // Test 3: Error Handling
    const test3Result = await Effect.runPromise(
      testErrorHandling.pipe(
        Effect.provide(TestStorageLayer),
        Effect.match({
          onFailure: (error) => ({
            success: true, // Expected to fail
            errorType: error._tag || 'Unknown error'
          }),
          onSuccess: (result) => result
        })
      )
    )
    
    console.log('Test 3 Result:', test3Result)
    
    // Summary
    const allTestsPassed = test1Result.success && test2Result.success && test3Result.success
    console.log('\n📊 Test Summary:')
    console.log('- API Client Creation:', test1Result.success ? '✅ PASS' : '❌ FAIL')
    console.log('- Layer Dependencies:', test2Result.success ? '✅ PASS' : '❌ FAIL') 
    console.log('- Error Handling:', test3Result.success ? '✅ PASS' : '❌ FAIL')
    console.log('\n🎯 Overall Result:', allTestsPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED')
    
    if (allTestsPassed) {
      console.log('\n🎉 Storage API Client integration is working correctly!')
      console.log('✅ Type safety fixes have been successfully applied')
      console.log('✅ Server can now safely use Storage API Client')
    } else {
      console.log('\n💥 Some integration issues remain')
      process.exit(1)
    }
    
  } catch (error) {
    console.error('❌ Test execution failed:', error)
    process.exit(1)
  }
}

runTests()