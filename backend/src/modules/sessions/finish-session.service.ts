import { prisma } from '../../shared/database/prisma.js'
import { SessionsRepository } from './sessions.repository.js'
import { AppError } from '../../shared/errors/app-error.js'

interface FinishSessionInput {
  sessionId: string
  userId: string
  studentRating?: number
  studentFeedback?: string
}

export class FinishSessionService {
  constructor(private sessionsRepository: SessionsRepository) {}

  async execute({ sessionId, userId, studentRating, studentFeedback }: FinishSessionInput) {
    const session = await this.sessionsRepository.findById(sessionId)

    if (!session) {
      throw new AppError('Sessão não encontrada.', 404)
    }

    if (session.status !== 'ACTIVE') {
      throw new AppError('Esta sessão já foi concluída ou cancelada.', 400)
    }

    if (session.studentId !== userId && session.tutorId !== userId) {
      throw new AppError('Você não participa desta sessão.', 403)
    }

    // Se quem está finalizando é o aluno e avaliou o monitor, recalculamos a média do monitor
    return prisma.$transaction(async (tx) => {
      const finishedSession = await tx.tutoringSession.update({
        where: { id: sessionId },
        data: {
          status: 'FINISHED',
          endedAt: new Date(),
          studentRating,
          studentFeedback,
        },
      })

      // Libera o valor em custódia (Pix Escrow) para o monitor
      if (session.escrow && session.escrow.status === 'HELD') {
        await tx.escrowTransaction.update({
          where: { id: session.escrow.id },
          data: {
            status: 'RELEASED_TO_TUTOR',
            releasedAt: new Date(),
          },
        })
      }

      // Atualiza a nota do monitor caso haja avaliação
      if (studentRating && studentRating >= 1 && studentRating <= 5) {
        const tutor = await tx.user.findUnique({ where: { id: session.tutorId } })
        if (tutor) {
          const newTotalReviews = tutor.totalReviews + 1
          const newRating = Number(
            ((tutor.rating * tutor.totalReviews + studentRating) / newTotalReviews).toFixed(1)
          )

          await tx.user.update({
            where: { id: session.tutorId },
            data: {
              rating: newRating,
              totalReviews: newTotalReviews,
            },
          })
        }
      }

      return {
        session: finishedSession,
      }
    })
  }
}
