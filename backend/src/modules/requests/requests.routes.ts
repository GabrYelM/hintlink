import { FastifyInstance } from 'fastify'
import { acceptRequest, createRequest, listOpenRequests } from './requests.controller.js'
import { verifyJwt } from '../../shared/middlewares/verify-jwt.js'
import { verifyUserRole } from '../../shared/middlewares/verify-user-role.js'

export async function requestsRoutes(app: FastifyInstance) {
  app.get(
    '/requests/open',
    {
      onRequest: [verifyJwt],
      schema: {
        tags: ['Chamados de Monitoria (Estilo Uber)'],
        summary: 'Listar chamados em aberto',
        description: 'Retorna a lista de alunos aguardando atendimento. Suporta o parâmetro ?eligibleOnly=true para filtrar apenas disciplinas aprovadas do monitor.',
        security: [{ bearerAuth: [] }],
      },
    },
    listOpenRequests
  )

  app.post(
    '/requests',
    {
      onRequest: [verifyJwt],
      schema: {
        tags: ['Chamados de Monitoria (Estilo Uber)'],
        summary: 'Aluno abre chamado de dúvida',
        description: 'Cria uma nova solicitação informando disciplina, tópico da dúvida, duração e valor ofertado.',
        security: [{ bearerAuth: [] }],
      },
    },
    createRequest
  )

  app.patch(
    '/requests/:id/accept',
    {
      onRequest: [verifyJwt, verifyUserRole(['TUTOR', 'ADMIN'])],
      schema: {
        tags: ['Chamados de Monitoria (Estilo Uber)'],
        summary: 'Monitor aceita chamado',
        description: 'O monitor aceita a corrida: cria a sala de sessão, gera a transação de custódia Pix e fecha o chamado.',
        security: [{ bearerAuth: [] }],
      },
    },
    acceptRequest
  )
}
