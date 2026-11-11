import { prisma } from '../../shared/database/prisma.js'
import { RequestsRepository } from './requests.repository.js'
import { AcademicRecordsRepository } from '../academic-records/academic-records.repository.js'
import { UsersRepository } from '../users/users.repository.js'
import { AppError } from '../../shared/errors/app-error.js'

interface AcceptRequestInput {
  requestId: string
  tutorId: string
}

export class AcceptRequestService {
  constructor(
    private requestsRepository: RequestsRepository,
    private academicRecordsRepository: AcademicRecordsRepository,
    private usersRepository: UsersRepository = new UsersRepository()
  ) {}

  async execute({ requestId, tutorId }: AcceptRequestInput) {
    const request = await this.requestsRepository.findById(requestId)

    if (!request) {
      throw new AppError('Solicitação de monitoria não encontrada.', 404)
    }

    if (request.status !== 'OPEN') {
      throw new AppError('Esta solicitação já foi aceita ou cancelada.', 400)
    }

    if (request.studentId === tutorId) {
      throw new AppError('Você não pode aceitar sua própria solicitação.', 400)
    }

    // Regra: Não pode aceitar se já foi recusado pelo aluno para este chamado
    if (request.rejectedTutorIds && request.rejectedTutorIds.includes(tutorId)) {
      throw new AppError('Você foi recusado pelo aluno para este chamado e não pode aceitá-lo novamente.', 403)
    }

    // Regra de segurança acadêmica: O monitor precisa ter a matéria aprovada
    const hasApprovedRecord = await this.academicRecordsRepository.findByUserAndSubject(
      tutorId,
      request.subjectId
    )

    if (!hasApprovedRecord || !hasApprovedRecord.isApproved) {
      throw new AppError(
        'Você não possui esta matéria aprovada em seu histórico acadêmico para monitorar.',
        403
      )
    }

    // Busca detalhes do monitor e número de sessões finalizadas
    const tutorUser = await this.usersRepository.findById(tutorId).catch(() => null)
    let completedSessionsCount = 0
    try {
      completedSessionsCount = await this.usersRepository.countFinishedSessions(tutorId)
    } catch {
      completedSessionsCount = 0
    }

    const tutorSummary = {
      id: tutorUser?.id || tutorId,
      name: tutorUser?.name || 'Monitor',
      email: tutorUser?.email || '',
      avatarUrl: tutorUser?.avatarUrl || null,
      rating: tutorUser?.rating ?? 5.0,
      totalReviews: tutorUser?.totalReviews ?? 0,
      completedSessionsCount,
      isNovel: completedSessionsCount < 5,
    }

    // Transação ACID: Atualiza o chamado para MATCHED, cria a Sessão e abre a Custódia (Escrow)
    const result = await prisma.$transaction(async (tx) => {
      const updatedRequest = await tx.tutoringRequest.update({
        where: { id: requestId },
        data: { status: 'MATCHED' },
      })

      const session = await tx.tutoringSession.create({
        data: {
          requestId: request.id,
          studentId: request.studentId,
          tutorId,
          durationMinutes: request.durationMinutes,
          status: 'ACTIVE',
        },
      })

      // Simulação do código Pix / chave transacional de retenção
      const dummyPixPayload = `00020126580014br.gov.bcb.pix0136hintlink-${session.id}520400005303986540${request.offeredPrice}5802BR5916Hintlink Escrow6009Sao Paulo62070503***6304`

      const escrow = await tx.escrowTransaction.create({
        data: {
          sessionId: session.id,
          amount: request.offeredPrice,
          pixCode: dummyPixPayload,
          status: 'HELD', // Saldo retido em custódia até o fim da aula
        },
      })

      return {
        session,
        escrow,
        request: updatedRequest,
        tutor: tutorSummary,
      }
    })

    return result
  }
}
