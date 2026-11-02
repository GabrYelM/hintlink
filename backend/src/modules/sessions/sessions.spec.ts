import { describe, it, expect, beforeEach, vi } from 'vitest'
import { FinishSessionService } from './finish-session.service.js'
import { OpenDisputeService } from './open-dispute.service.js'
import { AppError } from '../../shared/errors/app-error.js'
import { prisma } from '../../shared/database/prisma.js'

describe('Sessions & Dispute - Unit Tests', () => {
  let mockSessionsRepo: any

  beforeEach(() => {
    mockSessionsRepo = {
      findById: vi.fn(),
      findActiveByUserId: vi.fn(),
    }
  })

  describe('FinishSessionService', () => {
    it('deve finalizar a sessão com sucesso, liberando a custódia Pix e atualizando avaliação', async () => {
      mockSessionsRepo.findById.mockResolvedValue({
        id: 'session-1',
        studentId: 'student-1',
        tutorId: 'tutor-1',
        status: 'ACTIVE',
        escrow: {
          id: 'escrow-1',
          status: 'HELD',
          amount: 40.0,
        },
      })

      const finishedSession = {
        id: 'session-1',
        status: 'FINISHED',
        studentRating: 5,
        studentFeedback: 'Excelente explicação!',
      }

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        return callback({
          tutoringSession: {
            update: vi.fn().mockResolvedValue(finishedSession),
          },
          escrowTransaction: {
            update: vi.fn().mockResolvedValue({ id: 'escrow-1', status: 'RELEASED_TO_TUTOR' }),
          },
          user: {
            findUnique: vi.fn().mockResolvedValue({ id: 'tutor-1', rating: 5, totalReviews: 1 }),
            update: vi.fn().mockResolvedValue({}),
          },
        })
      })

      const service = new FinishSessionService(mockSessionsRepo)
      const result = await service.execute({
        sessionId: 'session-1',
        userId: 'student-1',
        studentRating: 5,
        studentFeedback: 'Excelente explicação!',
      })

      expect(result.session.status).toBe('FINISHED')
      expect(result.session.studentRating).toBe(5)
    })

    it('não deve permitir finalizar uma sessão que não está ativa', async () => {
      mockSessionsRepo.findById.mockResolvedValue({
        id: 'session-1',
        status: 'FINISHED',
      })

      const service = new FinishSessionService(mockSessionsRepo)

      await expect(
        service.execute({
          sessionId: 'session-1',
          userId: 'student-1',
        })
      ).rejects.toThrow('Esta sessão já foi concluída ou cancelada.')
    })
  })

  describe('OpenDisputeService (com gravação prévia)', () => {
    it('deve abrir disputa, congelar repasse Pix e salvar caminho do vídeo de gravação para ouvidoria', async () => {
      mockSessionsRepo.findById.mockResolvedValue({
        id: 'session-2',
        studentId: 'student-2',
        tutorId: 'tutor-2',
        status: 'ACTIVE',
        escrow: {
          id: 'escrow-2',
          status: 'HELD',
        },
        ticket: null,
      })

      const createdTicket = {
        id: 'ticket-1',
        sessionId: 'session-2',
        openedByUserId: 'student-2',
        reason: 'O monitor não compareceu e não sanou a dúvida.',
        recordingUrl: '/uploads/recordings/session-2-12345.webm',
        status: 'OPEN',
      }

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        return callback({
          tutoringSession: {
            update: vi.fn().mockResolvedValue({ id: 'session-2', status: 'DISPUTED' }),
          },
          escrowTransaction: {
            update: vi.fn().mockResolvedValue({ id: 'escrow-2', status: 'HELD' }),
          },
          disputeTicket: {
            create: vi.fn().mockResolvedValue(createdTicket),
          },
        })
      })

      const service = new OpenDisputeService(mockSessionsRepo)
      const result = await service.execute({
        sessionId: 'session-2',
        userId: 'student-2',
        reason: 'O monitor não compareceu e não sanou a dúvida.',
        recordingUrl: '/uploads/recordings/session-2-12345.webm',
      })

      expect(result.ticket).toBeDefined()
      expect(result.ticket.recordingUrl).toBe('/uploads/recordings/session-2-12345.webm')
      expect(result.ticket.status).toBe('OPEN')
    })

    it('não deve permitir que o monitor ou terceiro abra disputa de dúvida não sanada', async () => {
      mockSessionsRepo.findById.mockResolvedValue({
        id: 'session-2',
        studentId: 'student-2',
        tutorId: 'tutor-2',
      })

      const service = new OpenDisputeService(mockSessionsRepo)

      await expect(
        service.execute({
          sessionId: 'session-2',
          userId: 'tutor-2',
          reason: 'Monitor tentando abrir ticket',
        })
      ).rejects.toThrow('Apenas o aluno da monitoria pode abrir um ticket de reclamação.')
    })
  })
})
