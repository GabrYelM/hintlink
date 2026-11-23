'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '@/services/api'
import {
  MessageSquare,
  Send,
  Video,
  Clock,
  DollarSign,
  X,
  Search,
  Users,
  Calendar,
  Sparkles,
  Trash2,
  AlertTriangle,
  Star,
  BookOpen,
  ChevronLeft,
  PlusCircle,
  CheckCircle2,
} from 'lucide-react'
import axios from 'axios'
import { WebSocketMessage } from '@/hooks/use-socket'
import { ChatMessage } from './SessionChatModal'

export interface MoodleSessionItem {
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
    availability?: Array<{ day: string; startTime: string; endTime: string }>
  }
  escrow?: {
    amount: number | string
    status: string
  }
  chatMessages?: ChatMessage[]
}

export interface DirectChatMessage {
  id: string
  threadId?: string
  senderId: string
  senderName: string
  senderRole: string
  recipientId?: string
  text: string
  time: string
  directRequest?: {
    requestId: string
    topic: string
    subjectName: string
    durationMinutes: number
    offeredPrice: number
  }
}

export interface MoodleContactItem {
  id: string
  name: string
  role: 'STUDENT' | 'TUTOR' | 'ADMIN'
  rating: number
  totalReviews: number
  availability?: Array<{ day: string; startTime: string; endTime: string }>
  subjects?: Array<{ id: string; code: string; name: string }>
  lastSubject?: { id: string; code: string; name: string } | null
  pendingDirectRequest?: {
    id: string
    topic: string
    durationMinutes: number
    offeredPrice: number
    subject?: { id: string; code: string; name: string }
    studentId: string
  } | null
  messages: DirectChatMessage[]
}

interface MoodleChatDrawerProps {
  isOpen: boolean
  onClose: () => void
  currentUser: {
    id: string
    name: string
    role: 'STUDENT' | 'TUTOR' | 'ADMIN'
  }
  initialSessionId?: string | null
  sendMessage: (type: string, payload?: unknown, sessionId?: string) => void
  subscribe: (callback: (msg: WebSocketMessage) => void) => () => void
  onStartCall: (session: MoodleSessionItem) => void
  onSessionCancelled: (data: {
    sessionId: string
    refundAmount?: number
    studentCredits?: number
    message: string
  }) => void
  onDirectLessonChanged?: (data: {
    remainingCredits?: number
    message: string
  }) => void
}

