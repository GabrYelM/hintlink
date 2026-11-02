import { FastifyInstance } from 'fastify'
import { acceptRequest, createRequest, listOpenRequests } from './requests.controller.js'
import { verifyJwt } from '../../shared/middlewares/verify-jwt.js'
import { verifyUserRole } from '../../shared/middlewares/verify-user-role.js'

export async function requestsRoutes(app: FastifyInstance) {
  // Alunos e monitores autenticados podem ver chamados
  app.get('/requests/open', { onRequest: [verifyJwt] }, listOpenRequests)

  // Aluno abre chamado
  app.post('/requests', { onRequest: [verifyJwt] }, createRequest)

  // Apenas monitor (TUTOR) pode dar "aceitar" (estilo Uber)
  app.patch(
    '/requests/:id/accept',
    { onRequest: [verifyJwt, verifyUserRole(['TUTOR', 'ADMIN'])] },
    acceptRequest
  )
}
