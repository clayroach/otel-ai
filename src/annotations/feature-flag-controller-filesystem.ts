/**
 * Filesystem-based Feature Flag Controller
 *
 * This implementation directly modifies the flagd configuration file
 * without requiring a gRPC connection to the flagd service.
 * This is useful for local development and testing scenarios.
 */

import { Effect, Layer } from 'effect'
import * as fs from 'fs/promises'
import {
  FeatureFlagController,
  FeatureFlagError,
  type FeatureFlag,
  type FlagEvaluation
} from './feature-flag-controller.js'

const CONFIG_PATH = './demo/otel-demo-app/src/flagd/demo.flagd.json'

interface FlagConfig {
  flags: Record<
    string,
    {
      description?: string
      state: string
      variants: Record<string, unknown>
      defaultVariant: string
    }
  >
}

const readFlagConfig = async (): Promise<FlagConfig> => {
  try {
    const content = await fs.readFile(CONFIG_PATH, 'utf8')
    return JSON.parse(content)
  } catch (error) {
    console.warn(`Failed to read flag config from ${CONFIG_PATH}:`, error)
    // Return empty config if file doesn't exist
    return { flags: {} }
  }
}

const writeFlagConfig = async (config: FlagConfig): Promise<void> => {
  try {
    await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2))
    // Wait a moment for flagd to potentially reload
    await new Promise((resolve) => setTimeout(resolve, 100))
  } catch (error) {
    console.warn(`Failed to write flag config to ${CONFIG_PATH}:`, error)
  }
}

/**
 * Filesystem-based Feature Flag Controller Layer
 *
 * This implementation reads and writes directly to the flagd configuration file
 * without requiring a gRPC connection.
 */
export const FeatureFlagControllerFilesystem = Layer.succeed(FeatureFlagController, {
  listFlags: () =>
    Effect.tryPromise({
      try: async () => {
        const config = await readFlagConfig()
        const flags: FeatureFlag[] = []

        for (const [name, flagConfig] of Object.entries(config.flags)) {
          const value =
            flagConfig.defaultVariant === 'on' ||
            flagConfig.defaultVariant === 'true' ||
            (typeof flagConfig.variants[flagConfig.defaultVariant] === 'boolean' &&
              flagConfig.variants[flagConfig.defaultVariant] === true)

          flags.push({
            name,
            value,
            defaultValue: false,
            description: flagConfig.description,
            metadata: {
              state: flagConfig.state,
              variants: flagConfig.variants,
              defaultVariant: flagConfig.defaultVariant
            }
          })
        }

        return flags
      },
      catch: (error) =>
        new FeatureFlagError({
          reason: 'ConnectionFailure',
          message: `Failed to list flags: ${String(error)}`,
          retryable: true
        })
    }),

  getFlagValue: (flagName: string) =>
    Effect.tryPromise({
      try: async () => {
        const config = await readFlagConfig()
        const flagConfig = config.flags[flagName]

        if (!flagConfig) {
          throw new Error(`Flag ${flagName} not found`)
        }

        const value =
          flagConfig.defaultVariant === 'on' ||
          flagConfig.defaultVariant === 'true' ||
          (typeof flagConfig.variants[flagConfig.defaultVariant] === 'boolean' &&
            flagConfig.variants[flagConfig.defaultVariant] === true)

        return value
      },
      catch: (error) =>
        new FeatureFlagError({
          reason: 'FlagNotFound',
          message: `Failed to get flag value: ${String(error)}`,
          retryable: false
        })
    }),

  enableFlag: (flagName: string) =>
    Effect.tryPromise({
      try: async () => {
        const config = await readFlagConfig()

        if (!config.flags[flagName]) {
          throw new Error(`Flag ${flagName} not found`)
        }

        // Set to "on" variant or the highest numeric variant
        const variants = config.flags[flagName].variants
        if ('on' in variants) {
          config.flags[flagName].defaultVariant = 'on'
        } else if ('100%' in variants) {
          config.flags[flagName].defaultVariant = '100%'
        } else {
          // Find the highest numeric variant
          const numericVariants = Object.entries(variants)
            .filter(([_, value]) => typeof value === 'number')
            .sort(([_, a], [__, b]) => (b as number) - (a as number))

          if (numericVariants.length > 0 && numericVariants[0]) {
            config.flags[flagName].defaultVariant = numericVariants[0][0]
          }
        }

        await writeFlagConfig(config)
        console.log(`Flag ${flagName} enabled via filesystem`)
      },
      catch: (error) =>
        new FeatureFlagError({
          reason: 'InvalidValue',
          message: `Failed to enable flag: ${String(error)}`,
          retryable: false
        })
    }),

  disableFlag: (flagName: string) =>
    Effect.tryPromise({
      try: async () => {
        const config = await readFlagConfig()

        if (!config.flags[flagName]) {
          throw new Error(`Flag ${flagName} not found`)
        }

        // Set to "off" variant or 0
        const variants = config.flags[flagName].variants
        if ('off' in variants) {
          config.flags[flagName].defaultVariant = 'off'
        } else if ('0' in variants) {
          config.flags[flagName].defaultVariant = '0'
        } else {
          // Find the lowest numeric variant
          const numericVariants = Object.entries(variants)
            .filter(([_, value]) => typeof value === 'number')
            .sort(([_, a], [__, b]) => (a as number) - (b as number))

          if (numericVariants.length > 0 && numericVariants[0]) {
            config.flags[flagName].defaultVariant = numericVariants[0][0]
          }
        }

        await writeFlagConfig(config)
        console.log(`Flag ${flagName} disabled via filesystem`)
      },
      catch: (error) =>
        new FeatureFlagError({
          reason: 'InvalidValue',
          message: `Failed to disable flag: ${String(error)}`,
          retryable: false
        })
    }),

  evaluateFlag: (flagName: string, _context?: Record<string, unknown>) =>
    Effect.tryPromise({
      try: async () => {
        const config = await readFlagConfig()
        const flagConfig = config.flags[flagName]

        if (!flagConfig) {
          // Return default evaluation for non-existent flag
          return {
            value: false,
            reason: 'FLAG_NOT_FOUND',
            errorCode: 'FLAG_NOT_FOUND',
            errorMessage: `Flag ${flagName} not found`
          }
        }

        const variant = flagConfig.defaultVariant
        const variantValue = flagConfig.variants[variant]

        // Convert to boolean
        const value =
          variant === 'on' ||
          variant === 'true' ||
          (typeof variantValue === 'boolean' && variantValue === true) ||
          (typeof variantValue === 'number' && variantValue > 0)

        const evaluation: FlagEvaluation = {
          value,
          variant,
          reason: 'STATIC',
          errorCode: undefined,
          errorMessage: undefined
        }

        return evaluation
      },
      catch: (error) =>
        new FeatureFlagError({
          reason: 'EvaluationError',
          message: `Failed to evaluate flag: ${String(error)}`,
          retryable: true
        })
    })
})
