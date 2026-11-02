import { FastifyInstance } from 'fastify'
import { finishSession, getActiveSession, getSession, openDispute } from './sessions.controller.js'
import { verifyJwt } from '../../shared/middlewares/verify-jwt.js'

export async function sessionsRoutes(app: FastifyInstance) {
  // Consulta se o usuário tem alguma sessão ativa no momento
  app.get('/sessions/active', { onRequest: [verifyJwt] }, getActiveSession)

  // Detalhes da sala virtual
  app.get('/sessions/:id', { onRequest: [verifyJwt] }, getSession)

  // Finalização da monitoria + avaliação do aluno + liberação de saldo
  app.post('/sessions/:id/finish', { onRequest: [verifyJwt] }, finishSession)

  // Abertura de ticket de reclamação (congela repasse do Pix)
  app.post('/sessions/:id/dispute', { onRequest: [verifyJwt] }, openDispute)
}
