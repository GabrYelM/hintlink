import { Prisma, TutoringRequest } from '@prisma/client'
import { prisma } from '../../shared/database/prisma.js'

export class RequestsRepository {
  async create(data: Prisma.TutoringRequestUncheckedCreateInput): Promise<TutoringRequest> {
    return prisma.tutoringRequest.create({
      data,
    })
  }

  async findById(id: string) {
    return prisma.tutoringRequest.findUnique({
      where: { id },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            rating: true,
            avatarUrl: true,
          },
        },
        subject: true,
      },
    })
  }

  async findManyOpen(subjectIds?: string[]) {
    return prisma.tutoringRequest.findMany({
      where: {
        status: 'OPEN',
        ...(subjectIds && subjectIds.length > 0
          ? { subjectId: { in: subjectIds } }
          : {}),
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            rating: true,
            avatarUrl: true,
          },
        },
        subject: true,
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async findManyByStudentId(studentId: string) {
    return prisma.tutoringRequest.findMany({
      where: { studentId },
      include: {
        subject: true,
        session: true,
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async updateStatus(id: string, status: 'OPEN' | 'MATCHED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED') {
    return prisma.tutoringRequest.update({
      where: { id },
      data: { status },
    })
  }

  async addRejectedTutor(id: string, tutorId: string) {
    const request = await prisma.tutoringRequest.findUnique({ where: { id } })
    const existingRejected = request?.rejectedTutorIds || []
    return prisma.tutoringRequest.update({
      where: { id },
      data: {
        status: 'OPEN',
        rejectedTutorIds: Array.from(new Set([...existingRejected, tutorId])),
      },
    })
  }
}
