import { FastifyInstance } from 'fastify'
import { fetchSubjects } from './subjects.controller.js'

export async function subjectsRoutes(app: FastifyInstance) {
  app.get('/subjects', fetchSubjects)
}
