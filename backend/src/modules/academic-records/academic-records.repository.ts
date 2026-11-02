import { AcademicRecord } from '@prisma/client'
import { prisma } from '../../shared/database/prisma.js'

export interface CreateAcademicRecordData {
  userId: string
  subjectId: string
  grade?: number
  proofDocumentUrl?: string
  isApproved?: boolean
}

export class AcademicRecordsRepository {
  async findByUserAndSubject(userId: string, subjectId: string): Promise<AcademicRecord | null> {
    return prisma.academicRecord.findUnique({
      where: {
        userId_subjectId: {
          userId,
          subjectId,
        },
      },
    })
  }

  async findManyByUserId(userId: string) {
    return prisma.academicRecord.findMany({
      where: { userId },
      include: {
        subject: true,
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async create(data: CreateAcademicRecordData): Promise<AcademicRecord> {
    return prisma.academicRecord.create({
      data,
    })
  }

  async delete(userId: string, subjectId: string): Promise<AcademicRecord> {
    return prisma.academicRecord.delete({
      where: {
        userId_subjectId: {
          userId,
          subjectId,
        },
      },
    })
  }
}
