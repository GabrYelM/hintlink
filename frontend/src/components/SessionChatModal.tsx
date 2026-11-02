'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Send,
  Video,
  Clock,
  DollarSign,
  ShieldCheck,
  User,
  X,
  Calendar,
  Sparkles,
} from 'lucide-react'
import { WebSocketMessage } from '@/hooks/use-socket'

export interface ChatMessage {
  id: string
  senderId: string
  senderName: string
  senderRole: string
  text: string
  time: string
}

export interface SessionChatModalProps {
  session: {
    id: string
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
  currentUser: {
    id: string
    name: string
    role: 'STUDENT' | 'TUTOR' | 'ADMIN'
  }
  sendMessage: (type: string, payload?: unknown, sessionId?: string) => void
  subscribe: (callback: (msg: WebSocketMessage) => void) => () => void
  onStartCall: () => void
  onClose: () => void
}

export function SessionChatModal({
  session,
  currentUser,
  sendMessage,
  subscribe,
  onStartCall,
  onClose,
}: SessionChatModalProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (Array.isArray(session.chatMessages) && session.chatMessages.length > 0) {
      return session.chatMessages
    }
    return [
      {
        id: 'init-1',
        senderId: 'system',
        senderName: 'Sistema Hintlink',
        senderRole: 'BOT',
        text: 'Chamado aceito com sucesso! Usem este chat para alinhar dúvidas, materiais ou combinar o melhor horário antes de iniciar o vídeo.',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]
  })
  const [inputText, setInputText] = useState('')
  const [isPartnerInCall, setIsPartnerInCall] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  const isStudent = currentUser.role === 'STUDENT'
  const partner = isStudent ? session.tutor : session.student
  const partnerRoleLabel = isStudent ? 'Monitor' : 'Aluno'

  // Join Room via WebSocket & Listen for events
  useEffect(() => {
    // Entra na sala do websocket
    sendMessage('JOIN_ROOM', {}, session.id)

    const unsubscribe = subscribe((msg) => {
      if (msg.sessionId && msg.sessionId !== session.id) return

      if (msg.type === 'ROOM_CHAT' && msg.payload) {
        setMessages((prev) => [...prev, msg.payload as ChatMessage])
      }

      if (msg.type === 'CALL_STARTED') {
        setIsPartnerInCall(true)
      }
    })

    return () => {
      sendMessage('LEAVE_ROOM', {}, session.id)
      unsubscribe()
    }
  }, [session.id, sendMessage, subscribe])

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSend(textToSend?: string) {
    const text = (textToSend || inputText).trim()
    if (!text) return

    const newMsg: ChatMessage = {
      id: `${Date.now()}-${Math.random()}`,
      senderId: currentUser.id,
      senderName: currentUser.name,
      senderRole: currentUser.role,
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    setMessages((prev) => [...prev, newMsg])
    sendMessage('ROOM_CHAT', newMsg, session.id)
    if (!textToSend) {
      setInputText('')
    }
  }

  function handleLaunchCall() {
    sendMessage('CALL_STARTED', { startedBy: currentUser.id }, session.id)
    onStartCall()
  }

  const quickReplies = [
    'Olá! Podemos iniciar a chamada de vídeo agora?',
    'Estou pronto, vamos começar!',
    'Podemos agendar para daqui a 15 minutos?',
    'Qual exercício você quer resolver primeiro?',
  ]

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-3xl w-full h-[620px] shadow-2xl flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="p-4 sm:p-5 bg-gradient-to-r from-brand-blue to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-white/10 backdrop-blur-md text-brand-yellow flex items-center justify-center font-black">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-brand-yellow/20 text-brand-yellow border border-brand-yellow/30">
                  Agendamento & Chat Pré-Chamada
                </span>
                <span className="text-xs text-white/70">
                  {session.request?.subject?.code} - {session.request?.subject?.name}
                </span>
              </div>
              <h3 className="font-extrabold text-base text-white truncate max-w-md">
                {session.request?.topic || 'Monitoria Agendada'}
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Info Strip (Parceiro, Tempo, Pix) */}
        <div className="bg-brand-light px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-brand-purple/10 text-brand-purple flex items-center justify-center font-bold text-xs">
              <User className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="font-bold text-brand-dark block">
                {partner?.name || `${partnerRoleLabel}`}
              </span>
              <span className="text-[11px] text-slate-500">
                {partnerRoleLabel} ({partner?.rating ? `${partner.rating} ★` : 'Novo'})
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-slate-600 font-mono">
            <span className="flex items-center gap-1 font-semibold">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              {session.durationMinutes} min
            </span>
            <span className="flex items-center gap-1 font-bold text-emerald-600">
              <DollarSign className="w-3.5 h-3.5" />
              R$ {Number(session.request?.offeredPrice || 25).toFixed(2)}
            </span>
            <span className="hidden sm:flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
              Custódia Retida
            </span>
          </div>
        </div>

