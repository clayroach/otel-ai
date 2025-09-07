import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { Effect } from "effect"
import { defaultLLMConfig, makeLLMConfigService, printConfigStatus, ENV_DOCS } from "../../config.js"

describe("LLM Manager Config", () => {
  let originalEnv: Record<string, string | undefined>

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env }
  })

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv
  })

  describe("defaultLLMConfig", () => {
    it("should provide sensible defaults", () => {
      expect(defaultLLMConfig).toBeDefined()
      expect(defaultLLMConfig.models.llama).toBeDefined()
      expect(defaultLLMConfig.models.llama?.endpoint).toBe("http://localhost:1234/v1")
      expect(defaultLLMConfig.models.llama?.contextLength).toBe(4096)
      expect(defaultLLMConfig.routing.strategy).toBe("balanced")
      expect(defaultLLMConfig.routing.fallbackOrder).toContain("llama")
      expect(defaultLLMConfig.cache.enabled).toBe(true)
    })

    it("should use appropriate timeout based on environment", () => {
      // Since the config is loaded at import time, we can only test the current state
      // This tests that the timeout logic is applied correctly
      expect(typeof defaultLLMConfig.routing.timeoutMs).toBe("number")
      expect(defaultLLMConfig.routing.timeoutMs).toBeGreaterThan(0)
      
      // In our test environment, it should be 90000
      if (process.env.NODE_ENV === 'test' || process.env.CI) {
        expect(defaultLLMConfig.routing.timeoutMs).toBe(90000)
      } else {
        expect(defaultLLMConfig.routing.timeoutMs).toBe(30000)
      }
    })
  })

  describe("makeLLMConfigService", () => {
    it("should create a valid config service", async () => {
      const configService = makeLLMConfigService()
      
      const result = await Effect.runPromise(configService)
      
      expect(result).toBeDefined()
      expect(result.getConfig).toBeDefined()
      expect(typeof result.getConfig).toBe("function")
    })

    it("should return config via getConfig method", async () => {
      const configService = makeLLMConfigService()
      const service = await Effect.runPromise(configService)
      
      const config = await Effect.runPromise(service.getConfig())
      
      expect(config).toBeDefined()
      expect(config.models).toBeDefined()
      expect(config.routing).toBeDefined()
      expect(config.cache).toBeDefined()
    })
  })

  describe("ENV_DOCS", () => {
    it("should provide documentation for environment variables", () => {
      expect(ENV_DOCS).toBeDefined()
      expect(typeof ENV_DOCS).toBe("object")
      
      // Check for some expected environment variable docs
      expect(Object.keys(ENV_DOCS).length).toBeGreaterThan(0)
    })
  })

  describe("printConfigStatus", () => {
    it("should be a function that can be called", () => {
      expect(typeof printConfigStatus).toBe("function")
      
      // Test that it doesn't throw when called
      expect(() => printConfigStatus()).not.toThrow()
    })
  })
})