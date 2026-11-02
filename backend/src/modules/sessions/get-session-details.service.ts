import { SessionsRepository } from './sessions.repository.js'
import { AppError } from '../../shared/errors/app-error.js'

export class GetSessionDetailsService {
  constructor(private sessionsRepository: SessionsRepository) {}

  async execute(sessionId: string, userId: string) {
    const session = await this.sessionsRepository.findById(sessionId)

    if (!session) {
      throw new AppError('Sessão de monitoria não encontrada.', 404)
    }

    if (session.studentId !== userId && session.tutorId !== userId) {
      throw new AppError('Você não tem permissão para acessar esta sessão.', 403)
    }

    return {
      session,
    }
  }
}
