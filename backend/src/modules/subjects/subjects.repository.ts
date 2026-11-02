import { Subject } from '@prisma/client'
import { prisma } from '../../shared/database/prisma.js'

export class SubjectsRepository {
  async findAll(query?: string): Promise<Subject[]> {
    if (!query) {
      return prisma.subject.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      })
    }

    const cleanQuery = query.trim()

    return prisma.subject.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { contains: cleanQuery, mode: 'insensitive' } },
          { code: { contains: cleanQuery, mode: 'insensitive' } },
          { aliases: { hasSome: [cleanQuery] } },
        ],
      },
      orderBy: { name: 'asc' },
    })
  }

  async findById(id: string): Promise<Subject | null> {
    return prisma.subject.findUnique({
      where: { id },
    })
  }

  async findByCode(code: string): Promise<Subject | null> {
    return prisma.subject.findUnique({
      where: { code },
    })
  }
}
