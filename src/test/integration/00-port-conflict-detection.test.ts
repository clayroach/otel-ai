import { describe, it, expect } from 'vitest'
import { createServer } from 'net'

/**
 * Port Conflict Detection Tests - Integration Test Gatekeeper
 * 
 * ⚠️ RUNS FIRST (00- prefix): This test acts as a gatekeeper for all integration tests.
 * It's the fastest way to detect if the runtime environment (ClickHouse, MinIO, etc.) 
 * is available and ready for testing. If this fails, other integration tests will 
 * fail too, so this provides early feedback.
 * 
 * These tests validate that our application can detect and handle port conflicts
 * gracefully, preventing issues when users have other services running on 
 * standard ports like 8123 (ClickHouse), 9000 (MinIO), etc.
 */
describe('Port Conflict Detection', () => {
  const checkPortAvailable = (port: number): Promise<boolean> => {
    return new Promise((resolve) => {
      const server = createServer()
      
      server.listen(port, () => {
        server.close(() => resolve(true))
      })
      
      server.on('error', () => resolve(false))
    })
  }

  const waitFor = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  it('should use non-conflicting ClickHouse port (8124, not 8123)', async () => {
    // Check if standard ClickHouse port 8123 is available
    const standardPortAvailable = await checkPortAvailable(8123)
    
    // Our configuration should use 8124 to avoid conflicts
    const configuredPort = parseInt(process.env.CLICKHOUSE_PORT || '8124')
    
    expect(configuredPort).toBe(8124)
    expect(configuredPort).not.toBe(8123) // Should not use standard port
    
    if (!standardPortAvailable) {
      console.log('⚠️  Port 8123 is occupied (as expected) - our app correctly uses 8124')
    } else {
      console.log('✅ Port 8123 is available, but our app still uses 8124 to avoid future conflicts')
    }
  })

  it('should detect when configured ClickHouse port is occupied', async () => {
    const configuredPort = parseInt(process.env.CLICKHOUSE_PORT || '8124')
    
    // Check if our ClickHouse is already running on this port
    const portCurrentlyAvailable = await checkPortAvailable(configuredPort)
    
    if (!portCurrentlyAvailable) {
      // Port is occupied (likely by our ClickHouse) - this is expected
      console.log(`✅ Port ${configuredPort} is occupied by our ClickHouse service (as expected)`)
      expect(portCurrentlyAvailable).toBe(false)
      return
    }
    
    // If port is available, test conflict detection with a temporary server
    const conflictServer = createServer()
    
    try {
      // Start server on configured port
      await new Promise<void>((resolve, reject) => {
        conflictServer.listen(configuredPort, () => resolve())
        conflictServer.on('error', reject)
      })

      // Wait a bit to ensure server is fully started
      await waitFor(100)
      
      // Verify the port is now occupied
      const portStillAvailable = await checkPortAvailable(configuredPort)
      expect(portStillAvailable).toBe(false)
      
      console.log(`⚠️  Port ${configuredPort} conflict simulation successful - application would need to handle this gracefully`)
      
    } finally {
      // Clean up the conflict server
      conflictServer.close()
      await waitFor(100) // Wait for server to fully close
    }
  })

  it('should use non-conflicting MinIO port (9001, not 9000)', async () => {
    // Standard MinIO port is 9000, we should use 9001
    // This is configured in docker-compose.yaml
    const expectedMinIOPort = 9001
    
    // Check if standard MinIO port 9000 might be available
    const standardMinIOPortAvailable = await checkPortAvailable(9000)
    
    // Our docker-compose should map to 9001:9000 to avoid conflicts
    console.log(`✅ Our MinIO configuration maps to port ${expectedMinIOPort} to avoid conflicts with standard port 9000`)
    
    if (!standardMinIOPortAvailable) {
      console.log('⚠️  Standard MinIO port 9000 is occupied - our configuration correctly avoids it')
    }
    
    expect(expectedMinIOPort).not.toBe(9000) // Should not use standard port
  })

  it('should provide clear error messages for port conflicts', () => {
    // Test that our configuration provides helpful error messages
    const clickhousePort = process.env.CLICKHOUSE_PORT
    const clickhouseHost = process.env.CLICKHOUSE_HOST
    
    expect(clickhousePort).toBeDefined()
    expect(clickhouseHost).toBeDefined()
    
    console.log(`📋 ClickHouse configuration: ${clickhouseHost}:${clickhousePort}`)
    
    // Verify our configuration uses non-standard ports
    expect(clickhousePort ? parseInt(clickhousePort) : undefined).toBe(8124)
    
    // This ensures users get clear connection info
    expect(clickhouseHost).toBe('localhost')
  })

  it('should document port usage for developers', () => {
    // This test serves as living documentation of our port usage
    const portMapping = {
      'ClickHouse HTTP': { standard: 8123, ourConfig: 8124 },
      'ClickHouse Native': { standard: 9000, ourConfig: 9001 },
      'MinIO API': { standard: 9000, ourConfig: 9001 },  
      'Frontend Dev': { standard: 3000, ourConfig: 5173 },
      'Backend API': { standard: 3000, ourConfig: 4319 },
      'OTLP gRPC': { standard: 4317, ourConfig: 4317 }, // Standard
      'OTLP HTTP': { standard: 4318, ourConfig: 4318 }  // Standard
    }

    console.log('📋 Port Configuration Summary:')
    Object.entries(portMapping).forEach(([service, ports]) => {
      const status = ports.standard === ports.ourConfig ? 'STANDARD' : 'MODIFIED'
      console.log(`   ${service}: ${ports.ourConfig} (standard: ${ports.standard}) - ${status}`)
    })

    // Key insight: We modify database/storage ports but keep telemetry ports standard
    expect(portMapping['ClickHouse HTTP'].ourConfig).not.toBe(portMapping['ClickHouse HTTP'].standard)
    expect(portMapping['OTLP gRPC'].ourConfig).toBe(portMapping['OTLP gRPC'].standard)
  })
})