export function MoodleChatDrawer({
  isOpen,
  onClose,
  currentUser,
  initialSessionId,
  sendMessage,
  subscribe,
  onStartCall,
  onSessionCancelled,
  onDirectLessonChanged,
}: MoodleChatDrawerProps) {
  const [activeSessions, setActiveSessions] = useState<MoodleSessionItem[]>([])
  const [contacts, setContacts] = useState<MoodleContactItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'ALL' | 'SESSIONS' | 'MONITORS'>('ALL')

  // Conversa selecionada: pode ser uma sessão de aula ('SESSION') ou conversa direta com monitor/aluno ('DIRECT')
  const [selectedThread, setSelectedThread] = useState<{
    type: 'SESSION' | 'DIRECT'
    id: string
  } | null>(null)

  const [inputText, setInputText] = useState('')
  const [confirmCancelSessionId, setConfirmCancelSessionId] = useState<string | null>(null)
  const [isCancelling, setIsCancelling] = useState(false)
  const [unreadByThread, setUnreadByThread] = useState<Record<string, number>>({})
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  // Estados para Solicitação de Aula Direta pelo Chat (+15% por hora)
  const [showDirectLessonForm, setShowDirectLessonForm] = useState(false)
  const [directTopic, setDirectTopic] = useState('')
  const [directSubjectId, setDirectSubjectId] = useState('')
  const [directHours, setDirectHours] = useState(0)
  const [directMins, setDirectMins] = useState(30)
  const [isRequestingDirectLesson, setIsRequestingDirectLesson] = useState(false)
  const [isAcceptingDirectId, setIsAcceptingDirectId] = useState<string | null>(null)
  const [drawerFeedback, setDrawerFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const directTotalMinutes = Math.max(1, (Number(directHours) || 0) * 60 + (Number(directMins) || 0))
  const directBasePrice = Number((directTotalMinutes * 0.5).toFixed(2))
  // +15% sobre a hora-aula normal (R$ 30,00/h -> R$ 34,50/h)
  const directCalculatedPrice = Number((directBasePrice * 1.15).toFixed(2))

  const isStudent = currentUser.role === 'STUDENT'

  const loadMoodleData = useCallback(async () => {
    try {
      const res = await api.get('/chat/moodle')
      const loadedSessions: MoodleSessionItem[] = res.data?.activeSessions || []
      const loadedContacts: MoodleContactItem[] = res.data?.contacts || []

      setActiveSessions(loadedSessions)
      setContacts(loadedContacts)

      setSelectedThread((prev) => {
        if (initialSessionId && loadedSessions.some((s) => s.id === initialSessionId)) {
          return { type: 'SESSION', id: initialSessionId }
        }
        if (prev) return prev
        if (loadedSessions.length > 0) {
          return { type: 'SESSION', id: loadedSessions[0].id }
        }
        if (loadedContacts.length > 0) {
          return { type: 'DIRECT', id: loadedContacts[0].id }
        }
        return null
      })
    } catch {
      // ignora erro silencioso de rede
    }
  }, [initialSessionId])

  useEffect(() => {
    if (isOpen) {
      loadMoodleData()
    }
  }, [isOpen, loadMoodleData])

  // Entra nas salas de WebSocket de todas as sessões ativas para receber mensagens em tempo real
  useEffect(() => {
    if (!isOpen) return
    for (const s of activeSessions) {
      sendMessage('JOIN_ROOM', {}, s.id)
    }
  }, [isOpen, activeSessions, sendMessage])

  useEffect(() => {
    const unsubscribe = subscribe((msg) => {
      if (msg.type === 'ROOM_CHAT' && msg.sessionId && msg.payload) {
        const chatMsg = msg.payload as ChatMessage
        setActiveSessions((prev) =>
          prev.map((s) => {
            if (s.id !== msg.sessionId) return s
            const existing = Array.isArray(s.chatMessages) ? s.chatMessages : []
            if (existing.some((m) => m.id === chatMsg.id)) return s
            return { ...s, chatMessages: [...existing, chatMsg] }
          })
        )
        if (selectedThread?.id !== msg.sessionId && chatMsg.senderId !== currentUser.id) {
          const sid = msg.sessionId
          setUnreadByThread((prev) => ({ ...prev, [sid]: (prev[sid] || 0) + 1 }))
        }
      }

      if (msg.type === 'DIRECT_CHAT' && msg.payload) {
        const data = msg.payload as { partnerId: string; message: DirectChatMessage }
        if (data?.partnerId && data?.message) {
          setContacts((prev) => {
            const exists = prev.some((c) => c.id === data.partnerId)
            if (!exists) {
              loadMoodleData()
              return prev
            }
            return prev.map((c) => {
              if (c.id !== data.partnerId) return c
              if (c.messages.some((m) => m.id === data.message.id)) return c
              return { ...c, messages: [...c.messages, data.message] }
            })
          })
          if (selectedThread?.id !== data.partnerId) {
            setUnreadByThread((prev) => ({
              ...prev,
              [data.partnerId]: (prev[data.partnerId] || 0) + 1,
            }))
          }
        }
      }

      if (msg.type === 'CALL_STARTED' && msg.sessionId) {
        setActiveSessions((prev) =>
          prev.map((s) =>
            s.id === msg.sessionId
              ? { ...s, callStartedAt: new Date().toISOString() }
              : s
          )
        )
      }

      if (
        msg.type === 'SESSION_CANCELLED' ||
        msg.type === 'REQUEST_ACCEPTED' ||
        msg.type === 'NEW_TUTORING_REQUEST'
      ) {
        loadMoodleData()
      }
    })

    return () => unsubscribe()
  }, [subscribe, selectedThread, currentUser.id, loadMoodleData])

  async function handleRequestDirectLesson(e: React.FormEvent) {
    e.preventDefault()
    if (!currentContact || !directTopic.trim()) return

    setIsRequestingDirectLesson(true)
    setDrawerFeedback(null)
    try {
      const res = await api.post(`/chat/direct/${currentContact.id}/request-lesson`, {
        subjectId: directSubjectId || currentContact.lastSubject?.id || currentContact.subjects?.[0]?.id,
        topic: directTopic.trim(),
        durationMinutes: directTotalMinutes,
      })

      setShowDirectLessonForm(false)
      setDirectTopic('')
      setDrawerFeedback({
        type: 'success',
        message:
          res.data?.message ||
          `Solicitação de Aula Direta (+15%/h) enviada para ${currentContact.name}!`,
      })
      onDirectLessonChanged?.({
        remainingCredits: res.data?.remainingCredits,
        message:
          res.data?.message ||
          `Solicitação de Aula Direta (+15%/h) enviada para ${currentContact.name}!`,
      })
      await loadMoodleData()
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setDrawerFeedback({
          type: 'error',
          message: err.response?.data?.message || 'Erro ao solicitar aula direta.',
        })
      }
    } finally {
      setIsRequestingDirectLesson(false)
    }
  }

  async function handleAcceptDirectLesson(requestId: string) {
    setIsAcceptingDirectId(requestId)
    setDrawerFeedback(null)
    try {
      const res = await api.patch(`/requests/${requestId}/accept`)
      setDrawerFeedback({
        type: 'success',
        message: 'Aula direta (+15%/h) aceita com sucesso! Redirecionando para a conversa da aula...',
      })
      onDirectLessonChanged?.({
        message: 'Aula direta (+15%/h) aceita com sucesso!',
      })
      await loadMoodleData()
      if (res.data?.session?.id) {
        setSelectedThread({ type: 'SESSION', id: res.data.session.id })
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setDrawerFeedback({
          type: 'error',
          message: err.response?.data?.message || 'Erro ao aceitar aula direta.',
        })
      }
    } finally {
      setIsAcceptingDirectId(null)
    }
  }

  const currentSession =
    selectedThread?.type === 'SESSION'
      ? activeSessions.find((s) => s.id === selectedThread.id) || null
      : null

  const currentContact =
    selectedThread?.type === 'DIRECT'
      ? contacts.find((c) => c.id === selectedThread.id) || null
      : null

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [currentSession?.chatMessages?.length, currentContact?.messages?.length, selectedThread])

  async function handleSendMessage(customText?: string) {
    const text = (customText ?? inputText).trim()
    if (!text || !selectedThread) return

    if (!customText) {
      setInputText('')
    }

    if (selectedThread.type === 'SESSION' && currentSession) {
      const newMsg: ChatMessage = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        senderId: currentUser.id,
        senderName: currentUser.name,
        senderRole: currentUser.role,
        text,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }

      setActiveSessions((prev) =>
        prev.map((s) =>
          s.id === currentSession.id
            ? {
                ...s,
                chatMessages: [...(Array.isArray(s.chatMessages) ? s.chatMessages : []), newMsg],
              }
            : s
        )
      )
      sendMessage('ROOM_CHAT', newMsg, currentSession.id)
      return
    }

    if (selectedThread.type === 'DIRECT' && currentContact) {
      try {
        const res = await api.post(`/chat/direct/${currentContact.id}`, { text })
        const savedMsg: DirectChatMessage = res.data.message
        setContacts((prev) =>
          prev.map((c) =>
            c.id === currentContact.id
              ? { ...c, messages: [...c.messages, savedMsg] }
              : c
          )
        )
      } catch {
        // fallback local
      }
    }
  }

  async function handleCancelLesson(sessionId: string) {
    setIsCancelling(true)
    try {
      const res = await api.post(`/sessions/${sessionId}/cancel`)
      setConfirmCancelSessionId(null)
      setActiveSessions((prev) => prev.filter((s) => s.id !== sessionId))
      onSessionCancelled({
        sessionId,
        refundAmount: res.data?.refundAmount,
        studentCredits: res.data?.studentCredits,
        message: res.data?.message || 'Aula cancelada com sucesso.',
      })
      await loadMoodleData()
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        alert(err.response?.data?.message || 'Erro ao cancelar a aula.')
      }
    } finally {
      setIsCancelling(false)
    }
  }

  if (!isOpen) return null

  const normalizedQuery = searchQuery.trim().toLowerCase()
  const filteredSessions = activeSessions.filter((s) => {
    if (!normalizedQuery) return true
    const partnerName = isStudent ? s.tutor?.name || '' : s.student?.name || ''
    const subj = `${s.request?.subject?.code || ''} ${s.request?.subject?.name || ''} ${s.request?.topic || ''}`
    return (
      partnerName.toLowerCase().includes(normalizedQuery) ||
      subj.toLowerCase().includes(normalizedQuery)
    )
  })

  const filteredContacts = contacts.filter((c) => {
    if (!normalizedQuery) return true
    const subjStr = (c.subjects || []).map((s) => `${s.code} ${s.name}`).join(' ')
    return (
      c.name.toLowerCase().includes(normalizedQuery) ||
      subjStr.toLowerCase().includes(normalizedQuery)
    )
  })

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-4xl h-full shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden">
        {/* Top Moodle Bar */}
        <header className="px-5 py-4 bg-gradient-to-r from-brand-blue via-slate-900 to-brand-purple text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-brand-yellow/20 border border-brand-yellow/40 text-brand-yellow">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-black text-base sm:text-lg text-white">
                  Central de Mensagens & Monitores
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-brand-yellow text-brand-dark text-[10px] font-black uppercase">
                  Chat Ao Vivo
                </span>
              </div>
              <p className="text-xs text-white/75">
                Converse com seus monitores e alunos, gerencie suas aulas ativas, inicie chamadas ou cancele agendamentos.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-white/75 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Main Split Body: Left Contacts/Sessions Drawer + Right Conversation Panel */}
        <div className="flex-1 flex overflow-hidden">
          {/* Coluna Esquerda: Lista de Aulas Ativas e Diretório de Monitores */}
          <div className="w-80 sm:w-88 border-r border-slate-200 bg-slate-50 flex flex-col shrink-0">
            {/* Search & Filter Tabs */}
            <div className="p-3.5 border-b border-slate-200 space-y-2.5 bg-white">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar monitor, aluno ou matéria..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-xs text-brand-dark focus:outline-none focus:border-brand-blue"
                />
              </div>

              <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl text-[11px] font-extrabold">
                <button
                  type="button"
                  onClick={() => setActiveTab('ALL')}
                  className={`py-1.5 rounded-lg transition-all ${
                    activeTab === 'ALL'
                      ? 'bg-white text-brand-blue shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('SESSIONS')}
                  className={`py-1.5 rounded-lg transition-all ${
                    activeTab === 'SESSIONS'
                      ? 'bg-white text-brand-blue shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Aulas ({activeSessions.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('MONITORS')}
                  className={`py-1.5 rounded-lg transition-all ${
                    activeTab === 'MONITORS'
                      ? 'bg-white text-brand-blue shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Contatos ({contacts.length})
                </button>
              </div>
            </div>

            {/* Contact & Session List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-200/70">
              {/* Seção 1: Aulas Ativas */}
              {(activeTab === 'ALL' || activeTab === 'SESSIONS') && (
                <div>
                  <div className="px-4 py-2 bg-slate-100/80 text-[10px] font-black uppercase tracking-wider text-brand-blue flex items-center justify-between">
                    <span>📚 Aulas em Andamento ({filteredSessions.length})</span>
                  </div>

                  {filteredSessions.length === 0 ? (
                    <p className="px-4 py-4 text-xs text-slate-400">
                      Nenhuma aula agendada em andamento no momento.
                    </p>
                  ) : (
                    filteredSessions.map((sess) => {
                      const partner = isStudent ? sess.tutor : sess.student
                      const isSelected =
                        selectedThread?.type === 'SESSION' && selectedThread.id === sess.id
                      const unread = unreadByThread[sess.id] || 0
                      const lastMsg =
                        Array.isArray(sess.chatMessages) && sess.chatMessages.length > 0
                          ? sess.chatMessages[sess.chatMessages.length - 1]
                          : null

                      return (
                        <button
                          key={sess.id}
                          type="button"
                          onClick={() => {
                            setSelectedThread({ type: 'SESSION', id: sess.id })
                            setUnreadByThread((prev) => ({ ...prev, [sess.id]: 0 }))
                          }}
                          className={`w-full text-left p-3.5 transition-all flex items-start gap-3 ${
                            isSelected
                              ? 'bg-brand-blue/10 border-l-4 border-l-brand-blue'
                              : 'hover:bg-white'
                          }`}
                        >
                          <div className="w-10 h-10 rounded-full bg-brand-blue text-brand-yellow flex items-center justify-center font-black text-sm shrink-0">
                            {(partner?.name || 'M').charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-extrabold text-xs text-brand-dark truncate">
                                {partner?.name || (isStudent ? 'Monitor' : 'Aluno')}
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[9px] font-black shrink-0">
                                {sess.durationMinutes}m • R${Number(sess.request?.offeredPrice || 0).toFixed(0)}
                              </span>
                            </div>
                            <p className="text-[11px] font-bold text-brand-purple truncate mt-0.5">
                              {sess.request?.subject?.code} - {sess.request?.topic}
                            </p>
                            <p className="text-[11px] text-slate-500 truncate mt-0.5">
                              {lastMsg ? lastMsg.text : 'Clique para conversar ou iniciar aula'}
                            </p>
                          </div>
                          {unread > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black">
                              {unread}
                            </span>
                          )}
                        </button>
                      )
                    })
                  )}
                </div>
              )}

              {/* Seção 2: Monitores e Alunos que já tiveram contato direto */}
              {(activeTab === 'ALL' || activeTab === 'MONITORS') && (
                <div>
                  <div className="px-4 py-2 bg-slate-100/80 text-[10px] font-black uppercase tracking-wider text-brand-purple flex items-center justify-between">
                    <span>🤝 Contatos Diretos ({filteredContacts.length})</span>
                  </div>

                  {filteredContacts.length === 0 ? (
                    <p className="px-4 py-4 text-xs text-slate-400">
                      Aparecerão aqui apenas os monitores e alunos com quem você já teve contato direto em alguma aula.
                    </p>
                  ) : (
                    filteredContacts.map((contact) => {
                      const isSelected =
                        selectedThread?.type === 'DIRECT' && selectedThread.id === contact.id
                      const unread = unreadByThread[contact.id] || 0
                      const lastMsg =
                        contact.messages.length > 0
                          ? contact.messages[contact.messages.length - 1]
                          : null

                      return (
                        <button
                          key={contact.id}
                          type="button"
                          onClick={() => {
                            setSelectedThread({ type: 'DIRECT', id: contact.id })
                            setUnreadByThread((prev) => ({ ...prev, [contact.id]: 0 }))
                          }}
                          className={`w-full text-left p-3.5 transition-all flex items-start gap-3 ${
                            isSelected
                              ? 'bg-brand-purple/10 border-l-4 border-l-brand-purple'
                              : 'hover:bg-white'
                          }`}
                        >
                          <div className="w-10 h-10 rounded-full bg-brand-purple/15 text-brand-purple flex items-center justify-center font-black text-sm shrink-0">
                            {contact.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-extrabold text-xs text-brand-dark truncate">
                                {contact.name}
                              </span>
                              <span className="text-[10px] font-bold text-amber-500 flex items-center gap-0.5 shrink-0">
                                <Star className="w-3 h-3 fill-current" />
                                {Number(contact.rating || 5).toFixed(1)}
                              </span>
                            </div>
                            {contact.subjects && contact.subjects.length > 0 && (
                              <p className="text-[10px] font-semibold text-brand-blue truncate mt-0.5">
                                {contact.subjects.map((s) => s.code).join(', ')}
                              </p>
                            )}
                            <p className="text-[11px] text-slate-500 truncate mt-0.5">
                              {lastMsg
                                ? `${lastMsg.senderId === currentUser.id ? 'Você: ' : ''}${lastMsg.text}`
                                : 'Iniciar conversa com este monitor'}
                            </p>
                          </div>
                          {unread > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black">
                              {unread}
                            </span>
                          )}
                        </button>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Coluna Direita: Painel da Conversa Selecionada */}
          <div className="flex-1 flex flex-col bg-white overflow-hidden">
            {currentSession ? (
              <>
                {/* Header da Aula Ativa + Botão Iniciar Chamada + Botão Cancelar Aula */}
                <div className="p-4 bg-slate-50 border-b border-slate-200 space-y-3 shrink-0">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-brand-blue text-white text-[10px] font-black">
                          {currentSession.request?.subject?.code || 'AULA'}
                        </span>
                        <h3 className="font-extrabold text-sm text-brand-dark">
                          {currentSession.request?.topic || 'Monitoria em Andamento'}
                        </h3>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-600 mt-1">
                        <span>
                          {isStudent ? 'Monitor:' : 'Aluno:'}{' '}
                          <strong className="text-brand-dark">
                            {isStudent ? currentSession.tutor?.name : currentSession.student?.name}
                          </strong>
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1 font-semibold">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          {currentSession.durationMinutes} min
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1 font-bold text-emerald-600">
                          <DollarSign className="w-3.5 h-3.5" />
                          {Number(currentSession.request?.offeredPrice || 0).toFixed(2)} créd.
                        </span>
                      </div>
                    </div>

                    {/* Botões de Ação da Aula: Iniciar/Entrar na Chamada e Cancelar Aula */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {isStudent ? (
                        <button
                          type="button"
                          onClick={() => onStartCall(currentSession)}
                          className="px-4 py-2 rounded-xl bg-brand-yellow hover:bg-amber-400 text-brand-dark font-black text-xs shadow-md flex items-center gap-1.5 transition-all"
                        >
                          <Video className="w-3.5 h-3.5" />
                          <span>
                            {currentSession.callStartedAt
                              ? 'Retornar à Chamada'
                              : `Iniciar Chamada (${currentSession.durationMinutes}m)`}
                          </span>
                        </button>
                      ) : currentSession.callStartedAt ? (
                        <button
                          type="button"
                          onClick={() => onStartCall(currentSession)}
                          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-md flex items-center gap-1.5 animate-pulse"
                        >
                          <Video className="w-3.5 h-3.5" />
                          <span>Entrar na Chamada Agora</span>
                        </button>
                      ) : (
                        <span className="px-3 py-2 rounded-xl bg-amber-100 text-amber-900 font-bold text-[11px] flex items-center gap-1.5 cursor-not-allowed">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Aguardando Aluno Iniciar...</span>
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => setConfirmCancelSessionId(currentSession.id)}
                        className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-extrabold text-xs flex items-center gap-1.5 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Cancelar Aula</span>
                      </button>
                    </div>
                  </div>

                  {/* Confirmação de Cancelamento com Regra 50% (Aluno) / 100% (Monitor) */}
                  {confirmCancelSessionId === currentSession.id && (
                    <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-150">
                      <div className="flex items-start gap-2 text-xs text-rose-900">
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-black block">
                            Tem certeza que deseja cancelar esta aula agendada?
                          </span>
                          {isStudent ? (
                            <span>
                              Como <strong>Aluno</strong>, ao cancelar uma aula já aceita pelo monitor, você receberá{' '}
                              <strong>
                                50% do valor de volta (+
                                {(Number(currentSession.request?.offeredPrice || 0) * 0.5).toFixed(2)}{' '}
                                créditos)
                              </strong>{' '}
                              na sua carteira.
                            </span>
                          ) : (
                            <span>
                              Como <strong>Monitor</strong>, ao cancelar esta aula, o aluno receberá{' '}
                              <strong>
                                100% do valor de volta (+
                                {Number(currentSession.request?.offeredPrice || 0).toFixed(2)} créditos)
                              </strong>
                              .
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setConfirmCancelSessionId(null)}
                          className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-600 font-bold text-xs"
                        >
                          Voltar
                        </button>
                        <button
                          type="button"
                          disabled={isCancelling}
                          onClick={() => handleCancelLesson(currentSession.id)}
                          className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs shadow-sm disabled:opacity-50"
                        >
                          {isCancelling
                            ? 'Cancelando...'
                            : isStudent
                            ? 'Confirmar (Reembolso 50%)'
                            : 'Confirmar (Estorno 100% ao Aluno)'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Mensagens da Aula */}
                <div className="flex-1 p-5 overflow-y-auto space-y-3 bg-slate-50/50">
                  {(Array.isArray(currentSession.chatMessages) &&
                  currentSession.chatMessages.length > 0
                    ? currentSession.chatMessages
                    : [
                        {
                          id: 'sys-1',
                          senderId: 'system',
                          senderName: 'Sistema Hintlink',
                          senderRole: 'BOT',
                          text: 'Aula conectada! Usem este chat para alinhar dúvidas. Apenas o Aluno pode iniciar a chamada de vídeo.',
                          time: '',
                        },
                      ]
                  ).map((m) => {
                    const isMe = m.senderId === currentUser.id
                    const isBot = m.senderRole === 'BOT'

                    if (isBot) {
                      return (
                        <div
                          key={m.id}
                          className="p-3 rounded-2xl bg-slate-200/80 text-slate-700 text-xs text-center max-w-lg mx-auto font-medium"
                        >
                          {m.text}
                        </div>
                      )
                    }

                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                      >
                        <div
                          className={`max-w-md p-3.5 rounded-2xl text-xs space-y-1 shadow-2xs ${
                            isMe
                              ? 'bg-brand-blue text-white rounded-br-sm'
                              : 'bg-white text-brand-dark border border-slate-200 rounded-bl-sm'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3 text-[10px] opacity-75 font-semibold">
                            <span>{isMe ? 'Você' : m.senderName}</span>
                            <span>{m.time}</span>
                          </div>
                          <p className="leading-relaxed whitespace-pre-wrap">{m.text}</p>
                        </div>
                      </div>
                    )
                  })}
                  <div ref={messagesEndRef} />
                </div>
              </>
            ) : currentContact ? (
              <>
                {/* Header de Conversa Direta com Monitor/Aluno (Apenas Contatos Diretos + Solicitação de Aula Direta +15%) */}
                <div className="p-4 bg-slate-50 border-b border-slate-200 space-y-3 shrink-0">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-brand-purple/15 text-brand-purple flex items-center justify-center font-black text-sm">
                        {currentContact.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-extrabold text-sm text-brand-dark">
                            {currentContact.name}
                          </h3>
                          <span className="px-2 py-0.5 rounded-full bg-brand-purple/10 text-brand-purple text-[10px] font-bold">
                            {currentContact.role === 'TUTOR' ? 'Monitor (Contato Direto)' : 'Aluno (Contato Direto)'}
                          </span>
                          <span className="text-xs font-bold text-amber-500">
                            ★ {Number(currentContact.rating || 5).toFixed(1)}
                          </span>
                        </div>
                        {currentContact.subjects && currentContact.subjects.length > 0 && (
                          <p className="text-[11px] text-slate-600 flex items-center gap-1 mt-0.5">
                            <BookOpen className="w-3 h-3 text-brand-blue shrink-0" />
                            <span>
                              Matérias:{' '}
                              {currentContact.subjects.map((s) => `${s.code} (${s.name})`).join(' • ')}
                            </span>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Se o usuário logado é ALUNO, exibe o botão de Solicitar Aula Direta (+15% por hora) */}
                    {isStudent && (
                      <button
                        type="button"
                        onClick={() => {
                          setDrawerFeedback(null)
                          if (
                            !directSubjectId &&
                            (currentContact.lastSubject?.id || currentContact.subjects?.[0]?.id)
                          ) {
                            setDirectSubjectId(
                              currentContact.lastSubject?.id || currentContact.subjects?.[0]?.id || ''
                            )
                          }
                          setShowDirectLessonForm((prev) => !prev)
                        }}
                        className="px-4 py-2 rounded-xl bg-brand-yellow hover:bg-amber-400 text-brand-dark font-black text-xs shadow-md shadow-brand-yellow/25 flex items-center gap-1.5 transition-all"
                      >
                        <PlusCircle className="w-4 h-4" />
                        <span>Solicitar Aula Direta (+15%/h)</span>
                      </button>
                    )}
                  </div>

                  {drawerFeedback && (
                    <div
                      className={`p-3 rounded-xl text-xs font-bold flex items-center justify-between gap-2 ${
                        drawerFeedback.type === 'success'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-rose-50 text-rose-800 border border-rose-200'
                      }`}
                    >
                      <span>{drawerFeedback.message}</span>
                      <button
                        type="button"
                        onClick={() => setDrawerFeedback(null)}
                        className="text-[10px] underline"
                      >
                        Fechar
                      </button>
                    </div>
                  )}

                  {/* Banner de Aula Direta Pendente (Para o Monitor aceitar ou para o Aluno acompanhar) */}
                  {currentContact.pendingDirectRequest && (
                    <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div>
                        <span className="inline-block px-2 py-0.5 rounded-md bg-brand-purple text-white text-[10px] font-black uppercase mb-1">
                          ⚡ Aula Direta (+15%/h) Pendente
                        </span>
                        <p className="font-extrabold text-brand-dark">
                          {currentContact.pendingDirectRequest.subject?.code} —{' '}
                          {currentContact.pendingDirectRequest.topic} (
                          {currentContact.pendingDirectRequest.durationMinutes} min)
                        </p>
                        <p className="text-[11px] text-emerald-700 font-bold">
                          Valor com +15%: {currentContact.pendingDirectRequest.offeredPrice.toFixed(2)} créditos (R${' '}
                          {currentContact.pendingDirectRequest.offeredPrice.toFixed(2)})
                        </p>
                      </div>
                      {!isStudent ? (
                        <button
                          type="button"
                          disabled={isAcceptingDirectId === currentContact.pendingDirectRequest.id}
                          onClick={() =>
                            handleAcceptDirectLesson(currentContact.pendingDirectRequest!.id)
                          }
                          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-md flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>
                            {isAcceptingDirectId === currentContact.pendingDirectRequest.id
                              ? 'Aceitando...'
                              : 'Aceitar Aula Direta (+15%)'}
                          </span>
                        </button>
                      ) : (
                        <span className="px-3 py-1.5 rounded-xl bg-amber-200/70 text-amber-900 font-bold text-[11px] shrink-0">
                          ⏳ Aguardando aceite de {currentContact.name.split(' ')[0]}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Formulário Inline para o Aluno Solicitar Aula Direta (+15% por hora = R$ 34,50/h) */}
                  {isStudent && showDirectLessonForm && (
                    <form
                      onSubmit={handleRequestDirectLesson}
                      className="p-4 rounded-2xl bg-white border-2 border-brand-yellow shadow-md space-y-3 animate-in fade-in duration-150"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-black text-xs text-brand-blue flex items-center gap-1.5">
                            <Sparkles className="w-4 h-4 text-brand-purple" />
                            <span>
                              Solicitar Aula Direta com {currentContact.name} (+15% / hora)
                            </span>
                          </h4>
                          <p className="text-[11px] text-slate-500">
                            Taxa direta: <strong>R$ 34,50/hora</strong> (acréscimo de 15% sobre R$ 30,00/h pela escolha direta do monitor).
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowDirectLessonForm(false)}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {currentContact.subjects && currentContact.subjects.length > 0 && (
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            Disciplina da Monitoria
                          </label>
                          <select
                            value={directSubjectId}
                            onChange={(e) => setDirectSubjectId(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-brand-light border border-slate-200 text-xs font-bold text-brand-dark focus:outline-none focus:border-brand-blue"
                          >
                            {currentContact.subjects.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.code} - {s.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          Tópico / O que você quer estudar nesta aula?
                        </label>
                        <input
                          type="text"
                          required
                          value={directTopic}
                          onChange={(e) => setDirectTopic(e.target.value)}
                          placeholder="Ex: Continuação dos exercícios de Derivadas..."
                          className="w-full px-3 py-2 rounded-xl bg-brand-light border border-slate-200 text-xs text-brand-dark focus:outline-none focus:border-brand-blue"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                        <div className="sm:col-span-3">
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">
                            Horas
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={12}
                            value={directHours}
                            onChange={(e) =>
                              setDirectHours(Math.max(0, parseInt(e.target.value || '0', 10)))
                            }
                            className="w-full px-2.5 py-1.5 rounded-xl bg-brand-light border border-slate-200 text-xs font-black text-center"
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">
                            Minutos
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={59}
                            value={directMins}
                            onChange={(e) =>
                              setDirectMins(
                                Math.max(0, Math.min(59, parseInt(e.target.value || '0', 10)))
                              )
                            }
                            className="w-full px-2.5 py-1.5 rounded-xl bg-brand-light border border-slate-200 text-xs font-black text-center"
                          />
                        </div>
                        <div className="sm:col-span-6">
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">
                            Valor Total com +15% ({directTotalMinutes} min)
                          </label>
                          <div className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs font-black text-emerald-900">
                            <span>{directCalculatedPrice.toFixed(2)} créd.</span>
                            <span className="text-[10px] text-emerald-700">
                              (Base: {directBasePrice.toFixed(2)} + 15%)
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setShowDirectLessonForm(false)}
                          className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={isRequestingDirectLesson || !directTopic.trim()}
                          className="px-4 py-1.5 rounded-xl bg-brand-blue hover:bg-slate-800 text-white font-black text-xs shadow-sm disabled:opacity-50"
                        >
                          {isRequestingDirectLesson
                            ? 'Enviando...'
                            : `Confirmar Aula Direta (${directCalculatedPrice.toFixed(2)} créd.)`}
                        </button>
                      </div>
                    </form>
                  )}

                  {Array.isArray(currentContact.availability) &&
                    currentContact.availability.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap pt-1">
                        <span className="text-[10px] font-bold text-brand-purple flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Horários deste monitor:
                        </span>
                        {currentContact.availability.map((slot, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] font-semibold text-slate-700"
                          >
                            {slot.day.replace('-feira', '')}: {slot.startTime}–{slot.endTime}
                          </span>
                        ))}
                      </div>
                    )}
                </div>

                {/* Mensagens Diretas */}
                <div className="flex-1 p-5 overflow-y-auto space-y-3 bg-slate-50/50">
                  {currentContact.messages.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 text-xs space-y-2 max-w-sm mx-auto">
                      <Users className="w-8 h-8 mx-auto text-brand-purple/50" />
                      <p className="font-bold text-slate-600">
                        Histórico de Contato Direto com {currentContact.name}
                      </p>
                      <p>
                        Envie uma mensagem abaixo ou clique em <strong>Solicitar Aula Direta (+15%/h)</strong> no topo para contratar uma nova monitoria diretamente com este monitor.
                      </p>
                    </div>
                  ) : (
                    currentContact.messages.map((m) => {
                      const isMe = m.senderId === currentUser.id
                      return (
                        <div
                          key={m.id}
                          className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                        >
                          <div
                            className={`max-w-md p-3.5 rounded-2xl text-xs space-y-2 shadow-2xs ${
                              isMe
                                ? 'bg-brand-purple text-white rounded-br-sm'
                                : 'bg-white text-brand-dark border border-slate-200 rounded-bl-sm'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3 text-[10px] opacity-75 font-semibold">
                              <span>{isMe ? 'Você' : m.senderName}</span>
                              <span>{m.time}</span>
                            </div>
                            <p className="leading-relaxed whitespace-pre-wrap">{m.text}</p>

                            {m.directRequest && !isStudent && (
                              <button
                                type="button"
                                disabled={isAcceptingDirectId === m.directRequest.requestId}
                                onClick={() =>
                                  handleAcceptDirectLesson(m.directRequest!.requestId)
                                }
                                className="w-full mt-1 py-2 px-3 rounded-xl bg-brand-yellow hover:bg-amber-400 text-brand-dark font-black text-xs flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                                <span>
                                  {isAcceptingDirectId === m.directRequest.requestId
                                    ? 'Aceitando...'
                                    : `Aceitar Aula Direta (+${m.directRequest.offeredPrice.toFixed(2)} créd.)`}
                                </span>
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
                <ChevronLeft className="w-8 h-8 mb-2 text-slate-300" />
                <p className="font-bold text-sm text-slate-600">
                  Selecione uma aula ou um contato na lista ao lado
                </p>
                <p className="text-xs mt-1 max-w-xs">
                  Você pode manter conversas independentes com seus monitores e alunos ao mesmo tempo.
                </p>
              </div>
            )}

            {/* Barra de Respostas Rápidas e Input (quando há conversa selecionada) */}
            {(currentSession || currentContact) && (
              <>
                <div className="px-4 py-2 bg-white border-t border-slate-100 flex items-center gap-2 overflow-x-auto shrink-0">
                  <Sparkles className="w-3.5 h-3.5 text-brand-purple shrink-0" />
                  {[
                    'Olá! Você tem disponibilidade para monitoria hoje?',
                    'Estou pronto, podemos iniciar a chamada?',
                    'Podemos combinar para o próximo horário disponível?',
                  ].map((qr) => (
                    <button
                      key={qr}
                      type="button"
                      onClick={() => handleSendMessage(qr)}
                      className="text-[11px] whitespace-nowrap px-3 py-1 rounded-full bg-slate-100 hover:bg-brand-purple/10 hover:text-brand-purple text-slate-600 transition-colors font-medium border border-slate-200"
                    >
                      {qr}
                    </button>
                  ))}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    handleSendMessage()
                  }}
                  className="p-3.5 bg-white border-t border-slate-200 flex items-center gap-2.5 shrink-0"
                >
                  <input
                    type="text"
                    placeholder="Escreva uma mensagem..."
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    className="flex-1 px-4 py-2.5 rounded-2xl bg-brand-light border border-slate-200 text-xs text-brand-dark placeholder-slate-400 focus:outline-none focus:border-brand-purple"
                  />
                  <button
                    type="submit"
                    disabled={!inputText.trim()}
                    className="p-2.5 rounded-2xl bg-brand-purple hover:bg-purple-700 text-white shadow-md transition-all disabled:opacity-40"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
