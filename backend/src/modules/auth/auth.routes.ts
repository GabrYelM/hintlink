import { FastifyInstance } from 'fastify'
import {
  authenticate,
  depositCredits,
  getCredits,
  profile,
  register,
  toggleRole,
  updateAvailability,
  withdrawCredits,
} from './auth.controller.js'
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

  app.put(
    '/me/availability',
    {
      onRequest: [verifyJwt],
      schema: {
        tags: ['Autenticação & Usuários'],
        summary: 'Atualizar dias e horários de disponibilidade do monitor',
        description: 'Salva ou altera a grade de dias e horários disponíveis do monitor no perfil.',
        security: [{ bearerAuth: [] }],
      },
    },
    updateAvailability
  )

  app.get(
    '/credits',
    {
      onRequest: [verifyJwt],
      schema: {
        tags: ['Carteira & Créditos'],
        summary: 'Consultar saldo de créditos e extrato',
        description: 'Retorna o saldo atual de créditos do usuário (Aluno ou Monitor) e o histórico de movimentações.',
        security: [{ bearerAuth: [] }],
      },
    },
    getCredits
  )

  app.post(
    '/credits/deposit',
    {
      onRequest: [verifyJwt],
      schema: {
        tags: ['Carteira & Créditos'],
        summary: 'Adicionar créditos na carteira (Aluno)',
        description: 'Permite que o aluno adicione créditos (Pix ou Cartão simulado) para pagar pelas aulas.',
        security: [{ bearerAuth: [] }],
      },
    },
    depositCredits
  )

  app.post(
    '/credits/withdraw',
    {
      onRequest: [verifyJwt],
      schema: {
        tags: ['Carteira & Créditos'],
        summary: 'Sacar créditos recebidos via Pix (Monitor)',
        description: 'Permite que o monitor transfira seus créditos acumulados em monitorias para sua chave Pix.',
        security: [{ bearerAuth: [] }],
      },
    },
    withdrawCredits
  )
}
