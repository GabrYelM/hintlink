import { RequestsRepository } from './requests.repository.js'
import { SubjectsRepository } from '../subjects/subjects.repository.js'
import { UsersRepository } from '../users/users.repository.js'
import { AppError } from '../../shared/errors/app-error.js'

interface CreateTutoringRequestInput {
  studentId: string
  subjectId: string
  topic: string
  description?: string
  durationMinutes: number
  offeredPrice: number
}

export class CreateTutoringRequestService {
  constructor(
    private requestsRepository: RequestsRepository,
    private subjectsRepository: SubjectsRepository,
    private usersRepository: UsersRepository
  ) {}

  async execute({
    studentId,
    subjectId,
    topic,
    description,
    durationMinutes,
    offeredPrice,
  }: CreateTutoringRequestInput) {
    const student = await this.usersRepository.findById(studentId)
    if (!student) {
      throw new AppError('Aluno não encontrado.', 404)
    }

    const subject = await this.subjectsRepository.findById(subjectId)
    if (!subject) {
      throw new AppError('Matéria não encontrada.', 404)
    }

    if (offeredPrice <= 0) {
      throw new AppError('O valor ofertado deve ser maior que zero.', 400)
    }

    if (durationMinutes < 15) {
      throw new AppError('A duração mínima de monitoria é de 15 minutos.', 400)
    }

    const tutoringRequest = await this.requestsRepository.create({
      studentId,
      subjectId,
      topic,
      description,
      durationMinutes,
      offeredPrice,
      status: 'OPEN',
    })

    return {
      tutoringRequest,
    }
  }
}
