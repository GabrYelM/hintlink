import { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../shared/database/prisma.js'
import { RequestsRepository } from './requests.repository.js'
import { SubjectsRepository } from '../subjects/subjects.repository.js'
import { UsersRepository } from '../users/users.repository.js'
import { AcademicRecordsRepository } from '../academic-records/academic-records.repository.js'
import { CreateTutoringRequestService } from './create-request.service.js'
import { FetchOpenRequestsService } from './fetch-open-requests.service.js'
import { AcceptRequestService } from './accept-request.service.js'
import { RejectTutorService } from './reject-tutor.service.js'
import { MatchmakingService } from './matchmaking.service.js'
import { connectionManager } from '../../shared/websocket/connection-manager.js'

export async function createRequest(request: FastifyRequest, reply: FastifyReply) {
  const createRequestBodySchema = z.object({
    subjectId: z.string().uuid('ID de matéria inválido'),
    topic: z.string().min(3, 'O tópico deve ter no mínimo 3 caracteres'),
    description: z.string().optional(),
    durationMinutes: z.number().int().min(1).default(30),
    // O valor não é mais definido pelo aluno; aceito como opcional para compatibilidade
    offeredPrice: z.number().positive().optional(),
    preferredDays: z.array(z.string()).optional(),
    preferredHours: z.string().optional(),
    studentAvailability: z
      .array(
        z.object({
          day: z.string(),
          startTime: z.string(),
          endTime: z.string(),
        })
      )
      .optional(),
  })

  const {
    subjectId,
    topic,
    description,
    durationMinutes,
    preferredDays,
    preferredHours,
    studentAvailability,
  } = createRequestBodySchema.parse(request.body)

  const requestsRepository = new RequestsRepository()
  const subjectsRepository = new SubjectsRepository()
  const usersRepository = new UsersRepository()

  const createRequestService = new CreateTutoringRequestService(
    requestsRepository,
    subjectsRepository,
    usersRepository
  )

  const { tutoringRequest, remainingCredits } = await createRequestService.execute({
    studentId: request.user.sub,
    subjectId,
    topic,
    description,
    durationMinutes,
    preferredDays,
    preferredHours,
    studentAvailability,
  })

  // 🚀 Executa o Matchmaking Inteligente (Divisão 50/50, filtro de horário e ranking por avaliação)
  const matchmakingService = new MatchmakingService()
  const matchResult = await matchmakingService.execute({
    subjectId: tutoringRequest.subjectId,
    studentId: tutoringRequest.studentId,
    studentAvailability: (tutoringRequest as any).studentAvailability as any,
    durationMinutes: tutoringRequest.durationMinutes,
  })

  // 🚀 DISPARO EM TEMPO REAL VIA WEBSOCKET (EFEITO UBER):
  // Notifica os monitores online com os detalhes do novo chamado, fila de matchmaking e valor calculado por tempo
  connectionManager.broadcastToRole('TUTOR', 'NEW_TUTORING_REQUEST', {
    requestId: tutoringRequest.id,
    subjectId: tutoringRequest.subjectId,
    topic: tutoringRequest.topic,
    durationMinutes: tutoringRequest.durationMinutes,
    offeredPrice: tutoringRequest.offeredPrice,
    preferredDays: tutoringRequest.preferredDays,
    preferredHours: tutoringRequest.preferredHours,
    studentAvailability: (tutoringRequest as any).studentAvailability,
    studentId: tutoringRequest.studentId,
    createdAt: tutoringRequest.createdAt,
    matchQueue: tutoringRequest.matchQueue,
    matchedTutorId: matchResult.matchedTutor?.id,
  })

  return reply.status(201).send({
    request: tutoringRequest,
    matchmaking: matchResult,
    remainingCredits,
  })
}

export async function listOpenRequests(request: FastifyRequest, reply: FastifyReply) {
  const listQuerySchema = z.object({
    eligibleOnly: z.coerce.boolean().default(false),
  })

  const { eligibleOnly } = listQuerySchema.parse(request.query)

  const requestsRepository = new RequestsRepository()
  const academicRecordsRepository = new AcademicRecordsRepository()

  const fetchOpenRequestsService = new FetchOpenRequestsService(
    requestsRepository,
    academicRecordsRepository
  )

  const { requests } = await fetchOpenRequestsService.execute({
    tutorId: request.user.sub,
    onlyEligibleSubjects: eligibleOnly,
  })

  return reply.status(200).send({
    requests,
  })
}

export async function acceptRequest(request: FastifyRequest, reply: FastifyReply) {
  const acceptParamsSchema = z.object({
    id: z.string().uuid('ID de chamado inválido'),
  })

  const { id } = acceptParamsSchema.parse(request.params)

  const requestsRepository = new RequestsRepository()
  const academicRecordsRepository = new AcademicRecordsRepository()

  const acceptRequestService = new AcceptRequestService(
    requestsRepository,
    academicRecordsRepository
  )

  const { session, escrow, request: updatedRequest, tutor } =
    await acceptRequestService.execute({
      requestId: id,
      tutorId: request.user.sub,
    })

  // 🚀 DISPARO EM TEMPO REAL VIA WEBSOCKET:
  // 1. Notifica o aluno dono do chamado que um monitor aceitou a dúvida,
  // enviando todos os dados do monitor (nome, nota, experiência) para que o aluno possa aceitar ou recusar!
  connectionManager.sendToUser(updatedRequest.studentId, 'REQUEST_ACCEPTED', {
    sessionId: session.id,
    requestId: updatedRequest.id,
    tutorId: session.tutorId,
    tutor,
    status: session.status,
    message: `O monitor ${tutor.name} aceitou sua dúvida! Você pode confirmar ou recusar para buscar outro.`,
  })

  // 2. Avisa os outros monitores para removerem o chamado do feed deles (já foi pego)
  connectionManager.broadcastToRole('TUTOR', 'REQUEST_TAKEN', {
    requestId: updatedRequest.id,
  })

  return reply.status(200).send({
    message: 'Monitoria aceita com sucesso!',
    session,
    escrow,
    request: updatedRequest,
    tutor,
  })
}

export async function rejectMatchedTutor(request: FastifyRequest, reply: FastifyReply) {
  const rejectParamsSchema = z.object({
    id: z.string().uuid('ID de chamado inválido'),
  })

  const rejectBodySchema = z.object({
    tutorId: z.string().uuid('ID de monitor inválido').optional(),
  })

  const { id } = rejectParamsSchema.parse(request.params)
  const { tutorId } = rejectBodySchema.parse(request.body || {})

  const requestsRepository = new RequestsRepository()
  const rejectTutorService = new RejectTutorService(requestsRepository)

  const result = await rejectTutorService.execute({
    requestId: id,
    studentId: request.user.sub,
    tutorId,
  })

  return reply.status(200).send(result)
}

export async function getMatchmakingForRequest(request: FastifyRequest, reply: FastifyReply) {
  const paramsSchema = z.object({
    id: z.string().uuid('ID de chamado inválido'),
  })

  const { id } = paramsSchema.parse(request.params)
  const requestsRepository = new RequestsRepository()
  const tutoringRequest = await requestsRepository.findById(id)

  if (!tutoringRequest) {
    return reply.status(404).send({ message: 'Chamado não encontrado.' })
  }

  const matchmakingService = new MatchmakingService()
  const result = await matchmakingService.execute({
    requestId: tutoringRequest.id,
    subjectId: tutoringRequest.subjectId,
    studentId: tutoringRequest.studentId,
    rejectedTutorIds: tutoringRequest.rejectedTutorIds,
  })

  return reply.status(200).send(result)
}

export async function cancelRequest(request: FastifyRequest, reply: FastifyReply) {
  const paramsSchema = z.object({
    id: z.string().uuid('ID de chamado inválido'),
  })

  const { id } = paramsSchema.parse(request.params)
  const requestsRepository = new RequestsRepository()
  const tutoringRequest = await requestsRepository.findById(id)

  if (!tutoringRequest) {
    return reply.status(404).send({ message: 'Chamado não encontrado.' })
  }

  if (tutoringRequest.studentId !== request.user.sub) {
    return reply.status(403).send({ message: 'Apenas o aluno dono do chamado pode cancelá-lo.' })
  }

  if (tutoringRequest.status !== 'OPEN') {
    return reply.status(400).send({
      message: 'Apenas chamados em aberto (ainda sem monitor em atendimento) podem ser cancelados diretamente.',
    })
  }

  const refundAmount = Number(tutoringRequest.offeredPrice)

  const result = await prisma.$transaction(async (tx) => {
    const cancelledRequest = await tx.tutoringRequest.update({
      where: { id },
      data: { status: 'CANCELLED' },
    })

    const updatedUser = await tx.user.update({
      where: { id: tutoringRequest.studentId },
      data: {
        credits: {
          increment: refundAmount,
        },
      },
    })

    await tx.creditTransaction.create({
      data: {
        userId: tutoringRequest.studentId,
        type: 'ESCROW_REFUND',
        amount: refundAmount,
        description: `Estorno de créditos por cancelamento do chamado: ${tutoringRequest.topic}`,
        referenceId: id,
      },
    })

    return {
      request: cancelledRequest,
      credits: Number(updatedUser.credits),
    }
  })

  connectionManager.broadcastToRole('TUTOR', 'REQUEST_TAKEN', {
    requestId: id,
  })

  return reply.status(200).send({
    message: `Chamado cancelado e ${refundAmount.toFixed(2)} créditos estornados para sua carteira!`,
    request: result.request,
    credits: result.credits,
  })
}
