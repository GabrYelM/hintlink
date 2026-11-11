import { prisma } from '../../shared/database/prisma.js'
import { RequestsRepository } from './requests.repository.js'
import { AppError } from '../../shared/errors/app-error.js'
import { MatchmakingService } from './matchmaking.service.js'
import { connectionManager } from '../../shared/websocket/connection-manager.js'

interface RejectTutorInput {
  requestId: string
  studentId: string
  tutorId?: string
}

export class RejectTutorService {
  constructor(
    private requestsRepository: RequestsRepository,
    private matchmakingService: MatchmakingService = new MatchmakingService()
  ) {}

  async execute({ requestId, studentId, tutorId }: RejectTutorInput) {
    const request = await this.requestsRepository.findById(requestId)

    if (!request) {
      throw new AppError('Solicitação de monitoria não encontrada.', 404)
    }

    if (request.studentId !== studentId) {
      throw new AppError('Apenas o aluno dono do chamado pode recusar o monitor.', 403)
    }

    // Busca a sessão associada se existir
    const existingSession = await prisma.tutoringSession.findUnique({
      where: { requestId },
      include: { escrow: true },
    })

    const targetTutorId = tutorId || existingSession?.tutorId

    if (!targetTutorId) {
      throw new AppError('Nenhum monitor vinculado a esta solicitação para ser recusado.', 400)
    }

    // Transação: remove sessão/escrow pendente e reabre o chamado com o tutor recusado
    const updatedRejectedList = Array.from(
      new Set([...(request.rejectedTutorIds || []), targetTutorId])
    )

    const updatedRequest = await prisma.$transaction(async (tx) => {
      // 1. Se existir sessão criada, remove ou cancela a sessão e a custódia pendente
      if (existingSession) {
        if (existingSession.escrow) {
          await tx.escrowTransaction.delete({
            where: { id: existingSession.escrow.id },
          })
        }
        await tx.tutoringSession.delete({
          where: { id: existingSession.id },
        })
      }

      // 2. Reabre o chamado e anota o tutor recusado
      return tx.tutoringRequest.update({
        where: { id: requestId },
        data: {
          status: 'OPEN',
          rejectedTutorIds: updatedRejectedList,
        },
        include: {
          student: true,
          subject: true,
        },
      })
    })

    // 3. Notifica o monitor dispensado via WebSocket
    connectionManager.sendToUser(targetTutorId, 'TUTOR_REJECTED_BY_STUDENT', {
      requestId: updatedRequest.id,
      message: 'O aluno optou por buscar outro monitor para este chamado.',
    })

    // 4. Executa o matchmaking para encontrar o próximo monitor disponível
    const nextMatch = await this.matchmakingService.execute({
      subjectId: updatedRequest.subjectId,
      studentId: updatedRequest.studentId,
      rejectedTutorIds: updatedRejectedList,
    })

    // 5. Notifica monitores que o chamado está disponível novamente no feed
    connectionManager.broadcastToRole('TUTOR', 'NEW_TUTORING_REQUEST', {
      requestId: updatedRequest.id,
      subjectId: updatedRequest.subjectId,
      topic: updatedRequest.topic,
      durationMinutes: updatedRequest.durationMinutes,
      offeredPrice: updatedRequest.offeredPrice,
      studentId: updatedRequest.studentId,
      createdAt: updatedRequest.createdAt,
      matchQueue: updatedRequest.matchQueue,
    })

    return {
      message: 'Monitor recusado com sucesso. Chamado reaberto para novos monitores.',
      request: updatedRequest,
      rejectedTutorId: targetTutorId,
      nextMatch,
    }
  }
}
