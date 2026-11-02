import { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { AcademicRecordsRepository } from './academic-records.repository.js'
import { SubjectsRepository } from '../subjects/subjects.repository.js'
import { UsersRepository } from '../users/users.repository.js'
import { AddTutorSubjectService } from './add-tutor-subject.service.js'
import { ImportTranscriptService } from './import-transcript.service.js'
import { AppError } from '../../shared/errors/app-error.js'

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

export async function uploadTranscript(request: FastifyRequest, reply: FastifyReply) {
  const file = await request.file()

  if (!file) {
    throw new AppError('Nenhum arquivo enviado. Selecione o arquivo PDF do seu histórico escolar.', 400)
  }

  if (file.mimetype !== 'application/pdf') {
    throw new AppError('Formato inválido. Apenas arquivos PDF são aceitos.', 400)
  }

  const buffer = await file.toBuffer()
  const importService = new ImportTranscriptService()

  const result = await importService.execute({
    userId: request.user.sub,
    pdfBuffer: buffer,
  })

  return reply.status(200).send({
    message: `Histórico validado com sucesso! ${result.totalApproved} matérias aprovadas foram vinculadas ao seu perfil.`,
    ...result,
  })
}
