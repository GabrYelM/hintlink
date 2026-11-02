import { Role, User } from '@prisma/client'
import { prisma } from '../../shared/database/prisma.js'

export interface CreateUserData {
  name: string
  username?: string
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

  async findByUsername(username: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { username },
    })
  }

  async findByEmailOrUsername(identifier: string): Promise<User | null> {
    return prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { username: identifier.toLowerCase() },
        ],
      },
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

  async updateRole(id: string, role: Role): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: { role },
    })
  }
}
