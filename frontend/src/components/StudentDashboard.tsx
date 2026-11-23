'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/services/api'
import {
  PlusCircle,
  Clock,
  DollarSign,
  CheckCircle,
  BookOpen,
  AlertCircle,
  ArrowRight,
  Video,
  Sparkles,
  MessageSquare,
  XCircle,
  Info,
  CheckCircle2,
  Wallet,
  CreditCard,
  QrCode,
  History,
  Trash2,
  Calendar,
  Bell,
} from 'lucide-react'
import axios from 'axios'
import { VirtualRoom } from './VirtualRoom'
import { ChatMessage } from './SessionChatModal'
import { MoodleChatDrawer, MoodleSessionItem } from './MoodleChatDrawer'
import { useHintlinkSocket } from '@/hooks/use-socket'

const STUDENT_AVAILABLE_DAYS = [
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
  'Domingo',
]

export interface StudentScheduleSlot {
  day: string
  startTime: string
  endTime: string
}

export function calculatePriceByDuration(durationMinutes: number): number {
  const validMinutes = Math.max(1, Number(durationMinutes) || 0)
  return Number((validMinutes * 0.5).toFixed(2))
}

interface Subject {
  id: string
  code: string
  name: string
  aliases: string[]
}

interface TutoringRequestItem {
  id: string
  topic: string
  description?: string
  durationMinutes: number
  offeredPrice: string
  preferredDays?: string[]
  preferredHours?: string
  status: string
  createdAt: string
  subject: {
    code: string
    name: string
  }
}

interface CreditTransactionItem {
  id: string
  type: 'DEPOSIT' | 'ESCROW_HOLD' | 'ESCROW_REFUND' | 'TUTORING_EARNING' | 'WITHDRAWAL'
  amount: string | number
  description: string
  createdAt: string
}

interface StudentUser {
  id: string
  name: string
  email: string
  role: 'STUDENT' | 'TUTOR' | 'ADMIN'
  rating: number
  credits?: number | string
}

interface ActiveSessionData {
  id: string
  status: string
  durationMinutes: number
  startedAt: string
  callStartedAt?: string | null
  request?: {
    topic: string
    offeredPrice: number | string
    subject?: {
      code: string
      name: string
    }
  }
  student?: {
    id: string
    name: string
    rating: number
  }
  tutor?: {
    id: string
    name: string
    rating: number
  }
  escrow?: {
    amount: number | string
    status: string
  }
  chatMessages?: ChatMessage[]
}

interface MatchedTutorNotification {
  requestId: string
  sessionId: string
  tutor: {
    id: string
    name: string
    email?: string
    rating: number
    totalReviews: number
    completedSessionsCount: number
    isNovel: boolean
    avatarUrl?: string | null
    availability?: Array<{ day: string; startTime: string; endTime: string }>
  }
  message?: string
}

