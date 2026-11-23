import { FastifyInstance } from 'fastify'
import {
  finishSession,
  getActiveSession,
  getSession,
  openDispute,
  disputeWithRecording,
  startSessionCall,
  cancelSession,
  getMoodleChatOverview,
  sendDirectChatMessage,
  requestDirectLessonFromChat,
} from './sessions.controller.js'
import { verifyJwt } from '../../shared/middlewares/verify-jwt.js'

export async function sessionsRoutes(app: FastifyInstance) {
  app.post(
    '/chat/direct/:partnerId/request-lesson',
    {
      onRequest: [verifyJwt],
      schema: {
        tags: ['Sessões & Sala Virtual'],
        summary: 'Solicitar aula direta com um monitor do chat (+15% por hora)',
        description: 'Permite ao aluno solicitar diretamente uma aula com um monitor com quem já teve contato no chat, pagando +15% sobre a hora-aula padrão (R$ 34,50/h).',
        security: [{ bearerAuth: [] }],
      },
    },
    requestDirectLessonFromChat
  )
  app.get(
    '/chat/moodle',
    {
      onRequest: [verifyJwt],
      schema: {
        tags: ['Sessões & Sala Virtual'],
        summary: 'Listar conversas e monitores (Chat estilo Moodle)',
        description: 'Retorna todas as sessões ativas e a lista de monitores/contatos com histórico de mensagens diretas.',
        security: [{ bearerAuth: [] }],
      },
    },
    getMoodleChatOverview
  )

  app.post(
    '/chat/direct/:partnerId',
    {
      onRequest: [verifyJwt],
      schema: {
        tags: ['Sessões & Sala Virtual'],
        summary: 'Enviar mensagem direta a um monitor ou aluno (estilo Moodle)',
        description: 'Envia mensagem direta para qualquer monitor/usuário da plataforma e notifica em tempo real.',
        security: [{ bearerAuth: [] }],
      },
    },
    sendDirectChatMessage
  )

  app.post(
    '/sessions/:id/cancel',
    {
      onRequest: [verifyJwt],
      schema: {
        tags: ['Sessões & Sala Virtual'],
        summary: 'Cancelar aula agendada (Aluno: 50% reembolso | Monitor: 100% reembolso ao aluno)',
        description: 'Cancela a sessão ativa. Se cancelada pelo aluno, estorna 50% dos créditos; se cancelada pelo monitor, estorna 100% dos créditos ao aluno.',
        security: [{ bearerAuth: [] }],
      },
    },
    cancelSession
  )
  app.patch(
    '/sessions/:id/start-call',
    {
      onRequest: [verifyJwt],
      schema: {
        tags: ['Sessões & Sala Virtual'],
        summary: 'Iniciar chamada de vídeo (Apenas Aluno)',
        description: 'Marca a chamada da monitoria como iniciada pelo aluno, liberando a entrada do monitor e iniciando a contagem do tempo.',
        security: [{ bearerAuth: [] }],
      },
    },
    startSessionCall
  )
  app.get(
    '/sessions/active',
    {
      onRequest: [verifyJwt],
      schema: {
        tags: ['Sessões & Sala Virtual'],
        summary: 'Verificar sessão em andamento',
        description: 'Verifica se o usuário logado tem alguma monitoria ocorrendo neste momento.',
        security: [{ bearerAuth: [] }],
      },
    },
    getActiveSession
  )

  app.get(
    '/sessions/:id',
    {
      onRequest: [verifyJwt],
      schema: {
        tags: ['Sessões & Sala Virtual'],
        summary: 'Detalhes da sala de monitoria',
        description: 'Retorna participantes, timestamps, status do Pix e dados da sessão.',
        security: [{ bearerAuth: [] }],
      },
    },
    getSession
  )

  app.post(
    '/sessions/:id/finish',
    {
      onRequest: [verifyJwt],
      schema: {
        tags: ['Sessões & Sala Virtual'],
        summary: 'Concluir monitoria & Liberar Pix',
        description: 'Finaliza a aula, registra a avaliação/estrelas dada pelo aluno e libera o saldo em custódia para o monitor.',
        security: [{ bearerAuth: [] }],
      },
    },
    finishSession
  )

  app.post(
    '/sessions/:id/dispute',
    {
      onRequest: [verifyJwt],
      schema: {
        tags: ['Sessões & Sala Virtual'],
        summary: 'Abrir ticket de reclamação',
        description: 'Congela a sessão e o repasse financeiro do Pix para intervenção da administração.',
        security: [{ bearerAuth: [] }],
      },
    },
    openDispute
  )

  app.post(
    '/sessions/:id/dispute-with-recording',
    {
      onRequest: [verifyJwt],
      schema: {
        tags: ['Sessões & Sala Virtual'],
        summary: 'Abrir ticket de reclamação anexando a gravação da videochamada',
        description: 'Envia o vídeo pré-gravado da chamada para ser auditado pela equipe do Hintlink caso a dúvida não tenha sido sanada.',
        security: [{ bearerAuth: [] }],
      },
    },
    disputeWithRecording
  )
}
