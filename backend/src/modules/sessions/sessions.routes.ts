import { FastifyInstance } from 'fastify'
import { finishSession, getActiveSession, getSession, openDispute } from './sessions.controller.js'
import { verifyJwt } from '../../shared/middlewares/verify-jwt.js'

export async function sessionsRoutes(app: FastifyInstance) {
  app.get(
    '/sessions/active',
    {
      onRequest: [verifyJwt],
      schema: {
        tags: ['Sessões & Sala Virtual'],
        summary: 'Verificar sessão em andamento',
        description: 'Verifica se o usuário logado tem alguma monitoria ocorrendo neste momento.',
        security: [{ bearerAuth: [] }],
      },
    },
    getActiveSession
  )

  app.get(
    '/sessions/:id',
    {
      onRequest: [verifyJwt],
      schema: {
        tags: ['Sessões & Sala Virtual'],
        summary: 'Detalhes da sala de monitoria',
        description: 'Retorna participantes, timestamps, status do Pix e dados da sessão.',
        security: [{ bearerAuth: [] }],
      },
    },
    getSession
  )

  app.post(
    '/sessions/:id/finish',
    {
      onRequest: [verifyJwt],
      schema: {
        tags: ['Sessões & Sala Virtual'],
        summary: 'Concluir monitoria & Liberar Pix',
        description: 'Finaliza a aula, registra a avaliação/estrelas dada pelo aluno e libera o saldo em custódia para o monitor.',
        security: [{ bearerAuth: [] }],
      },
    },
    finishSession
  )

  app.post(
    '/sessions/:id/dispute',
    {
      onRequest: [verifyJwt],
      schema: {
        tags: ['Sessões & Sala Virtual'],
        summary: 'Abrir ticket de reclamação',
        description: 'Congela a sessão e o repasse financeiro do Pix para intervenção da administração.',
        security: [{ bearerAuth: [] }],
      },
    },
    openDispute
  )
}
