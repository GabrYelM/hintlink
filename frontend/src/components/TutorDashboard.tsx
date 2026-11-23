'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '@/services/api'
import {
  Bell,
  CheckCircle2,
  Clock,
  DollarSign,
  BookOpen,
  UserCheck,
  AlertTriangle,
  UploadCloud,
  FileText,
  Video,
  Sparkles,
  MessageSquare,
  Wallet,
  ArrowUpRight,
  History,
  XCircle,
  Calendar,
  Trash2,
} from 'lucide-react'
import axios from 'axios'
import { VirtualRoom } from './VirtualRoom'
import { ChatMessage } from './SessionChatModal'
import { MoodleChatDrawer, MoodleSessionItem } from './MoodleChatDrawer'
import { useHintlinkSocket } from '@/hooks/use-socket'

interface OpenRequest {
  id: string
  topic: string
  description?: string
  durationMinutes: number
  offeredPrice: string
  preferredDays?: string[]
  preferredHours?: string
  studentAvailability?: Array<{ day: string; startTime: string; endTime: string }>
  matchQueue?: string
  createdAt: string
  student: {
    id: string
    name: string
    rating: number
  }
  subject: {
    id: string
    code: string
    name: string
  }
}

interface TutorRecord {
  id: string
  isApproved: boolean
  grade?: number
  concept?: string
  subject: {
    id: string
    code: string
    name: string
  }
}

