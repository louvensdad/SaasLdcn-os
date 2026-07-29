import { useEffect, useRef, useCallback } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useWebSocketStore } from '@/store/webSocketStore'
import type { WsMessage } from '@/types/api'

type MessageHandler = (msg: WsMessage) => void

export function useWebSocket(handlers?: {
  onInstanceStatus?: MessageHandler
  onMacroProgress?: MessageHandler
}) {
  const wsRef = useRef<WebSocket | null>(null)
  const { accessToken } = useAuthStore()
  const { setConnected, incrementReconnect, resetReconnect, reconnectAttempts } = useWebSocketStore()
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  const connect = useCallback(() => {
    if (!accessToken) return
    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws'
    const ws = new WebSocket(`${wsUrl}?token=${accessToken}`)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      resetReconnect()
    }

    ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data)
        if (msg.type === 'instance_status') {
          handlersRef.current?.onInstanceStatus?.(msg)
        } else if (msg.type === 'macro_progress') {
          handlersRef.current?.onMacroProgress?.(msg)
        }
      } catch {
        // ignore malformed messages
      }
    }

    ws.onclose = () => {
      setConnected(false)
      incrementReconnect()
      // auto reconnect with backoff
      const delay = Math.min(1000 * 2 ** reconnectAttempts, 30_000)
      setTimeout(connect, delay)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [accessToken, setConnected, resetReconnect, incrementReconnect, reconnectAttempts])

  useEffect(() => {
    connect()
    return () => {
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [connect])

  return {
    connected: useWebSocketStore((s) => s.connected),
    send: (data: unknown) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(data))
      }
    },
  }
}