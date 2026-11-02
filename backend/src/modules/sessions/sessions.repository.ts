import { prisma } from '../../shared/database/prisma.js'

export class SessionsRepository {
  async findById(id: string) {
    return prisma.tutoringSession.findUnique({
      where: { id },
      include: {
        request: {
          include: {
            subject: true,
          },
        },
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            rating: true,
            avatarUrl: true,
          },
        },
        tutor: {
          select: {
            id: true,
            name: true,
            email: true,
            rating: true,
            avatarUrl: true,
          },
        },
        escrow: true,
        ticket: true,
      },
    })
  }

  async updateWhiteboard(id: string, whiteboardData: any) {
    return prisma.tutoringSession.update({
      where: { id },
      data: { whiteboardData },
    })
  }

  async finishSession(id: string, studentRating?: number, studentFeedback?: string) {
    return prisma.tutoringSession.update({
      where: { id },
      data: {
        status: 'FINISHED',
        endedAt: new Date(),
        studentRating,
        studentFeedback,
      },
    })
  }

  async findActiveByUserId(userId: string) {
    return prisma.tutoringSession.findFirst({
      where: {
        status: 'ACTIVE',
        OR: [{ studentId: userId }, { tutorId: userId }],
      },
      include: {
        request: {
          include: {
            subject: true,
          },
        },
        student: {
          select: { id: true, name: true, avatarUrl: true, rating: true },
        },
        tutor: {
          select: { id: true, name: true, avatarUrl: true, rating: true },
        },
        escrow: true,
      },
    })
  }
}
