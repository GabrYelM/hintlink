import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CreateTutoringRequestService } from './create-request.service.js'
import { AcceptRequestService } from './accept-request.service.js'
import { AppError } from '../../shared/errors/app-error.js'
import { prisma } from '../../shared/database/prisma.js'

describe('Tutoring Requests - Unit Tests', () => {
  let mockRequestsRepo: any
  let mockSubjectsRepo: any
  let mockUsersRepo: any
  let mockAcademicRecordsRepo: any

  beforeEach(() => {
    mockRequestsRepo = {
      findById: vi.fn(),
      create: vi.fn(),
      findManyOpen: vi.fn(),
      updateStatus: vi.fn(),
    }
    mockSubjectsRepo = {
      findById: vi.fn(),
    }
    mockUsersRepo = {
      findById: vi.fn(),
    }
    mockAcademicRecordsRepo = {
      findByUserAndSubject: vi.fn(),
    }
  })

  it('deve criar uma solicitação de monitoria com sucesso', async () => {
    mockUsersRepo.findById.mockResolvedValue({ id: 'student-1', role: 'STUDENT' })
    mockSubjectsRepo.findById.mockResolvedValue({ id: 'subj-1', code: 'BC0005', name: 'Bases Matemáticas' })
    mockRequestsRepo.create.mockResolvedValue({
      id: 'req-1',
      studentId: 'student-1',
      subjectId: 'subj-1',
      topic: 'Limites e Derivadas',
      offeredPrice: 25.0,
      durationMinutes: 30,
      status: 'OPEN',
    })

    const service = new CreateTutoringRequestService(mockRequestsRepo, mockSubjectsRepo, mockUsersRepo)

    const result = await service.execute({
      studentId: 'student-1',
      subjectId: 'subj-1',
      topic: 'Limites e Derivadas',
      offeredPrice: 25.0,
      durationMinutes: 30,
    })

    expect(result.tutoringRequest).toBeDefined()
    expect(result.tutoringRequest.status).toBe('OPEN')
    expect(mockRequestsRepo.create).toHaveBeenCalledOnce()
  })

  it('não deve permitir solicitação com preço ofertado menor ou igual a zero', async () => {
    mockUsersRepo.findById.mockResolvedValue({ id: 'student-1' })
    mockSubjectsRepo.findById.mockResolvedValue({ id: 'subj-1' })

    const service = new CreateTutoringRequestService(mockRequestsRepo, mockSubjectsRepo, mockUsersRepo)

    await expect(
      service.execute({
        studentId: 'student-1',
        subjectId: 'subj-1',
        topic: 'Dúvida',
        offeredPrice: 0,
        durationMinutes: 30,
      })
    ).rejects.toBeInstanceOf(AppError)
  })

  it('não deve permitir que o monitor aceite uma chamada se não tiver a matéria aprovada no histórico', async () => {
    mockRequestsRepo.findById.mockResolvedValue({
      id: 'req-1',
      studentId: 'student-1',
      subjectId: 'subj-1',
      status: 'OPEN',
      offeredPrice: 30,
      durationMinutes: 30,
    })

    // Monitor NÃO tem a matéria aprovada
    mockAcademicRecordsRepo.findByUserAndSubject.mockResolvedValue(null)

    const service = new AcceptRequestService(mockRequestsRepo, mockAcademicRecordsRepo)

    await expect(
      service.execute({
        requestId: 'req-1',
        tutorId: 'tutor-sem-materia',
      })
    ).rejects.toThrow('Você não possui esta matéria aprovada em seu histórico acadêmico para monitorar.')
  })

  it('não deve permitir que o próprio aluno aceite a sua própria solicitação', async () => {
    mockRequestsRepo.findById.mockResolvedValue({
      id: 'req-1',
      studentId: 'same-user',
      subjectId: 'subj-1',
      status: 'OPEN',
    })

    const service = new AcceptRequestService(mockRequestsRepo, mockAcademicRecordsRepo)

    await expect(
      service.execute({
        requestId: 'req-1',
        tutorId: 'same-user',
      })
    ).rejects.toThrow('Você não pode aceitar sua própria solicitação.')
  })

  it('deve aceitar a solicitação e criar sessão quando o monitor possui a matéria aprovada', async () => {
    mockRequestsRepo.findById.mockResolvedValue({
      id: 'req-1',
      studentId: 'student-1',
      subjectId: 'subj-1',
      status: 'OPEN',
      offeredPrice: 30,
      durationMinutes: 30,
    })

    // Monitor TEM a matéria aprovada
    mockAcademicRecordsRepo.findByUserAndSubject.mockResolvedValue({
      id: 'record-1',
      userId: 'tutor-1',
      subjectId: 'subj-1',
      isApproved: true,
      concept: 'A',
    })

    // Mock Prisma Transaction
    const mockSession = { id: 'session-123', status: 'ACTIVE' }
    const mockEscrow = { id: 'escrow-123', status: 'HELD', amount: 30 }
    vi.spyOn(prisma, '$transaction').mockResolvedValue({
      session: mockSession,
      escrow: mockEscrow,
      request: { id: 'req-1', status: 'MATCHED' },
    } as any)

    const service = new AcceptRequestService(mockRequestsRepo, mockAcademicRecordsRepo)

    const result = await service.execute({
      requestId: 'req-1',
      tutorId: 'tutor-1',
    })

    expect(result.session).toBeDefined()
    expect(result.session.status).toBe('ACTIVE')
    expect(result.escrow.status).toBe('HELD')
  })
})
