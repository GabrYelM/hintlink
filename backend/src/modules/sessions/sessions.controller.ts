import { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import fs from 'node:fs'
import path from 'node:path'
import { SessionsRepository } from './sessions.repository.js'
import { GetSessionDetailsService } from './get-session-details.service.js'
import { FinishSessionService } from './finish-session.service.js'
import { OpenDisputeService } from './open-dispute.service.js'
import { CancelSessionService } from './cancel-session.service.js'
import { AppError } from '../../shared/errors/app-error.js'
import { connectionManager } from '../../shared/websocket/connection-manager.js'
import { prisma } from '../../shared/database/prisma.js'
import { calculateDirectTutorPriceByDuration } from '../../shared/utils/pricing.js'

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

  if (session.tutorId) {
    connectionManager.sendToUser(session.tutorId, 'CREDITS_UPDATED', {
      sessionId: session.id,
      message: 'Monitoria finalizada! Os créditos da aula foram liberados na sua carteira.',
    })
  }

  return reply.status(200).send({
    message: 'Monitoria concluída e créditos transferidos para o monitor com sucesso!',
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
  const [session, sessions] = await Promise.all([
    sessionsRepository.findActiveByUserId(request.user.sub),
    sessionsRepository.findAllActiveByUserId(request.user.sub),
  ])

  return reply.status(200).send({
    session,
    sessions,
  })
}

export async function cancelSession(request: FastifyRequest, reply: FastifyReply) {
  const paramsSchema = z.object({
    id: z.string().uuid('ID de sessão inválido'),
  })

  const bodySchema = z
    .object({
      reason: z.string().optional(),
    })
    .optional()

  const { id } = paramsSchema.parse(request.params)
  const body = bodySchema.parse(request.body)

  const sessionsRepository = new SessionsRepository()
  const cancelSessionService = new CancelSessionService(sessionsRepository)

  const result = await cancelSessionService.execute({
    sessionId: id,
    userId: request.user.sub,
    reason: body?.reason,
  })

  const isCancelledByStudent = result.cancelledBy === 'STUDENT'
  const notificationMessage = isCancelledByStudent
    ? `A aula foi cancelada pelo aluno. Conforme a regra da plataforma, 50% do valor (${result.refundAmount.toFixed(2)} créditos) foi reembolsado ao aluno.`
    : `A aula foi cancelada pelo monitor. O aluno recebeu 100% do valor de volta (${result.refundAmount.toFixed(2)} créditos).`

  // Notifica tanto o aluno quanto o monitor em tempo real
  connectionManager.sendToRoom(id, 'SESSION_CANCELLED', {
    sessionId: id,
    cancelledBy: result.cancelledBy,
    refundPercentage: result.refundPercentage,
    refundAmount: result.refundAmount,
    studentCredits: result.studentCredits,
    message: notificationMessage,
  })

  if (result.studentId) {
    connectionManager.sendToUser(result.studentId, 'SESSION_CANCELLED', {
      sessionId: id,
      cancelledBy: result.cancelledBy,
      refundPercentage: result.refundPercentage,
      refundAmount: result.refundAmount,
      studentCredits: result.studentCredits,
      message: isCancelledByStudent
        ? `Você cancelou a aula e recebeu 50% dos créditos de volta (+${result.refundAmount.toFixed(2)} créditos).`
        : `O monitor cancelou a aula. Você recebeu 100% dos seus créditos de volta (+${result.refundAmount.toFixed(2)} créditos)!`,
    })
  }

  if (result.tutorId) {
    connectionManager.sendToUser(result.tutorId, 'SESSION_CANCELLED', {
      sessionId: id,
      cancelledBy: result.cancelledBy,
      refundPercentage: result.refundPercentage,
      refundAmount: result.refundAmount,
      message: isCancelledByStudent
        ? `O aluno cancelou a aula agendada (reembolso de 50% ao aluno).`
        : `Você cancelou a aula agendada. O aluno foi reembolsado em 100% (${result.refundAmount.toFixed(2)} créditos).`,
    })
  }

  return reply.status(200).send({
    message: isCancelledByStudent
      ? `Aula cancelada. Você recebeu 50% do valor de volta (+${result.refundAmount.toFixed(2)} créditos).`
      : `Aula cancelada pelo monitor. O aluno recebeu 100% do valor de volta (+${result.refundAmount.toFixed(2)} créditos).`,
    ...result,
  })
}

// Armazenamento persistente de mensagens diretas estilo Moodle (multi-monitores / alunos)
const directMessagesFilePath = path.resolve(process.cwd(), 'uploads', 'direct-messages.json')

interface DirectChatMessageItem {
  id: string
  threadId: string
  senderId: string
  senderName: string
  senderRole: string
  recipientId: string
  text: string
  time: string
  createdAt: string
  directRequest?: {
    requestId: string
    topic: string
    subjectName: string
    durationMinutes: number
    offeredPrice: number
  }
}

function getThreadId(userA: string, userB: string): string {
  return [userA, userB].sort().join('__')
}

function readDirectMessages(): Record<string, DirectChatMessageItem[]> {
  try {
    if (!fs.existsSync(directMessagesFilePath)) {
      return {}
    }
    const raw = fs.readFileSync(directMessagesFilePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function writeDirectMessages(store: Record<string, DirectChatMessageItem[]>) {
  try {
    const dir = path.dirname(directMessagesFilePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(directMessagesFilePath, JSON.stringify(store, null, 2), 'utf-8')
  } catch {
    // ignora falha de disco em ambiente restrito
  }
}

export async function getMoodleChatOverview(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.user.sub
  const sessionsRepository = new SessionsRepository()

  // Busca sessões ativas e TODAS as sessões (atuais ou anteriores) em que o usuário teve contato direto com um monitor ou aluno
  const [activeSessions, allUserSessions, openDirectRequests] = await Promise.all([
    sessionsRepository.findAllActiveByUserId(userId),
    prisma.tutoringSession.findMany({
      where: {
        OR: [{ studentId: userId }, { tutorId: userId }],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        request: {
          include: {
            subject: true,
          },
        },
      },
    }),
    prisma.tutoringRequest.findMany({
      where: {
        status: 'OPEN',
        matchQueue: { startsWith: 'DIRECT:' },
      },
      include: {
        subject: true,
        student: {
          select: { id: true, name: true, rating: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const allDirect = readDirectMessages()
  const userDirectThreads: Record<string, DirectChatMessageItem[]> = {}

  for (const [, msgs] of Object.entries(allDirect)) {
    if (!Array.isArray(msgs) || msgs.length === 0) continue
    const first = msgs[0]
    if (first.senderId === userId || first.recipientId === userId) {
      const partnerId = first.senderId === userId ? first.recipientId : first.senderId
      userDirectThreads[partnerId] = msgs
    }
  }

  // Regra solicitada: Devem estar visíveis APENAS os monitores e alunos que já tiveram contato direto com este usuário
  const directContactIds = new Set<string>()
  const lastSubjectByPartner: Record<string, { id: string; code: string; name: string }> = {}
  const sessionHistoryMessagesByPartner: Record<string, DirectChatMessageItem[]> = {}

  for (const sess of allUserSessions) {
    const partnerId = sess.studentId === userId ? sess.tutorId : sess.studentId
    if (!partnerId || partnerId === userId) continue
    directContactIds.add(partnerId)

    if (!lastSubjectByPartner[partnerId] && sess.request?.subject) {
      lastSubjectByPartner[partnerId] = {
        id: sess.request.subject.id,
        code: sess.request.subject.code,
        name: sess.request.subject.name,
      }
    }

    if (Array.isArray(sess.chatMessages) && sess.chatMessages.length > 0) {
      const existingHist = sessionHistoryMessagesByPartner[partnerId] || []
      const converted = (sess.chatMessages as any[]).map((m, idx) => ({
        id: m.id || `${sess.id}-${idx}`,
        threadId: getThreadId(userId, partnerId),
        senderId: m.senderId || '',
        senderName: m.senderName || 'Participante',
        senderRole: m.senderRole || 'STUDENT',
        recipientId: partnerId,
        text: m.text || '',
        time: m.time || '',
        createdAt: sess.createdAt.toISOString(),
      }))
      sessionHistoryMessagesByPartner[partnerId] = [...converted, ...existingHist]
    }
  }

  // Também inclui caso exista uma solicitação de aula direta aberta entre os dois
  for (const req of openDirectRequests) {
    const targetTutorId = (req.matchQueue || '').replace('DIRECT:', '')
    if (req.studentId === userId && targetTutorId) {
      directContactIds.add(targetTutorId)
    } else if (targetTutorId === userId && req.studentId) {
      directContactIds.add(req.studentId)
    }
  }

  const contactUsers =
    directContactIds.size > 0
      ? await prisma.user.findMany({
          where: {
            id: { in: Array.from(directContactIds) },
          },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            rating: true,
            totalReviews: true,
            availability: true,
            academicRecords: {
              where: { isApproved: true },
              include: {
                subject: {
                  select: { id: true, code: true, name: true },
                },
              },
            },
          },
          orderBy: [{ rating: 'desc' }, { name: 'asc' }],
        })
      : []

  const contacts = contactUsers.map((u) => {
    const directMsgs = userDirectThreads[u.id] || []
    const sessionMsgs = sessionHistoryMessagesByPartner[u.id] || []
    const combinedMessages =
      directMsgs.length > 0 ? directMsgs : sessionMsgs

    const approvedSubjects = u.academicRecords.map((ar) => ar.subject)
    const fallbackSubj = lastSubjectByPartner[u.id]
    const subjectsList =
      approvedSubjects.length > 0
        ? approvedSubjects
        : fallbackSubj
          ? [fallbackSubj]
          : []

    // Verifica se há uma solicitação de aula direta (+15%) pendente entre este aluno e este monitor
    const pendingDirectReq = openDirectRequests.find((r) => {
      const targetTutorId = (r.matchQueue || '').replace('DIRECT:', '')
      return (
        (r.studentId === userId && targetTutorId === u.id) ||
        (r.studentId === u.id && targetTutorId === userId)
      )
    })

    return {
      id: u.id,
      name: u.name,
      role: u.role,
      rating: u.rating,
      totalReviews: u.totalReviews,
      availability: u.availability || [],
      subjects: subjectsList,
      lastSubject: fallbackSubj || subjectsList[0] || null,
      pendingDirectRequest: pendingDirectReq
        ? {
            id: pendingDirectReq.id,
            topic: pendingDirectReq.topic,
            durationMinutes: pendingDirectReq.durationMinutes,
            offeredPrice: Number(pendingDirectReq.offeredPrice),
            subject: pendingDirectReq.subject,
            studentId: pendingDirectReq.studentId,
          }
        : null,
      messages: combinedMessages,
    }
  })

  return reply.status(200).send({
    activeSessions,
    contacts,
  })
}

export async function requestDirectLessonFromChat(request: FastifyRequest, reply: FastifyReply) {
  const paramsSchema = z.object({
    partnerId: z.string().uuid('ID do monitor inválido'),
  })

  const bodySchema = z.object({
    subjectId: z.string().uuid().optional(),
    topic: z.string().min(2, 'Informe o tópico da aula direta'),
    durationMinutes: z.number().int().min(1).default(30),
  })

  const { partnerId: tutorId } = paramsSchema.parse(request.params)
  const { subjectId, topic, durationMinutes } = bodySchema.parse(request.body)
  const studentId = request.user.sub

  if (studentId === tutorId) {
    throw new AppError('Você não pode solicitar uma aula direta para si mesmo.', 400)
  }

  const [student, tutor] = await Promise.all([
    prisma.user.findUnique({ where: { id: studentId } }),
    prisma.user.findUnique({
      where: { id: tutorId },
      include: {
        academicRecords: {
          where: { isApproved: true },
          include: { subject: true },
        },
      },
    }),
  ])

  if (!student) {
    throw new AppError('Aluno não encontrado.', 404)
  }
  if (!tutor) {
    throw new AppError('Monitor não encontrado.', 404)
  }

  // Determina a disciplina da aula direta (a enviada, a aprovada do monitor, a última sessão juntos ou a primeira do catálogo)
  let resolvedSubjectId = subjectId
  let resolvedSubjectName = 'Monitoria Direta'

  if (resolvedSubjectId) {
    const subj = await prisma.subject.findUnique({ where: { id: resolvedSubjectId } })
    if (subj) {
      resolvedSubjectName = `${subj.code} - ${subj.name}`
    }
  } else if (tutor.academicRecords.length > 0) {
    resolvedSubjectId = tutor.academicRecords[0].subjectId
    resolvedSubjectName = `${tutor.academicRecords[0].subject.code} - ${tutor.academicRecords[0].subject.name}`
  } else {
    const lastSession = await prisma.tutoringSession.findFirst({
      where: { studentId, tutorId },
      include: { request: { include: { subject: true } } },
      orderBy: { createdAt: 'desc' },
    })
    if (lastSession?.request?.subject) {
      resolvedSubjectId = lastSession.request.subjectId
      resolvedSubjectName = `${lastSession.request.subject.code} - ${lastSession.request.subject.name}`
    } else {
      const anySubj = await prisma.subject.findFirst()
      if (!anySubj) {
        throw new AppError('Nenhuma matéria cadastrada no sistema.', 400)
      }
      resolvedSubjectId = anySubj.id
      resolvedSubjectName = `${anySubj.code} - ${anySubj.name}`
    }
  }

  // Regra de Negócio: Aula direta com monitor do chat tem preço 15% maior por hora (R$ 34,50/h)
  const directPrice = calculateDirectTutorPriceByDuration(durationMinutes)
  const currentBalance = Number(student.credits)

  if (currentBalance < directPrice) {
    throw new AppError(
      `Saldo insuficiente para solicitar aula direta (+15%/h). Saldo atual: ${currentBalance.toFixed(2)} créditos | Necessário: ${directPrice.toFixed(2)} créditos.`,
      400
    )
  }

  const result = await prisma.$transaction(async (tx) => {
    const createdRequest = await tx.tutoringRequest.create({
      data: {
        studentId,
        subjectId: resolvedSubjectId!,
        topic: topic.trim(),
        description: `Solicitação de Aula Direta pelo Chat (+15%/h) para o monitor ${tutor.name}`,
        durationMinutes,
        offeredPrice: directPrice,
        status: 'OPEN',
        matchQueue: `DIRECT:${tutorId}`,
        rejectedTutorIds: [],
      },
      include: {
        subject: true,
      },
    })

    const updatedStudent = await tx.user.update({
      where: { id: studentId },
      data: {
        credits: {
          decrement: directPrice,
        },
      },
    })

    await tx.creditTransaction.create({
      data: {
        userId: studentId,
        type: 'ESCROW_HOLD',
        amount: -directPrice,
        description: `Custódia de Aula Direta (+15%/h) com ${tutor.name}: ${topic.trim()} (${durationMinutes} min)`,
        referenceId: createdRequest.id,
      },
    })

    return {
      request: createdRequest,
      remainingCredits: Number(updatedStudent.credits),
    }
  })

  // Registra também uma mensagem automática na conversa direta entre o aluno e o monitor
  const threadId = getThreadId(studentId, tutorId)
  const store = readDirectMessages()
  const existing = Array.isArray(store[threadId]) ? store[threadId] : []

  const proposalMessage: DirectChatMessageItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    threadId,
    senderId: studentId,
    senderName: student.name,
    senderRole: student.role,
    recipientId: tutorId,
    text: `📌 Solicitei uma Aula Direta (+15%/h) com você!\n• Matéria: ${resolvedSubjectName}\n• Tópico: ${topic.trim()}\n• Duração: ${durationMinutes} min\n• Valor (+15%): ${directPrice.toFixed(2)} créditos (R$ ${directPrice.toFixed(2)})`,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    createdAt: new Date().toISOString(),
    directRequest: {
      requestId: result.request.id,
      topic: topic.trim(),
      subjectName: resolvedSubjectName,
      durationMinutes,
      offeredPrice: directPrice,
    },
  }

  store[threadId] = [...existing, proposalMessage]
  writeDirectMessages(store)

  // Notifica o monitor em tempo real via WebSocket
  connectionManager.sendToUser(tutorId, 'DIRECT_CHAT', {
    partnerId: studentId,
    message: proposalMessage,
  })

  connectionManager.sendToUser(tutorId, 'NEW_TUTORING_REQUEST', {
    requestId: result.request.id,
    subjectId: result.request.subjectId,
    topic: result.request.topic,
    durationMinutes: result.request.durationMinutes,
    offeredPrice: result.request.offeredPrice,
    studentId,
    matchQueue: result.request.matchQueue,
    isDirectRequest: true,
  })

  return reply.status(201).send({
    message: `Solicitação de aula direta (+15%/h) enviada para ${tutor.name}! Valor em custódia: ${directPrice.toFixed(2)} créditos.`,
    request: result.request,
    remainingCredits: result.remainingCredits,
    chatMessage: proposalMessage,
  })
}

export async function sendDirectChatMessage(request: FastifyRequest, reply: FastifyReply) {
  const paramsSchema = z.object({
    partnerId: z.string().uuid('ID de destinatário inválido'),
  })
  const bodySchema = z.object({
    text: z.string().min(1, 'A mensagem não pode estar vazia'),
  })

  const { partnerId } = paramsSchema.parse(request.params)
  const { text } = bodySchema.parse(request.body)
  const senderId = request.user.sub

  const sender = await prisma.user.findUnique({
    where: { id: senderId },
    select: { id: true, name: true, role: true },
  })

  if (!sender) {
    throw new AppError('Usuário não encontrado.', 404)
  }

  const threadId = getThreadId(senderId, partnerId)
  const store = readDirectMessages()
  const existing = Array.isArray(store[threadId]) ? store[threadId] : []

  const newMessage: DirectChatMessageItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    threadId,
    senderId,
    senderName: sender.name,
    senderRole: sender.role,
    recipientId: partnerId,
    text: text.trim(),
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    createdAt: new Date().toISOString(),
  }

  store[threadId] = [...existing, newMessage]
  writeDirectMessages(store)

  // Envia em tempo real via WebSocket para o destinatário
  connectionManager.sendToUser(partnerId, 'DIRECT_CHAT', {
    partnerId: senderId,
    message: newMessage,
  })

  return reply.status(201).send({
    message: newMessage,
  })
}

export async function startSessionCall(request: FastifyRequest, reply: FastifyReply) {
  const paramsSchema = z.object({
    id: z.string().uuid('ID de sessão inválido'),
  })

  const { id } = paramsSchema.parse(request.params)
  const sessionsRepository = new SessionsRepository()
  const session = await sessionsRepository.findById(id)

  if (!session) {
    throw new AppError('Sessão de monitoria não encontrada.', 404)
  }

  if (session.studentId !== request.user.sub) {
    throw new AppError('Apenas o aluno pode iniciar a chamada de vídeo.', 403)
  }

  const updatedSession = await sessionsRepository.markCallStarted(id)

  // Notifica o monitor em tempo real (tanto na sala quanto via sendToUser)
  connectionManager.sendToRoom(id, 'CALL_STARTED', {
    sessionId: id,
    startedBy: request.user.sub,
    callStartedAt: updatedSession.callStartedAt,
  })

  if (session.tutorId) {
    connectionManager.sendToUser(session.tutorId, 'CALL_STARTED', {
      sessionId: id,
      startedBy: request.user.sub,
      callStartedAt: updatedSession.callStartedAt,
      message: 'O aluno iniciou a chamada de vídeo! Clique para entrar na sala.',
    })
  }

  return reply.status(200).send({
    message: 'Chamada iniciada pelo aluno!',
    session: updatedSession,
  })
}
