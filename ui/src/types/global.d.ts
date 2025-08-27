// Global type declarations for Electron API
declare global {
  interface Window {
    electronAPI?: {
      onMenuAction: (callback: (action: string, data?: any) => void) => void
      off: (channel: string, callback?: Function) => void
      removeAllListeners?: (channel: string) => void
      showSaveDialog: (options: any) => Promise<any>
      showOpenDialog: (options: any) => Promise<any>
      writeFile: (path: string, content: string) => Promise<void>
      readFile: (path: string) => Promise<string>
      // Add other electron API methods as needed
    }
  }
}

export {}
