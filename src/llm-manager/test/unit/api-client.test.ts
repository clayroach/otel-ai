import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { LLMManagerAPIClient } from "../../api-client.js"

// Mock fetch globally
global.fetch = vi.fn()

describe("LLM Manager API Client", () => {
  let client: LLMManagerAPIClient
  let originalEnv: Record<string, string | undefined>

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env }
    
    // Create fresh client instance
    client = new LLMManagerAPIClient()
    
    // Reset fetch mock
    vi.clearAllMocks()
  })

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv
  })

  describe("initialize", () => {
    it("should initialize with default configuration", async () => {
      // Mock successful initialization
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ models: [] })
      } as Response)

      await client.initialize()
      
      // Should complete without throwing
      expect(client).toBeDefined()
    })

    it("should warn about custom model config being ignored", async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ models: [] })
      } as Response)

      await client.initialize({ 
        models: { custom: "config" },
        defaultModel: "test-model"
      })
      
      expect(consoleSpy).toHaveBeenCalledWith(
        '⚠️ Custom model config is no longer supported. Using environment configuration.'
      )
      
      consoleSpy.mockRestore()
    })
  })

  describe("getStatus", () => {
    it("should return status with loaded models", async () => {
      // Setup environment with test model
      process.env.LLM_GENERAL_MODEL_1 = "gpt-3.5-turbo"
      process.env.OPENAI_API_KEY = "test-key"
      
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ models: [] })
      } as Response)

      await client.initialize()
      
      const status = await client.getStatus()
      
      expect(status).toBeDefined()
      expect(status.loadedModels).toBeDefined()
      expect(Array.isArray(status.loadedModels)).toBe(true)
      expect(status.status).toMatch(/^(healthy|degraded|unhealthy)$/)
      expect(status.systemMetrics).toBeDefined()
      expect(typeof status.systemMetrics?.totalRequests).toBe('number')
      expect(typeof status.systemMetrics?.uptime).toBe('number')
    })

    it("should return degraded or unhealthy status when some models are unhealthy", async () => {
      // Setup with model that will be unhealthy (no API key)
      process.env.LLM_GENERAL_MODEL_1 = "gpt-3.5-turbo"
      delete process.env.OPENAI_API_KEY // No API key = unhealthy
      
      await client.initialize()
      
      const status = await client.getStatus()
      
      // Should be either degraded or unhealthy (depending on how many models are loaded)
      expect(['degraded', 'unhealthy']).toContain(status.status)
    })
  })

  describe("getLoadedModels", () => {
    it("should return only healthy models", async () => {
      // Setup environment with healthy local model
      process.env.LLM_SQL_MODEL_1 = "sqlcoder-7b-2"
      
      // Mock healthy local endpoint
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ models: [] })
      } as Response)

      await client.initialize()
      
      const models = await client.getLoadedModels()
      
      expect(Array.isArray(models)).toBe(true)
      models.forEach(model => {
        expect(model.status).toBe('healthy')
        expect(model.id).toBeDefined()
        expect(model.provider).toBeDefined()
        expect(model.capabilities).toBeDefined()
      })
    })
  })

  describe("selectModel", () => {
    beforeEach(async () => {
      // Setup with multiple model types
      process.env.LLM_GENERAL_MODEL_1 = "gpt-3.5-turbo"
      process.env.LLM_SQL_MODEL_1 = "sqlcoder-7b-2" 
      process.env.OPENAI_API_KEY = "test-key"
      
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ models: [] })
      } as Response)

      await client.initialize()
    })

    it("should select SQL model for ui-generation tasks", async () => {
      const selection = await client.selectModel({
        taskType: 'ui-generation',
        requirements: { needsSQL: true }
      })
      
      expect(selection.selectedModel).toBeDefined()
      expect(selection.reason).toContain('SQL')
      expect(Array.isArray(selection.alternatives)).toBe(true)
    })

    it("should select appropriate model for analysis tasks", async () => {
      const selection = await client.selectModel({
        taskType: 'analysis',
        requirements: { needsReasoning: true }
      })
      
      expect(selection.selectedModel).toBeDefined()
      expect(selection.reason).toBeDefined()
      expect(typeof selection.estimatedLatency).toBe('number')
    })

    it("should respect preferred provider requirement", async () => {
      const selection = await client.selectModel({
        taskType: 'analysis',
        requirements: { preferredProvider: 'openai' }
      })
      
      expect(selection.reason).toContain('Preferred provider: openai')
    })

    it("should prefer local models for low latency requirements", async () => {
      const selection = await client.selectModel({
        taskType: 'analysis',
        requirements: { maxLatency: 100 }
      })
      
      expect(selection.reason).toContain('Local model for low latency')
    })
  })

  describe("checkModelHealth", () => {
    it("should check local model health via endpoint", async () => {
      // Setup local model
      process.env.LLM_SQL_MODEL_1 = "sqlcoder-7b-2"
      
      // Mock healthy endpoint response
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ models: [] })
      } as Response)

      await client.initialize()
      
      const isHealthy = await client.checkModelHealth("sqlcoder-7b-2")
      expect(typeof isHealthy).toBe('boolean')
    })

    it("should return false for non-existent model", async () => {
      await client.initialize()
      
      const isHealthy = await client.checkModelHealth("non-existent-model")
      expect(isHealthy).toBe(false)
    })
  })

  describe("getModelCategories", () => {
    it("should categorize models from environment variables", async () => {
      // Setup various model types
      process.env.LLM_GENERAL_MODEL_1 = "gpt-3.5-turbo"
      process.env.LLM_SQL_MODEL_1 = "sqlcoder-7b-2"
      process.env.LLM_CODE_MODEL_1 = "codellama-7b-instruct"
      process.env.LLM_DOC_MODEL_1 = "claude-3-haiku-20240307"
      
      await client.initialize()
      
      const categories = client.getModelCategories()
      
      expect(categories.general).toContain("gpt-3.5-turbo")
      expect(categories.sql).toContain("sqlcoder-7b-2")  
      expect(categories.code).toContain("codellama-7b-instruct")
      expect(categories.doc).toContain("claude-3-haiku-20240307")
    })

    it("should return empty arrays when no models configured", async () => {
      // Clear all model environment variables
      Object.keys(process.env).forEach(key => {
        if (key.startsWith('LLM_') && key.includes('_MODEL_')) {
          delete process.env[key]
        }
      })
      
      await client.initialize()
      
      const categories = client.getModelCategories()
      
      expect(categories.general).toEqual([])
      expect(categories.sql).toEqual([])
      expect(categories.code).toEqual([])
      expect(categories.doc).toEqual([])
    })
  })
})