        {/* Banner de Chamada Pronta / Em Andamento */}
        {isPartnerInCall ? (
          <div className="bg-emerald-600 text-white px-5 py-2.5 flex items-center justify-between animate-pulse shrink-0">
            <div className="flex items-center gap-2 text-xs font-bold">
              <span className="h-2.5 w-2.5 rounded-full bg-white"></span>
              <span>O {partnerRoleLabel} já está aguardando na chamada de vídeo!</span>
            </div>
            <button
              onClick={handleLaunchCall}
              className="px-4 py-1.5 rounded-xl bg-white text-emerald-800 font-black text-xs hover:bg-slate-100 shadow-sm flex items-center gap-1.5"
            >
              <Video className="w-3.5 h-3.5" />
              <span>Entrar na Aula Agora</span>
            </button>
          </div>
        ) : (
          <div className="bg-brand-blue/5 border-b border-brand-blue/10 px-5 py-2 flex items-center justify-between text-xs shrink-0">
            <span className="text-slate-600 font-medium">
              Alinhem o dia e a hora pelo chat ou cliquem no botão para iniciar imediatamente:
            </span>
            <button
              onClick={handleLaunchCall}
              className="px-4 py-1.5 rounded-xl bg-brand-yellow hover:bg-amber-400 text-brand-dark font-extrabold text-xs shadow-md shadow-brand-yellow/20 flex items-center gap-1.5 transition-all"
            >
              <Video className="w-3.5 h-3.5" />
              <span>Iniciar Videochamada</span>
            </button>
          </div>
        )}

        {/* Message Feed */}
        <div className="flex-1 p-5 overflow-y-auto space-y-3 bg-slate-50/50">
          {messages.map((m) => {
            const isMe = m.senderId === currentUser.id
            const isBot = m.senderRole === 'BOT'

            if (isBot) {
              return (
                <div
                  key={m.id}
                  className="p-3 rounded-2xl bg-slate-200/80 text-slate-700 text-xs text-center max-w-lg mx-auto"
                >
                  <p className="font-medium">{m.text}</p>
                </div>
              )
            }

            return (
              <div
                key={m.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-md p-3.5 rounded-2xl text-xs space-y-1 shadow-sm ${
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

        {/* Quick Replies Bar */}
        <div className="px-5 py-2 bg-white border-t border-slate-100 flex items-center gap-2 overflow-x-auto shrink-0 scrollbar-none">
          <Sparkles className="w-3.5 h-3.5 text-brand-purple shrink-0" />
          {quickReplies.map((qr) => (
            <button
              key={qr}
              onClick={() => handleSend(qr)}
              className="text-[11px] whitespace-nowrap px-3 py-1 rounded-full bg-slate-100 hover:bg-brand-purple/10 hover:text-brand-purple text-slate-600 transition-colors font-medium border border-slate-200"
            >
              {qr}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSend()
          }}
          className="p-4 bg-white border-t border-slate-200 flex items-center gap-3 shrink-0"
        >
          <input
            type="text"
            placeholder="Digite uma mensagem para alinhar o atendimento..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="flex-1 px-4 py-3 rounded-2xl bg-brand-light border border-slate-200 text-xs text-brand-dark placeholder-slate-400 focus:outline-none focus:border-brand-purple"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="p-3 rounded-2xl bg-brand-purple hover:bg-purple-700 text-white shadow-md shadow-brand-purple/20 transition-all disabled:opacity-40"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  )
}
