import '@fastify/jwt'
import { Role } from '@prisma/client'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { role: Role }
    user: {
      sub: string
      role: Role
    }
  }
}