interface ActiveSessionData {
  id: string
  status: string
  durationMinutes: number
  callStartedAt?: string | null
  request?: {
    topic: string
    description?: string
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

interface CreditTransactionItem {
  id: string
  type: 'DEPOSIT' | 'ESCROW_HOLD' | 'ESCROW_REFUND' | 'TUTORING_EARNING' | 'WITHDRAWAL'
  amount: string | number
  description: string
  createdAt: string
}

interface TutorUser {
  id: string
  name: string
  email: string
  cpf: string
  role: 'STUDENT' | 'TUTOR' | 'ADMIN'
  rating: number
  totalReviews: number
  credits?: number | string
}

export function TutorDashboard({
  user,
  onCreditsChange,
}: {
  user: TutorUser
  onCreditsChange?: (newCredits: number) => void
}) {
  const [openRequests, setOpenRequests] = useState<OpenRequest[]>([])
  const [mySubjects, setMySubjects] = useState<TutorRecord[]>([])
  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Carteira de Créditos do Monitor
  const [credits, setCredits] = useState<number>(Number(user.credits ?? 0))
  const [transactions, setTransactions] = useState<CreditTransactionItem[]>([])
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false)
  const [withdrawAmount, setWithdrawAmount] = useState<number>(0)
  const [pixKey, setPixKey] = useState<string>(user.cpf || user.email || '')
  const [isWithdrawing, setIsWithdrawing] = useState(false)

  // Upload Histórico State
  const [isUploadingTranscript, setIsUploadingTranscript] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Active Session, Chat de Agendamento & Virtual Room
  const [activeSession, setActiveSession] = useState<ActiveSessionData | null>(null)
  const [isChatModalOpen, setIsChatModalOpen] = useState(false)
  const [isVirtualRoomOpen, setIsVirtualRoomOpen] = useState(false)
  const [isDemoRoomOpen, setIsDemoRoomOpen] = useState(false)
  const [callStartedLive, setCallStartedLive] = useState(false)
  const [unreadChatCount, setUnreadChatCount] = useState(0)
  const [latestNotification, setLatestNotification] = useState<string | null>(null)

  const isCallStartedByStudent = Boolean(activeSession?.callStartedAt) || callStartedLive

  // WebSocket Connection
  const token = typeof window !== 'undefined' ? localStorage.getItem('@hintlink:token') : null
  const { sendMessage, subscribe } = useHintlinkSocket(token)

  const loadData = useCallback(async () => {
    try {
      const [reqRes, mySubRes, activeRes, credRes] = await Promise.all([
        api.get('/requests/open').catch(() => ({ data: { requests: [] } })),
        api.get('/tutors/subjects').catch(() => ({ data: { records: [] } })),
        api.get('/sessions/active').catch(() => ({ data: { session: null } })),
        api.get('/credits').catch(() => ({ data: { credits: Number(user.credits ?? 0), transactions: [] } })),
      ])
      setOpenRequests(reqRes.data.requests || [])
      setMySubjects(mySubRes.data.records || [])
      setActiveSession(activeRes.data?.session || null)

      if (credRes.data?.credits !== undefined) {
        const balance = Number(credRes.data.credits)
        setCredits(balance)
        onCreditsChange?.(balance)
      }
      if (credRes.data?.transactions) {
        setTransactions(credRes.data.transactions)
      }
    } catch (err) {
      console.error('Erro ao carregar dados do dashboard do monitor:', err)
    }
  }, [user.credits, onCreditsChange])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Escuta eventos em tempo real do WebSocket (sem refresh!)
  useEffect(() => {
    const unsubscribe = subscribe((msg) => {
      // 🚀 Novo chamado aberto por algum aluno -> aparece no feed na hora!
      if (msg.type === 'NEW_TUTORING_REQUEST') {
        loadData()
        setFeedback({
          type: 'success',
          message: 'Novo chamado de aluno recebido em tempo real!',
        })
      }

      // Outro monitor pegou o chamado -> remove do feed na hora!
      const payload = msg.payload as { requestId?: string; message?: string } | undefined
      if (msg.type === 'REQUEST_TAKEN' && payload?.requestId) {
        setOpenRequests((prev) => prev.filter((r) => r.id !== payload.requestId))
      }

      // O aluno optou por recusar este monitor e buscar outro
      if (msg.type === 'TUTOR_REJECTED_BY_STUDENT') {
        loadData()
        setIsChatModalOpen(false)
        setIsVirtualRoomOpen(false)
        setActiveSession(null)
        setCallStartedLive(false)
        setFeedback({
          type: 'error',
          message: 'O aluno optou por buscar outro monitor para este chamado. Você está liberado para atender outras dúvidas.',
        })
      }

      // O aluno iniciou a chamada de vídeo -> libera o botão de entrada para o monitor e notifica!
      if (msg.type === 'CALL_STARTED') {
        setCallStartedLive(true)
        loadData()
        setLatestNotification('🔔 O aluno iniciou a chamada de vídeo! O tempo da aula começou a contar. Clique para entrar na sala.')
        setFeedback({
          type: 'success',
          message: '🔔 O aluno acabou de iniciar a chamada de vídeo! Clique em "Entrar na Chamada" para ingressar.',
        })
      }

      // Nova mensagem no chat ou mensagem direta estilo Moodle
      if (msg.type === 'CHAT_NOTIFICATION' || msg.type === 'ROOM_CHAT' || msg.type === 'DIRECT_CHAT') {
        const rawPayload = msg.payload as { message?: ChatMessage } | ChatMessage | undefined
        const chatPayload =
          rawPayload && 'message' in rawPayload && rawPayload.message
            ? rawPayload.message
            : (rawPayload as ChatMessage | undefined)
        if (chatPayload && chatPayload.senderId !== user.id) {
          setUnreadChatCount((prev) => prev + 1)
          setLatestNotification(
            `💬 ${chatPayload.senderName || 'Aluno'}: "${chatPayload.text}"`
          )
          loadData()
        }
      }

      // Aula cancelada pelo aluno (reembolso 50%) ou pelo monitor (reembolso 100% ao aluno)
      if (msg.type === 'SESSION_CANCELLED') {
        const cancelData = msg.payload as { message?: string } | undefined
        setIsVirtualRoomOpen(false)
        setCallStartedLive(false)
        setFeedback({
          type: 'error',
          message:
            cancelData?.message ||
            'A aula agendada foi cancelada.',
        })
        loadData()
      }

      // Sessão concluída / Créditos transferidos para o monitor
      if (msg.type === 'CALL_ENDED_BY_STUDENT' || msg.type === 'CREDITS_UPDATED') {
        loadData()
        setIsVirtualRoomOpen(false)
        setIsChatModalOpen(false)
        setCallStartedLive(false)
        if (msg.type === 'CREDITS_UPDATED') {
          setFeedback({
            type: 'success',
            message:
              payload?.message ||
              'Monitoria concluída! Os créditos da aula foram depositados na sua carteira.',
          })
        }
      }
    })

    return () => {
      unsubscribe()
    }
  }, [subscribe, loadData, user.id])

  const [isCancellingSession, setIsCancellingSession] = useState(false)
  const [showCancelSessionConfirm, setShowCancelSessionConfirm] = useState(false)

  async function handleTutorCancelActiveSession() {
    if (!activeSession) return
    setIsCancellingSession(true)
    try {
      const res = await api.post(`/sessions/${activeSession.id}/cancel`)
      setShowCancelSessionConfirm(false)
      setCallStartedLive(false)
      setFeedback({
        type: 'success',
        message:
          res.data?.message ||
          'Aula cancelada pelo monitor. O aluno recebeu 100% dos créditos de volta.',
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

  async function handleWithdrawCredits(e: React.FormEvent) {
    e.preventDefault()
    if (!withdrawAmount || withdrawAmount <= 0 || !pixKey.trim()) return

    setIsWithdrawing(true)
    setFeedback(null)

    try {
      const res = await api.post('/credits/withdraw', {
        amount: Number(withdrawAmount),
        pixKey: pixKey.trim(),
      })

      const newBalance = Number(res.data.credits)
      setCredits(newBalance)
      onCreditsChange?.(newBalance)
      setWithdrawAmount(0)
      setFeedback({
        type: 'success',
        message: res.data.message || 'Saque via Pix realizado com sucesso!',
      })
      await loadData()
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setFeedback({
          type: 'error',
          message: err.response?.data?.message || 'Erro ao realizar saque.',
        })
      } else {
        setFeedback({
          type: 'error',
          message: 'Erro ao processar saque via Pix.',
        })
      }
    } finally {
      setIsWithdrawing(false)
    }
  }

  // Upload e Parsing do Histórico Escolar Oficial em PDF
  async function handleTranscriptUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.type !== 'application/pdf') {
      setFeedback({
        type: 'error',
        message: 'Por favor, selecione um arquivo no formato PDF.',
      })
      return
    }

    setIsUploadingTranscript(true)
    setFeedback(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await api.post('/tutors/upload-transcript', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })

      setFeedback({
        type: 'success',
        message:
          response.data.message ||
          'Histórico processado com sucesso! Suas matérias aprovadas foram validadas.',
      })

      await loadData()
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setFeedback({
          type: 'error',
          message:
            err.response?.data?.message ||
            'Erro ao processar histórico escolar. Verifique se o CPF do PDF é o mesmo do seu cadastro.',
        })
      } else {
        setFeedback({
          type: 'error',
          message: 'Erro inesperado ao enviar arquivo.',
        })
      }
    } finally {
      setIsUploadingTranscript(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // Aceitar chamado: Agora abre o Chat de Agendamento em vez da videochamada direta
  async function handleAcceptRequest(requestId: string) {
    setLoadingAction(requestId)
    setFeedback(null)

    try {
      const response = await api.patch(`/requests/${requestId}/accept`)
      setFeedback({
        type: 'success',
        message: 'Você aceitou a monitoria! Chat de agendamento aberto para alinhar detalhes com o aluno.',
      })
      // Remove da lista de chamados abertos
      setOpenRequests((prev) => prev.filter((r) => r.id !== requestId))
      setActiveSession(response.data.session)
      // Abre o Chat de Agendamento primeiro!
      setIsChatModalOpen(true)
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setFeedback({
          type: 'error',
          message:
            err.response?.data?.message ||
            'Erro ao aceitar chamado. Verifique se você possui esta matéria aprovada em seu histórico.',
        })
      } else {
        setFeedback({
          type: 'error',
          message: 'Erro inesperado ao aceitar chamado.',
        })
      }
    } finally {
      setLoadingAction(null)
    }
  }

  const handleCloseVirtualRoom = useCallback(() => {
    setIsVirtualRoomOpen(false)
    setIsDemoRoomOpen(false)
    loadData()
  }, [loadData])

  return (
    <div className="space-y-8">
      {/* Top Welcome Banner */}
      <div className="bg-gradient-to-r from-brand-blue to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-brand-yellow/20 text-brand-yellow border border-brand-yellow/30 mb-2">
            👨‍🏫 Painel do Monitor
          </span>
          <h2 className="text-2xl sm:text-3xl font-black">
            Pronto para atender, {user.name.split(' ')[0]}?
          </h2>
          <p className="text-sm text-white/80 mt-1 max-w-xl">
            Aceite chamados estilo Uber de matérias aprovadas no seu histórico escolar. Os pagamentos Pix caem em custódia garantida.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Saldo de Créditos Recebidos pelo Monitor */}
          <div className="bg-emerald-500/15 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-emerald-400/30 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-400/20 text-emerald-300">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-wider text-emerald-200 font-bold">
                Meus Créditos (1 Créd = R$ 1)
              </span>
              <span className="text-lg font-black text-white">
                {credits.toFixed(2)} créd.
              </span>
            </div>
            <button
              onClick={() => {
                setWithdrawAmount(credits > 0 ? Number(credits.toFixed(2)) : 0)
                setIsWalletModalOpen(true)
              }}
              className="ml-1 px-3 py-2 rounded-xl bg-brand-yellow hover:bg-amber-400 text-brand-dark font-black text-xs flex items-center gap-1 shadow-md transition-all"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>Sacar / Extrato</span>
            </button>
          </div>

          <div className="bg-white/10 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/20 text-center">
            <span className="block text-xs uppercase tracking-wider text-white/70 font-semibold">Reputação</span>
            <span className="text-lg font-black text-brand-yellow">{user.rating} ★ ({user.totalReviews})</span>
          </div>

          {/* Botão do Chat */}
          <button
            onClick={() => {
              setUnreadChatCount(0)
              setLatestNotification(null)
              setIsChatModalOpen(true)
            }}
            className="px-4 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-extrabold text-xs flex items-center gap-2 border border-white/20 transition-all relative"
          >
            <MessageSquare className="w-4 h-4 text-brand-yellow" />
            <span>Chat</span>
            {unreadChatCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black animate-bounce">
                {unreadChatCount}
              </span>
            )}
          </button>

          {/* Botão de Teste Rápido da Chamada */}
          <button
            onClick={() => setIsDemoRoomOpen(true)}
            className="px-4 py-3 rounded-2xl bg-brand-purple hover:bg-purple-700 text-white font-extrabold text-xs flex items-center gap-2 shadow-lg shadow-purple-900/30 transition-all border border-purple-400/30"
          >
            <Sparkles className="w-4 h-4 text-brand-yellow" />
            <span>Testar Chamada (Demo)</span>
          </button>
        </div>
      </div>

      {/* Alerta de Sessão Ativa com Ferramenta Visível de Chat & Notificação e Controle de Chamada */}
      {activeSession && (
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-2xl p-5 text-white shadow-lg flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="h-3 w-3 rounded-full bg-white animate-ping shrink-0"></span>
              <div>
                <h4 className="font-extrabold text-sm sm:text-base">
                  Monitoria ativa com {activeSession.student?.name || 'aluno'} ({activeSession.durationMinutes} min)
                </h4>
                <p className="text-xs text-white/90">
                  {isCallStartedByStudent
                    ? '🔔 O aluno já iniciou a chamada! O tempo de aula está correndo — entre agora na sala virtual.'
                    : '⏳ Alinhem os detalhes pelo Chat. A chamada de vídeo só pode ser iniciada pelo Aluno.'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  setUnreadChatCount(0)
                  setLatestNotification(null)
                  setIsChatModalOpen(true)
                }}
                className="px-4 py-2.5 rounded-xl bg-white/20 hover:bg-white/30 text-white font-extrabold text-xs flex items-center gap-1.5 transition-all"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Abrir Chat</span>
                {unreadChatCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black animate-bounce">
                    {unreadChatCount} nova(s)
                  </span>
                )}
              </button>

              {isCallStartedByStudent ? (
                <button
                  onClick={() => setIsVirtualRoomOpen(true)}
                  className="px-4 py-2.5 rounded-xl bg-brand-yellow hover:bg-amber-400 text-brand-dark font-black text-xs shadow-lg flex items-center gap-1.5 transition-all animate-pulse"
                >
                  <Video className="w-4 h-4" />
                  <span>Entrar na Chamada (Iniciada!)</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  title="Apenas o aluno pode iniciar a chamada de vídeo"
                  className="px-4 py-2.5 rounded-xl bg-black/25 text-white/75 font-bold text-xs flex items-center gap-1.5 cursor-not-allowed border border-white/15"
                >
                  <Clock className="w-4 h-4" />
                  <span>Aguardando Aluno Iniciar Chamada...</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowCancelSessionConfirm((prev) => !prev)}
                className="px-3.5 py-2.5 rounded-xl bg-rose-600/80 hover:bg-rose-600 text-white font-extrabold text-xs flex items-center gap-1.5 transition-all shadow-sm"
              >
                <Trash2 className="w-4 h-4" />
                <span>Cancelar Aula (Estorno 100%)</span>
              </button>
            </div>
          </div>

          {showCancelSessionConfirm && (
            <div className="bg-rose-950/90 border border-rose-400/50 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div>
                <p className="font-black text-rose-200">
                  Confirmar cancelamento da aula com {activeSession.student?.name || 'o aluno'}?
                </p>
                <p className="text-rose-100/90 mt-0.5">
                  Como <strong>Monitor</strong>, ao cancelar esta aula, o aluno receberá{' '}
                  <strong>
                    100% do valor de volta (+
                    {Number(activeSession.request?.offeredPrice || 0).toFixed(2)} créditos)
                  </strong>{' '}
                  integralmente na carteira dele.
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
                  onClick={handleTutorCancelActiveSession}
                  className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black shadow-md disabled:opacity-50"
                >
                  {isCancellingSession ? 'Cancelando...' : 'Confirmar (Estorno 100% ao Aluno)'}
                </button>
              </div>
            </div>
          )}

          {latestNotification && (
            <div className="bg-black/20 border border-white/20 rounded-xl px-4 py-2 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 truncate">
                <Bell className="w-4 h-4 text-brand-yellow shrink-0 animate-bounce" />
                <span className="font-bold truncate">{latestNotification}</span>
              </div>
              <button
                onClick={() => {
                  setUnreadChatCount(0)
                  setLatestNotification(null)
                  if (isCallStartedByStudent) {
                    setIsVirtualRoomOpen(true)
                  } else {
                    setIsChatModalOpen(true)
                  }
                }}
                className="px-3 py-1 rounded-lg bg-white text-emerald-900 font-black text-[11px] shrink-0"
              >
                {isCallStartedByStudent ? 'Entrar na Sala' : 'Abrir Chat'}
              </button>
            </div>
          )}
        </div>
      )}

