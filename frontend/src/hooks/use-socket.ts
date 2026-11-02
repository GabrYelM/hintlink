'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

export interface WebSocketMessage {
  type: string
  sessionId?: string
  payload?: unknown
  timestamp?: string
}

export function useHintlinkSocket(token: string | null) {
  const [isConnected, setIsConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const subscribersRef = useRef<Set<(msg: WebSocketMessage) => void>>(new Set())

  useEffect(() => {
    if (!token) return

    const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
    const wsUrl = `ws://${host}:3333/ws?token=${token}`
    let ws: WebSocket | null = null
    let reconnectTimeout: NodeJS.Timeout

    function connect() {
      try {
        ws = new WebSocket(wsUrl)
        socketRef.current = ws

        ws.onopen = () => {
          setIsConnected(true)
        }

        ws.onmessage = (event) => {
          try {
            const data: WebSocketMessage = JSON.parse(event.data)
            setLastMessage(data)
            subscribersRef.current.forEach((cb) => cb(data))
          } catch {
            // Ignora payload inválido
          }
        }

        ws.onclose = () => {
          setIsConnected(false)
          // Tenta reconectar após 3 segundos se o token ainda existir
          reconnectTimeout = setTimeout(connect, 3000)
        }

        ws.onerror = () => {
          setIsConnected(false)
        }
      } catch {
        reconnectTimeout = setTimeout(connect, 3000)
      }
    }

    connect()

    return () => {
      clearTimeout(reconnectTimeout)
      if (ws) {
        ws.close()
      }
    }
  }, [token])

  const sendMessage = useCallback((type: string, payload?: unknown, sessionId?: string) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type, payload, sessionId }))
    }
  }, [])

  const subscribe = useCallback((callback: (msg: WebSocketMessage) => void) => {
    subscribersRef.current.add(callback)
    return () => {
      subscribersRef.current.delete(callback)
    }
  }, [])

  return {
    isConnected,
    lastMessage,
    sendMessage,
    subscribe,
  }
}
