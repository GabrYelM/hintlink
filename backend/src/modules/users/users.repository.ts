import { Role, User } from '@prisma/client'
import { prisma } from '../../shared/database/prisma.js'

export interface CreateUserData {
  name: string
  email: string
  cpf: string
  passwordHash: string
  role: Role
}

export class UsersRepository {
  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { email },
    })
  }

  async findByCpf(cpf: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { cpf },
    })
  }

  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id },
    })
  }

  async create(data: CreateUserData): Promise<User> {
    return prisma.user.create({
      data,
    })
  }
}
