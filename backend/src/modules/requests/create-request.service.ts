import { RequestsRepository } from './requests.repository.js'
import { SubjectsRepository } from '../subjects/subjects.repository.js'
import { UsersRepository } from '../users/users.repository.js'
import { AppError } from '../../shared/errors/app-error.js'
import { calculatePriceByDuration } from '../../shared/utils/pricing.js'
import { determineTargetQueue, ScheduleSlot } from './matchmaking.service.js'

interface CreateTutoringRequestInput {
  studentId: string
  subjectId: string
  topic: string
  description?: string
  durationMinutes: number
  offeredPrice?: number // Opcional: o sistema calcula com base na duração
  preferredDays?: string[]
  preferredHours?: string
  studentAvailability?: ScheduleSlot[]
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
    preferredDays,
    preferredHours,
    studentAvailability,
  }: CreateTutoringRequestInput) {
    const student = await this.usersRepository.findById(studentId)
    if (!student) {
      throw new AppError('Aluno não encontrado.', 404)
    }

    const subject = await this.subjectsRepository.findById(subjectId)
    if (!subject) {
      throw new AppError('Matéria não encontrada.', 404)
    }

    if (!durationMinutes || durationMinutes < 1) {
      throw new AppError('A duração mínima de monitoria é de 1 minuto.', 400)
    }

    // Regra de Negócio: O aluno não define o preço. O sistema calcula a cobrança baseada no tempo.
    const calculatedPrice = calculatePriceByDuration(durationMinutes)

    // Validação de Saldo de Créditos: Se o aluno possui o campo credits carregado, valida se há saldo suficiente
    if (student.credits !== undefined && student.credits !== null) {
      const currentBalance = Number(student.credits)
      if (currentBalance < calculatedPrice) {
        throw new AppError(
          `Saldo de créditos insuficiente para abrir este chamado (Saldo atual: ${currentBalance.toFixed(2)} créditos | Necessário: ${calculatedPrice.toFixed(2)} créditos). Adicione créditos na sua carteira.`,
          400
        )
      }
    }

    // Regra de Matchmaking 50/50: Metade das monitorias vai para a fila normal e metade para a fila de novos monitores (<5 aulas)
    const matchQueue = determineTargetQueue()

    // Se studentAvailability foi informado com slots independentes por dia, gera automaticamente preferredDays e preferredHours legíveis
    const validSlots = Array.isArray(studentAvailability)
      ? studentAvailability.filter((s) => s.day && s.startTime && s.endTime)
      : []

    const resolvedPreferredDays =
      validSlots.length > 0
        ? Array.from(new Set(validSlots.map((s) => s.day)))
        : preferredDays && preferredDays.length > 0
          ? preferredDays
          : undefined

    const resolvedPreferredHours =
      validSlots.length > 0
        ? validSlots.map((s) => `${s.day}: ${s.startTime} às ${s.endTime}`).join(' | ')
        : preferredHours?.trim() || undefined

    const tutoringRequest = await this.requestsRepository.create({
      studentId,
      subjectId,
      topic,
      description,
      durationMinutes,
      offeredPrice: calculatedPrice,
      preferredDays: resolvedPreferredDays,
      preferredHours: resolvedPreferredHours,
      ...(validSlots.length > 0 ? { studentAvailability: validSlots as any } : {}),
      status: 'OPEN',
      matchQueue,
      rejectedTutorIds: [],
    })

    // Retém os créditos do aluno em custódia (Escrow) ao abrir o chamado
    let remainingCredits =
      student.credits !== undefined && student.credits !== null
        ? Number(student.credits) - calculatedPrice
        : undefined

    if (typeof this.usersRepository.deductCreditsForEscrow === 'function') {
      const deductResult = await this.usersRepository.deductCreditsForEscrow(
        studentId,
        calculatedPrice,
        `Retenção em custódia para monitoria: ${topic} (${durationMinutes} min)`,
        tutoringRequest.id
      )
      remainingCredits = Number(deductResult.user.credits)
    }

    return {
      tutoringRequest,
      remainingCredits,
    }
  }
}
