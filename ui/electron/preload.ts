import { contextBridge, ipcRenderer } from 'electron'

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Menu event listeners
  onMenuAction: (callback: (action: string, data?: any) => void) => {
    ipcRenderer.on('menu-new-query', () => callback('new-query'))
    ipcRenderer.on('menu-open-query', () => callback('open-query'))
    ipcRenderer.on('menu-save-query', () => callback('save-query'))
    ipcRenderer.on('menu-preferences', () => callback('preferences'))
    ipcRenderer.on('menu-navigate', (_, route) => callback('navigate', route))
    ipcRenderer.on('menu-run-query', () => callback('run-query'))
    ipcRenderer.on('menu-format-query', () => callback('format-query'))
    ipcRenderer.on('menu-ai-suggestions', () => callback('ai-suggestions'))
    ipcRenderer.on('menu-about', () => callback('about'))
  },

  // Remove listeners
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('menu-new-query')
    ipcRenderer.removeAllListeners('menu-open-query')
    ipcRenderer.removeAllListeners('menu-save-query')
    ipcRenderer.removeAllListeners('menu-preferences')
    ipcRenderer.removeAllListeners('menu-navigate')
    ipcRenderer.removeAllListeners('menu-run-query')
    ipcRenderer.removeAllListeners('menu-format-query')
    ipcRenderer.removeAllListeners('menu-ai-suggestions')
    ipcRenderer.removeAllListeners('menu-about')
  },

  // Platform info
  platform: process.platform,
  isElectron: true
})

// Type declaration for the exposed API
declare global {
  interface Window {
    electronAPI: {
      onMenuAction: (callback: (action: string, data?: any) => void) => void
      removeAllListeners: () => void
      platform: string
      isElectron: boolean
    }
  }
}
