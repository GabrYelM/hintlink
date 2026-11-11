import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CreateTutoringRequestService } from './create-request.service.js'
import { AcceptRequestService } from './accept-request.service.js'
import { RejectTutorService } from './reject-tutor.service.js'
import {
  MatchmakingService,
  determineTargetQueue,
  isNovelTutor,
  sortTutorsByRating,
  resetGlobalRequestSequence,
  TutorCandidate,
} from './matchmaking.service.js'
import { calculatePriceByDuration } from '../../shared/utils/pricing.js'
import { AppError } from '../../shared/errors/app-error.js'
import { prisma } from '../../shared/database/prisma.js'

describe('Tutoring Requests - Unit Tests', () => {
  let mockRequestsRepo: any
  let mockSubjectsRepo: any
  let mockUsersRepo: any
  let mockAcademicRecordsRepo: any

  beforeEach(() => {
    resetGlobalRequestSequence()
    mockRequestsRepo = {
      findById: vi.fn(),
      create: vi.fn(),
      findManyOpen: vi.fn(),
      updateStatus: vi.fn(),
      addRejectedTutor: vi.fn(),
    }
    mockSubjectsRepo = {
      findById: vi.fn(),
    }
    mockUsersRepo = {
      findById: vi.fn(),
      countFinishedSessions: vi.fn().mockResolvedValue(0),
    }
    mockAcademicRecordsRepo = {
      findByUserAndSubject: vi.fn(),
    }
  })

  describe('1. Cobrança Baseada no Tempo da Aula (Pricing - R$ 30,00/hora)', () => {
    it('deve calcular o valor correto com base em R$ 30/hora (R$ 0,50/min) para 15, 30, 45, 60 e excedentes', () => {
      expect(calculatePriceByDuration(15)).toBe(7.5)
      expect(calculatePriceByDuration(30)).toBe(15.0)
      expect(calculatePriceByDuration(45)).toBe(22.5)
      expect(calculatePriceByDuration(60)).toBe(30.0)
      // 90 minutos: 90 * 0.50 = R$ 45,00
      expect(calculatePriceByDuration(90)).toBe(45.0)
    })

    it('deve rejeitar duração menor que 15 minutos na regra de preço', () => {
      expect(() => calculatePriceByDuration(10)).toThrow('A duração mínima de monitoria é de 15 minutos.')
    })

    it('o sistema deve calcular o preço automaticamente na criação do chamado sem input de preço do aluno', async () => {
      mockUsersRepo.findById.mockResolvedValue({ id: 'student-1', role: 'STUDENT' })
      mockSubjectsRepo.findById.mockResolvedValue({ id: 'subj-1', code: 'BC0005', name: 'Bases Matemáticas' })
      mockRequestsRepo.create.mockImplementation(async (data: any) => ({
        id: 'req-1',
        ...data,
      }))

      const service = new CreateTutoringRequestService(mockRequestsRepo, mockSubjectsRepo, mockUsersRepo)

      const result = await service.execute({
        studentId: 'student-1',
        subjectId: 'subj-1',
        topic: 'Limites e Derivadas',
        durationMinutes: 30, // Aluno só define a duração
      })

      expect(result.tutoringRequest).toBeDefined()
      expect(result.tutoringRequest.status).toBe('OPEN')
      // Preço calculado automaticamente para 30 minutos: R$ 15,00
      expect(result.tutoringRequest.offeredPrice).toBe(15.0)
      expect(mockRequestsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          durationMinutes: 30,
          offeredPrice: 15.0,
          status: 'OPEN',
        })
      )
    })

    it('não deve permitir solicitação com duração menor que 15 minutos', async () => {
      mockUsersRepo.findById.mockResolvedValue({ id: 'student-1' })
      mockSubjectsRepo.findById.mockResolvedValue({ id: 'subj-1' })

      const service = new CreateTutoringRequestService(mockRequestsRepo, mockSubjectsRepo, mockUsersRepo)

      await expect(
        service.execute({
          studentId: 'student-1',
          subjectId: 'subj-1',
          topic: 'Dúvida Rápida',
          durationMinutes: 10,
        })
      ).rejects.toThrow('A duração mínima de monitoria é de 15 minutos.')
    })
  })

  describe('2. Matchmaking Inteligente, Fila de Novos Monitores e Divisão 50/50', () => {
    it('deve classificar monitor como novo se tiver menos de 5 monitorias realizadas', () => {
      expect(isNovelTutor(0)).toBe(true)
      expect(isNovelTutor(3)).toBe(true)
      expect(isNovelTutor(4)).toBe(true)
      expect(isNovelTutor(5)).toBe(false)
      expect(isNovelTutor(12)).toBe(false)
    })

    it('deve alternar 50% das solicitações para a fila normal e 50% para a fila de novos monitores', () => {
      resetGlobalRequestSequence()
      const queue1 = determineTargetQueue(0)
      const queue2 = determineTargetQueue(1)
      const queue3 = determineTargetQueue(2)
      const queue4 = determineTargetQueue(3)

      expect(queue1).toBe('NORMAL')
      expect(queue2).toBe('NOVEL')
      expect(queue3).toBe('NORMAL')
      expect(queue4).toBe('NOVEL')
    })

    it('deve ordenar monitores por nota (rating decrescente) e desempate por totalReviews', () => {
      const candidates: TutorCandidate[] = [
        { id: '1', name: 'Tutor B', email: 'b@test.com', rating: 4.5, totalReviews: 10, completedSessionsCount: 8, isNovel: false },
        { id: '2', name: 'Tutor A', email: 'a@test.com', rating: 5.0, totalReviews: 2, completedSessionsCount: 2, isNovel: true },
        { id: '3', name: 'Tutor C', email: 'c@test.com', rating: 4.9, totalReviews: 20, completedSessionsCount: 15, isNovel: false },
        { id: '4', name: 'Tutor D', email: 'd@test.com', rating: 4.9, totalReviews: 5, completedSessionsCount: 6, isNovel: false },
      ]

      const sorted = sortTutorsByRating(candidates)
      expect(sorted[0].name).toBe('Tutor A') // 5.0
      expect(sorted[1].name).toBe('Tutor C') // 4.9 com 20 reviews
      expect(sorted[2].name).toBe('Tutor D') // 4.9 com 5 reviews
      expect(sorted[3].name).toBe('Tutor B') // 4.5
    })

    it('deve realizar fallback para fila NORMAL quando fila NOVEL não possuir monitores disponíveis', async () => {
      const matchmakingService = new MatchmakingService()

      // Mock de registros aprovados no banco apenas com monitores veteranos (>= 5 monitorias)
      vi.spyOn(prisma.academicRecord, 'findMany').mockResolvedValue([
        {
          id: 'rec-1',
          subjectId: 'subj-1',
          userId: 'vet-1',
          isApproved: true,
          user: {
            id: 'vet-1',
            name: 'Monitor Experiente',
            email: 'vet@test.com',
            role: 'TUTOR',
            rating: 4.9,
            totalReviews: 10,
            avatarUrl: null,
            sessionsAsTutor: [{ id: 's1' }, { id: 's2' }, { id: 's3' }, { id: 's4' }, { id: 's5' }], // 5 monitorias = normal
          },
        },
      ] as any)

      // Solicitação roteada para a fila de novatos (requestIndex ímpar)
      const result = await matchmakingService.execute({
        subjectId: 'subj-1',
        studentId: 'student-1',
        requestIndex: 1, // ALVO: NOVEL
      })

      // Como não há novatos, o sistema faz fallback para NORMAL
      expect(result.assignedQueue).toBe('NORMAL')
      expect(result.isFallback).toBe(true)
      expect(result.matchedTutor?.id).toBe('vet-1')
    })
  })

  describe('3. Aceite, Notificação e Recusa de Monitor pelo Aluno', () => {
    it('deve aceitar a solicitação, criar sessão e retornar o sumário completo do monitor', async () => {
      mockRequestsRepo.findById.mockResolvedValue({
        id: 'req-1',
        studentId: 'student-1',
        subjectId: 'subj-1',
        status: 'OPEN',
        offeredPrice: 25.0,
        durationMinutes: 30,
        rejectedTutorIds: [],
      })

      mockAcademicRecordsRepo.findByUserAndSubject.mockResolvedValue({
        id: 'record-1',
        userId: 'tutor-1',
        subjectId: 'subj-1',
        isApproved: true,
      })

      mockUsersRepo.findById.mockResolvedValue({
        id: 'tutor-1',
        name: 'Carlos Monitor',
        email: 'carlos@test.com',
        rating: 4.8,
        totalReviews: 6,
      })
      mockUsersRepo.countFinishedSessions.mockResolvedValue(6)

      const mockSession = { id: 'session-123', status: 'ACTIVE' }
      const mockEscrow = { id: 'escrow-123', status: 'HELD', amount: 25.0 }
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        return callback({
          tutoringRequest: { update: vi.fn().mockResolvedValue({ id: 'req-1', status: 'MATCHED' }) },
          tutoringSession: { create: vi.fn().mockResolvedValue(mockSession) },
          escrowTransaction: { create: vi.fn().mockResolvedValue(mockEscrow) },
        })
      })

      const service = new AcceptRequestService(mockRequestsRepo, mockAcademicRecordsRepo, mockUsersRepo)

      const result = await service.execute({
        requestId: 'req-1',
        tutorId: 'tutor-1',
      })

      expect(result.session).toBeDefined()
      expect(result.tutor).toBeDefined()
      expect(result.tutor.name).toBe('Carlos Monitor')
      expect(result.tutor.rating).toBe(4.8)
      expect(result.tutor.isNovel).toBe(false) // 6 monitorias = experiente
    })

    it('não deve permitir que um monitor que foi previamente recusado pelo aluno aceite novamente o mesmo chamado', async () => {
      mockRequestsRepo.findById.mockResolvedValue({
        id: 'req-1',
        studentId: 'student-1',
        subjectId: 'subj-1',
        status: 'OPEN',
        rejectedTutorIds: ['tutor-recusado-anteriormente'],
      })

      const service = new AcceptRequestService(mockRequestsRepo, mockAcademicRecordsRepo, mockUsersRepo)

      await expect(
        service.execute({
          requestId: 'req-1',
          tutorId: 'tutor-recusado-anteriormente',
        })
      ).rejects.toThrow('Você foi recusado pelo aluno para este chamado e não pode aceitá-lo novamente.')
    })

    it('deve permitir que o aluno recuse o monitor que aceitou, reabrindo o chamado para novos monitores', async () => {
      mockRequestsRepo.findById.mockResolvedValue({
        id: 'req-1',
        studentId: 'student-1',
        subjectId: 'subj-1',
        topic: 'Cálculo',
        durationMinutes: 30,
        offeredPrice: 25.0,
        status: 'MATCHED',
        rejectedTutorIds: [],
      })

      vi.spyOn(prisma.tutoringSession, 'findUnique').mockResolvedValue({
        id: 'session-123',
        requestId: 'req-1',
        tutorId: 'tutor-indesejado',
        escrow: { id: 'escrow-1' },
      } as any)

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        return callback({
          escrowTransaction: { delete: vi.fn() },
          tutoringSession: { delete: vi.fn() },
          tutoringRequest: {
            update: vi.fn().mockResolvedValue({
              id: 'req-1',
              studentId: 'student-1',
              subjectId: 'subj-1',
              status: 'OPEN',
              rejectedTutorIds: ['tutor-indesejado'],
            }),
          },
        })
      })

      const mockMatchmaking = {
        execute: vi.fn().mockResolvedValue({
          assignedQueue: 'NORMAL',
          matchedTutor: { id: 'novo-tutor' },
        }),
      } as any

      const service = new RejectTutorService(mockRequestsRepo, mockMatchmaking)

      const result = await service.execute({
        requestId: 'req-1',
        studentId: 'student-1',
        tutorId: 'tutor-indesejado',
      })

      expect(result.message).toContain('Monitor recusado com sucesso')
      expect(result.rejectedTutorId).toBe('tutor-indesejado')
      expect(result.request.status).toBe('OPEN')
      expect(result.request.rejectedTutorIds).toContain('tutor-indesejado')
    })

    it('não deve permitir que outro usuário além do aluno dono do chamado recuse o monitor', async () => {
      mockRequestsRepo.findById.mockResolvedValue({
        id: 'req-1',
        studentId: 'student-verdadeiro',
        status: 'MATCHED',
      })

      const service = new RejectTutorService(mockRequestsRepo)

      await expect(
        service.execute({
          requestId: 'req-1',
          studentId: 'outro-usuario-intruso',
          tutorId: 'tutor-1',
        })
      ).rejects.toThrow('Apenas o aluno dono do chamado pode recusar o monitor.')
    })
  })
})
