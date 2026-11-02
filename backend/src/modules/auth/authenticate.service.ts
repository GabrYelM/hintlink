import bcrypt from 'bcryptjs'
import { User } from '@prisma/client'
import { UsersRepository } from '../users/users.repository.js'
import { AppError } from '../../shared/errors/app-error.js'

interface AuthenticateRequest {
  login: string // Pode ser e-mail ou username
  password: string
}

interface AuthenticateResponse {
  user: Omit<User, 'passwordHash'>
}

export class AuthenticateService {
  constructor(private usersRepository: UsersRepository) {}

  async execute({ login, password }: AuthenticateRequest): Promise<AuthenticateResponse> {
    const user = await this.usersRepository.findByEmailOrUsername(login)

    if (!user) {
      throw new AppError('Credenciais inválidas.', 401)
    }

    const doesPasswordMatch = await bcrypt.compare(password, user.passwordHash)

    if (!doesPasswordMatch) {
      throw new AppError('Credenciais inválidas.', 401)
    }

    const { passwordHash: _, ...userWithoutPassword } = user

    return {
      user: userWithoutPassword,
    }
  }
}
