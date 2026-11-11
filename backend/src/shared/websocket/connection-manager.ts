import { WebSocket } from 'ws'

export interface ConnectedUser {
  userId: string
  role: 'STUDENT' | 'TUTOR' | 'ADMIN'
  socket: WebSocket
}

export interface RoomParticipant {
  userId: string
  role: 'STUDENT' | 'TUTOR' | 'ADMIN'
  socket: WebSocket
}

class ConnectionManager {
  private connections: Map<string, ConnectedUser[]> = new Map()
  private rooms: Map<string, RoomParticipant[]> = new Map()

  addConnection(userId: string, role: 'STUDENT' | 'TUTOR' | 'ADMIN', socket: WebSocket) {
    const existing = this.connections.get(userId) || []
    this.connections.set(userId, [...existing, { userId, role, socket }])
  }

  removeConnection(userId: string, socket: WebSocket) {
    const existing = this.connections.get(userId)
    if (existing) {
      const filtered = existing.filter((conn) => conn.socket !== socket)
      if (filtered.length === 0) {
        this.connections.delete(userId)
      } else {
        this.connections.set(userId, filtered)
      }
    }

    // Remove também de todas as salas onde este socket estava
    for (const [sessionId, participants] of this.rooms.entries()) {
      const updated = participants.filter((p) => p.socket !== socket)
      if (updated.length === 0) {
        this.rooms.delete(sessionId)
      } else {
        this.rooms.set(sessionId, updated)
      }
    }
  }

  joinRoom(sessionId: string, userId: string, role: 'STUDENT' | 'TUTOR' | 'ADMIN', socket: WebSocket) {
    const current = this.rooms.get(sessionId) || []
    const filtered = current.filter((p) => p.socket !== socket)
    const updated = [...filtered, { userId, role, socket }]
    this.rooms.set(sessionId, updated)
    console.log(`[WS-ROOM] ${role} (${userId.slice(0, 8)}) entrou na sala: ${sessionId}. Total: ${updated.length}`)
  }

  leaveRoom(sessionId: string, socket: WebSocket) {
    const current = this.rooms.get(sessionId)
    if (!current) return
    const updated = current.filter((p) => p.socket !== socket)
    if (updated.length === 0) {
      this.rooms.delete(sessionId)
    } else {
      this.rooms.set(sessionId, updated)
    }
  }

  sendToRoom(sessionId: string, type: string, payload: any, excludeSocket?: WebSocket) {
    const participants = this.rooms.get(sessionId)
    if (!participants) {
      console.log(`[WS-ROOM] sendToRoom (${type}): Ninguém na sala ${sessionId}`)
      return
    }

    const message = JSON.stringify({ type, sessionId, payload, timestamp: new Date().toISOString() })
    let count = 0
    for (const p of participants) {
      if (p.socket !== excludeSocket && p.socket.readyState === WebSocket.OPEN) {
        p.socket.send(message)
        count++
      }
    }
    console.log(`[WS-ROOM] sendToRoom (${type}) em ${sessionId}: entregue para ${count} participante(s)`)
  }

  getRoomParticipants(sessionId: string) {
    return this.rooms.get(sessionId) || []
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
