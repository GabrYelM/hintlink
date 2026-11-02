import { FastifyInstance } from 'fastify'
import { connectionManager } from '../../shared/websocket/connection-manager.js'

export async function websocketRoutes(app: FastifyInstance) {
  app.get('/ws', { websocket: true }, (socket, req) => {
    // Permite autenticação via query param no handshake do WebSocket: /ws?token=JWT_AQUI
    const { token } = req.query as { token?: string }

    if (!token) {
      socket.send(
        JSON.stringify({
          type: 'ERROR',
          message: 'Conexão rejeitada: token JWT obrigatório via query param ?token=...',
        })
      )
      socket.close()
      return
    }

    try {
      const decoded = app.jwt.verify<{ sub: string; role: 'STUDENT' | 'TUTOR' | 'ADMIN' }>(token)
      const userId = decoded.sub
      const role = decoded.role

      connectionManager.addConnection(userId, role, socket)

      // Confirmação de conexão para o cliente
      socket.send(
        JSON.stringify({
          type: 'CONNECTED',
          payload: {
            message: 'Conectado ao canal em tempo real do Hintlink!',
            userId,
            role,
          },
        })
      )

      socket.on('message', (message: any) => {
        try {
          const parsed = JSON.parse(message.toString())
          // Tratamento de ping / keep-alive
          if (parsed.type === 'PING') {
            socket.send(JSON.stringify({ type: 'PONG' }))
          }
        } catch {
          // Ignora mensagens mal formatadas
        }
      })

      socket.on('close', () => {
        connectionManager.removeConnection(userId, socket)
      })

      socket.on('error', () => {
        connectionManager.removeConnection(userId, socket)
      })
    } catch {
      socket.send(
        JSON.stringify({
          type: 'ERROR',
          message: 'Token JWT inválido ou expirado.',
        })
      )
      socket.close()
    }
  })
}
