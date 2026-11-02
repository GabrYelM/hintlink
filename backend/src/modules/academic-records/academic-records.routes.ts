import { FastifyInstance } from 'fastify'
import { addTutorSubject, getTutorSubjects } from './academic-records.controller.js'
import { verifyJwt } from '../../shared/middlewares/verify-jwt.js'
import { verifyUserRole } from '../../shared/middlewares/verify-user-role.js'

export async function academicRecordsRoutes(app: FastifyInstance) {
  // Rotas restritas para monitores autenticados
  app.post(
    '/tutors/subjects',
    { onRequest: [verifyJwt, verifyUserRole(['TUTOR', 'ADMIN'])] },
    addTutorSubject
  )

  app.get(
    '/tutors/subjects',
    { onRequest: [verifyJwt] },
    getTutorSubjects
  )
}
