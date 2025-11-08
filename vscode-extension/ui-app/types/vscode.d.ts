/**
 * VSCode API types for Next.js app
 */
declare global {
  interface Window {
    vscode?: {
      postMessage: (message: VSCodeMessage) => void
      getState: () => any
      setState: (state: any) => void
    }
  }

  function acquireVsCodeApi(): {
    postMessage: (message: VSCodeMessage) => void
    getState: () => any
    setState: (state: any) => void
  }
}

export interface VSCodeMessage {
  command: 'login' | 'signup' | 'openBrowser' | string
  data?: any
}

export {}



