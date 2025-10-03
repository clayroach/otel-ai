/**
 * Config Watcher
 * Watches debug.yaml and hot-reloads configuration changes
 */

import { watch, type FSWatcher } from 'chokidar'
import { readFile } from 'fs/promises'
import { load as parseYaml } from 'js-yaml'
import { Schema } from '@effect/schema'
import type { ConfigWatcher, DebugConfig } from './types.js'
import { DebugConfigSchema, defaultDebugConfig } from './types.js'

// Type for config change callbacks
type ConfigCallback = (config: DebugConfig) => void

/**
 * Create a config watcher instance
 */
export const createConfigWatcher = (configPath: string): ConfigWatcher => {
  let currentConfig: DebugConfig = { ...defaultDebugConfig }
  let watcher: FSWatcher | null = null
  let debounceTimeout: NodeJS.Timeout | null = null
  const subscribers = new Set<ConfigCallback>()

  /**
   * Load and validate configuration from file
   */
  const loadConfig = async (): Promise<DebugConfig> => {
    try {
      const content = await readFile(configPath, 'utf-8')
      const parsed = parseYaml(content) as unknown

      // Validate with schema
      const decoded = Schema.decodeUnknownSync(DebugConfigSchema)(parsed)
      return decoded
    } catch (error) {
      console.error('[ConfigWatcher] Failed to load config:', error)
      console.error('[ConfigWatcher] Using default configuration')
      return { ...defaultDebugConfig }
    }
  }

  /**
   * Reload configuration and notify subscribers
   */
  const reload = async (): Promise<void> => {
    const newConfig = await loadConfig()
    currentConfig = newConfig

    // Notify all subscribers
    for (const callback of subscribers) {
      try {
        callback(newConfig)
      } catch (error) {
        console.error('[ConfigWatcher] Subscriber callback error:', error)
      }
    }
  }

  /**
   * Handle file change with debouncing
   */
  const handleFileChange = () => {
    // Clear existing timeout
    if (debounceTimeout) {
      clearTimeout(debounceTimeout)
    }

    // Set new debounced reload
    debounceTimeout = setTimeout(async () => {
      console.log(`[ConfigWatcher] Config file changed, reloading...`)
      await reload()
      console.log(`[ConfigWatcher] Config reloaded successfully`)
    }, currentConfig.debug.hotReload.debounceMs)
  }

  /**
   * Start watching the config file
   */
  const startWatching = () => {
    if (!currentConfig.debug.hotReload.enabled) {
      console.log('[ConfigWatcher] Hot reload disabled, not watching file')
      return
    }

    if (watcher) {
      console.log('[ConfigWatcher] Already watching config file')
      return
    }

    console.log(`[ConfigWatcher] Starting to watch: ${configPath}`)

    watcher = watch(configPath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50
      }
    })

    watcher.on('change', handleFileChange)
    watcher.on('error', (error) => {
      console.error('[ConfigWatcher] Watcher error:', error)
    })
  }

  /**
   * Stop watching the config file (cleanup utility)
   */
  const _stopWatching = async () => {
    if (watcher) {
      await watcher.close()
      watcher = null
      console.log('[ConfigWatcher] Stopped watching config file')
    }

    if (debounceTimeout) {
      clearTimeout(debounceTimeout)
      debounceTimeout = null
    }
  }

  // Prevent unused variable warning - kept for future cleanup implementation
  void _stopWatching

  /**
   * Get current configuration
   */
  const getCurrentConfig = (): DebugConfig => {
    return currentConfig
  }

  /**
   * Subscribe to configuration changes
   */
  const subscribe = (callback: ConfigCallback): (() => void) => {
    subscribers.add(callback)

    // Return unsubscribe function
    return () => {
      subscribers.delete(callback)
    }
  }

  // Initialize: Load config and start watching
  const initialize = async () => {
    await reload()
    startWatching()
  }

  // Start initialization
  initialize().catch((error) => {
    console.error('[ConfigWatcher] Initialization failed:', error)
  })

  // Return the config watcher interface
  return {
    getCurrentConfig,
    reload,
    subscribe
  }
}
