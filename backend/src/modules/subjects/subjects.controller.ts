import { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { SubjectsRepository } from './subjects.repository.js'
import { FetchSubjectsService } from './fetch-subjects.service.js'

export async function fetchSubjects(request: FastifyRequest, reply: FastifyReply) {
  const fetchQuerySchema = z.object({
    q: z.string().optional(),
  })

  const { q } = fetchQuerySchema.parse(request.query)

  const subjectsRepository = new SubjectsRepository()
  const fetchSubjectsService = new FetchSubjectsService(subjectsRepository)

  const { subjects } = await fetchSubjectsService.execute({
    query: q,
  })

  return reply.status(200).send({
    subjects,
  })
}
