import { prisma } from '../../shared/database/prisma.js'

export interface ScheduleSlot {
  day: string
  startTime: string
  endTime: string
}

export interface TutorCandidate {
  id: string
  name: string
  email: string
  avatarUrl?: string | null
  rating: number
  totalReviews: number
  completedSessionsCount: number
  isNovel: boolean // true se < 5 monitorias realizadas
  availability?: ScheduleSlot[]
}

export type MatchQueueType = 'NORMAL' | 'NOVEL'

export interface MatchmakingInput {
  requestId?: string
  subjectId: string
  studentId: string
  rejectedTutorIds?: string[]
  requestIndex?: number // contador ou índice para alternância 50/50
  studentAvailability?: ScheduleSlot[]
  durationMinutes?: number
}

export function normalizeDayName(day: string): string {
  return (day || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace('-feira', '')
    .replace(/\s+/g, '')
    .trim()
}

export function parseTimeToMinutes(timeStr: string): number {
  const [hStr, mStr] = (timeStr || '00:00').split(':')
  const h = Number(hStr) || 0
  const m = Number(mStr) || 0
  return h * 60 + m
}

/**
 * Verifica se a grade de disponibilidade do monitor cumpre pelo menos um dos horários
 * informados pelo aluno na solicitação de monitoria.
 */
export function doesTutorFulfillStudentSchedule(
  studentSlots?: ScheduleSlot[] | null,
  tutorSlots?: ScheduleSlot[] | null,
  durationMinutes = 15
): boolean {
  if (!Array.isArray(studentSlots) || studentSlots.length === 0) {
    return true
  }

  if (!Array.isArray(tutorSlots) || tutorSlots.length === 0) {
    return false
  }

  for (const sSlot of studentSlots) {
    const sDay = normalizeDayName(sSlot.day)
    const sStart = parseTimeToMinutes(sSlot.startTime)
    const sEnd = parseTimeToMinutes(sSlot.endTime)
    const sWindow = sEnd - sStart
    if (sWindow <= 0) continue

    const requiredMinutes = Math.min(Math.max(1, durationMinutes), sWindow)

    for (const tSlot of tutorSlots) {
      const tDay = normalizeDayName(tSlot.day)
      if (sDay !== tDay) continue

      const tStart = parseTimeToMinutes(tSlot.startTime)
      const tEnd = parseTimeToMinutes(tSlot.endTime)

      const overlapStart = Math.max(sStart, tStart)
      const overlapEnd = Math.min(sEnd, tEnd)
      const overlapMinutes = overlapEnd - overlapStart

      if (overlapMinutes >= requiredMinutes) {
        return true
      }
    }
  }

  return false
}

export interface MatchmakingResult {
  assignedQueue: MatchQueueType
  isFallback: boolean
  matchedTutor: TutorCandidate | null
  novelTutors: TutorCandidate[]
  regularTutors: TutorCandidate[]
  totalEligibleTutors: number
}

// Contador em memória para alternância contínua 50/50 caso requestIndex não seja fornecido
let globalRequestSequence = 0

export function resetGlobalRequestSequence() {
  globalRequestSequence = 0
}

export function determineTargetQueue(sequenceIndex?: number): MatchQueueType {
  const seq = typeof sequenceIndex === 'number' ? sequenceIndex : globalRequestSequence++
  // 50% para a fila normal (pares) e 50% para a fila de novos monitores (ímpares)
  return seq % 2 === 0 ? 'NORMAL' : 'NOVEL'
}

export function isNovelTutor(completedSessionsCount: number): boolean {
  return completedSessionsCount < 5
}

export function sortTutorsByRating(tutors: TutorCandidate[]): TutorCandidate[] {
  return [...tutors].sort((a, b) => {
    // 1. Maior nota de avaliação (rating) primeiro
    if (b.rating !== a.rating) {
      return b.rating - a.rating
    }
    // 2. Desempate: maior quantidade de avaliações / experiência
    if (b.totalReviews !== a.totalReviews) {
      return b.totalReviews - a.totalReviews
    }
    // 3. Desempate: mais monitorias realizadas
    return b.completedSessionsCount - a.completedSessionsCount
  })
}

export class MatchmakingService {
  /**
   * Executa a lógica de seleção de monitores (Matchmaking Inteligente).
   * - Filtra monitores aprovados na matéria.
   * - Exclui o próprio aluno e monitores recusados para este chamado.
   * - Separa os monitores entre fila Normal (>= 5 monitorias) e fila de Novos (< 5 monitorias).
   * - Aplica distribuição 50/50 entre as filas com ordenação por avaliações.
   * - Se uma fila estiver vazia, faz fallback automático para a outra para não deixar o aluno sem atendimento.
   */
  async execute({
    subjectId,
    studentId,
    rejectedTutorIds = [],
    requestIndex,
    studentAvailability,
    durationMinutes = 30,
  }: MatchmakingInput): Promise<MatchmakingResult> {
    // 1. Busca todos os monitores aprovados nesta disciplina
    const approvedRecords = await prisma.academicRecord.findMany({
      where: {
        subjectId,
        isApproved: true,
        userId: {
          notIn: [studentId, ...rejectedTutorIds],
        },
      },
      include: {
        user: {
          include: {
            sessionsAsTutor: {
              where: {
                status: 'FINISHED',
              },
              select: {
                id: true,
              },
            },
          },
        },
      },
    })

    // 2. Mapeia e classifica os candidatos (filtrando também pelos horários compatíveis quando informados)
    const candidates: TutorCandidate[] = approvedRecords
      .filter((record) => record.user.role === 'TUTOR' || record.user.role === 'ADMIN')
      .filter((record) => {
        if (!Array.isArray(studentAvailability) || studentAvailability.length === 0) {
          return true
        }
        const tutorSlots = Array.isArray(record.user.availability)
          ? (record.user.availability as unknown as ScheduleSlot[])
          : []
        return doesTutorFulfillStudentSchedule(studentAvailability, tutorSlots, durationMinutes)
      })
      .map((record) => {
        const completedSessionsCount = record.user.sessionsAsTutor.length
        return {
          id: record.user.id,
          name: record.user.name,
          email: record.user.email,
          avatarUrl: record.user.avatarUrl,
          rating: record.user.rating,
          totalReviews: record.user.totalReviews,
          completedSessionsCount,
          isNovel: isNovelTutor(completedSessionsCount),
          availability: Array.isArray(record.user.availability)
            ? (record.user.availability as unknown as ScheduleSlot[])
            : [],
        }
      })

    // Separa os monitores por categoria
    const novelTutors = sortTutorsByRating(candidates.filter((c) => c.isNovel))
    const regularTutors = sortTutorsByRating(candidates.filter((c) => !c.isNovel))

    // 3. Define a fila alvo pela regra de 50/50
    const targetQueue = determineTargetQueue(requestIndex)
    let assignedQueue = targetQueue
    let isFallback = false
    let matchedTutor: TutorCandidate | null = null

    // 4. Seleção com Fallback inteligente
    if (targetQueue === 'NOVEL') {
      if (novelTutors.length > 0) {
        matchedTutor = novelTutors[0]
      } else if (regularTutors.length > 0) {
        // Fallback para fila normal
        assignedQueue = 'NORMAL'
        isFallback = true
        matchedTutor = regularTutors[0]
      }
    } else {
      // targetQueue === 'NORMAL'
      if (regularTutors.length > 0) {
        matchedTutor = regularTutors[0]
      } else if (novelTutors.length > 0) {
        // Fallback para fila de novatos
        assignedQueue = 'NOVEL'
        isFallback = true
        matchedTutor = novelTutors[0]
      }
    }

    return {
      assignedQueue,
      isFallback,
      matchedTutor,
      novelTutors,
      regularTutors,
      totalEligibleTutors: candidates.length,
    }
  }
}
