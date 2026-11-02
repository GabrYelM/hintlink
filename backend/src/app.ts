import fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import websocket from '@fastify/websocket'
import fastifyMultipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import fastifySwagger from '@fastify/swagger'
import fastifySwaggerUi from '@fastify/swagger-ui'
import path from 'node:path'
import fs from 'node:fs'
import { ZodError } from 'zod'
import { AppError } from './shared/errors/app-error.js'
import { authRoutes } from './modules/auth/auth.routes.js'
import { subjectsRoutes } from './modules/subjects/subjects.routes.js'
import { academicRecordsRoutes } from './modules/academic-records/academic-records.routes.js'
import { requestsRoutes } from './modules/requests/requests.routes.js'
import { sessionsRoutes } from './modules/sessions/sessions.routes.js'
import { websocketRoutes } from './shared/websocket/websocket.routes.js'

export const app = fastify({
  logger: process.env.NODE_ENV !== 'test',
})

// Plugins de Infraestrutura
app.register(cors, {
  origin: process.env.FRONTEND_URL || true,
})

app.register(jwt, {
  secret: process.env.JWT_SECRET || 'hintlink_default_dev_secret',
})

app.register(websocket)

app.register(fastifyMultipart, {
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB para históricos e gravações em vídeo
  },
})

const uploadsPath = path.resolve(process.cwd(), 'uploads')
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true })
}

app.register(fastifyStatic, {
  root: uploadsPath,
  prefix: '/uploads/',
})

// Documentação Swagger / OpenAPI
app.register(fastifySwagger, {
  openapi: {
    info: {
      title: 'Hintlink API - Monitorias Acadêmicas Sob Demanda',
      description:
        'Documentação interativa da API do Hintlink. Permite testar rotas de autenticação, catálogo de matérias, matching estilo Uber e custódia Pix.',
      version: '1.0.0',
    },
    servers: [
      {
        url: 'http://localhost:3333',
        description: 'Servidor Local de Desenvolvimento',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Insira o token JWT gerado na rota /api/v1/auth/login',
        },
      },
    },
  },
})

app.register(fastifySwaggerUi, {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: true,
  },
  staticCSP: true,
  transformStaticCSP: (header) => header,
})

// Rotas da Aplicação
app.register(websocketRoutes)
app.register(authRoutes, { prefix: '/api/v1' })
app.register(subjectsRoutes, { prefix: '/api/v1' })
app.register(academicRecordsRoutes, { prefix: '/api/v1' })
app.register(requestsRoutes, { prefix: '/api/v1' })
app.register(sessionsRoutes, { prefix: '/api/v1' })

// Rota de Health Check
app.get(
  '/health',
  {
    schema: {
      tags: ['Infraestrutura'],
      summary: 'Status do servidor',
      description: 'Retorna se a API está online e respondendo.',
    },
  },
  async () => {
    return {
      status: 'ok',
      service: 'hintlink-backend',
      timestamp: new Date().toISOString(),
    }
  }
)

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
