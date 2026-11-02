import fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import websocket from '@fastify/websocket'
import { ZodError } from 'zod'

export const app = fastify({
  logger: true,
})

// Plugins
app.register(cors, {
  origin: process.env.FRONTEND_URL || true,
})

app.register(jwt, {
  secret: process.env.JWT_SECRET || 'hintlink_default_dev_secret',
})

app.register(websocket)

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
      message: 'Validation error.',
      issues: error.format(),
    })
  }

  if (process.env.NODE_ENV !== 'production') {
    console.error(error)
  }

  return reply.status(500).send({
    message: 'Internal server error.',
  })
})
