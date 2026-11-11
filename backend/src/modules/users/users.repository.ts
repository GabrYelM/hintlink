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

const DEMO_USERS = [
  {
    name: 'Aluno Demonstração',
    username: 'aluno',
    email: 'aluno@aluno.ufabc.edu.br',
    cpf: '11144477735',
    passwordHash: '$2a$08$uh9fRKO1mN3fs/pygxpPZO7fyhSb/SmO7TEl.M36O1YVyr.KkgcDO',
    role: 'STUDENT' as Role,
  },
  {
    name: 'Lucas Mendes (Monitor)',
    username: 'monitor',
    email: 'monitor@aluno.ufabc.edu.br',
    cpf: '22255588846',
    passwordHash: '$2a$08$uh9fRKO1mN3fs/pygxpPZO7fyhSb/SmO7TEl.M36O1YVyr.KkgcDO',
    role: 'TUTOR' as Role,
    rating: 4.9,
    totalReviews: 8,
  },
  {
    name: 'Rafaela Santos',
    username: 'rafa',
    email: 'rafa@aluno.ufabc.edu.br',
    cpf: '49063199805',
    passwordHash: '$2a$08$uh9fRKO1mN3fs/pygxpPZO7fyhSb/SmO7TEl.M36O1YVyr.KkgcDO',
    role: 'STUDENT' as Role,
  },
  {
    name: 'Gabryel Gomes Martins',
    username: 'thefirst',
    email: 'gabryel.m@aluno.ufabc.edu.br',
    cpf: '49063244878',
    passwordHash: '$2a$08$uh9fRKO1mN3fs/pygxpPZO7fyhSb/SmO7TEl.M36O1YVyr.KkgcDO',
    role: 'TUTOR' as Role,
    rating: 5.0,
    totalReviews: 3,
  },
]

export class UsersRepository {
  private async ensureDemoUsers() {
    try {
      for (const demo of DEMO_USERS) {
        await prisma.user.upsert({
          where: { email: demo.email },
          update: {},
          create: demo,
        })
      }
    } catch (err) {
      console.warn('Falha ao auto-popular usuários de demonstração:', err)
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    const clean = email.trim()
    return prisma.user.findFirst({
      where: { email: { equals: clean, mode: 'insensitive' } },
    })
  }

  async findByUsername(username: string): Promise<User | null> {
    const clean = username.trim()
    return prisma.user.findFirst({
      where: { username: { equals: clean, mode: 'insensitive' } },
    })
  }

  async findByEmailOrUsername(identifier: string): Promise<User | null> {
    const clean = identifier.trim()
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: clean, mode: 'insensitive' } },
          { username: { equals: clean, mode: 'insensitive' } },
        ],
      },
    })

    if (!user) {
      await this.ensureDemoUsers()
      user = await prisma.user.findFirst({
        where: {
          OR: [
            { email: { equals: clean, mode: 'insensitive' } },
            { username: { equals: clean, mode: 'insensitive' } },
          ],
        },
      })
    }

    return user
  }

  async findByCpf(cpf: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { cpf: cpf.trim() },
    })
  }

  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id },
    })
  }

  async countFinishedSessions(userId: string): Promise<number> {
    return prisma.tutoringSession.count({
      where: { tutorId: userId, status: 'FINISHED' },
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
