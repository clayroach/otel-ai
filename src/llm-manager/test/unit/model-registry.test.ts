import { describe, it, expect } from "vitest"
import { 
  getModelMetadata, 
  getModelMetadataForEnvironment,
  getAllRegistryModelIds,
  isSQLSpecificModel,
  hasThinkingTags,
  getThinkingTagPattern,
  hasMarkdownBlocks,
  getMarkdownBlockType,
  getModelConfig,
  extractResponseContent,
  needsResponseWrapping
} from "../../model-registry.js"

describe("Model Registry", () => {
  
  describe("getModelMetadata", () => {
    it("should return metadata for valid model IDs", () => {
      const gptMetadata = getModelMetadata("gpt-3.5-turbo")
      expect(gptMetadata).toBeDefined()
      expect(gptMetadata?.provider).toBe("openai")
      expect(gptMetadata?.capabilities?.json).toBe(true)

      const claudeMetadata = getModelMetadata("claude-3-7-sonnet-20250219")
      expect(claudeMetadata).toBeDefined()
      expect(claudeMetadata?.provider).toBe("anthropic")

      const localMetadata = getModelMetadata("sqlcoder-7b-2")
      expect(localMetadata).toBeDefined()
      expect(localMetadata?.provider).toBe("defog")
      expect(localMetadata?.capabilities?.sql).toBe(true)
    })

    it("should return undefined for invalid model IDs", () => {
      const invalidMetadata = getModelMetadata("invalid-model-id")
      expect(invalidMetadata).toBeUndefined()
    })
  })

  describe("getModelMetadataForEnvironment", () => {
    it("should return metadata map for valid model IDs", () => {
      const modelIds = ["gpt-3.5-turbo", "claude-3-7-sonnet-20250219", "sqlcoder-7b-2"]
      const metadataMap = getModelMetadataForEnvironment(modelIds)
      
      expect(metadataMap.size).toBe(3)
      expect(metadataMap.get("gpt-3.5-turbo")?.provider).toBe("openai")
      expect(metadataMap.get("claude-3-7-sonnet-20250219")?.provider).toBe("anthropic")
      expect(metadataMap.get("sqlcoder-7b-2")?.provider).toBe("defog")
    })

    it("should skip invalid model IDs", () => {
      const modelIds = ["gpt-3.5-turbo", "invalid-model", "claude-3-7-sonnet-20250219"]
      const metadataMap = getModelMetadataForEnvironment(modelIds)
      
      expect(metadataMap.size).toBe(2) // Only valid models
      expect(metadataMap.has("invalid-model")).toBe(false)
    })

    it("should return empty map for empty input", () => {
      const metadataMap = getModelMetadataForEnvironment([])
      expect(metadataMap.size).toBe(0)
    })
  })

  describe("getAllRegistryModelIds", () => {
    it("should return array of model IDs", () => {
      const modelIds = getAllRegistryModelIds()
      expect(Array.isArray(modelIds)).toBe(true)
      expect(modelIds.length).toBeGreaterThan(0)
      expect(modelIds).toContain("gpt-3.5-turbo")
      expect(modelIds).toContain("sqlcoder-7b-2")
    })
  })

  describe("isSQLSpecificModel", () => {
    it("should return true for SQL-specific models", () => {
      expect(isSQLSpecificModel("sqlcoder-7b-2")).toBe(true)
      expect(isSQLSpecificModel("codellama-7b-instruct")).toBe(true) // Often used for SQL
    })

    it("should return false for non-SQL models", () => {
      expect(isSQLSpecificModel("gpt-3.5-turbo")).toBe(false)
      expect(isSQLSpecificModel("claude-3-sonnet-20240229")).toBe(false)
    })

    it("should return false for invalid model IDs", () => {
      expect(isSQLSpecificModel("invalid-model")).toBe(false)
    })
  })

  describe("hasThinkingTags", () => {
    it("should return boolean for model thinking tag support", () => {
      const result = hasThinkingTags("claude-3-7-sonnet-20250219")
      expect(typeof result).toBe("boolean")
    })

    it("should return false for invalid model IDs", () => {
      expect(hasThinkingTags("invalid-model")).toBe(false)
    })
  })

  describe("getThinkingTagPattern", () => {
    it("should return RegExp or undefined", () => {
      const pattern = getThinkingTagPattern("claude-3-7-sonnet-20250219")
      expect(pattern === undefined || pattern instanceof RegExp).toBe(true)
    })
  })

  describe("hasMarkdownBlocks", () => {
    it("should return boolean for markdown block support", () => {
      const result = hasMarkdownBlocks("gpt-3.5-turbo")
      expect(typeof result).toBe("boolean")
    })

    it("should return false for invalid model IDs", () => {
      expect(hasMarkdownBlocks("invalid-model")).toBe(false)
    })
  })

  describe("getMarkdownBlockType", () => {
    it("should return string or undefined", () => {
      const blockType = getMarkdownBlockType("gpt-3.5-turbo")
      expect(blockType === undefined || typeof blockType === "string").toBe(true)
    })
  })

  describe("getModelConfig", () => {
    it("should return config for valid model IDs", () => {
      const config = getModelConfig("gpt-3.5-turbo")
      expect(config).toBeDefined()
      expect(typeof config).toBe("object")
    })

    it("should handle invalid model IDs", () => {
      const config = getModelConfig("invalid-model")
      expect(config).toBeDefined()
      expect(config).toEqual({})
    })
  })

  describe("extractResponseContent", () => {
    it("should extract content from model response", () => {
      const content = extractResponseContent("gpt-3.5-turbo", "Hello world")
      expect(typeof content).toBe("string")
      expect(content).toBeDefined()
    })

    it("should handle empty content", () => {
      const content = extractResponseContent("gpt-3.5-turbo", "")
      expect(content).toBe("")
    })
  })

  describe("needsResponseWrapping", () => {
    it("should return boolean for response wrapping requirement", () => {
      const needs = needsResponseWrapping("sqlcoder-7b-2", "sql")
      expect(typeof needs).toBe("boolean")
    })
    
    it("should handle different task types", () => {
      const sqlNeeds = needsResponseWrapping("gpt-3.5-turbo", "sql")
      const jsonNeeds = needsResponseWrapping("gpt-3.5-turbo", "json") 
      const generalNeeds = needsResponseWrapping("gpt-3.5-turbo", "general")
      
      expect(typeof sqlNeeds).toBe("boolean")
      expect(typeof jsonNeeds).toBe("boolean")
      expect(typeof generalNeeds).toBe("boolean")
    })
  })
})