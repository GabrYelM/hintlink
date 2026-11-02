import { FastifyInstance } from 'fastify'
import { authenticate, profile, register, toggleRole } from './auth.controller.js'
import { verifyJwt } from '../../shared/middlewares/verify-jwt.js'

export async function authRoutes(app: FastifyInstance) {
  app.post(
    '/auth/register',
    {
      schema: {
        tags: ['Autenticação & Usuários'],
        summary: 'Cadastro de usuário',
        description: 'Cadastra um Aluno (STUDENT) ou Monitor (TUTOR) com validação de CPF e senha criptografada.',
      },
    },
    register
  )

  app.post(
    '/auth/login',
    {
      schema: {
        tags: ['Autenticação & Usuários'],
        summary: 'Login do usuário',
        description: 'Autentica com e-mail e senha e retorna o Bearer Token JWT.',
      },
    },
    authenticate
  )

  app.get(
    '/me',
    {
      onRequest: [verifyJwt],
      schema: {
        tags: ['Autenticação & Usuários'],
        summary: 'Perfil do usuário logado',
        description: 'Retorna os dados cadastrais e estatísticas do usuário autenticado.',
        security: [{ bearerAuth: [] }],
      },
    },
    profile
  )

  app.patch(
    '/me/role',
    {
      onRequest: [verifyJwt],
      schema: {
        tags: ['Autenticação & Usuários'],
        summary: 'Alternar tipo de perfil (Aluno <-> Monitor)',
        description: 'Permite ao estudante se tornar monitor ou alternar seu papel ativo no sistema.',
        security: [{ bearerAuth: [] }],
      },
    },
    toggleRole
  )
}
