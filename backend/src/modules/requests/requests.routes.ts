import { FastifyInstance } from 'fastify'
import {
  acceptRequest,
  createRequest,
  listOpenRequests,
  rejectMatchedTutor,
  getMatchmakingForRequest,
} from './requests.controller.js'
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
        description: 'Cria uma nova solicitação informando disciplina, tópico da dúvida e duração. O valor é calculado automaticamente pela tabela de tempo.',
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
        description: 'O monitor aceita a corrida: cria a sala de sessão, gera a transação de custódia Pix e notifica o aluno com os dados do monitor.',
        security: [{ bearerAuth: [] }],
      },
    },
    acceptRequest
  )

  app.post(
    '/requests/:id/reject-tutor',
    {
      onRequest: [verifyJwt],
      schema: {
        tags: ['Chamados de Monitoria (Estilo Uber)'],
        summary: 'Aluno recusa o monitor e busca outro',
        description: 'O aluno recusa o monitor que aceitou o chamado. A sessão pendente é cancelada e o chamado é reaberto para matchmaking com outros monitores.',
        security: [{ bearerAuth: [] }],
      },
    },
    rejectMatchedTutor
  )

  app.get(
    '/requests/:id/matchmaking',
    {
      onRequest: [verifyJwt],
      schema: {
        tags: ['Chamados de Monitoria (Estilo Uber)'],
        summary: 'Obter dados de matchmaking do chamado',
        description: 'Retorna a fila designada (Normal ou Novos) e os monitores elegíveis.',
        security: [{ bearerAuth: [] }],
      },
    },
    getMatchmakingForRequest
  )
}
