import { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { UsersRepository } from '../users/users.repository.js'
import { RegisterUserService } from '../users/register.service.js'
import { AuthenticateService } from './authenticate.service.js'

export async function register(request: FastifyRequest, reply: FastifyReply) {
  const registerBodySchema = z.object({
    name: z.string().min(3, 'O nome deve ter no mínimo 3 caracteres'),
    email: z.string().email('E-mail em formato inválido'),
    cpf: z.string().min(11, 'CPF incompleto'),
    password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres'),
    role: z.enum(['STUDENT', 'TUTOR']).default('STUDENT'),
  })

  const { name, email, cpf, password, role } = registerBodySchema.parse(request.body)

  const usersRepository = new UsersRepository()
  const registerUserService = new RegisterUserService(usersRepository)

  const { user } = await registerUserService.execute({
    name,
    email,
    cpf,
    password,
    role,
  })

  const token = await reply.jwtSign(
    { role: user.role },
    { sign: { sub: user.id } }
  )

  return reply.status(201).send({
    user,
    token,
  })
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const authenticateBodySchema = z.object({
    email: z.string().email('E-mail em formato inválido'),
    password: z.string().min(1, 'Informe a senha'),
  })

  const { email, password } = authenticateBodySchema.parse(request.body)

  const usersRepository = new UsersRepository()
  const authenticateService = new AuthenticateService(usersRepository)

  const { user } = await authenticateService.execute({
    email,
    password,
  })

  const token = await reply.jwtSign(
    { role: user.role },
    { sign: { sub: user.id } }
  )

  return reply.status(200).send({
    user,
    token,
  })
}

export async function profile(request: FastifyRequest, reply: FastifyReply) {
  const usersRepository = new UsersRepository()
  const user = await usersRepository.findById(request.user.sub)

  if (!user) {
    return reply.status(404).send({ message: 'Usuário não encontrado.' })
  }

  const { passwordHash: _, ...userWithoutPassword } = user

  return reply.status(200).send({
    user: userWithoutPassword,
  })
}

export async function toggleRole(request: FastifyRequest, reply: FastifyReply) {
  const usersRepository = new UsersRepository()
  const user = await usersRepository.findById(request.user.sub)

  if (!user) {
    return reply.status(404).send({ message: 'Usuário não encontrado.' })
  }

  // Alterna entre STUDENT e TUTOR
  const newRole = user.role === 'STUDENT' ? 'TUTOR' : 'STUDENT'
  const updatedUser = await usersRepository.updateRole(user.id, newRole)

  // Emite novo token JWT com a role atualizada
  const token = await reply.jwtSign(
    { role: updatedUser.role },
    { sign: { sub: updatedUser.id } }
  )

  const { passwordHash: _, ...userWithoutPassword } = updatedUser

  return reply.status(200).send({
    message: `Perfil alternado para ${newRole === 'TUTOR' ? 'Monitor' : 'Aluno'} com sucesso!`,
    user: userWithoutPassword,
    token,
  })
}
