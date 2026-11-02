import { FastifyInstance } from 'fastify'
import { addTutorSubject, getTutorSubjects, uploadTranscript } from './academic-records.controller.js'
import { verifyJwt } from '../../shared/middlewares/verify-jwt.js'
import { verifyUserRole } from '../../shared/middlewares/verify-user-role.js'

export async function academicRecordsRoutes(app: FastifyInstance) {
  app.post(
    '/tutors/upload-transcript',
    {
      onRequest: [verifyJwt, verifyUserRole(['TUTOR', 'ADMIN'])],
      schema: {
        tags: ['Histórico Acadêmico do Monitor'],
        summary: 'Importar histórico escolar em PDF para validar matérias',
        description: 'Recebe o PDF do histórico oficial da universidade, valida a titularidade por CPF e cadastra todas as matérias aprovadas.',
        security: [{ bearerAuth: [] }],
      },
    },
    uploadTranscript
  )

  app.post(
    '/tutors/subjects',
    {
      onRequest: [verifyJwt, verifyUserRole(['TUTOR', 'ADMIN'])],
      schema: {
        tags: ['Histórico Acadêmico do Monitor'],
        summary: 'Vincular matéria lecionada ao histórico',
        description: 'Permite que o monitor submeta uma matéria que já cursou e foi aprovado na faculdade.',
        security: [{ bearerAuth: [] }],
      },
    },
    addTutorSubject
  )

  app.get(
    '/tutors/subjects',
    {
      onRequest: [verifyJwt],
      schema: {
        tags: ['Histórico Acadêmico do Monitor'],
        summary: 'Consultar matérias aptas do monitor',
        description: 'Lista as disciplinas que o monitor autenticado está habilitado a atender.',
        security: [{ bearerAuth: [] }],
      },
    },
    getTutorSubjects
  )
}
