import { prisma } from '../../shared/database/prisma.js'
import { SessionsRepository } from './sessions.repository.js'
import { AppError } from '../../shared/errors/app-error.js'

interface OpenDisputeInput {
  sessionId: string
  userId: string
  reason: string
  recordingUrl?: string
}

export class OpenDisputeService {
  constructor(private sessionsRepository: SessionsRepository) {}

  async execute({ sessionId, userId, reason, recordingUrl }: OpenDisputeInput) {
    const session = await this.sessionsRepository.findById(sessionId)

    if (!session) {
      throw new AppError('Sessão não encontrada.', 404)
    }

    if (session.studentId !== userId) {
      throw new AppError('Apenas o aluno da monitoria pode abrir um ticket de reclamação.', 403)
    }

    if (session.ticket) {
      throw new AppError('Já existe uma disputa aberta para esta monitoria.', 409)
    }

    return prisma.$transaction(async (tx) => {
      // Congela a sessão e o repasse financeiro
      await tx.tutoringSession.update({
        where: { id: sessionId },
        data: { status: 'DISPUTED' },
      })

      // Se o dinheiro estiver em custódia, garante que não será liberado
      if (session.escrow) {
        await tx.escrowTransaction.update({
          where: { id: session.escrow.id },
          data: { status: 'HELD' },
        })
      }

      const ticket = await tx.disputeTicket.create({
        data: {
          sessionId,
          openedByUserId: userId,
          reason,
          recordingUrl,
          status: 'OPEN',
        },
      })

      return {
        ticket,
      }
    })
  }
}