      {feedback && (
        <div
          className={`p-4 rounded-2xl text-xs font-bold flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-rose-50 text-rose-700 border border-rose-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      <div className="grid lg:grid-cols-12 gap-8 items-start">
        {/* Feed de Chamados Abertos (Estilo Uber) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-extrabold text-lg text-brand-blue flex items-center gap-2">
              <Bell className="w-5 h-5 text-brand-yellow" />
              Chamados de Alunos em Tempo Real
            </h3>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-200 text-slate-700">
              {openRequests.length} chamado(s) aberto(s)
            </span>
          </div>

          {openRequests.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-3xl p-10 text-center text-slate-500">
              <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500 mb-3" />
              <p className="font-bold text-slate-700 text-base">Nenhum chamado aberto na fila no momento</p>
              <p className="text-xs text-slate-400 mt-1">
                Fique atento! Novas dúvidas abertas por alunos aparecerão aqui instantaneamente via WebSocket sem refresh.
              </p>
            </div>
          ) : (
            openRequests.map((req) => (
              <div
                key={req.id}
                className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:border-brand-yellow/60 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-5"
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-brand-blue text-white">
                      {req.subject.code}
                    </span>
                    <span className="text-xs text-slate-600 font-medium">
                      {req.subject.name}
                    </span>
                    {req.matchQueue === 'NOVEL' ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                        🌱 Fila de Novos Monitores
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold">
                        ⭐ Fila Normal (Top Avaliações)
                      </span>
                    )}
                  </div>
                  <h4 className="font-black text-lg text-brand-dark">{req.topic}</h4>
                  {req.description && (
                    <p className="text-xs text-slate-500 line-clamp-2">{req.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-slate-500 pt-1 font-mono flex-wrap">
                    <span className="flex items-center gap-1 font-semibold text-slate-700">
                      <UserCheck className="w-3.5 h-3.5 text-brand-purple" />
                      {req.student.name} ({req.student.rating} ★)
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {req.durationMinutes} min
                    </span>
                    <span className="flex items-center gap-1 font-bold text-emerald-600 text-sm">
                      <DollarSign className="w-4 h-4" />
                      {Number(req.offeredPrice).toFixed(2)} créd. (R$ {Number(req.offeredPrice).toFixed(2)})
                    </span>
                  </div>
                  {Array.isArray(req.studentAvailability) && req.studentAvailability.length > 0 ? (
                    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-xs font-extrabold text-brand-purple">
                        <Calendar className="w-3.5 h-3.5 shrink-0" />
                        Horários do Aluno:
                      </span>
                      {req.studentAvailability.map((slot, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-0.5 rounded-lg bg-brand-purple/10 border border-brand-purple/25 text-[11px] font-bold text-brand-purple"
                        >
                          {slot.day.replace('-feira', '')}: {slot.startTime} até {slot.endTime}
                        </span>
                      ))}
                    </div>
                  ) : (
                    req.preferredDays &&
                    req.preferredDays.length > 0 && (
                      <div className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-brand-purple/10 border border-brand-purple/20 text-xs font-bold text-brand-purple">
                        <Calendar className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          Disponibilidade do Aluno: {req.preferredDays.join(', ')}
                          {req.preferredHours ? ` • ${req.preferredHours}` : ''}
                        </span>
                      </div>
                    )
                  )}
                </div>

                <div className="shrink-0">
                  <button
                    onClick={() => handleAcceptRequest(req.id)}
                    disabled={loadingAction === req.id}
                    className="w-full sm:w-auto px-6 py-3 rounded-xl bg-brand-yellow hover:bg-amber-400 text-brand-dark font-extrabold text-sm shadow-md shadow-brand-yellow/30 transition-all disabled:opacity-50"
                  >
                    {loadingAction === req.id ? 'Aceitando...' : 'Aceitar Chamado & Agendar'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Gerenciamento de Matérias Baseadas em Histórico Escolar Oficial */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-5">
            <div>
              <h3 className="font-extrabold text-base text-brand-blue flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-brand-purple" />
                Matérias Habilitadas
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Suas matérias são validadas automaticamente pelo seu Histórico Escolar oficial.
              </p>
            </div>

            {/* Upload do Histórico PDF Oficial */}
            <div className="p-4 rounded-2xl bg-brand-light border-2 border-dashed border-brand-purple/30 text-center space-y-3">
              <UploadCloud className="w-8 h-8 mx-auto text-brand-purple" />
              <div>
                <p className="text-xs font-extrabold text-brand-blue">
                  Importar Histórico Escolar (PDF)
                </p>
                <p className="text-[11px] text-slate-500">
                  Reconhecimento de notas e validação por CPF (SIGAA UFABC).
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={handleTranscriptUpload}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingTranscript}
                className="w-full py-2.5 rounded-xl bg-brand-purple hover:bg-purple-700 text-white font-extrabold text-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <FileText className="w-4 h-4" />
                <span>{isUploadingTranscript ? 'Lendo e Validando PDF...' : 'Subir Arquivo PDF'}</span>
              </button>
            </div>

            {/* Lista de Matérias Aptas com Conceito / Nota */}
            {mySubjects.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-2">
                Nenhuma disciplina vinculada ainda. Suba o seu histórico escolar acima para se habilitar.
              </p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {mySubjects.map((sub) => (
                  <div
                    key={sub.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-brand-light border border-slate-200 text-xs"
                  >
                    <div>
                      <span className="font-bold text-brand-blue block">{sub.subject.code}</span>
                      <span className="text-slate-600 truncate max-w-[150px] block text-[11px]">
                        {sub.subject.name}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                        {sub.concept ? `Conceito ${sub.concept}` : `Nota: ${sub.grade || 'Aprovado'}`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de Carteira, Ganhos e Saque Pix do Monitor */}
      {isWalletModalOpen && (
        <div className="fixed inset-0 z-50 bg-brand-dark/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full border border-slate-200 shadow-2xl relative animate-in fade-in zoom-in duration-200 max-h-[88vh] flex flex-col">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-2xl bg-emerald-100 text-emerald-700">
                  <Wallet className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-brand-dark">Carteira do Monitor</h3>
                  <p className="text-xs text-slate-500">
                    Saldo disponível: <strong className="text-emerald-600">{credits.toFixed(2)} créditos (R$ {credits.toFixed(2)})</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsWalletModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Formulário de Saque Pix Simulado */}
            <form onSubmit={handleWithdrawCredits} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-brand-blue uppercase tracking-wider">
                  Transferir Créditos via Pix
                </span>
                <button
                  type="button"
                  onClick={() => setWithdrawAmount(Number(credits.toFixed(2)))}
                  className="text-[11px] font-bold text-brand-purple hover:underline"
                >
                  Sacar tudo ({credits.toFixed(2)})
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Valor do Saque (Créditos / R$)
                  </label>
                  <input
                    type="number"
                    min={0.5}
                    max={Math.max(0.5, credits)}
                    step="0.50"
                    required
                    value={withdrawAmount || ''}
                    onChange={(e) => setWithdrawAmount(Number(e.target.value))}
                    placeholder="0.00"
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-extrabold text-brand-dark focus:outline-none focus:border-brand-blue"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Sua Chave Pix (CPF, E-mail ou Celular)
                  </label>
                  <input
                    type="text"
                    required
                    value={pixKey}
                    onChange={(e) => setPixKey(e.target.value)}
                    placeholder="CPF ou E-mail institucional"
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-brand-dark focus:outline-none focus:border-brand-blue"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isWithdrawing || credits <= 0 || !withdrawAmount || withdrawAmount > credits}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-md transition-all disabled:opacity-50"
              >
                {isWithdrawing
                  ? 'Enviando Pix...'
                  : credits <= 0
                  ? 'Sem saldo disponível para saque'
                  : `Solicitar Saque Pix de R$ ${Number(withdrawAmount || 0).toFixed(2)}`}
              </button>
            </form>

            {/* Histórico de Créditos Recebidos e Saques */}
            <div className="flex items-center gap-2 mb-2.5">
              <History className="w-4 h-4 text-slate-500" />
              <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                Histórico de Recebimentos e Movimentações
              </h4>
            </div>

            <div className="overflow-y-auto space-y-2 flex-1 pr-1">
              {transactions.length === 0 ? (
                <p className="text-center py-8 text-slate-400 text-xs">
                  Nenhuma movimentação registrada ainda. Conclua monitorias para receber créditos!
                </p>
              ) : (
                transactions.map((tx) => {
                  const val = Number(tx.amount)
                  const isPositive = val >= 0
                  return (
                    <div
                      key={tx.id}
                      className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3"
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

      {/* Botão Flutuante Sempre Visível do Chat Estilo Moodle */}
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
                ? `Chat & Aulas (${activeSession.student?.name?.split(' ')[0] || 'Aluno'})`
                : 'Central de Chat'}
            </span>
            {unreadChatCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black animate-bounce">
                {unreadChatCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Gaveta de Mensagens Estilo Moodle */}
      <MoodleChatDrawer
        isOpen={isChatModalOpen}
        onClose={() => setIsChatModalOpen(false)}
        currentUser={user}
        initialSessionId={activeSession?.id}
        sendMessage={sendMessage}
        subscribe={subscribe}
        onStartCall={(sess: MoodleSessionItem) => {
          if (!sess.callStartedAt && !isCallStartedByStudent) return
          setActiveSession(sess)
          setIsChatModalOpen(false)
          setIsVirtualRoomOpen(true)
        }}
        onSessionCancelled={(data) => {
          setCallStartedLive(false)
          setFeedback({
            type: 'success',
            message: data.message,
          })
          loadData()
        }}
        onDirectLessonChanged={(data) => {
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
          durationMinutes={activeSession?.durationMinutes || 30}
          callStartedAt={activeSession?.callStartedAt}
          sendMessage={sendMessage}
          subscribe={subscribe}
          onClose={handleCloseVirtualRoom}
        />
      )}
    </div>
  )
}
