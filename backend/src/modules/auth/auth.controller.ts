import { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { UsersRepository } from '../users/users.repository.js'
import { RegisterUserService } from '../users/register.service.js'
import { AuthenticateService } from './authenticate.service.js'

const availabilitySlotSchema = z.object({
  day: z.string().min(1, 'Informe o dia da semana'),
  startTime: z.string().min(1, 'Informe o horário de início'),
  endTime: z.string().min(1, 'Informe o horário de término'),
})

export async function register(request: FastifyRequest, reply: FastifyReply) {
  const registerBodySchema = z.object({
    name: z.string().min(3, 'O nome deve ter no mínimo 3 caracteres'),
    username: z.string().min(3, 'O login deve ter no mínimo 3 caracteres').optional(),
    email: z.string().email('E-mail em formato inválido'),
    cpf: z.string().min(11, 'CPF incompleto'),
    password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres'),
    role: z.enum(['STUDENT', 'TUTOR']).default('STUDENT'),
    availability: z.array(availabilitySlotSchema).optional(),
  })

  const { name, username, email, cpf, password, role, availability } =
    registerBodySchema.parse(request.body)

  const usersRepository = new UsersRepository()
  const registerUserService = new RegisterUserService(usersRepository)

  const { user } = await registerUserService.execute({
    name,
    username,
    email,
    cpf,
    password,
    role,
    availability,
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
    login: z.string().min(1, 'Informe seu e-mail ou nome de usuário'),
    password: z.string().min(1, 'Informe a senha'),
  })

  const { login, password } = authenticateBodySchema.parse(request.body)

  const usersRepository = new UsersRepository()
  const authenticateService = new AuthenticateService(usersRepository)

  const { user } = await authenticateService.execute({
    login,
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
  const toggleRoleBodySchema = z
    .object({
      availability: z.array(availabilitySlotSchema).optional(),
    })
    .optional()

  const parsedBody = toggleRoleBodySchema.parse(request.body || {})

  const usersRepository = new UsersRepository()
  const user = await usersRepository.findById(request.user.sub)

  if (!user) {
    return reply.status(404).send({ message: 'Usuário não encontrado.' })
  }

  // Alterna entre STUDENT e TUTOR
  const newRole = user.role === 'STUDENT' ? 'TUTOR' : 'STUDENT'

  const existingAvailability = Array.isArray(user.availability) ? user.availability : []
  const incomingAvailability = parsedBody?.availability

  if (
    newRole === 'TUTOR' &&
    existingAvailability.length === 0 &&
    (!incomingAvailability || incomingAvailability.length === 0)
  ) {
    return reply.status(400).send({
      message:
        'Para ativar o modo Monitor, é necessário informar os dias e horários em que você tem disponibilidade para dar aula.',
    })
  }

  const updatedUser = await usersRepository.updateRole(
    user.id,
    newRole,
    incomingAvailability && incomingAvailability.length > 0 ? incomingAvailability : undefined
  )

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

export async function updateAvailability(request: FastifyRequest, reply: FastifyReply) {
  const bodySchema = z.object({
    availability: z
      .array(availabilitySlotSchema)
      .min(1, 'Selecione pelo menos um dia e horário de disponibilidade.'),
  })

  const { availability } = bodySchema.parse(request.body)

  const usersRepository = new UsersRepository()
  const user = await usersRepository.findById(request.user.sub)

  if (!user) {
    return reply.status(404).send({ message: 'Usuário não encontrado.' })
  }

  const updatedUser = await usersRepository.updateAvailability(user.id, availability)
  const { passwordHash: _, ...userWithoutPassword } = updatedUser

  return reply.status(200).send({
    message: 'Sua grade de dias e horários disponíveis foi salva com sucesso!',
    user: userWithoutPassword,
  })
}

export async function getCredits(request: FastifyRequest, reply: FastifyReply) {
  const usersRepository = new UsersRepository()
  const user = await usersRepository.findById(request.user.sub)

  if (!user) {
    return reply.status(404).send({ message: 'Usuário não encontrado.' })
  }

  const transactions = await usersRepository.listCreditTransactions(user.id, 25)

  return reply.status(200).send({
    credits: Number(user.credits ?? 0),
    transactions,
  })
}

export async function depositCredits(request: FastifyRequest, reply: FastifyReply) {
  const depositBodySchema = z.object({
    amount: z.coerce
      .number()
      .positive('Informe um valor positivo para recarga')
      .max(5000, 'O limite por recarga é de 5.000 créditos'),
    paymentMethod: z.enum(['PIX', 'CARD']).optional().default('PIX'),
  })

  const { amount, paymentMethod } = depositBodySchema.parse(request.body)

  const usersRepository = new UsersRepository()
  const user = await usersRepository.findById(request.user.sub)

  if (!user) {
    return reply.status(404).send({ message: 'Usuário não encontrado.' })
  }

  const methodLabel = paymentMethod === 'CARD' ? 'Cartão de Crédito' : 'Pix Instantâneo'
  const { user: updatedUser, transaction } = await usersRepository.addCredits(
    user.id,
    amount,
    `Recarga de créditos via ${methodLabel}`
  )

  const { passwordHash: _, ...userWithoutPassword } = updatedUser

  return reply.status(200).send({
    message: `${amount.toFixed(2)} créditos adicionados com sucesso à sua carteira!`,
    credits: Number(updatedUser.credits),
    transaction,
    user: userWithoutPassword,
  })
}

export async function withdrawCredits(request: FastifyRequest, reply: FastifyReply) {
  const withdrawBodySchema = z.object({
    amount: z.coerce.number().positive('Informe um valor positivo para saque'),
    pixKey: z.string().min(3, 'Informe uma chave Pix válida para receber o saque'),
  })

  const { amount, pixKey } = withdrawBodySchema.parse(request.body)

  const usersRepository = new UsersRepository()
  const user = await usersRepository.findById(request.user.sub)

  if (!user) {
    return reply.status(404).send({ message: 'Usuário não encontrado.' })
  }

  const currentBalance = Number(user.credits ?? 0)
  if (currentBalance < amount) {
    return reply.status(400).send({
      message: `Saldo insuficiente para saque (Disponível: ${currentBalance.toFixed(2)} créditos).`,
    })
  }

  const { user: updatedUser, transaction } = await usersRepository.withdrawCredits(
    user.id,
    amount,
    pixKey.trim()
  )

  const { passwordHash: _, ...userWithoutPassword } = updatedUser

  return reply.status(200).send({
    message: `Saque de R$ ${amount.toFixed(2)} (${amount.toFixed(2)} créditos) enviado via Pix para ${pixKey.trim()}!`,
    credits: Number(updatedUser.credits),
    transaction,
    user: userWithoutPassword,
  })
}
