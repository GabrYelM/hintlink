import { FastifyInstance } from 'fastify'
import { connectionManager } from '../../shared/websocket/connection-manager.js'
import { prisma } from '../../shared/database/prisma.js'

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

      socket.on('message', async (message: any) => {
        try {
          const parsed = JSON.parse(message.toString())
          const { type, sessionId, payload } = parsed

          // Tratamento de ping / keep-alive
          if (type === 'PING') {
            socket.send(JSON.stringify({ type: 'PONG' }))
            return
          }

          if (type === 'JOIN_ROOM' && sessionId) {
            connectionManager.joinRoom(sessionId, userId, role, socket)

            // Notifica quem acabou de entrar sobre quem já está na sala
            const existingParticipants = connectionManager
              .getRoomParticipants(sessionId)
              .filter((p) => p.socket !== socket)
              .map((p) => ({ userId: p.userId, role: p.role }))

            if (existingParticipants.length > 0) {
              socket.send(
                JSON.stringify({
                  type: 'ROOM_USERS',
                  sessionId,
                  payload: { participants: existingParticipants },
                  timestamp: new Date().toISOString(),
                })
              )
            }

            // Informa os outros participantes que este usuário entrou
            connectionManager.sendToRoom(
              sessionId,
              'USER_JOINED_ROOM',
              { userId, role },
              socket
            )
            return
          }

          if (type === 'LEAVE_ROOM' && sessionId) {
            connectionManager.leaveRoom(sessionId, socket)
            connectionManager.sendToRoom(
              sessionId,
              'USER_LEFT_ROOM',
              { userId },
              socket
            )
            return
          }

          // Chat de Agendamento e da Chamada
          if (type === 'ROOM_CHAT' && sessionId) {
            connectionManager.sendToRoom(sessionId, 'ROOM_CHAT', payload, socket)
            // Persiste no banco de dados para histórico
            try {
              const session = await prisma.tutoringSession.findUnique({
                where: { id: sessionId },
                select: { chatMessages: true },
              })
              const existingMessages = Array.isArray(session?.chatMessages)
                ? (session.chatMessages as any[])
                : []
              await prisma.tutoringSession.update({
                where: { id: sessionId },
                data: {
                  chatMessages: [...existingMessages, payload],
                },
              })
            } catch {
              // não bloqueia envio em tempo real se persistência falhar
            }
            return
          }

          // Quadro Branco: Traços em tempo real
          if (type === 'ROOM_DRAW' && sessionId) {
            connectionManager.sendToRoom(sessionId, 'ROOM_DRAW', payload, socket)
            return
          }

          // Quadro Branco: Limpar Lousa
          if (type === 'ROOM_CLEAR_BOARD' && sessionId) {
            connectionManager.sendToRoom(sessionId, 'ROOM_CLEAR_BOARD', payload, socket)
            return
          }

          // WebRTC Signaling: Offer, Answer, ICE Candidates
          if (
            (type === 'RTC_OFFER' || type === 'RTC_ANSWER' || type === 'RTC_ICE_CANDIDATE') &&
            sessionId
          ) {
            connectionManager.sendToRoom(sessionId, type, payload, socket)
            return
          }

          // Chamada iniciada (notifica o outro participante no chat de agendamento)
          if (type === 'CALL_STARTED' && sessionId) {
            connectionManager.sendToRoom(sessionId, 'CALL_STARTED', { startedBy: userId }, socket)
            return
          }

          // Notificação de Compartilhamento de Tela & Áudio
          if (type === 'ROOM_SCREEN_SHARE_CHANGED' && sessionId) {
            connectionManager.sendToRoom(sessionId, 'ROOM_SCREEN_SHARE_CHANGED', payload, socket)
            return
          }

          // Aluno encerrou a chamada (fecha a sala automaticamente para o monitor)
          if (type === 'CALL_ENDED_BY_STUDENT' && sessionId) {
            connectionManager.sendToRoom(sessionId, 'CALL_ENDED_BY_STUDENT', payload, socket)
            return
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
