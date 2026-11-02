import { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { RequestsRepository } from './requests.repository.js'
import { SubjectsRepository } from '../subjects/subjects.repository.js'
import { UsersRepository } from '../users/users.repository.js'
import { AcademicRecordsRepository } from '../academic-records/academic-records.repository.js'
import { CreateTutoringRequestService } from './create-request.service.js'
import { FetchOpenRequestsService } from './fetch-open-requests.service.js'
import { AcceptRequestService } from './accept-request.service.js'
import { connectionManager } from '../../shared/websocket/connection-manager.js'

export async function createRequest(request: FastifyRequest, reply: FastifyReply) {
  const createRequestBodySchema = z.object({
    subjectId: z.string().uuid('ID de matéria inválido'),
    topic: z.string().min(3, 'O tópico deve ter no mínimo 3 caracteres'),
    description: z.string().optional(),
    durationMinutes: z.number().int().min(15).default(30),
    offeredPrice: z.number().positive('O valor deve ser maior que zero'),
  })

  const { subjectId, topic, description, durationMinutes, offeredPrice } =
    createRequestBodySchema.parse(request.body)

  const requestsRepository = new RequestsRepository()
  const subjectsRepository = new SubjectsRepository()
  const usersRepository = new UsersRepository()

  const createRequestService = new CreateTutoringRequestService(
    requestsRepository,
    subjectsRepository,
    usersRepository
  )

  const { tutoringRequest } = await createRequestService.execute({
    studentId: request.user.sub,
    subjectId,
    topic,
    description,
    durationMinutes,
    offeredPrice,
  })

  // 🚀 DISPARO EM TEMPO REAL VIA WEBSOCKET (EFEITO UBER):
  // Notifica instantaneamente todos os monitores (TUTOR) online com os detalhes do novo chamado
  connectionManager.broadcastToRole('TUTOR', 'NEW_TUTORING_REQUEST', {
    requestId: tutoringRequest.id,
    subjectId: tutoringRequest.subjectId,
    topic: tutoringRequest.topic,
    durationMinutes: tutoringRequest.durationMinutes,
    offeredPrice: tutoringRequest.offeredPrice,
    studentId: tutoringRequest.studentId,
    createdAt: tutoringRequest.createdAt,
  })

  return reply.status(201).send({
    request: tutoringRequest,
  })
}

export async function listOpenRequests(request: FastifyRequest, reply: FastifyReply) {
  const listQuerySchema = z.object({
    eligibleOnly: z
      .string()
      .optional()
      .transform((val) => val === 'true'),
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

  const { session, escrow, request: updatedRequest } = await acceptRequestService.execute({
    requestId: id,
    tutorId: request.user.sub,
  })

  // 🚀 DISPARO EM TEMPO REAL VIA WEBSOCKET:
  // 1. Notifica o aluno dono do chamado que um monitor aceitou a dúvida e envia o link/ID da sala de aula
  connectionManager.sendToUser(updatedRequest.studentId, 'REQUEST_ACCEPTED', {
    sessionId: session.id,
    requestId: updatedRequest.id,
    tutorId: session.tutorId,
    status: session.status,
    message: 'Um monitor aceitou sua dúvida! Entrando na sala...',
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
  })
}
