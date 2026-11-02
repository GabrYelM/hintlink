import { Role } from '@prisma/client'
import { FastifyReply, FastifyRequest } from 'fastify'

export function verifyUserRole(rolesToVerify: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { role } = request.user as { role: Role; sub: string }

    if (!rolesToVerify.includes(role)) {
      return reply.status(403).send({ message: 'Acesso negado: permissão insuficiente.' })
    }
  }
}
