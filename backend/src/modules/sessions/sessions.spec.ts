import { describe, it, expect, beforeEach, vi } from 'vitest'
import { FinishSessionService } from './finish-session.service.js'
import { OpenDisputeService } from './open-dispute.service.js'
import { CancelSessionService } from './cancel-session.service.js'
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

    it('deve abrir disputa de dúvida não sanada apenas com relato textual (sem necessidade de gravação)', async () => {
      mockSessionsRepo.findById.mockResolvedValue({
        id: 'session-2',
        studentId: 'student-2',
        tutorId: 'tutor-2',
        status: 'ACTIVE',
        escrow: { id: 'escrow-2', status: 'HELD' },
        ticket: null,
      })

      const createdTicket = {
        id: 'ticket-2',
        sessionId: 'session-2',
        openedByUserId: 'student-2',
        reason: 'O monitor não compareceu.',
        recordingUrl: null,
        status: 'OPEN',
      }

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        return callback({
          tutoringSession: { update: vi.fn().mockResolvedValue({ id: 'session-2', status: 'DISPUTED' }) },
          escrowTransaction: { update: vi.fn().mockResolvedValue({ id: 'escrow-2', status: 'HELD' }) },
          disputeTicket: { create: vi.fn().mockResolvedValue(createdTicket) },
        })
      })

      const service = new OpenDisputeService(mockSessionsRepo)
      const result = await service.execute({
        sessionId: 'session-2',
        userId: 'student-2',
        reason: 'O monitor não compareceu.',
      })

      expect(result.ticket).toBeDefined()
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

  describe('CancelSessionService (Reembolso 50% Aluno / 100% Monitor)', () => {
    it('deve reembolsar 50% do valor ao aluno quando o próprio ALUNO cancelar a aula', async () => {
      mockSessionsRepo.findById.mockResolvedValue({
        id: 'session-cancel-1',
        requestId: 'req-1',
        studentId: 'student-1',
        tutorId: 'tutor-1',
        status: 'ACTIVE',
        request: { topic: 'Cálculo 1', offeredPrice: 30.0 },
        escrow: { id: 'escrow-1', status: 'HELD', amount: 30.0 },
      })

      const userUpdateMock = vi.fn().mockResolvedValue({ id: 'student-1', credits: 15.0 })
      const creditTxCreateMock = vi.fn().mockResolvedValue({})

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        return callback({
          tutoringSession: {
            update: vi.fn().mockResolvedValue({ id: 'session-cancel-1', status: 'CANCELLED' }),
          },
          escrowTransaction: { update: vi.fn() },
          tutoringRequest: { update: vi.fn() },
          user: { update: userUpdateMock },
          creditTransaction: { create: creditTxCreateMock },
        })
      })

      const service = new CancelSessionService(mockSessionsRepo)
      const result = await service.execute({
        sessionId: 'session-cancel-1',
        userId: 'student-1',
      })

      expect(result.cancelledBy).toBe('STUDENT')
      expect(result.refundPercentage).toBe(50)
      expect(result.refundAmount).toBe(15.0)
      expect(userUpdateMock).toHaveBeenCalledWith({
        where: { id: 'student-1' },
        data: { credits: { increment: 15.0 } },
      })
    })

    it('deve reembolsar 100% do valor ao aluno quando o MONITOR cancelar a aula', async () => {
      mockSessionsRepo.findById.mockResolvedValue({
        id: 'session-cancel-2',
        requestId: 'req-2',
        studentId: 'student-1',
        tutorId: 'tutor-1',
        status: 'ACTIVE',
        request: { topic: 'Física Quântica', offeredPrice: 30.0 },
        escrow: { id: 'escrow-2', status: 'HELD', amount: 30.0 },
      })

      const userUpdateMock = vi.fn().mockResolvedValue({ id: 'student-1', credits: 30.0 })
      const creditTxCreateMock = vi.fn().mockResolvedValue({})

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        return callback({
          tutoringSession: {
            update: vi.fn().mockResolvedValue({ id: 'session-cancel-2', status: 'CANCELLED' }),
          },
          escrowTransaction: { update: vi.fn() },
          tutoringRequest: { update: vi.fn() },
          user: { update: userUpdateMock },
          creditTransaction: { create: creditTxCreateMock },
        })
      })

      const service = new CancelSessionService(mockSessionsRepo)
      const result = await service.execute({
        sessionId: 'session-cancel-2',
        userId: 'tutor-1',
      })

      expect(result.cancelledBy).toBe('TUTOR')
      expect(result.refundPercentage).toBe(100)
      expect(result.refundAmount).toBe(30.0)
      expect(userUpdateMock).toHaveBeenCalledWith({
        where: { id: 'student-1' },
        data: { credits: { increment: 30.0 } },
      })
    })
  })
})