export function StudentDashboard({
  user,
  onCreditsChange,
}: {
  user: StudentUser
  onCreditsChange?: (newCredits: number) => void
}) {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [topic, setTopic] = useState('')
  const [description, setDescription] = useState('')
  const [durationHours, setDurationHours] = useState<number>(0)
  const [durationMins, setDurationMins] = useState<number>(30)
  const durationMinutes = Math.max(1, (Number(durationHours) || 0) * 60 + (Number(durationMins) || 0))

  // Horários independentes por dia (ex: Segunda-feira: 14:00 até 19:00, Terça-feira: 12:00 até 20:00)
  const [studentAvailability, setStudentAvailability] = useState<StudentScheduleSlot[]>([
    { day: 'Segunda-feira', startTime: '14:00', endTime: '19:00' },
    { day: 'Terça-feira', startTime: '12:00', endTime: '20:00' },
  ])
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [myRequests, setMyRequests] = useState<TutoringRequestItem[]>([])
  const [unreadChatCount, setUnreadChatCount] = useState(0)
  const [latestNotification, setLatestNotification] = useState<string | null>(null)

  function toggleStudentDay(day: string) {
    setStudentAvailability((prev) => {
      const exists = prev.some((s) => s.day === day)
      if (exists) {
        return prev.filter((s) => s.day !== day)
      }
      return [...prev, { day, startTime: '14:00', endTime: '19:00' }]
    })
  }

  function updateStudentSlotTime(day: string, field: 'startTime' | 'endTime', value: string) {
    setStudentAvailability((prev) =>
      prev.map((s) => (s.day === day ? { ...s, [field]: value } : s))
    )
  }

  // Carteira de Créditos do Aluno
  const [credits, setCredits] = useState<number>(Number(user.credits ?? 0))
  const [transactions, setTransactions] = useState<CreditTransactionItem[]>([])
  const [isAddCreditsModalOpen, setIsAddCreditsModalOpen] = useState(false)
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false)
  const [depositAmount, setDepositAmount] = useState<number>(30)
  const [paymentMethod, setPaymentMethod] = useState<'PIX' | 'CARD'>('PIX')
  const [isDepositing, setIsDepositing] = useState(false)
  const [cancellingRequestId, setCancellingRequestId] = useState<string | null>(null)

  // Modal de notificação de monitor aceito (com opção de recusar e buscar outro)
  const [tutorOffer, setTutorOffer] = useState<MatchedTutorNotification | null>(null)
  const [isRejectingTutor, setIsRejectingTutor] = useState(false)

  // Active Session, Chat de Agendamento & Virtual Room
  const [activeSession, setActiveSession] = useState<ActiveSessionData | null>(null)
  const [isChatModalOpen, setIsChatModalOpen] = useState(false)
  const [isVirtualRoomOpen, setIsVirtualRoomOpen] = useState(false)
  const [isDemoRoomOpen, setIsDemoRoomOpen] = useState(false)

  // WebSocket Connection
  const token = typeof window !== 'undefined' ? localStorage.getItem('@hintlink:token') : null
  const { sendMessage, subscribe } = useHintlinkSocket(token)

  const loadData = useCallback(async () => {
    // 1. Carrega catálogo de matérias de forma independente para garantir que o dropdown nunca trave
    try {
      const subRes = await api.get('/subjects')
      const list = subRes.data?.subjects || []
      setSubjects(list)
      if (list.length > 0) {
        setSelectedSubjectId((prev) => (prev ? prev : list[0].id))
      }
    } catch (subErr) {
      console.error('Erro ao carregar matérias:', subErr)
    }

    // 2. Carrega chamados abertos, sessão ativa e saldo de créditos do aluno
    try {
      const [reqRes, activeRes, credRes] = await Promise.all([
        api.get('/requests/open').catch(() => ({ data: { requests: [] } })),
        api.get('/sessions/active').catch(() => ({ data: { session: null } })),
        api.get('/credits').catch(() => ({ data: { credits: Number(user.credits ?? 0), transactions: [] } })),
      ])
      setActiveSession(activeRes.data?.session || null)

      if (credRes.data?.credits !== undefined) {
        const balance = Number(credRes.data.credits)
        setCredits(balance)
        onCreditsChange?.(balance)
      }
      if (credRes.data?.transactions) {
        setTransactions(credRes.data.transactions)
      }

      // Filtra os chamados criados por este aluno
      const mine = (reqRes.data?.requests || []).filter(
        (r: { student?: { id: string } }) => r.student?.id === user.id
      )
      setMyRequests(mine)
    } catch (err) {
      console.error('Erro ao carregar chamados/sessão do aluno:', err)
    }
  }, [user.id, user.credits, onCreditsChange])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Escuta eventos em tempo real do WebSocket (sem refresh!)
  useEffect(() => {
    const unsubscribe = subscribe((msg) => {
      // 🚀 Um monitor aceitou a dúvida do aluno!
      if (msg.type === 'REQUEST_ACCEPTED') {
        loadData()
        const payload = msg.payload as MatchedTutorNotification | undefined
        if (payload && payload.tutor) {
          // Exibe o modal com detalhes do monitor para o aluno aceitar ou recusar
          setTutorOffer({
            requestId: payload.requestId,
            sessionId: payload.sessionId,
            tutor: payload.tutor,
            message: payload.message,
          })
        } else {
          setIsChatModalOpen(true)
        }
        setFeedback({
          type: 'success',
          message: 'Um monitor aceitou seu chamado! Revise o perfil abaixo.',
        })
      }

      // Nova mensagem no chat de aula ou mensagem direta estilo Moodle
      if (msg.type === 'CHAT_NOTIFICATION' || msg.type === 'ROOM_CHAT' || msg.type === 'DIRECT_CHAT') {
        const rawPayload = msg.payload as { message?: ChatMessage } | ChatMessage | undefined
        const chatPayload =
          rawPayload && 'message' in rawPayload && rawPayload.message
            ? rawPayload.message
            : (rawPayload as ChatMessage | undefined)
        if (chatPayload && chatPayload.senderId !== user.id) {
          setUnreadChatCount((prev) => prev + 1)
          setLatestNotification(
            `💬 ${chatPayload.senderName || 'Monitor'}: "${chatPayload.text}"`
          )
          loadData()
        }
      }

      // Aula cancelada pelo monitor (reembolso 100%) ou pelo aluno (reembolso 50%)
      if (msg.type === 'SESSION_CANCELLED') {
        const cancelData = msg.payload as
          | { message?: string; studentCredits?: number }
          | undefined
        if (cancelData?.studentCredits !== undefined) {
          const bal = Number(cancelData.studentCredits)
          setCredits(bal)
          onCreditsChange?.(bal)
        }
        setIsVirtualRoomOpen(false)
        setTutorOffer(null)
        setFeedback({
          type: 'success',
          message:
            cancelData?.message ||
            'A aula foi cancelada e o reembolso correspondente foi creditado na sua carteira.',
        })
        loadData()
      }

      // Sessão concluída
      if (msg.type === 'CALL_ENDED_BY_STUDENT') {
        loadData()
        setIsVirtualRoomOpen(false)
        setIsChatModalOpen(false)
        setTutorOffer(null)
      }
    })

    return () => {
      unsubscribe()
    }
  }, [subscribe, loadData, user.id, onCreditsChange])

  const [isCancellingSession, setIsCancellingSession] = useState(false)
  const [showCancelSessionConfirm, setShowCancelSessionConfirm] = useState(false)

  async function handleCancelActiveSession() {
    if (!activeSession) return
    setIsCancellingSession(true)
    try {
      const res = await api.post(`/sessions/${activeSession.id}/cancel`)
      if (res.data?.studentCredits !== undefined) {
        const bal = Number(res.data.studentCredits)
        setCredits(bal)
        onCreditsChange?.(bal)
      }
      setShowCancelSessionConfirm(false)
      setFeedback({
        type: 'success',
        message:
          res.data?.message ||
          'Aula cancelada! Você recebeu 50% dos créditos de volta na sua carteira.',
      })
      await loadData()
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setFeedback({
          type: 'error',
          message: err.response?.data?.message || 'Erro ao cancelar a aula.',
        })
      }
    } finally {
      setIsCancellingSession(false)
    }
  }

  const handleStudentStartCall = useCallback(
    async (sessionOverride?: MoodleSessionItem) => {
      const targetSession = sessionOverride || activeSession
      if (!targetSession) return
      try {
        const res = await api.patch(`/sessions/${targetSession.id}/start-call`)
        if (res.data?.session) {
          setActiveSession((prev) =>
            prev ? { ...prev, callStartedAt: res.data.session.callStartedAt } : prev
          )
        }
      } catch {
        // prossegue mesmo que o endpoint retorne erro de rede
      }
      sendMessage('CALL_STARTED', { startedBy: user.id }, targetSession.id)
      setIsChatModalOpen(false)
      setIsVirtualRoomOpen(true)
    },
    [activeSession, sendMessage, user.id]
  )

  const handleCloseVirtualRoom = useCallback(() => {
    setIsVirtualRoomOpen(false)
    setIsDemoRoomOpen(false)
    loadData()
  }, [loadData])

  async function handleDepositCredits(e: React.FormEvent) {
    e.preventDefault()
    if (!depositAmount || depositAmount <= 0) return

    setIsDepositing(true)
    setFeedback(null)

    try {
      const res = await api.post('/credits/deposit', {
        amount: Number(depositAmount),
        paymentMethod,
      })

      const newBalance = Number(res.data.credits)
      setCredits(newBalance)
      onCreditsChange?.(newBalance)
      setIsAddCreditsModalOpen(false)
      setFeedback({
        type: 'success',
        message: res.data.message || `${Number(depositAmount).toFixed(2)} créditos adicionados com sucesso!`,
      })
      await loadData()
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setFeedback({
          type: 'error',
          message: err.response?.data?.message || 'Erro ao adicionar créditos.',
        })
      } else {
        setFeedback({
          type: 'error',
          message: 'Erro ao processar recarga de créditos.',
        })
      }
    } finally {
      setIsDepositing(false)
    }
  }

  async function handleCancelRequest(requestId: string) {
    setCancellingRequestId(requestId)
    setFeedback(null)
    try {
      const res = await api.patch(`/requests/${requestId}/cancel`)
      if (res.data?.credits !== undefined) {
        const newBalance = Number(res.data.credits)
        setCredits(newBalance)
        onCreditsChange?.(newBalance)
      }
      setFeedback({
        type: 'success',
        message: res.data?.message || 'Chamado cancelado e créditos estornados para sua carteira!',
      })
      await loadData()
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setFeedback({
          type: 'error',
          message: err.response?.data?.message || 'Erro ao cancelar chamado.',
        })
      }
    } finally {
      setCancellingRequestId(null)
    }
  }

  async function handleCreateRequest(e: React.FormEvent) {
    e.preventDefault()

    if (studentAvailability.length === 0) {
      setFeedback({
        type: 'error',
        message: 'Selecione pelo menos um dia e horário em que você tem disponibilidade para realizar a aula.',
      })
      return
    }

    const hasInvalidTime = studentAvailability.some(
      (s) => !s.startTime || !s.endTime || s.startTime >= s.endTime
    )
    if (hasInvalidTime) {
      setFeedback({
        type: 'error',
        message: 'Verifique os horários informados: o horário de início deve ser anterior ao horário de término em cada dia.',
      })
      return
    }

    if (durationMinutes < 1) {
      setFeedback({
        type: 'error',
        message: 'Informe uma duração de aula válida (mínimo de 1 minuto).',
      })
      return
    }

    const requiredCredits = calculatePriceByDuration(durationMinutes)
    if (credits < requiredCredits) {
      setFeedback({
        type: 'error',
        message: `Saldo insuficiente (${credits.toFixed(2)} créditos). Esta aula requer ${requiredCredits.toFixed(2)} créditos. Adicione créditos abaixo para continuar!`,
      })
      setDepositAmount(Math.max(15, Math.ceil(requiredCredits - credits)))
      setIsAddCreditsModalOpen(true)
      return
    }

    setLoading(true)
    setFeedback(null)

    const formattedDays = studentAvailability.map((s) => s.day)
    const formattedHours = studentAvailability
      .map((s) => `${s.day}: ${s.startTime} até ${s.endTime}`)
      .join(' | ')

    try {
      // O aluno não define o preço. O backend calcula com base em durationMinutes e filtra monitores compatíveis com studentAvailability
      const res = await api.post('/requests', {
        subjectId: selectedSubjectId,
        topic,
        description: description || undefined,
        durationMinutes: Number(durationMinutes),
        preferredDays: formattedDays,
        preferredHours: formattedHours,
        studentAvailability,
      })

      if (res.data?.remainingCredits !== undefined) {
        const newBal = Number(res.data.remainingCredits)
        setCredits(newBal)
        onCreditsChange?.(newBal)
      }

      setFeedback({
        type: 'success',
        message: `Chamado aberto com sucesso! ${requiredCredits.toFixed(2)} créditos foram retidos em custódia segura e os monitores foram notificados.`,
      })
      setTopic('')
      setDescription('')
      loadData()
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setFeedback({
          type: 'error',
          message: err.response?.data?.message || 'Falha ao abrir chamado.',
        })
      } else {
        setFeedback({
          type: 'error',
          message: 'Ocorreu um erro inesperado.',
        })
      }
    } finally {
      setLoading(false)
    }
  }

  function handleAcceptTutor() {
    setTutorOffer(null)
    setIsChatModalOpen(true)
    setFeedback({
      type: 'success',
      message: `Monitor ${tutorOffer?.tutor.name} confirmado! Abrindo o chat de agendamento.`,
    })
  }

  async function handleRejectTutor() {
    if (!tutorOffer) return
    setIsRejectingTutor(true)
    try {
      await api.post(`/requests/${tutorOffer.requestId}/reject-tutor`, {
        tutorId: tutorOffer.tutor.id,
      })
      setFeedback({
        type: 'success',
        message: 'Monitor recusado. Buscando um novo monitor disponível no matchmaking...',
      })
      setTutorOffer(null)
      await loadData()
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setFeedback({
          type: 'error',
          message: err.response?.data?.message || 'Erro ao recusar monitor.',
        })
      } else {
        setFeedback({
          type: 'error',
          message: 'Erro ao recusar monitor.',
        })
      }
    } finally {
      setIsRejectingTutor(false)
    }
  }

  const currentRequiredCredits = calculatePriceByDuration(durationMinutes)
  const hasEnoughCredits = credits >= currentRequiredCredits

  return (
    <div className="space-y-8">
      {/* Carteira de Créditos do Aluno */}
      <div className="bg-gradient-to-r from-brand-blue via-slate-900 to-brand-purple rounded-3xl p-6 sm:p-8 text-white shadow-xl flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4 text-center md:text-left flex-col sm:flex-row">
          <div className="p-4 rounded-2xl bg-brand-yellow/20 border border-brand-yellow/40 text-brand-yellow shrink-0">
            <Wallet className="w-8 h-8" />
          </div>
          <div>
            <span className="inline-block text-[11px] font-extrabold uppercase tracking-wider text-brand-yellow mb-0.5">
              Carteira de Créditos Hintlink (1 Crédito = R$ 1,00)
            </span>
            <div className="flex items-baseline gap-2 justify-center sm:justify-start">
              <span className="text-3xl sm:text-4xl font-black text-white">
                {credits.toFixed(2)}
              </span>
              <span className="text-sm font-bold text-white/80">créditos disponíveis</span>
            </div>
            <p className="text-xs text-white/75 mt-1">
              Adicione créditos para abrir chamados. O valor fica protegido em custódia e só é transferido ao monitor após a conclusão da aula.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 shrink-0 w-full md:w-auto">
          <button
            onClick={() => {
              setUnreadChatCount(0)
              setLatestNotification(null)
              setIsChatModalOpen(true)
            }}
            className="flex-1 sm:flex-initial px-4 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-extrabold text-xs border border-white/20 transition-all flex items-center justify-center gap-2 relative"
          >
            <MessageSquare className="w-4 h-4 text-brand-yellow" />
            <span>Chat & Monitores</span>
            {unreadChatCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black animate-bounce">
                {unreadChatCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setIsHistoryModalOpen(true)}
            className="flex-1 sm:flex-initial px-4 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-extrabold text-xs border border-white/20 transition-all flex items-center justify-center gap-2"
          >
            <History className="w-4 h-4 text-brand-yellow" />
            <span>Extrato ({transactions.length})</span>
          </button>

          <button
            onClick={() => setIsAddCreditsModalOpen(true)}
            className="flex-1 sm:flex-initial px-6 py-3 rounded-2xl bg-brand-yellow hover:bg-amber-400 text-brand-dark font-black text-sm shadow-lg shadow-brand-yellow/30 transition-all flex items-center justify-center gap-2"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Adicionar Créditos</span>
          </button>
        </div>
      </div>

      {/* Banner de Sessão Ativa + Central de Chat & Notificações */}
      {activeSession && (
        <div className="bg-brand-blue text-white rounded-3xl p-6 sm:p-8 shadow-xl shadow-brand-blue/20 flex flex-col gap-5 relative overflow-hidden">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 z-10">
            <div className="space-y-2 text-center md:text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-yellow text-brand-dark text-xs font-black tracking-wider uppercase">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                Monitoria Aceita • Tempo Contratado: {activeSession.durationMinutes} min
              </div>
              <h2 className="text-2xl sm:text-3xl font-black">
                {activeSession.request?.subject?.name || 'Monitoria Agendada'}
              </h2>
              <p className="text-slate-300 text-sm max-w-xl">
                Tópico: &ldquo;{activeSession.request?.topic}&rdquo; com o monitor{' '}
                <span className="font-bold text-white">{activeSession.tutor?.name || 'Monitor'}</span>.
                Combine pelo chat e clique em <strong>Iniciar Chamada de Vídeo</strong> quando estiver pronto (o cronômetro iniciará na hora).
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto shrink-0 flex-wrap">
              <button
                onClick={() => {
                  setUnreadChatCount(0)
                  setLatestNotification(null)
                  setIsChatModalOpen(true)
                }}
                className="relative w-full sm:w-auto px-5 py-3 rounded-2xl bg-white/15 hover:bg-white/25 text-white font-extrabold text-sm backdrop-blur-md border border-white/25 transition-all flex items-center justify-center gap-2"
              >
                <MessageSquare className="w-4 h-4 text-brand-yellow" />
                <span>Abrir Chat</span>
                {unreadChatCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[11px] font-black animate-bounce">
                    {unreadChatCount} nova(s)
                  </span>
                )}
              </button>

              <button
                onClick={() => handleStudentStartCall()}
                className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-brand-yellow hover:bg-amber-400 text-brand-dark font-black text-sm shadow-lg shadow-brand-yellow/30 transition-all flex items-center justify-center gap-2"
              >
                <Video className="w-4 h-4" />
                <span>
                  {activeSession.callStartedAt
                    ? 'Retornar à Chamada de Vídeo'
                    : `Iniciar Chamada de Vídeo (${activeSession.durationMinutes} min)`}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setShowCancelSessionConfirm((prev) => !prev)}
                className="w-full sm:w-auto px-4 py-3 rounded-2xl bg-rose-500/25 hover:bg-rose-500/40 text-rose-100 border border-rose-400/40 font-extrabold text-xs transition-all flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Cancelar Aula (Reembolso 50%)</span>
              </button>
            </div>
          </div>

          {showCancelSessionConfirm && (
            <div className="z-10 bg-rose-950/90 border border-rose-400/50 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div>
                <p className="font-black text-rose-200">
                  Confirmar cancelamento da aula com {activeSession.tutor?.name || 'o monitor'}?
                </p>
                <p className="text-rose-100/90 mt-0.5">
                  Como <strong>Aluno</strong>, ao cancelar a aula você recebe{' '}
                  <strong>
                    50% do valor de volta (+
                    {(Number(activeSession.request?.offeredPrice || 0) * 0.5).toFixed(2)} créditos)
                  </strong>{' '}
                  imediatamente na sua carteira.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowCancelSessionConfirm(false)}
                  className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold"
                >
                  Manter Aula
                </button>
                <button
                  type="button"
                  disabled={isCancellingSession}
                  onClick={handleCancelActiveSession}
                  className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black shadow-md disabled:opacity-50"
                >
                  {isCancellingSession ? 'Cancelando...' : 'Confirmar e Receber 50%'}
                </button>
              </div>
            </div>
          )}

          {latestNotification && (
            <div className="z-10 bg-white/10 border border-white/20 rounded-2xl px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 truncate">
                <Bell className="w-4 h-4 text-brand-yellow shrink-0 animate-bounce" />
                <span className="font-bold truncate">{latestNotification}</span>
              </div>
              <button
                onClick={() => {
                  setUnreadChatCount(0)
                  setLatestNotification(null)
                  setIsChatModalOpen(true)
                }}
                className="px-3 py-1 rounded-xl bg-brand-yellow text-brand-dark font-black text-[11px] shrink-0"
              >
                Responder no Chat
              </button>
            </div>
          )}
        </div>
      )}

      {/* Grid Principal */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Formulário de Abertura de Chamado */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm">
          <div className="flex items-center gap-2.5 text-brand-blue mb-6">
            <div className="p-2 rounded-xl bg-brand-blue/10 text-brand-blue">
              <PlusCircle className="w-5 h-5" />
            </div>
            <h3 className="font-extrabold text-lg">Pedir Ajuda Agora (Matchmaking Inteligente)</h3>
          </div>

          {feedback && (
            <div
              className={`mb-5 p-3.5 rounded-2xl text-xs font-semibold flex items-center gap-2 ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}

          <form onSubmit={handleCreateRequest} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Disciplina / Matéria</label>
              <select
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
                disabled={subjects.length === 0}
                className="w-full px-3.5 py-2.5 rounded-xl bg-brand-light border border-slate-200 text-sm text-brand-dark focus:outline-none focus:border-brand-blue font-medium disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {subjects.length === 0 ? (
                  <option value="">Carregando matérias disponíveis...</option>
                ) : (
                  subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} - {s.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Tópico da Dúvida</label>
              <input
                type="text"
                required
                placeholder="Ex: Teorema Fundamental do Cálculo, Lista 2 Exercício 4..."
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-brand-light border border-slate-200 text-sm text-brand-dark placeholder-slate-400 focus:outline-none focus:border-brand-blue"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Detalhes da Dúvida (Opcional)
              </label>
              <textarea
                rows={2}
                placeholder="Explique o que você já tentou fazer ou envie o enunciado..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-brand-light border border-slate-200 text-sm text-brand-dark placeholder-slate-400 focus:outline-none focus:border-brand-blue"
              />
            </div>

            {/* Pré-informar Dias e Horários Independentes do Aluno (Ex: Segunda 14h até 19h, Terça 12h até 20h) */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-extrabold text-brand-blue flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-brand-purple" />
                  <span>Disponibilidade por Dia (Horários Independentes)</span>
                </label>
                <span className="text-[10px] font-bold text-brand-purple bg-brand-purple/10 px-2 py-0.5 rounded-full">
                  {studentAvailability.length} dia(s) configurado(s)
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Selecione os dias e defina o intervalo de horas de cada dia individualmente. Sua solicitação será exibida <strong>apenas aos monitores compatíveis com estes horários</strong>.
              </p>

              {/* Botões de Dias da Semana */}
              <div className="flex flex-wrap gap-1.5">
                {STUDENT_AVAILABLE_DAYS.map((day) => {
                  const selected = studentAvailability.some((s) => s.day === day)
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleStudentDay(day)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                        selected
                          ? 'bg-brand-blue text-white border-brand-blue shadow-sm'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {day.replace('-feira', '')}
                    </button>
                  )
                })}
              </div>

              {/* Lista de Horários Independentes por Dia Selecionado */}
              {studentAvailability.length > 0 ? (
                <div className="space-y-2 pt-1">
                  {studentAvailability.map((slot) => (
                    <div
                      key={slot.day}
                      className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 p-2.5 rounded-xl bg-white border border-slate-200 shadow-2xs"
                    >
                      <span className="text-xs font-extrabold text-brand-dark min-w-[105px]">
                        {slot.day}
                      </span>
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="text-[11px] text-slate-500 font-semibold"> das </span>
                        <input
                          type="time"
                          value={slot.startTime}
                          onChange={(e) => updateStudentSlotTime(slot.day, 'startTime', e.target.value)}
                          className="px-2 py-1 rounded-lg bg-brand-light border border-slate-200 text-xs font-bold text-brand-dark focus:outline-none focus:border-brand-blue"
                        />
                        <span className="text-[11px] text-slate-500 font-semibold"> até </span>
                        <input
                          type="time"
                          value={slot.endTime}
                          onChange={(e) => updateStudentSlotTime(slot.day, 'endTime', e.target.value)}
                          className="px-2 py-1 rounded-lg bg-brand-light border border-slate-200 text-xs font-bold text-brand-dark focus:outline-none focus:border-brand-blue"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleStudentDay(slot.day)}
                        title="Remover dia"
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-rose-600 font-semibold">
                  Clique em pelo menos um dia acima para definir o horário em que você pode ter a aula.
                </p>
              )}
            </div>

            {/* Seleção de Tempo da Aula em Horas e Minutos + Cálculo Automático de Valor */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-extrabold text-brand-blue flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-brand-purple" />
                  <span>Tempo da Aula (Horas e Minutos)</span>
                </label>
                <span className="text-[11px] font-bold text-slate-500">
                  Taxa: R$ 30,00/h (R$ 0,50/min)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Horas</label>
                  <input
                    type="number"
                    min={0}
                    max={12}
                    value={durationHours}
                    onChange={(e) => setDurationHours(Math.max(0, parseInt(e.target.value || '0', 10)))}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm font-black text-brand-dark focus:outline-none focus:border-brand-blue text-center"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Minutos</label>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={durationMins}
                    onChange={(e) => setDurationMins(Math.max(0, Math.min(59, parseInt(e.target.value || '0', 10))))}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm font-black text-brand-dark focus:outline-none focus:border-brand-blue text-center"
                  />
                </div>

                <div className="sm:col-span-6">
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Valor Calculado Automaticamente ({durationMinutes} min)
                  </label>
                  <div className="w-full px-3.5 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 font-black flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <DollarSign className="w-4 h-4 text-emerald-600" />
                      {currentRequiredCredits.toFixed(2)} créditos
                    </span>
                    <span className="text-xs bg-white px-2 py-0.5 rounded-lg border border-emerald-200 text-emerald-700 font-extrabold">
                      R$ {currentRequiredCredits.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Atalhos rápidos de tempo */}
              <div className="flex items-center justify-between flex-wrap gap-1.5 pt-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-bold text-slate-400 mr-1">Preenchimento rápido:</span>
                  {[
                    { h: 0, m: 2, label: '2m (Teste Rápido)' },
                    { h: 0, m: 15, label: '15m' },
                    { h: 0, m: 30, label: '30m' },
                    { h: 0, m: 45, label: '45m' },
                    { h: 1, m: 0, label: '1h 00m' },
                    { h: 1, m: 30, label: '1h 30m' },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setDurationHours(preset.h)
                        setDurationMins(preset.m)
                      }}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition-all ${
                        durationHours === preset.h && durationMins === preset.m
                          ? 'bg-brand-purple text-white border-brand-purple'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <span className="text-[10px] text-slate-500">
                  Seu saldo:{' '}
                  <strong className={hasEnoughCredits ? 'text-emerald-600' : 'text-rose-600'}>
                    {credits.toFixed(2)} créditos
                  </strong>
                </span>
              </div>
            </div>

            {!hasEnoughCredits && (
              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-3">
                <div className="text-xs text-amber-900">
                  <span className="font-extrabold block">Saldo insuficiente para {durationMinutes} min</span>
                  <span>Faltam {(currentRequiredCredits - credits).toFixed(2)} créditos para abrir este chamado.</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDepositAmount(Math.max(15, Math.ceil(currentRequiredCredits - credits)))
                    setIsAddCreditsModalOpen(true)
                  }}
                  className="px-3 py-2 rounded-xl bg-brand-blue hover:bg-slate-800 text-white font-extrabold text-xs shrink-0 transition-all"
                >
                  + Recarregar
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3.5 rounded-xl bg-brand-yellow hover:bg-amber-400 text-brand-dark font-black text-sm shadow-md shadow-brand-yellow/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <span>
                {loading
                  ? 'Transmitindo Chamado...'
                  : hasEnoughCredits
                  ? `Abrir Chamado (${currentRequiredCredits.toFixed(2)} Créditos)`
                  : 'Adicionar Créditos e Abrir Chamado'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* Meus Chamados Recentes */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm">
          <div className="flex items-center gap-2.5 text-brand-purple mb-6">
            <div className="p-2 rounded-xl bg-brand-purple/10 text-brand-purple">
              <BookOpen className="w-5 h-5" />
            </div>
            <h3 className="font-extrabold text-lg">Minhas Solicitações</h3>
          </div>

          {myRequests.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              <p>Você não possui nenhum chamado aberto no momento.</p>
              <p className="text-xs mt-1 text-slate-500">
                Abra uma solicitação no formulário ao lado para encontrar um monitor.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {myRequests.map((req) => (
                <div
                  key={req.id}
                  className="p-4 rounded-2xl bg-brand-light border border-slate-200 flex items-center justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-extrabold text-brand-blue">{req.subject?.code}</span>
                      <span className="text-xs text-slate-400">•</span>
                      <span className="text-xs text-slate-500 font-medium">{req.subject?.name}</span>
                    </div>
                    <h4 className="font-bold text-sm text-brand-dark">{req.topic}</h4>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 flex-wrap">
                      <span className="flex items-center gap-1 font-semibold">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {req.durationMinutes} min
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1 font-bold text-emerald-600">
                        {Number(req.offeredPrice).toFixed(2)} créditos (R$ {Number(req.offeredPrice).toFixed(2)})
                      </span>
                    </div>
                    {req.preferredDays && req.preferredDays.length > 0 && (
                      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap text-[11px] text-brand-purple font-semibold">
                        <Calendar className="w-3 h-3 shrink-0" />
                        <span>
                          Disp.: {req.preferredDays.join(', ')}
                          {req.preferredHours ? ` (${req.preferredHours})` : ''}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold ${
                        req.status === 'OPEN'
                          ? 'bg-amber-100 text-amber-800'
                          : req.status === 'MATCHED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {req.status === 'OPEN'
                        ? 'Buscando Monitor'
                        : req.status === 'MATCHED'
                        ? 'Em Atendimento'
                        : req.status}
                    </span>

                    {req.status === 'OPEN' && (
                      <button
                        type="button"
                        onClick={() => handleCancelRequest(req.id)}
                        disabled={cancellingRequestId === req.id}
                        className="text-[11px] font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 px-2 py-0.5 rounded-lg hover:bg-rose-50 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>{cancellingRequestId === req.id ? 'Estornando...' : 'Cancelar e Estornar'}</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal de Recarga de Créditos (Simulação Instantânea Pix / Cartão) */}
      {isAddCreditsModalOpen && (
        <div className="fixed inset-0 z-50 bg-brand-dark/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full border border-slate-200 shadow-2xl relative animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-2xl bg-brand-yellow/20 text-brand-dark">
                  <Wallet className="w-6 h-6 text-brand-purple" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-brand-dark">Adicionar Créditos</h3>
                  <p className="text-xs text-slate-500">1 Crédito = R$ 1,00 • Liberação imediata</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddCreditsModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleDepositCredits} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  Escolha um pacote rápido:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { value: 15, label: '30 min' },
                    { value: 30, label: '1 hora' },
                    { value: 50, label: 'Popular' },
                    { value: 100, label: 'Intensivo' },
                  ].map((pkg) => (
                    <button
                      key={pkg.value}
                      type="button"
                      onClick={() => setDepositAmount(pkg.value)}
                      className={`p-2.5 rounded-2xl border text-center transition-all ${
                        depositAmount === pkg.value
                          ? 'border-brand-purple bg-brand-purple/10 text-brand-purple font-black shadow-sm'
                          : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold'
                      }`}
                    >
                      <span className="block text-sm">+{pkg.value}</span>
                      <span className="block text-[10px] text-slate-500">{pkg.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Ou digite o valor desejado (em Créditos / R$):
                </label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="number"
                    min={1}
                    max={5000}
                    step="0.50"
                    required
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(Number(e.target.value))}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-brand-light border border-slate-200 text-sm font-extrabold text-brand-dark focus:outline-none focus:border-brand-purple"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  Forma de Pagamento (Simulação Acadêmica):
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('PIX')}
                    className={`p-3 rounded-2xl border flex items-center justify-center gap-2 text-xs font-extrabold transition-all ${
                      paymentMethod === 'PIX'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <QrCode className="w-4 h-4" />
                    <span>Pix Instantâneo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('CARD')}
                    className={`p-3 rounded-2xl border flex items-center justify-center gap-2 text-xs font-extrabold transition-all ${
                      paymentMethod === 'CARD'
                        ? 'border-brand-blue bg-brand-blue/10 text-brand-blue'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>Cartão de Crédito</span>
                  </button>
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200 flex items-center justify-between text-xs">
                <span className="text-slate-600 font-semibold">Saldo após a recarga:</span>
                <span className="font-black text-emerald-600 text-sm">
                  {(credits + (Number(depositAmount) || 0)).toFixed(2)} créditos
                </span>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddCreditsModalOpen(false)}
                  className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isDepositing || !depositAmount || depositAmount <= 0}
                  className="flex-1 py-3 rounded-xl bg-brand-yellow hover:bg-amber-400 text-brand-dark font-black text-xs shadow-md shadow-brand-yellow/30 transition-all disabled:opacity-50"
                >
                  {isDepositing ? 'Confirmando...' : `Confirmar +${Number(depositAmount || 0).toFixed(2)} Créd.`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Extrato de Créditos do Aluno */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 z-50 bg-brand-dark/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full border border-slate-200 shadow-2xl relative animate-in fade-in zoom-in duration-200 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-2xl bg-brand-blue/10 text-brand-blue">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-brand-dark">Extrato da Carteira</h3>
                  <p className="text-xs text-slate-500">Saldo atual: {credits.toFixed(2)} créditos</p>
                </div>
              </div>
              <button
                onClick={() => setIsHistoryModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto space-y-2.5 flex-1 pr-1">
              {transactions.length === 0 ? (
                <p className="text-center py-10 text-slate-400 text-xs">
                  Nenhuma movimentação registrada ainda.
                </p>
              ) : (
                transactions.map((tx) => {
                  const val = Number(tx.amount)
                  const isPositive = val >= 0
                  return (
                    <div
                      key={tx.id}
                      className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3"
                    >
                      <div>
                        <p className="text-xs font-bold text-brand-dark">{tx.description}</p>
                        <span className="text-[10px] text-slate-400">
                          {new Date(tx.createdAt).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <span
                        className={`text-xs font-black shrink-0 ${
                          isPositive ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {isPositive ? '+' : ''}
                        {val.toFixed(2)} créd.
                      </span>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação ou Recusa do Monitor (Matchmaking Notification) */}
      {tutorOffer && (
        <div className="fixed inset-0 z-50 bg-brand-dark/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full border border-slate-200 shadow-2xl relative animate-in fade-in zoom-in duration-200">
            <div className="text-center mb-6">
              <div className="inline-flex p-3 rounded-2xl bg-brand-yellow/20 text-brand-dark mb-3">
                <Sparkles className="w-8 h-8 text-brand-purple" />
              </div>
              <h3 className="text-xl font-black text-brand-dark">Monitor Encontrado!</h3>
              <p className="text-xs text-slate-500 mt-1">Um monitor aceitou atender sua dúvida.</p>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 mb-6 flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-brand-purple/10 text-brand-purple flex items-center justify-center font-black text-xl shrink-0">
                {tutorOffer.tutor.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h4 className="font-extrabold text-sm text-brand-dark truncate">{tutorOffer.tutor.name}</h4>
                  {tutorOffer.tutor.isNovel ? (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                      🌱 Novo Monitor
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold">
                      ⭐ Experiente
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-600">
                  <span className="flex items-center gap-1 font-bold text-amber-500">
                    ★ {Number(tutorOffer.tutor.rating).toFixed(1)}
                  </span>
                  <span>•</span>
                  <span className="text-[11px] font-medium text-slate-500">
                    {tutorOffer.tutor.completedSessionsCount} monitorias realizadas
                  </span>
                </div>
                {Array.isArray(tutorOffer.tutor.availability) &&
                  tutorOffer.tutor.availability.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-200 text-[11px] text-slate-600">
                      <span className="font-bold text-brand-purple block mb-1">
                        📅 Horários do Monitor:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {tutorOffer.tutor.availability.map((slot, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] font-semibold"
                          >
                            {slot.day.replace('-feira', '')}: {slot.startTime}–{slot.endTime}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-6 text-xs text-amber-900 flex items-start gap-2">
              <Info className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
              <span>Você pode aceitar para iniciar o agendamento ou recusar para que o sistema busque automaticamente outro monitor na fila.</span>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                onClick={handleRejectTutor}
                disabled={isRejectingTutor}
                className="flex-1 py-3 px-4 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" />
                <span>{isRejectingTutor ? 'Buscando outro...' : 'Recusar Monitor'}</span>
              </button>
              <button
                onClick={handleAcceptTutor}
                className="flex-1 py-3 px-4 rounded-xl bg-brand-yellow hover:bg-amber-400 text-brand-dark font-extrabold text-xs shadow-md shadow-brand-yellow/30 transition-all flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Aceitar Monitor</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Botão Flutuante Sempre Visível do Chat Estilo Moodle (Conversas com Vários Monitores & Aulas) */}
      {!isChatModalOpen && !isVirtualRoomOpen && (
        <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
          <button
            onClick={() => {
              setUnreadChatCount(0)
              setLatestNotification(null)
              setIsChatModalOpen(true)
            }}
            className="px-5 py-3.5 rounded-full bg-brand-purple hover:bg-purple-700 text-white font-black text-xs shadow-2xl shadow-brand-purple/40 border-2 border-white flex items-center gap-2.5 transition-all hover:scale-105"
          >
            <MessageSquare className="w-4 h-4 text-brand-yellow" />
            <span>
              {activeSession
                ? `Chat & Monitores (${activeSession.tutor?.name?.split(' ')[0] || 'Aula Ativa'})`
                : 'Chat com Monitores'}
            </span>
            {unreadChatCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black animate-bounce">
                {unreadChatCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Gaveta de Mensagens Estilo Moodle (Múltiplos Monitores + Aulas Ativas + Cancelamento) */}
      <MoodleChatDrawer
        isOpen={isChatModalOpen}
        onClose={() => setIsChatModalOpen(false)}
        currentUser={user}
        initialSessionId={activeSession?.id}
        sendMessage={sendMessage}
        subscribe={subscribe}
        onStartCall={(sess) => handleStudentStartCall(sess)}
        onSessionCancelled={(data) => {
          if (data.studentCredits !== undefined) {
            const bal = Number(data.studentCredits)
            setCredits(bal)
            onCreditsChange?.(bal)
          }
          setFeedback({
            type: 'success',
            message: data.message,
          })
          loadData()
        }}
        onDirectLessonChanged={(data) => {
          if (data.remainingCredits !== undefined) {
            const bal = Number(data.remainingCredits)
            setCredits(bal)
            onCreditsChange?.(bal)
          }
          setFeedback({
            type: 'success',
            message: data.message,
          })
          loadData()
        }}
      />

      {/* Virtual Room Modal (Chamada Real ou Modo Teste) */}
      {(isVirtualRoomOpen || isDemoRoomOpen) && (
        <VirtualRoom
          sessionId={activeSession?.id || 'demo-ufabc-room-1'}
          currentUser={user}
          isDemoMode={isDemoRoomOpen}
          durationMinutes={activeSession?.durationMinutes || durationMinutes || 30}
          callStartedAt={activeSession?.callStartedAt}
          sendMessage={sendMessage}
          subscribe={subscribe}
          onClose={handleCloseVirtualRoom}
        />
      )}
    </div>
  )
}
