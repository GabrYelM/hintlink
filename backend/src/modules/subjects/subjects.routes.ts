import { FastifyInstance } from 'fastify'
import { fetchSubjects } from './subjects.controller.js'

export async function subjectsRoutes(app: FastifyInstance) {
  app.get(
    '/subjects',
    {
      schema: {
        tags: ['Catálogo de Matérias'],
        summary: 'Listar disciplinas universitárias',
        description: 'Retorna a lista de matérias cadastradas. Permite filtro por termo de busca (?q=Cálculo), abrangendo sinônimos e equivalências.',
      },
    },
    fetchSubjects
  )
}
