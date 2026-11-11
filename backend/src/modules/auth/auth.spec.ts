import { describe, it, expect, beforeEach, vi } from 'vitest'
import { RegisterUserService } from '../users/register.service.js'
import { AppError } from '../../shared/errors/app-error.js'

describe('Auth & User Registration - Unit Tests', () => {
  let mockUsersRepo: any

  beforeEach(() => {
    mockUsersRepo = {
      findByCpf: vi.fn().mockResolvedValue(null),
      findByEmail: vi.fn().mockResolvedValue(null),
      findByUsername: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async (data: any) => ({
        id: 'user-uuid-1',
        name: data.name,
        email: data.email,
        cpf: data.cpf,
        role: data.role,
        rating: 5.0,
        totalReviews: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    }
  })

  it('deve aceitar qualquer e-mail válido para cadastro (ex: gmail, hotmail, empresa ou ufabc)', async () => {
    const service = new RegisterUserService(mockUsersRepo)

    const emailsParaTestar = [
      'aluno.qualquer@gmail.com',
      'monitor.teste@hotmail.com',
      'desenvolvedor@empresa.com.br',
      'estudante@aluno.ufabc.edu.br',
      'professor.doutor@outlook.com',
    ]

    for (const email of emailsParaTestar) {
      mockUsersRepo.findByEmail.mockResolvedValueOnce(null)
      mockUsersRepo.findByCpf.mockResolvedValueOnce(null)

      const response = await service.execute({
        name: 'Usuário Teste',
        email,
        cpf: '52998224725', // CPF válido para teste
        password: 'password123',
        role: 'STUDENT',
      })

      expect(response.user).toBeDefined()
      expect(response.user.email).toBe(email)
    }
  })

  it('não deve permitir cadastro com e-mail já existente', async () => {
    mockUsersRepo.findByEmail.mockResolvedValue({ id: 'existing', email: 'repetido@gmail.com' })

    const service = new RegisterUserService(mockUsersRepo)

    await expect(
      service.execute({
        name: 'Outro Usuário',
        email: 'repetido@gmail.com',
        cpf: '52998224725',
        password: 'password123',
        role: 'STUDENT',
      })
    ).rejects.toThrow('E-mail já cadastrado.')
  })

  it('não deve permitir cadastro com CPF inválido', async () => {
    const service = new RegisterUserService(mockUsersRepo)

    await expect(
      service.execute({
        name: 'Usuário Invalido',
        email: 'valido@gmail.com',
        cpf: '000.000.000-00', // CPF inválido
        password: 'password123',
        role: 'STUDENT',
      })
    ).rejects.toThrow('CPF inválido.')
  })
})
