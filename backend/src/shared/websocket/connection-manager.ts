import { WebSocket } from 'ws'

export interface ConnectedUser {
  userId: string
  role: 'STUDENT' | 'TUTOR' | 'ADMIN'
  socket: WebSocket
}

class ConnectionManager {
  private connections: Map<string, ConnectedUser[]> = new Map()

  addConnection(userId: string, role: 'STUDENT' | 'TUTOR' | 'ADMIN', socket: WebSocket) {
    const existing = this.connections.get(userId) || []
    this.connections.set(userId, [...existing, { userId, role, socket }])
  }

  removeConnection(userId: string, socket: WebSocket) {
    const existing = this.connections.get(userId)
    if (!existing) return

    const filtered = existing.filter((conn) => conn.socket !== socket)
    if (filtered.length === 0) {
      this.connections.delete(userId)
    } else {
      this.connections.set(userId, filtered)
    }
  }

  sendToUser(userId: string, type: string, payload: any) {
    const userConns = this.connections.get(userId)
    if (!userConns) return

    const message = JSON.stringify({ type, payload, timestamp: new Date().toISOString() })
    for (const conn of userConns) {
      if (conn.socket.readyState === WebSocket.OPEN) {
        conn.socket.send(message)
      }
    }
  }

  broadcastToRole(role: 'STUDENT' | 'TUTOR' | 'ADMIN', type: string, payload: any) {
    const message = JSON.stringify({ type, payload, timestamp: new Date().toISOString() })

    for (const userConns of this.connections.values()) {
      for (const conn of userConns) {
        if (conn.role === role && conn.socket.readyState === WebSocket.OPEN) {
          conn.socket.send(message)
        }
      }
    }
  }

  broadcast(type: string, payload: any) {
    const message = JSON.stringify({ type, payload, timestamp: new Date().toISOString() })

    for (const userConns of this.connections.values()) {
      for (const conn of userConns) {
        if (conn.socket.readyState === WebSocket.OPEN) {
          conn.socket.send(message)
        }
      }
    }
  }

  isOnline(userId: string): boolean {
    return this.connections.has(userId)
  }
}

export const connectionManager = new ConnectionManager()
