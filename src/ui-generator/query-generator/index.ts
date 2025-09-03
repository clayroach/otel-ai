// Main exports for query generator module
export * from "./types"
export * as patterns from "./patterns"
export { 
  CriticalPathQueryGeneratorTag,
  CriticalPathQueryGeneratorLive
} from "./service"

// Re-export commonly used types for convenience
export type { 
  CriticalPath,
  GeneratedQuery,
  GeneratedQueryWithThunk,
  QueryResult,
  QueryThunk,
  QueryConfig
} from "./types"

export { QueryPattern } from "./types"