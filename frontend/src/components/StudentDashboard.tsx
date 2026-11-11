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
} from 'lucide-react'
import axios from 'axios'
import { VirtualRoom } from './VirtualRoom'
import { SessionChatModal, ChatMessage } from './SessionChatModal'
import { useHintlinkSocket } from '@/hooks/use-socket'

export function calculatePriceByDuration(durationMinutes: number): number {
  if (durationMinutes <= 15) return 7.5
  if (durationMinutes <= 30) return 15.0
  if (durationMinutes <= 45) return 22.5
  if (durationMinutes <= 60) return 30.0
  return Number((durationMinutes * 0.5).toFixed(2))
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
  status: string
  createdAt: string
  subject: {
    code: string
    name: string
  }
}

interface StudentUser {
  id: string
  name: string
  email: string
  role: 'STUDENT' | 'TUTOR' | 'ADMIN'
  rating: number
}

interface ActiveSessionData {
  id: string
  status: string
  durationMinutes: number
  startedAt: string
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
  }
  message?: string
}

export function StudentDashboard({ user }: { user: StudentUser }) {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [topic, setTopic] = useState('')
  const [description, setDescription] = useState('')
  const [durationMinutes, setDurationMinutes] = useState(30)
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [myRequests, setMyRequests] = useState<TutoringRequestItem[]>([])

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

    // 2. Carrega chamados abertos e sessão ativa do aluno com tratativa resiliente
    try {
      const [reqRes, activeRes] = await Promise.all([
        api.get('/requests/open').catch(() => ({ data: { requests: [] } })),
        api.get('/sessions/active').catch(() => ({ data: { session: null } })),
      ])
      setActiveSession(activeRes.data?.session || null)

      // Filtra os chamados criados por este aluno
      const mine = (reqRes.data?.requests || []).filter(
        (r: { student?: { id: string } }) => r.student?.id === user.id
      )
      setMyRequests(mine)
    } catch (err) {
      console.error('Erro ao carregar chamados/sessão do aluno:', err)
    }
  }, [user.id])

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
  }, [subscribe, loadData])

  const handleCloseVirtualRoom = useCallback(() => {
    setIsVirtualRoomOpen(false)
    setIsDemoRoomOpen(false)
    loadData()
  }, [loadData])

  async function handleCreateRequest(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setFeedback(null)

    try {
      // O aluno não define o preço. O backend calcula com base em durationMinutes
      await api.post('/requests', {
        subjectId: selectedSubjectId,
        topic,
        description: description || undefined,
        durationMinutes: Number(durationMinutes),
      })

      setFeedback({
        type: 'success',
        message: 'Chamado aberto com sucesso! Matchmaking acionado e monitores notificados instantaneamente.',
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

  return (
    <div className="space-y-8">
      {/* Banner de Sessão Ativa */}
      {activeSession && (
        <div className="bg-brand-blue text-white rounded-3xl p-6 sm:p-8 shadow-xl shadow-brand-blue/20 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
          <div className="space-y-2 z-10 text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-yellow text-brand-dark text-xs font-black tracking-wider uppercase">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              Monitoria em Andamento
            </div>
            <h2 className="text-2xl sm:text-3xl font-black">
              {activeSession.request?.subject?.name || 'Monitoria Agendada'}
            </h2>
            <p className="text-slate-300 text-sm max-w-xl">
              Tópico: &ldquo;{activeSession.request?.topic}&rdquo; com o monitor{' '}
              <span className="font-bold text-white">{activeSession.tutor?.name || 'Monitor'}</span>.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 z-10 w-full md:w-auto">
            <button
              onClick={() => setIsChatModalOpen(true)}
              className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-extrabold text-sm backdrop-blur-md border border-white/20 transition-all flex items-center justify-center gap-2"
            >
              <MessageSquare className="w-4 h-4 text-brand-yellow" />
              <span>Chat de Agendamento</span>
            </button>

            <button
              onClick={() => setIsVirtualRoomOpen(true)}
              className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-brand-yellow hover:bg-amber-400 text-brand-dark font-black text-sm shadow-lg shadow-brand-yellow/30 transition-all flex items-center justify-center gap-2"
            >
              <Video className="w-4 h-4" />
              <span>Entrar na Sala Virtual</span>
            </button>
          </div>
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
                rows={3}
                placeholder="Explique o que você já tentou fazer ou envie o enunciado..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-brand-light border border-slate-200 text-sm text-brand-dark placeholder-slate-400 focus:outline-none focus:border-brand-blue"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Duração Desejada</label>
                <div className="relative">
                  <Clock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <select
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-brand-light border border-slate-200 text-sm text-brand-dark focus:outline-none focus:border-brand-blue font-semibold"
                  >
                    <option value={15}>15 minutos</option>
                    <option value={30}>30 minutos</option>
                    <option value={45}>45 minutos</option>
                    <option value={60}>60 minutos (1h)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Cobrança Fixada por Tempo</label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 text-emerald-600 absolute left-3 top-3" />
                  <div className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-sm text-slate-800 font-extrabold flex items-center justify-between">
                    <span>R$ {calculatePriceByDuration(durationMinutes).toFixed(2)}</span>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Tabelado</span>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Cobrança automática pelo tempo da aula.</p>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3.5 rounded-xl bg-brand-yellow hover:bg-amber-400 text-brand-dark font-black text-sm shadow-md shadow-brand-yellow/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <span>{loading ? 'Transmitindo Chamado...' : 'Abrir Chamado Agora'}</span>
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
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
                      <span className="flex items-center gap-1 font-semibold">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {req.durationMinutes} min
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1 font-bold text-emerald-600">
                        R$ {Number(req.offeredPrice).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 shrink-0">
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
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

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

      {/* Chat de Agendamento Pré-Chamada */}
      {isChatModalOpen && activeSession && (
        <SessionChatModal
          session={activeSession}
          currentUser={user}
          sendMessage={sendMessage}
          subscribe={subscribe}
          onStartCall={() => {
            setIsChatModalOpen(false)
            setIsVirtualRoomOpen(true)
          }}
          onClose={() => setIsChatModalOpen(false)}
        />
      )}

      {/* Virtual Room Modal (Chamada Real ou Modo Teste) */}
      {(isVirtualRoomOpen || isDemoRoomOpen) && (
        <VirtualRoom
          sessionId={activeSession?.id || 'demo-ufabc-room-1'}
          currentUser={user}
          isDemoMode={isDemoRoomOpen}
          sendMessage={sendMessage}
          subscribe={subscribe}
          onClose={handleCloseVirtualRoom}
        />
      )}
    </div>
  )
}
