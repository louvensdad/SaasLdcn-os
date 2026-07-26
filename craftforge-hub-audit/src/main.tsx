import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './i18n'
import './styles/globals.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
})

async function enableMocking() {
  const enabled = import.meta.env.VITE_MOCK_ENABLED === 'true'
  if (!enabled) return
  const { worker } = await import('./mocks/browser')
  return worker.start({ onUnhandledRequest: 'bypass' })
}

enableMocking().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <App />
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: '#1e1e2e',
                color: '#cdd6f4',
                border: '1px solid #313244',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '0.875rem',
              },
              success: { iconTheme: { primary: '#a6e3a1', secondary: '#1e1e2e' } },
              error: { iconTheme: { primary: '#f38ba8', secondary: '#1e1e2e' } },
            }}
          />
        </QueryClientProvider>
      </BrowserRouter>
    </React.StrictMode>,
  )
})