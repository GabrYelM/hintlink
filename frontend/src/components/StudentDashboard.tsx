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
} from 'lucide-react'
import axios from 'axios'
import { VirtualRoom } from './VirtualRoom'
import { SessionChatModal, ChatMessage } from './SessionChatModal'
import { useHintlinkSocket } from '@/hooks/use-socket'

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
  cpf: string
  role: 'STUDENT' | 'TUTOR' | 'ADMIN'
}

interface ActiveSessionData {
  id: string
  status: string
  durationMinutes: number
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

export function StudentDashboard({ user }: { user: StudentUser }) {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [topic, setTopic] = useState('')
  const [description, setDescription] = useState('')
  const [durationMinutes, setDurationMinutes] = useState(30)
  const [offeredPrice, setOfferedPrice] = useState(25)
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [myRequests, setMyRequests] = useState<TutoringRequestItem[]>([])

  // Active Session, Chat de Agendamento & Virtual Room
  const [activeSession, setActiveSession] = useState<ActiveSessionData | null>(null)
  const [isChatModalOpen, setIsChatModalOpen] = useState(false)
  const [isVirtualRoomOpen, setIsVirtualRoomOpen] = useState(false)
  const [isDemoRoomOpen, setIsDemoRoomOpen] = useState(false)

  // WebSocket Connection
  const token = typeof window !== 'undefined' ? localStorage.getItem('@hintlink:token') : null
  const { sendMessage, subscribe } = useHintlinkSocket(token)

  const loadData = useCallback(async () => {
    try {
      const [subRes, reqRes, activeRes] = await Promise.all([
        api.get('/subjects'),
        api.get('/requests/open'),
        api.get('/sessions/active').catch(() => ({ data: { session: null } })),
      ])
      setSubjects(subRes.data.subjects || [])
      if (subRes.data.subjects?.length > 0) {
        setSelectedSubjectId(subRes.data.subjects[0].id)
      }
      setActiveSession(activeRes.data?.session || null)

      // Filtra os chamados criados por este aluno
      const mine = (reqRes.data.requests || []).filter(
        (r: { student?: { id: string } }) => r.student?.id === user.id
      )
      setMyRequests(mine)
    } catch (err) {
      console.error('Erro ao carregar dados do dashboard do aluno:', err)
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
        setIsChatModalOpen(true)
        setFeedback({
          type: 'success',
          message: 'Um monitor acabou de aceitar seu chamado! Abrindo o chat de agendamento.',
        })
      }

      // Sessão concluída
      if (msg.type === 'CALL_ENDED_BY_STUDENT') {
        loadData()
        setIsVirtualRoomOpen(false)
        setIsChatModalOpen(false)
      }
    })

    return () => {
      unsubscribe()
    }
  }, [subscribe, loadData])

  async function handleCreateRequest(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setFeedback(null)

    try {
      const response = await api.post('/requests', {
        subjectId: selectedSubjectId,
        topic,
        description: description || undefined,
        durationMinutes: Number(durationMinutes),
        offeredPrice: Number(offeredPrice),
      })

      setFeedback({
        type: 'success',
        message: 'Chamado aberto com sucesso! Monitores notificados instantaneamente sem necessidade de refresh.',
      })
      setTopic('')
      setDescription('')

      // Atualiza lista local de chamados
      setMyRequests((prev) => [
        {
          id: response.data.request.id,
          topic: response.data.request.topic,
          description: response.data.request.description,
          durationMinutes: response.data.request.durationMinutes,
          offeredPrice: response.data.request.offeredPrice,
          status: response.data.request.status,
          createdAt: response.data.request.createdAt,
          subject: subjects.find((s) => s.id === selectedSubjectId) || {
            code: '',
            name: '',
          },
        },
        ...prev,
      ])
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setFeedback({
          type: 'error',
          message: err.response?.data?.message || 'Falha ao abrir chamado.',
        })
      } else {
        setFeedback({
          type: 'error',
          message: 'Erro inesperado ao abrir chamado.',
        })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Top Welcome Card */}
      <div className="bg-gradient-to-r from-brand-blue to-brand-purple rounded-3xl p-6 sm:p-8 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-white/15 backdrop-blur-md mb-2">
            🎓 Painel do Estudante
          </span>
          <h2 className="text-2xl sm:text-3xl font-black">
            Olá, {user.name.split(' ')[0]}! Qual é a dúvida de hoje?
          </h2>
          <p className="text-sm text-white/80 mt-1 max-w-xl">
            Abra um chamado instantâneo. O valor do Pix só é liberado para o monitor após o término da aula com sua aprovação.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-white/10 backdrop-blur-md px-5 py-4 rounded-2xl border border-white/20 text-center shrink-0">
            <span className="block text-xs uppercase tracking-wider text-white/70 font-semibold">Garantia Pix</span>
            <span className="text-xl font-black text-brand-yellow">Custódia Protegida</span>
          </div>

          {/* Botão de Teste Rápido de Chamada */}
          <button
            onClick={() => setIsDemoRoomOpen(true)}
            className="px-4 py-3 rounded-2xl bg-brand-yellow hover:bg-amber-400 text-brand-dark font-extrabold text-xs flex items-center gap-2 shadow-lg shadow-brand-yellow/30 transition-all"
          >
            <Sparkles className="w-4 h-4 text-brand-purple" />
            <span>Testar Chamada (Demo)</span>
          </button>
        </div>
      </div>

      {/* Alerta de Sessão Ativa com Botões para Chat de Agendamento ou Vídeo */}
      {activeSession && (
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-2xl p-4 text-white shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 rounded-full bg-white animate-ping shrink-0"></span>
            <div>
              <h4 className="font-extrabold text-sm">
                Seu chamado foi aceito por {activeSession.tutor?.name || 'um monitor'}!
              </h4>
              <p className="text-xs text-white/80">
                Alinhe o horário pelo chat pré-chamada ou entre direto na sala de aula.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setIsChatModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white font-extrabold text-xs flex items-center gap-1.5 transition-all"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Chat & Agendamento</span>
            </button>
            <button
              onClick={() => setIsVirtualRoomOpen(true)}
              className="px-4 py-2 rounded-xl bg-white text-emerald-800 font-black text-xs hover:bg-slate-100 shadow-md flex items-center gap-1.5 transition-all"
            >
              <Video className="w-4 h-4" />
              <span>Entrar no Vídeo</span>
            </button>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-12 gap-8 items-start">
        {/* Formulário de Abertura de Chamado */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-6 text-brand-blue">
            <PlusCircle className="w-5 h-5 text-brand-yellow" />
            <h3 className="font-extrabold text-lg">Pedir Ajuda Agora (Estilo Uber)</h3>
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
                className="w-full px-3.5 py-2.5 rounded-xl bg-brand-light border border-slate-200 text-sm text-brand-dark focus:outline-none focus:border-brand-blue font-medium"
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} - {s.name}
                  </option>
                ))}
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
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Valor Ofertado (R$)</label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 text-emerald-600 absolute left-3 top-3" />
                  <input
                    type="number"
                    min="5"
                    step="5"
                    required
                    value={offeredPrice}
                    onChange={(e) => setOfferedPrice(Number(e.target.value))}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-brand-light border border-slate-200 text-sm text-brand-dark focus:outline-none focus:border-brand-blue font-bold"
                  />
                </div>
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

        {/* Histórico de Solicitações do Aluno */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-extrabold text-lg text-brand-blue flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-brand-purple" />
              Seus Chamados Recentes
            </h3>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-200 text-slate-700">
              {myRequests.length} registro(s)
            </span>
          </div>

          {myRequests.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-3xl p-10 text-center text-slate-500">
              <p className="font-bold text-slate-700 text-base">Você ainda não abriu nenhuma dúvida</p>
              <p className="text-xs text-slate-400 mt-1">
                Utilize o formulário ao lado para solicitar um monitor sob demanda.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {myRequests.map((req) => (
                <div
                  key={req.id}
                  className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:border-slate-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-brand-blue text-white">
                        {req.subject.code}
                      </span>
                      <span className="text-xs text-slate-600 font-medium">
                        {req.subject.name}
                      </span>
                    </div>
                    <h4 className="font-extrabold text-base text-brand-dark">{req.topic}</h4>
                    {req.description && (
                      <p className="text-xs text-slate-500 line-clamp-1">{req.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-slate-500 pt-1 font-mono">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {req.durationMinutes} min
                      </span>
                      <span className="flex items-center gap-1 font-bold text-emerald-600">
                        <DollarSign className="w-3.5 h-3.5" />
                        R$ {Number(req.offeredPrice).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-black ${
                        req.status === 'OPEN'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : req.status === 'MATCHED'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {req.status === 'OPEN'
                        ? 'Aguardando Monitor'
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
          onClose={() => {
            setIsVirtualRoomOpen(false)
            setIsDemoRoomOpen(false)
            loadData()
          }}
        />
      )}
    </div>
  )
}
