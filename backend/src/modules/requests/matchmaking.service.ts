import { prisma } from '../../shared/database/prisma.js'

export interface TutorCandidate {
  id: string
  name: string
  email: string
  avatarUrl?: string | null
  rating: number
  totalReviews: number
  completedSessionsCount: number
  isNovel: boolean // true se < 5 monitorias realizadas
}

export type MatchQueueType = 'NORMAL' | 'NOVEL'

export interface MatchmakingInput {
  requestId?: string
  subjectId: string
  studentId: string
  rejectedTutorIds?: string[]
  requestIndex?: number // contador ou índice para alternância 50/50
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

    // 2. Mapeia e classifica os candidatos
    const candidates: TutorCandidate[] = approvedRecords
      .filter((record) => record.user.role === 'TUTOR' || record.user.role === 'ADMIN')
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
