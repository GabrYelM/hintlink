import bcrypt from 'bcryptjs'
import { Role, User } from '@prisma/client'
import { UsersRepository } from './users.repository.js'
import { AppError } from '../../shared/errors/app-error.js'
import { formatCPF, validateCPF } from '../../shared/utils/cpf-validator.js'

interface RegisterUserRequest {
  name: string
  username?: string
  email: string
  cpf: string
  password: string
  role: Role
}

interface RegisterUserResponse {
  user: Omit<User, 'passwordHash'>
}

export class RegisterUserService {
  constructor(private usersRepository: UsersRepository) {}

  async execute({ name, username, email, cpf, password, role }: RegisterUserRequest): Promise<RegisterUserResponse> {
    const cleanCPF = formatCPF(cpf)

    if (!validateCPF(cleanCPF)) {
      throw new AppError('CPF inválido.', 400)
    }

    if (username) {
      const cleanUsername = username.trim().toLowerCase()
      if (cleanUsername.length < 3) {
        throw new AppError('O login de usuário deve ter no mínimo 3 caracteres.', 400)
      }

      const userWithSameUsername = await this.usersRepository.findByUsername(cleanUsername)
      if (userWithSameUsername) {
        throw new AppError('Este login de usuário já está em uso.', 409)
      }
    }

    const userWithSameEmail = await this.usersRepository.findByEmail(email)
    if (userWithSameEmail) {
      throw new AppError('E-mail já cadastrado.', 409)
    }

    const userWithSameCpf = await this.usersRepository.findByCpf(cleanCPF)
    if (userWithSameCpf) {
      throw new AppError('CPF já cadastrado.', 409)
    }

    const passwordHash = await bcrypt.hash(password, 8)

    const user = await this.usersRepository.create({
      name,
      username: username ? username.trim().toLowerCase() : undefined,
      email,
      cpf: cleanCPF,
      passwordHash,
      role,
    })

    const { passwordHash: _, ...userWithoutPassword } = user

    return {
      user: userWithoutPassword,
    }
  }
}
