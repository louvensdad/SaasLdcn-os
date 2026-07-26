import { create } from 'zustand'

interface WebSocketState {
  connected: boolean
  reconnectAttempts: number
  setConnected: (connected: boolean) => void
  incrementReconnect: () => void
  resetReconnect: () => void
}

export const useWebSocketStore = create<WebSocketState>((set) => ({
  connected: false,
  reconnectAttempts: 0,
  setConnected: (connected) => set({ connected }),
  incrementReconnect: () => set((s) => ({ reconnectAttempts: s.reconnectAttempts + 1 })),
  resetReconnect: () => set({ reconnectAttempts: 0 }),
}))