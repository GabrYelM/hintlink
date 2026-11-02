import { FastifyInstance } from 'fastify'
import { authenticate, profile, register } from './auth.controller.js'
import { verifyJwt } from '../../shared/middlewares/verify-jwt.js'

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/register', register)
  app.post('/auth/login', authenticate)

  /** Rotas autenticadas */
  app.get('/me', { onRequest: [verifyJwt] }, profile)
}
