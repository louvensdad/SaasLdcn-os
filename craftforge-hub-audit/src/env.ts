export const env = {
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  wsUrl: import.meta.env.VITE_WS_URL || 'ws://localhost:8000',
  mockEnabled: import.meta.env.VITE_MOCK_ENABLED === 'true',
}