import { RequestsRepository } from './requests.repository.js'
import { SubjectsRepository } from '../subjects/subjects.repository.js'
import { UsersRepository } from '../users/users.repository.js'
import { AppError } from '../../shared/errors/app-error.js'
import { calculatePriceByDuration } from '../../shared/utils/pricing.js'
import { determineTargetQueue } from './matchmaking.service.js'

interface CreateTutoringRequestInput {
  studentId: string
  subjectId: string
  topic: string
  description?: string
  durationMinutes: number
  offeredPrice?: number // Opcional: o sistema calcula com base na duração
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
  }: CreateTutoringRequestInput) {
    const student = await this.usersRepository.findById(studentId)
    if (!student) {
      throw new AppError('Aluno não encontrado.', 404)
    }

    const subject = await this.subjectsRepository.findById(subjectId)
    if (!subject) {
      throw new AppError('Matéria não encontrada.', 404)
    }

    if (!durationMinutes || durationMinutes < 15) {
      throw new AppError('A duração mínima de monitoria é de 15 minutos.', 400)
    }

    // Regra de Negócio: O aluno não define o preço. O sistema calcula a cobrança baseada no tempo.
    const calculatedPrice = calculatePriceByDuration(durationMinutes)

    // Regra de Matchmaking 50/50: Metade das monitorias vai para a fila normal e metade para a fila de novos monitores (<5 aulas)
    const matchQueue = determineTargetQueue()

    const tutoringRequest = await this.requestsRepository.create({
      studentId,
      subjectId,
      topic,
      description,
      durationMinutes,
      offeredPrice: calculatedPrice,
      status: 'OPEN',
      matchQueue,
      rejectedTutorIds: [],
    })

    return {
      tutoringRequest,
    }
  }
}
