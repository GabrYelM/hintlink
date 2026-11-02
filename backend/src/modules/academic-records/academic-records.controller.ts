import { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { AcademicRecordsRepository } from './academic-records.repository.js'
import { SubjectsRepository } from '../subjects/subjects.repository.js'
import { UsersRepository } from '../users/users.repository.js'
import { AddTutorSubjectService } from './add-tutor-subject.service.js'

export async function addTutorSubject(request: FastifyRequest, reply: FastifyReply) {
  const addSubjectBodySchema = z.object({
    subjectId: z.string().uuid('ID de matéria inválido'),
    grade: z.number().min(0).max(10).optional(),
    proofDocumentUrl: z.string().url().optional(),
  })

  const { subjectId, grade, proofDocumentUrl } = addSubjectBodySchema.parse(request.body)

  const academicRecordsRepository = new AcademicRecordsRepository()
  const subjectsRepository = new SubjectsRepository()
  const usersRepository = new UsersRepository()

  const addTutorSubjectService = new AddTutorSubjectService(
    academicRecordsRepository,
    subjectsRepository,
    usersRepository
  )

  const { academicRecord } = await addTutorSubjectService.execute({
    userId: request.user.sub,
    subjectId,
    grade,
    proofDocumentUrl,
  })

  return reply.status(201).send({
    academicRecord,
  })
}

export async function getTutorSubjects(request: FastifyRequest, reply: FastifyReply) {
  const academicRecordsRepository = new AcademicRecordsRepository()
  const records = await academicRecordsRepository.findManyByUserId(request.user.sub)

  return reply.status(200).send({
    records,
  })
}
