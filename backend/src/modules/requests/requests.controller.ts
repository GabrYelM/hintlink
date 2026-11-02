import { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { RequestsRepository } from './requests.repository.js'
import { SubjectsRepository } from '../subjects/subjects.repository.js'
import { UsersRepository } from '../users/users.repository.js'
import { AcademicRecordsRepository } from '../academic-records/academic-records.repository.js'
import { CreateTutoringRequestService } from './create-request.service.js'
import { FetchOpenRequestsService } from './fetch-open-requests.service.js'
import { AcceptRequestService } from './accept-request.service.js'

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

  return reply.status(200).send({
    message: 'Monitoria aceita com sucesso!',
    session,
    escrow,
    request: updatedRequest,
  })
}
