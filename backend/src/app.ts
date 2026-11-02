import fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import websocket from '@fastify/websocket'
import { ZodError } from 'zod'
import { AppError } from './shared/errors/app-error.js'
import { authRoutes } from './modules/auth/auth.routes.js'
import { subjectsRoutes } from './modules/subjects/subjects.routes.js'
import { academicRecordsRoutes } from './modules/academic-records/academic-records.routes.js'
import { requestsRoutes } from './modules/requests/requests.routes.js'

export const app = fastify({
  logger: process.env.NODE_ENV !== 'test',
})

// Plugins
app.register(cors, {
  origin: process.env.FRONTEND_URL || true,
})

app.register(jwt, {
  secret: process.env.JWT_SECRET || 'hintlink_default_dev_secret',
})

app.register(websocket)

// Rotas da Aplicação
app.register(authRoutes, { prefix: '/api/v1' })
app.register(subjectsRoutes, { prefix: '/api/v1' })
app.register(academicRecordsRoutes, { prefix: '/api/v1' })
app.register(requestsRoutes, { prefix: '/api/v1' })

// Rota de Health Check
app.get('/health', async () => {
  return {
    status: 'ok',
    service: 'hintlink-backend',
    timestamp: new Date().toISOString(),
  }
})

// Tratamento global de erros
app.setErrorHandler((error, _request, reply) => {
  if (error instanceof ZodError) {
    return reply.status(400).send({
      message: 'Erro de validação.',
      issues: error.format(),
    })
  }

  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      message: error.message,
    })
  }

  if (process.env.NODE_ENV !== 'production') {
    console.error(error)
  }

  return reply.status(500).send({
    message: 'Internal server error.',
  })
})
