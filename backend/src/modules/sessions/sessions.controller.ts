import { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import fs from 'node:fs'
import path from 'node:path'
import { SessionsRepository } from './sessions.repository.js'
import { GetSessionDetailsService } from './get-session-details.service.js'
import { FinishSessionService } from './finish-session.service.js'
import { OpenDisputeService } from './open-dispute.service.js'
import { AppError } from '../../shared/errors/app-error.js'

export async function getSession(request: FastifyRequest, reply: FastifyReply) {
  const paramsSchema = z.object({
    id: z.string().uuid('ID de sessão inválido'),
  })

  const { id } = paramsSchema.parse(request.params)

  const sessionsRepository = new SessionsRepository()
  const getSessionService = new GetSessionDetailsService(sessionsRepository)

  const { session } = await getSessionService.execute(id, request.user.sub)

  return reply.status(200).send({
    session,
  })
}

export async function finishSession(request: FastifyRequest, reply: FastifyReply) {
  const paramsSchema = z.object({
    id: z.string().uuid('ID de sessão inválido'),
  })

  const bodySchema = z.object({
    studentRating: z.number().int().min(1).max(5).optional(),
    studentFeedback: z.string().optional(),
  })

  const { id } = paramsSchema.parse(request.params)
  const { studentRating, studentFeedback } = bodySchema.parse(request.body)

  const sessionsRepository = new SessionsRepository()
  const finishSessionService = new FinishSessionService(sessionsRepository)

  const { session } = await finishSessionService.execute({
    sessionId: id,
    userId: request.user.sub,
    studentRating,
    studentFeedback,
  })

  return reply.status(200).send({
    message: 'Monitoria concluída e saldo liberado com sucesso!',
    session,
  })
}

export async function openDispute(request: FastifyRequest, reply: FastifyReply) {
  const paramsSchema = z.object({
    id: z.string().uuid('ID de sessão inválido'),
  })

  const bodySchema = z.object({
    reason: z.string().min(10, 'Descreva a reclamação com no mínimo 10 caracteres'),
  })

  const { id } = paramsSchema.parse(request.params)
  const { reason } = bodySchema.parse(request.body)

  const sessionsRepository = new SessionsRepository()
  const openDisputeService = new OpenDisputeService(sessionsRepository)

  const { ticket } = await openDisputeService.execute({
    sessionId: id,
    userId: request.user.sub,
    reason,
  })

  return reply.status(201).send({
    message: 'Ticket de ouvidoria aberto com sucesso. O pagamento ao monitor foi congelado para análise.',
    ticket,
  })
}

export async function disputeWithRecording(request: FastifyRequest, reply: FastifyReply) {
  const paramsSchema = z.object({
    id: z.string().uuid('ID de sessão inválido'),
  })

  const { id } = paramsSchema.parse(request.params)

  let reason = 'Dúvida não foi sanada pelo monitor'
  let recordingUrl: string | undefined = undefined

  if (request.isMultipart()) {
    const parts = request.parts()
    const uploadDir = path.resolve(process.cwd(), 'uploads', 'recordings')
    
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }

    for await (const part of parts) {
      if (part.type === 'file') {
        const ext = part.filename?.split('.').pop() || 'webm'
        const filename = `session-${id}-${Date.now()}.${ext}`
        const filePath = path.join(uploadDir, filename)
        const buffer = await part.toBuffer()
        await fs.promises.writeFile(filePath, buffer)
        recordingUrl = `/uploads/recordings/${filename}`
      } else if (part.fieldname === 'reason') {
        reason = (part.value as string) || reason
      }
    }
  } else {
    const bodySchema = z.object({
      reason: z.string().min(5),
    })
    const body = bodySchema.parse(request.body)
    reason = body.reason
  }

  const sessionsRepository = new SessionsRepository()
  const openDisputeService = new OpenDisputeService(sessionsRepository)

  const { ticket } = await openDisputeService.execute({
    sessionId: id,
    userId: request.user.sub,
    reason,
    recordingUrl,
  })

  return reply.status(201).send({
    message: 'Disputa registrada com gravação da aula enviada para análise da ouvidoria.',
    ticket,
  })
}

export async function getActiveSession(request: FastifyRequest, reply: FastifyReply) {
  const sessionsRepository = new SessionsRepository()
  const session = await sessionsRepository.findActiveByUserId(request.user.sub)

  return reply.status(200).send({
    session,
  })
}
