import { prisma } from '../../shared/database/prisma.js'
import { SessionsRepository } from './sessions.repository.js'
import { AppError } from '../../shared/errors/app-error.js'

interface CancelSessionInput {
  sessionId: string
  userId: string
  reason?: string
}

export class CancelSessionService {
  constructor(private sessionsRepository: SessionsRepository) {}

  async execute({ sessionId, userId, reason }: CancelSessionInput) {
    const session = await this.sessionsRepository.findById(sessionId)

    if (!session) {
      throw new AppError('Sessão de monitoria não encontrada.', 404)
    }

    if (session.status !== 'ACTIVE') {
      throw new AppError('Esta sessão já foi concluída ou cancelada.', 400)
    }

    const isStudent = session.studentId === userId
    const isTutor = session.tutorId === userId

    if (!isStudent && !isTutor) {
      throw new AppError('Você não tem permissão para cancelar esta sessão.', 403)
    }

    const cancelledBy: 'STUDENT' | 'TUTOR' = isStudent ? 'STUDENT' : 'TUTOR'
    const refundPercentage = isStudent ? 50 : 100

    const totalAmount = Number(
      session.escrow?.amount ?? (session as any).request?.offeredPrice ?? 0
    )
    const refundAmount = Number(((totalAmount * refundPercentage) / 100).toFixed(2))

    return prisma.$transaction(async (tx) => {
      const cancelledSession = await tx.tutoringSession.update({
        where: { id: sessionId },
        data: {
          status: 'CANCELLED',
          endedAt: new Date(),
          studentFeedback:
            reason?.trim() ||
            (isStudent
              ? 'Aula cancelada pelo aluno (reembolso de 50%).'
              : 'Aula cancelada pelo monitor (reembolso integral de 100% ao aluno).'),
        },
      })

      if (session.escrow && tx.escrowTransaction?.update) {
        await tx.escrowTransaction.update({
          where: { id: session.escrow.id },
          data: {
            status: 'REFUNDED_TO_STUDENT',
            releasedAt: new Date(),
          },
        })
      }

      if (session.requestId && tx.tutoringRequest?.update) {
        await tx.tutoringRequest.update({
          where: { id: session.requestId },
          data: {
            status: 'CANCELLED',
          },
        })
      }

      let studentCredits = 0
      if (refundAmount > 0 && tx.user?.update) {
        const updatedStudent = await tx.user.update({
          where: { id: session.studentId },
          data: {
            credits: {
              increment: refundAmount,
            },
          },
        })
        studentCredits = Number(updatedStudent?.credits ?? 0)

        if (tx.creditTransaction?.create) {
          await tx.creditTransaction.create({
            data: {
              userId: session.studentId,
              type: 'ESCROW_REFUND',
              amount: refundAmount,
              description: isStudent
                ? `Estorno de 50% por cancelamento da aula pelo aluno (${(session as any).request?.topic || 'Monitoria'})`
                : `Estorno integral (100%) por cancelamento da aula pelo monitor (${(session as any).request?.topic || 'Monitoria'})`,
              referenceId: sessionId,
            },
          })
        }
      }

      return {
        session: cancelledSession,
        cancelledBy,
        refundPercentage,
        refundAmount,
        studentCredits,
        studentId: session.studentId,
        tutorId: session.tutorId,
      }
    })
  }
}
