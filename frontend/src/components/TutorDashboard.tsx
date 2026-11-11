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
} from 'lucide-react'
import axios from 'axios'
import { VirtualRoom } from './VirtualRoom'
import { SessionChatModal, ChatMessage } from './SessionChatModal'
import { useHintlinkSocket } from '@/hooks/use-socket'

interface OpenRequest {
  id: string
  topic: string
  description?: string
  durationMinutes: number
  offeredPrice: string
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

interface TutorUser {
  id: string
  name: string
  email: string
  cpf: string
  role: 'STUDENT' | 'TUTOR' | 'ADMIN'
  rating: number
  totalReviews: number
}

export function TutorDashboard({ user }: { user: TutorUser }) {
  const [openRequests, setOpenRequests] = useState<OpenRequest[]>([])
  const [mySubjects, setMySubjects] = useState<TutorRecord[]>([])
  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Upload Histórico State
  const [isUploadingTranscript, setIsUploadingTranscript] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

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
      const [reqRes, mySubRes, activeRes] = await Promise.all([
        api.get('/requests/open').catch(() => ({ data: { requests: [] } })),
        api.get('/tutors/subjects').catch(() => ({ data: { records: [] } })),
        api.get('/sessions/active').catch(() => ({ data: { session: null } })),
      ])
      setOpenRequests(reqRes.data.requests || [])
      setMySubjects(mySubRes.data.records || [])
      setActiveSession(activeRes.data?.session || null)
    } catch (err) {
      console.error('Erro ao carregar dados do dashboard do monitor:', err)
    }
  }, [])

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
      const payload = msg.payload as { requestId?: string } | undefined
      if (msg.type === 'REQUEST_TAKEN' && payload?.requestId) {
        setOpenRequests((prev) => prev.filter((r) => r.id !== payload.requestId))
      }

      // O aluno optou por recusar este monitor e buscar outro
      if (msg.type === 'TUTOR_REJECTED_BY_STUDENT') {
        loadData()
        setIsChatModalOpen(false)
        setIsVirtualRoomOpen(false)
        setActiveSession(null)
        setFeedback({
          type: 'error',
          message: 'O aluno optou por buscar outro monitor para este chamado. Você está liberado para atender outras dúvidas.',
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
          <div className="bg-white/10 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/20 text-center">
            <span className="block text-xs uppercase tracking-wider text-white/70 font-semibold">Reputação</span>
            <span className="text-lg font-black text-brand-yellow">{user.rating} ★ ({user.totalReviews})</span>
          </div>

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

      {/* Alerta de Sessão Ativa com Botões para Chat ou Vídeo */}
      {activeSession && (
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-2xl p-4 text-white shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 rounded-full bg-white animate-ping shrink-0"></span>
            <div>
              <h4 className="font-extrabold text-sm">
                Você possui uma monitoria em andamento com {activeSession.student?.name || 'um aluno'}!
              </h4>
              <p className="text-xs text-white/80">
                Custódia Pix retida. Alinhem os horários no chat ou iniciem a videochamada.
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
                  <div className="flex items-center gap-4 text-xs text-slate-500 pt-1 font-mono">
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
                      R$ {Number(req.offeredPrice).toFixed(2)}
                    </span>
                  </div>
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
