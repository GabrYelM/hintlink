'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '@/services/api'
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  MonitorUp,
  MonitorX,
  Eraser,
  Trash2,
  Download,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Star,
  PhoneOff,
  Volume2,
  VolumeX,
  MessageSquare,
  Send,
  X,
  RefreshCw,
  LogOut,
  Maximize2,
} from 'lucide-react'
import axios from 'axios'
import { WebSocketMessage } from '@/hooks/use-socket'

interface VirtualRoomProps {
  sessionId: string
  currentUser: {
    id: string
    name: string
    role: 'STUDENT' | 'TUTOR' | 'ADMIN'
  }
  isDemoMode?: boolean
  sendMessage?: (type: string, payload?: unknown, sessionId?: string) => void
  subscribe?: (callback: (msg: WebSocketMessage) => void) => () => void
  onClose: () => void
}

interface ChatMessage {
  id: string
  senderId?: string
  senderName: string
  senderRole: string
  text: string
  time: string
}

interface StrokeData {
  prevX: number
  prevY: number
  currentX: number
  currentY: number
  color: string
  width: number
}

export function VirtualRoom({
  sessionId,
  currentUser,
  isDemoMode = false,
  sendMessage,
  subscribe,
  onClose,
}: VirtualRoomProps) {
  // Media State
  const [isVideoEnabled, setIsVideoEnabled] = useState(true)
  const [isAudioEnabled, setIsAudioEnabled] = useState(true)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false)
  const [audioVolumeLevel, setAudioVolumeLevel] = useState(0) // 0 to 100 for VU meter
  const [hasRemoteStream, setHasRemoteStream] = useState(false)

  // Focus Mode: Ambos ficam visíveis, apenas alternando o foco principal
  const [focusMode, setFocusMode] = useState<'VIDEO' | 'WHITEBOARD'>('VIDEO')
  const [isChatOpen, setIsChatOpen] = useState(false)

  // Whiteboard State
  const [drawColor, setDrawColor] = useState('#163A5F')
  const [lineWidth, setLineWidth] = useState(3)
  const [isEraser, setIsEraser] = useState(false)
  const strokeHistoryRef = useRef<StrokeData[]>([])

  // MediaRecorder / Pre-recording State
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDurationSeconds, setRecordingDurationSeconds] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])

  // Finish / Dispute Modal State (Exclusivo do Aluno)
  const [isEndModalOpen, setIsEndModalOpen] = useState(false)
  const [doubtResolved, setDoubtResolved] = useState<boolean | null>(null)
  const [studentRating, setStudentRating] = useState<number>(5)
  const [studentFeedback, setStudentFeedback] = useState('')
  const [disputeReason, setDisputeReason] = useState('')
  const [isSubmittingFinish, setIsSubmittingFinish] = useState(false)
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null)
  const [autoCloseAlert, setAutoCloseAlert] = useState<string | null>(null)

  // Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      senderName: 'Sistema Hintlink',
      senderRole: 'BOT',
      text: 'Sala iniciada. Gravação de conformidade ativa. Se a dúvida for sanada, a gravação será descartada ao final.',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ])
  const [newMessageText, setNewMessageText] = useState('')

  // Refs
  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null)
  const screenVideoRef = useRef<HTMLVideoElement | null>(null)
  const whiteboardCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const isDrawingRef = useRef(false)
  const lastPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  const isStudent = currentUser.role === 'STUDENT'

  // Replay Strokes on Canvas
  const replayStrokes = useCallback(() => {
    const canvas = whiteboardCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, 1200, 700)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    for (const s of strokeHistoryRef.current) {
      ctx.beginPath()
      ctx.moveTo(s.prevX, s.prevY)
      ctx.lineTo(s.currentX, s.currentY)
      ctx.strokeStyle = s.color
      ctx.lineWidth = s.width
      ctx.stroke()
    }
  }, [])

  // Initialize WebRTC Peer Connection
  const createPeerConnection = useCallback(() => {
    if (peerConnectionRef.current) return peerConnectionRef.current

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    })

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!)
      })
    }

    pc.ontrack = (event) => {
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0]
        setHasRemoteStream(true)
      }
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && sendMessage && !isDemoMode) {
        sendMessage('RTC_ICE_CANDIDATE', event.candidate, sessionId)
      }
    }

    peerConnectionRef.current = pc
    return pc
  }, [sessionId, sendMessage, isDemoMode])

  // Iniciar Negociação WebRTC
  const initiateOffer = useCallback(async () => {
    if (isDemoMode) return
    const pc = createPeerConnection()
    try {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      sendMessage?.('RTC_OFFER', offer, sessionId)
    } catch (err) {
      console.warn('Erro ao criar WebRTC offer:', err)
    }
  }, [createPeerConnection, isDemoMode, sendMessage, sessionId])

  // WebSocket Subscription for Real-time Sync (Draw, Chat, WebRTC, Call End)
  useEffect(() => {
    if (isDemoMode || !subscribe || !sendMessage) return

    sendMessage('JOIN_ROOM', {}, sessionId)

    const unsubscribe = subscribe(async (msg) => {
      if (msg.sessionId && msg.sessionId !== sessionId) return

      if (msg.type === 'USER_JOINED_ROOM') {
        if (currentUser.role === 'TUTOR') {
          initiateOffer()
        }
      }

      if (msg.type === 'RTC_OFFER' && msg.payload) {
        const pc = createPeerConnection()
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.payload as RTCSessionDescriptionInit))
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          sendMessage('RTC_ANSWER', answer, sessionId)
        } catch (err) {
          console.warn('Erro ao processar WebRTC offer:', err)
        }
      }

      if (msg.type === 'RTC_ANSWER' && msg.payload) {
        const pc = peerConnectionRef.current
        if (pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.payload as RTCSessionDescriptionInit))
          } catch (err) {
            console.warn('Erro ao processar WebRTC answer:', err)
          }
        }
      }

      if (msg.type === 'RTC_ICE_CANDIDATE' && msg.payload) {
        const pc = peerConnectionRef.current
        if (pc) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(msg.payload as RTCIceCandidateInit))
          } catch (err) {
            console.warn('Erro ao adicionar ICE candidate:', err)
          }
        }
      }

      // Quadro Branco: Traço recebido em tempo real
      if (msg.type === 'ROOM_DRAW' && msg.payload) {
        const s = msg.payload as StrokeData
        strokeHistoryRef.current.push(s)
        const canvas = whiteboardCanvasRef.current
        if (canvas) {
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.beginPath()
            ctx.moveTo(s.prevX, s.prevY)
            ctx.lineTo(s.currentX, s.currentY)
            ctx.strokeStyle = s.color
            ctx.lineWidth = s.width
            ctx.lineCap = 'round'
            ctx.lineJoin = 'round'
            ctx.stroke()
          }
        }
      }

      // Quadro Branco: Limpar Lousa
      if (msg.type === 'ROOM_CLEAR_BOARD') {
        strokeHistoryRef.current = []
        const canvas = whiteboardCanvasRef.current
        if (canvas) {
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.fillStyle = '#FFFFFF'
            ctx.fillRect(0, 0, 1200, 700)
          }
        }
      }

      // Chat da Sala
      if (msg.type === 'ROOM_CHAT' && msg.payload) {
        setChatMessages((prev) => [...prev, msg.payload as ChatMessage])
      }

      // Aluno encerrou a chamada -> Monitor fecha automaticamente
      if (msg.type === 'CALL_ENDED_BY_STUDENT') {
        setAutoCloseAlert(
          'O aluno encerrou a monitoria e enviou a avaliação de conformidade. A sala foi finalizada.'
        )
        setTimeout(() => {
          onClose()
        }, 3000)
      }
    })

    return () => {
      sendMessage('LEAVE_ROOM', {}, sessionId)
      unsubscribe()
    }
  }, [isDemoMode, subscribe, sendMessage, sessionId, currentUser.role, createPeerConnection, initiateOffer, onClose])

  // Initialize Canvas Fixed Dimensions once
  useEffect(() => {
    const canvas = whiteboardCanvasRef.current
    if (!canvas) return
    canvas.width = 1200
    canvas.height = 700
    replayStrokes()
  }, [replayStrokes])

  // Initialize Local Media Streams & Continuous Pre-Recording
  useEffect(() => {
    let animationFrameId: number

    async function initMedia() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        })
        localStreamRef.current = stream

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream
        }

        if (peerConnectionRef.current) {
          stream.getTracks().forEach((track) => {
            peerConnectionRef.current?.addTrack(track, stream)
          })
        }

        // Setup Audio Analyser for VU meter
        try {
          const AudioContextClass =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
          const audioCtx = new AudioContextClass()
          audioContextRef.current = audioCtx
          const source = audioCtx.createMediaStreamSource(stream)
          const analyser = audioCtx.createAnalyser()
          analyser.fftSize = 256
          source.connect(analyser)

          const dataArray = new Uint8Array(analyser.frequencyBinCount)
          const updateVU = () => {
            analyser.getByteFrequencyData(dataArray)
            let sum = 0
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i]
            }
            const average = sum / dataArray.length
            setAudioVolumeLevel(Math.min(100, Math.round((average / 128) * 100)))
            animationFrameId = requestAnimationFrame(updateVU)
          }
          updateVU()
        } catch (audioErr) {
          console.warn('Erro ao inicializar medidor de áudio:', audioErr)
        }

        // Setup Continuous Pre-recording via MediaRecorder
        try {
          recordedChunksRef.current = []
          const recorder = new MediaRecorder(stream, {
            mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
              ? 'video/webm;codecs=vp9'
              : 'video/webm',
          })

          recorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
              recordedChunksRef.current.push(event.data)
            }
          }

          recorder.start(1000)
          mediaRecorderRef.current = recorder
          setIsRecording(true)
        } catch (recorderErr) {
          console.warn('MediaRecorder não suportado:', recorderErr)
        }
      } catch (err) {
        console.warn('Permissão de câmera/microfone não concedida:', err)
      }
    }

    initMedia()

    const timerInterval = setInterval(() => {
      setRecordingDurationSeconds((prev) => prev + 1)
    }, 1000)

    return () => {
      clearInterval(timerInterval)
      cancelAnimationFrame(animationFrameId)
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop())
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop())
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close()
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {})
      }
    }
  }, [])

  // Toggle Camera
  function toggleVideo() {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled
        setIsVideoEnabled(videoTrack.enabled)
      }
    }
  }

  // Toggle Microphone
  function toggleAudio() {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
        setIsAudioEnabled(audioTrack.enabled)
      }
    }
  }

  // Toggle Screen Sharing & Replace Track in WebRTC PeerConnection
  async function toggleScreenSharing() {
    if (isScreenSharing) {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop())
        screenStreamRef.current = null
      }
      if (peerConnectionRef.current && localStreamRef.current) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0]
        const sender = peerConnectionRef.current
          .getSenders()
          .find((s) => s.track?.kind === 'video')
        if (sender && videoTrack) {
          sender.replaceTrack(videoTrack)
        }
      }
      setIsScreenSharing(false)
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        })
        screenStreamRef.current = stream
        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = stream
        }

        const screenTrack = stream.getVideoTracks()[0]
        if (peerConnectionRef.current && screenTrack) {
          const sender = peerConnectionRef.current
            .getSenders()
            .find((s) => s.track?.kind === 'video')
          if (sender) {
            sender.replaceTrack(screenTrack)
          }
        }

        screenTrack.onended = () => {
          setIsScreenSharing(false)
          if (peerConnectionRef.current && localStreamRef.current) {
            const videoTrack = localStreamRef.current.getVideoTracks()[0]
            const sender = peerConnectionRef.current
              .getSenders()
              .find((s) => s.track?.kind === 'video')
            if (sender && videoTrack) {
              sender.replaceTrack(videoTrack)
            }
          }
        }
        setIsScreenSharing(true)
      } catch (err) {
        console.warn('Compartilhamento de tela cancelado:', err)
      }
    }
  }

  // Canvas Drawing Handlers (Apenas permitido quando foco está no quadro)
  function startDrawing(e: React.MouseEvent<HTMLCanvasElement>) {
    if (focusMode !== 'WHITEBOARD') return
    const canvas = whiteboardCanvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const scaleX = 1200 / rect.width
    const scaleY = 700 / rect.height

    isDrawingRef.current = true
    lastPosRef.current = {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  function draw(e: React.MouseEvent<HTMLCanvasElement>) {
    if (focusMode !== 'WHITEBOARD' || !isDrawingRef.current) return
    const canvas = whiteboardCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    const scaleX = 1200 / rect.width
    const scaleY = 700 / rect.height
    const currentX = (e.clientX - rect.left) * scaleX
    const currentY = (e.clientY - rect.top) * scaleY

    const strokeColor = isEraser ? '#FFFFFF' : drawColor
    const strokeWidth = isEraser ? lineWidth * 4 : lineWidth

    ctx.beginPath()
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y)
    ctx.lineTo(currentX, currentY)
    ctx.strokeStyle = strokeColor
    ctx.lineWidth = strokeWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()

    const stroke: StrokeData = {
      prevX: lastPosRef.current.x,
      prevY: lastPosRef.current.y,
      currentX,
      currentY,
      color: strokeColor,
      width: strokeWidth,
    }
    strokeHistoryRef.current.push(stroke)

    if (sendMessage && !isDemoMode) {
      sendMessage('ROOM_DRAW', stroke, sessionId)
    }

    lastPosRef.current = { x: currentX, y: currentY }
  }

  function stopDrawing() {
    isDrawingRef.current = false
  }

  function clearWhiteboard() {
    const canvas = whiteboardCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, 1200, 700)
    strokeHistoryRef.current = []

    if (sendMessage && !isDemoMode) {
      sendMessage('ROOM_CLEAR_BOARD', {}, sessionId)
    }
  }

  function downloadWhiteboard() {
    const canvas = whiteboardCanvasRef.current
    if (!canvas) return
    const link = document.createElement('a')
    link.download = `hintlink-quadro-${sessionId}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  // Send Chat Message
  function handleSendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!newMessageText.trim()) return

    const msg: ChatMessage = {
      id: Date.now().toString(),
      senderId: currentUser.id,
      senderName: currentUser.name,
      senderRole: currentUser.role,
      text: newMessageText.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    setChatMessages((prev) => [...prev, msg])
    if (sendMessage && !isDemoMode) {
      sendMessage('ROOM_CHAT', msg, sessionId)
    }
    setNewMessageText('')
  }

  // Finalizar Sessão (Quando Dúvida Foi Sanada - EXCLUSIVO ALUNO)
  async function handleConfirmResolved() {
    setIsSubmittingFinish(true)
    try {
      if (!isDemoMode) {
        await api.post(`/sessions/${sessionId}/finish`, {
          studentRating,
          studentFeedback: studentFeedback.trim() || undefined,
        })
        sendMessage?.('CALL_ENDED_BY_STUDENT', { resolved: true }, sessionId)
      }

      recordedChunksRef.current = []

      setActionSuccessMessage(
        'Sessão finalizada com sucesso! A gravação foi descartada e o Pix em custódia foi liberado para o monitor.'
      )

      setTimeout(() => {
        onClose()
      }, 2500)
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.message || 'Erro ao finalizar aula.'
        : 'Erro inesperado.'
      alert(msg)
    } finally {
      setIsSubmittingFinish(false)
    }
  }

  // Abrir Disputa com Gravação Anexada (EXCLUSIVO ALUNO)
  async function handleConfirmDispute() {
    if (!disputeReason.trim() || disputeReason.length < 5) {
      alert('Por favor, descreva em detalhes por que sua dúvida não foi sanada.')
      return
    }

    setIsSubmittingFinish(true)
    try {
      const videoBlob = new Blob(recordedChunksRef.current, { type: 'video/webm' })

      if (!isDemoMode) {
        const formData = new FormData()
        formData.append('reason', disputeReason)
        formData.append('video', videoBlob, `session-${sessionId}-dispute.webm`)

        await api.post(`/sessions/${sessionId}/dispute-with-recording`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        })
        sendMessage?.('CALL_ENDED_BY_STUDENT', { resolved: false }, sessionId)
      }

      setActionSuccessMessage(
        'Ticket de ouvidoria aberto com sucesso! A gravação desta chamada foi enviada com segurança para análise pela administração do Hintlink. O pagamento em custódia foi congelado.'
      )

      setTimeout(() => {
        onClose()
      }, 3000)
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.message || 'Erro ao enviar contestação com gravação.'
        : 'Erro inesperado.'
      alert(msg)
    } finally {
      setIsSubmittingFinish(false)
    }
  }

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60)
    const s = secs % 60
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col font-sans select-none overflow-hidden">
      {/* Top Bar da Chamada */}
      <header className="h-16 px-4 sm:px-6 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="font-black text-sm text-slate-100 tracking-tight">
              {isDemoMode ? '🧪 Laboratório de Testes de Chamada (UFABC)' : 'Sala de Monitoria Hintlink'}
            </span>
          </div>

          {/* Badge de Gravação Contínua de Segurança */}
          {isRecording && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-rose-950/80 border border-rose-800/80 text-rose-300 text-xs font-bold">
              <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping"></span>
              <span>Gravação de Segurança Ativa ({formatTime(recordingDurationSeconds)})</span>
            </div>
          )}

          {/* Badge de Custódia Pix */}
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-950/60 border border-amber-800/60 text-brand-yellow text-xs font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Custódia Pix HELD</span>
          </div>
        </div>

        {/* Alternância de Foco: Vídeo ou Quadro Branco */}
        <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl">
          <button
            onClick={() => setFocusMode('VIDEO')}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 ${
              focusMode === 'VIDEO'
                ? 'bg-brand-blue text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>Foco no Vídeo</span>
          </button>
          <button
            onClick={() => setFocusMode('WHITEBOARD')}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 ${
              focusMode === 'WHITEBOARD'
                ? 'bg-brand-purple text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Foco no Quadro</span>
          </button>
        </div>

        {/* Ações Direitas */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsChatOpen(!isChatOpen)}
            className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all ${
              isChatOpen
                ? 'bg-brand-purple text-white border-brand-purple'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span className="hidden sm:inline">Chat</span>
          </button>

          {/* Se Aluno: Botão de Encerrar Sessão com Avaliação */}
          {isStudent ? (
            <button
              onClick={() => setIsEndModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs flex items-center gap-2 shadow-lg shadow-rose-900/40 transition-all"
            >
              <PhoneOff className="w-4 h-4" />
              <span>Encerrar Sessão</span>
            </button>
          ) : (
            /* Se Monitor: Botão de Sair da Sala */
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-extrabold text-xs flex items-center gap-2 transition-all"
            >
              <LogOut className="w-4 h-4 text-slate-400" />
              <span>Sair da Sala</span>
            </button>
          )}
        </div>
      </header>

      {/* Alerta de encerramento automático disparado pelo aluno para o monitor */}
      {autoCloseAlert && (
        <div className="bg-emerald-600 text-white text-center py-2.5 px-4 text-xs font-extrabold flex items-center justify-center gap-2 animate-bounce">
          <CheckCircle2 className="w-4 h-4" />
          <span>{autoCloseAlert}</span>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Stage Central: Ambos Vídeo e Lousa ficam SEMPRE no DOM para evitar interrupções de áudio/vídeo e descarte de traços */}
        <div className="flex-1 p-3 sm:p-4 flex flex-col items-center justify-center relative bg-slate-900/50 overflow-hidden w-full h-full">
          {/* CONTAINER DO VÍDEO (Permanente no DOM) */}
          <div
            className={`transition-all duration-300 ${
              focusMode === 'VIDEO'
                ? 'w-full h-full max-w-6xl grid grid-cols-1 md:grid-cols-2 gap-4'
                : 'absolute top-4 right-4 z-30 flex flex-col sm:flex-row gap-2 bg-slate-950/90 p-2.5 rounded-2xl border border-slate-700/80 shadow-2xl backdrop-blur-md'
            }`}
          >
            {/* Local Video Box */}
            <div
              className={`relative bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-xl flex items-center justify-center transition-all ${
                focusMode === 'VIDEO' ? 'w-full h-full' : 'w-36 h-24 sm:w-44 sm:h-28'
              }`}
            >
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className={`w-full h-full object-cover ${!isVideoEnabled ? 'hidden' : ''}`}
              />
              {!isVideoEnabled && (
                <div className="flex flex-col items-center justify-center text-slate-500">
                  <div
                    className={`rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-400 ${
                      focusMode === 'VIDEO' ? 'h-20 w-20 text-2xl mb-3' : 'h-10 w-10 text-sm'
                    }`}
                  >
                    {currentUser.name.charAt(0).toUpperCase()}
                  </div>
                  {focusMode === 'VIDEO' && <p className="font-semibold text-sm">Câmera Desligada</p>}
                </div>
              )}

              {/* Card do Usuário Local */}
              <div
                className={`absolute bottom-2 left-2 bg-slate-950/80 backdrop-blur-md rounded-xl border border-slate-700/60 flex items-center gap-1.5 ${
                  focusMode === 'VIDEO' ? 'px-3.5 py-1.5 text-xs' : 'px-2 py-0.5 text-[10px]'
                }`}
              >
                <span className="font-bold text-slate-100">
                  Você ({currentUser.name.split(' ')[0]})
                </span>
                {!isAudioEnabled && <MicOff className="w-3 h-3 text-rose-400" />}

                {/* VU Meter */}
                {isAudioEnabled && (
                  <div className="flex items-center gap-0.5 ml-1">
                    <span
                      className="w-1 bg-emerald-400 rounded-full transition-all"
                      style={{ height: `${Math.max(3, (audioVolumeLevel / 100) * 12)}px` }}
                    ></span>
                    <span
                      className="w-1 bg-emerald-400 rounded-full transition-all"
                      style={{ height: `${Math.max(3, (audioVolumeLevel / 100) * 16)}px` }}
                    ></span>
                    <span
                      className="w-1 bg-emerald-400 rounded-full transition-all"
                      style={{ height: `${Math.max(3, (audioVolumeLevel / 100) * 10)}px` }}
                    ></span>
                  </div>
                )}
              </div>
            </div>

            {/* Remote Video Box (Fluxo Real do Parceiro via WebRTC) */}
            <div
              className={`relative bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-xl flex items-center justify-center transition-all ${
                focusMode === 'VIDEO' ? 'w-full h-full' : 'w-36 h-24 sm:w-44 sm:h-28'
              }`}
            >
              {isScreenSharing ? (
                <video
                  ref={screenVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-contain bg-black"
                />
              ) : (
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className={`w-full h-full object-cover ${!hasRemoteStream && !isDemoMode ? 'hidden' : ''}`}
                />
              )}

              {!hasRemoteStream && !isDemoMode && !isScreenSharing && (
                <div className="flex flex-col items-center justify-center text-center p-3 text-slate-400">
                  <div
                    className={`rounded-full bg-brand-purple/20 text-brand-purple flex items-center justify-center font-black border border-brand-purple/40 ${
                      focusMode === 'VIDEO' ? 'h-16 w-16 text-2xl mb-2' : 'h-8 w-8 text-xs'
                    }`}
                  >
                    👥
                  </div>
                  {focusMode === 'VIDEO' && (
                    <>
                      <p className="font-extrabold text-slate-200 text-sm">Aguardando Parceiro</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">Sincronizando áudio e vídeo P2P...</p>
                    </>
                  )}
                </div>
              )}

              {isDemoMode && !isScreenSharing && (
                <div className="flex flex-col items-center justify-center text-center p-3 text-slate-400">
                  <div
                    className={`rounded-full bg-brand-purple/20 text-brand-purple flex items-center justify-center font-black border border-brand-purple/40 ${
                      focusMode === 'VIDEO' ? 'h-16 w-16 text-2xl mb-2' : 'h-8 w-8 text-xs'
                    }`}
                  >
                    LM
                  </div>
                  {focusMode === 'VIDEO' && (
                    <>
                      <p className="font-extrabold text-slate-200 text-sm">Prof. Lucas Mendes (Monitor)</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">Ambiente de Demonstração</p>
                    </>
                  )}
                </div>
              )}

              <div
                className={`absolute bottom-2 left-2 bg-slate-950/80 backdrop-blur-md rounded-xl border border-slate-700/60 flex items-center gap-1.5 ${
                  focusMode === 'VIDEO' ? 'px-3.5 py-1.5 text-xs' : 'px-2 py-0.5 text-[10px]'
                }`}
              >
                <span className="font-bold text-slate-100">
                  {isScreenSharing
                    ? '🖥️ Compartilhamento de Tela'
                    : isDemoMode
                    ? 'Lucas Mendes (Monitor)'
                    : isStudent
                    ? 'Monitor'
                    : 'Aluno'}
                </span>
              </div>
            </div>

            {/* Botão para Focar no Vídeo quando minimizado */}
            {focusMode === 'WHITEBOARD' && (
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2">
                <button
                  onClick={() => setFocusMode('VIDEO')}
                  className="px-3 py-1 rounded-full bg-brand-blue hover:bg-slate-800 text-white text-[10px] font-extrabold shadow-md flex items-center gap-1 border border-blue-400/30 whitespace-nowrap"
                >
                  <Video className="w-3 h-3 text-brand-yellow" />
                  <span>Focar no Vídeo</span>
                </button>
              </div>
            )}
          </div>

          {/* CONTAINER DO QUADRO BRANCO (Permanente no DOM) */}
          <div
            className={`transition-all duration-300 ${
              focusMode === 'WHITEBOARD'
                ? 'w-full h-full max-w-6xl flex flex-col bg-slate-900 rounded-3xl overflow-hidden border border-slate-800 shadow-2xl relative'
                : 'absolute bottom-4 right-4 z-30 w-72 sm:w-96 h-48 sm:h-56 rounded-2xl overflow-hidden shadow-2xl border-2 border-brand-purple/70 bg-white flex flex-col cursor-pointer group hover:scale-[1.02]'
            }`}
            onClick={() => {
              if (focusMode === 'VIDEO') {
                setFocusMode('WHITEBOARD')
              }
            }}
          >
            {/* Toolbar do Quadro Branco (Ativa apenas em Foco no Quadro) */}
            {focusMode === 'WHITEBOARD' ? (
              <div className="p-3 bg-slate-800 border-b border-slate-700 flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2">
                  {/* Cores Oficiais */}
                  {[
                    { color: '#163A5F', label: 'Azul UFABC' },
                    { color: '#7048A8', label: 'Roxo Hintlink' },
                    { color: '#F5B942', label: 'Amarelo Dourado' },
                    { color: '#18202A', label: 'Preto Grafite' },
                    { color: '#DC2626', label: 'Vermelho Destaque' },
                  ].map((c) => (
                    <button
                      key={c.color}
                      title={c.label}
                      onClick={(e) => {
                        e.stopPropagation()
                        setDrawColor(c.color)
                        setIsEraser(false)
                      }}
                      className={`h-6 w-6 rounded-full border-2 transition-transform ${
                        !isEraser && drawColor === c.color ? 'scale-125 border-white shadow-md' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c.color }}
                    />
                  ))}

                  <div className="h-5 w-px bg-slate-600 mx-2" />

                  {/* Espessuras */}
                  {[2, 4, 8].map((w) => (
                    <button
                      key={w}
                      onClick={(e) => {
                        e.stopPropagation()
                        setLineWidth(w)
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                        lineWidth === w ? 'bg-brand-blue text-white' : 'text-slate-400 hover:bg-slate-700'
                      }`}
                    >
                      {w === 2 ? 'Fino' : w === 4 ? 'Médio' : 'Grosso'}
                    </button>
                  ))}

                  <div className="h-5 w-px bg-slate-600 mx-2" />

                  {/* Borracha */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setIsEraser(!isEraser)
                    }}
                    className={`p-1.5 rounded-lg text-xs font-bold flex items-center gap-1 ${
                      isEraser ? 'bg-amber-500 text-slate-950 font-black' : 'text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <Eraser className="w-4 h-4" />
                    <span>Borracha</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      clearWhiteboard()
                    }}
                    className="p-1.5 px-3 rounded-lg text-xs font-bold text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 flex items-center gap-1 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Limpar</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      downloadWhiteboard()
                    }}
                    className="p-1.5 px-3 rounded-lg text-xs font-bold text-slate-200 bg-slate-700 hover:bg-slate-600 flex items-center gap-1 transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Salvar PNG</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Mini-banner em modo preview */
              <div className="p-2 bg-slate-900/90 text-white flex items-center justify-between px-3 border-b border-slate-800 text-[11px] font-bold shrink-0">
                <span className="flex items-center gap-1.5 text-brand-yellow">
                  <span>🎨</span>
                  <span>Quadro Branco (Ao Vivo)</span>
                </span>
                <span className="text-[10px] bg-brand-purple px-2 py-0.5 rounded-full text-white font-extrabold group-hover:bg-purple-600 transition-colors">
                  Focar & Desenhar 🔍
                </span>
              </div>
            )}

            {/* Canvas Body */}
            <div
              className={`flex-1 bg-white relative overflow-hidden ${
                focusMode === 'WHITEBOARD' ? 'cursor-crosshair' : 'cursor-pointer'
              }`}
            >
              <canvas
                ref={whiteboardCanvasRef}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                className="w-full h-full block"
              />
            </div>
          </div>
        </div>

        {/* Right Sidebar: Chat */}
        {isChatOpen && (
          <div className="w-80 bg-slate-900 border-l border-slate-800 flex flex-col h-full animate-in slide-in-from-right-4 duration-200">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-black text-sm text-slate-100 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-brand-purple" />
                Chat da Monitoria
              </h3>
              <button
                onClick={() => setIsChatOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 p-4 overflow-y-auto space-y-3">
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`p-3 rounded-2xl text-xs space-y-1 ${
                    msg.senderRole === 'BOT'
                      ? 'bg-slate-800 text-slate-300 border border-slate-700'
                      : msg.senderName === currentUser.name
                      ? 'bg-brand-blue text-white ml-6'
                      : 'bg-brand-purple/30 text-slate-200 mr-6 border border-brand-purple/40'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] opacity-75 font-semibold">
                    <span>{msg.senderName}</span>
                    <span>{msg.time}</span>
                  </div>
                  <p className="leading-relaxed">{msg.text}</p>
                </div>
              ))}
            </div>

            <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-800 flex gap-2">
              <input
                type="text"
                placeholder="Digite sua mensagem..."
                value={newMessageText}
                onChange={(e) => setNewMessageText(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-purple"
              />
              <button
                type="submit"
                className="p-2 rounded-xl bg-brand-purple hover:bg-purple-700 text-white transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Bottom Controls Dock */}
      <footer className="h-20 bg-slate-900 border-t border-slate-800 px-6 flex items-center justify-center gap-3">
        {/* Toggle Mic */}
        <button
          onClick={toggleAudio}
          className={`p-3.5 rounded-2xl transition-all ${
            isAudioEnabled
              ? 'bg-slate-800 hover:bg-slate-700 text-white'
              : 'bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-900/50'
          }`}
          title={isAudioEnabled ? 'Silenciar Microfone' : 'Ativar Microfone'}
        >
          {isAudioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
        </button>

        {/* Toggle Video */}
        <button
          onClick={toggleVideo}
          className={`p-3.5 rounded-2xl transition-all ${
            isVideoEnabled
              ? 'bg-slate-800 hover:bg-slate-700 text-white'
              : 'bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-900/50'
          }`}
          title={isVideoEnabled ? 'Desligar Câmera' : 'Ligar Câmera'}
        >
          {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
        </button>

        {/* Toggle Screen Share */}
        <button
          onClick={toggleScreenSharing}
          className={`p-3.5 rounded-2xl transition-all ${
            isScreenSharing
              ? 'bg-brand-yellow text-slate-950 font-black shadow-lg shadow-brand-yellow/30'
              : 'bg-slate-800 hover:bg-slate-700 text-white'
          }`}
          title={isScreenSharing ? 'Parar Compartilhamento' : 'Compartilhar Tela'}
        >
          {isScreenSharing ? <MonitorX className="w-5 h-5" /> : <MonitorUp className="w-5 h-5" />}
        </button>

        {/* Toggle Speaker */}
        <button
          onClick={() => setIsSpeakerMuted(!isSpeakerMuted)}
          className={`p-3.5 rounded-2xl transition-all ${
            isSpeakerMuted
              ? 'bg-amber-600 text-white'
              : 'bg-slate-800 hover:bg-slate-700 text-white'
          }`}
          title={isSpeakerMuted ? 'Desmutar Som Geral' : 'Mutar Som Geral'}
        >
          {isSpeakerMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      </footer>

      {/* Modal Obrigatório de Encerramento com Análise de Dúvida e Gravação (EXCLUSIVO ALUNO) */}
      {isEndModalOpen && isStudent && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-lg w-full p-6 sm:p-8 text-white shadow-2xl space-y-6">
            {actionSuccessMessage ? (
              <div className="text-center py-6 space-y-4">
                <CheckCircle2 className="w-14 h-14 mx-auto text-emerald-400 animate-bounce" />
                <h3 className="text-xl font-black text-slate-100">Processado com Sucesso!</h3>
                <p className="text-xs text-slate-300 leading-relaxed max-w-md mx-auto">
                  {actionSuccessMessage}
                </p>
              </div>
            ) : (
              <>
                <div>
                  <span className="text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-full bg-brand-yellow/20 text-brand-yellow border border-brand-yellow/30">
                    Validação Acadêmica de Monitoria
                  </span>
                  <h3 className="text-2xl font-black mt-2 text-slate-100">
                    Finalização da Sessão
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Para garantir a excelência pedagógica e a segurança da custódia Pix, informe se sua dúvida foi sanada.
                  </p>
                </div>

                {/* Pergunta Crucial */}
                <div className="space-y-3">
                  <label className="block text-sm font-extrabold text-slate-200">
                    Sua dúvida foi devidamente sanada pelo monitor?
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setDoubtResolved(true)}
                      className={`p-4 rounded-2xl border text-center transition-all ${
                        doubtResolved === true
                          ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 ring-2 ring-emerald-500'
                          : 'bg-slate-800 border-slate-700 hover:border-slate-600 text-slate-300'
                      }`}
                    >
                      <CheckCircle2 className="w-6 h-6 mx-auto mb-1 text-emerald-400" />
                      <span className="block font-black text-sm">Sim, sanada!</span>
                      <span className="text-[10px] opacity-75">Gravação descartada</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDoubtResolved(false)}
                      className={`p-4 rounded-2xl border text-center transition-all ${
                        doubtResolved === false
                          ? 'bg-rose-950/80 border-rose-500 text-rose-300 ring-2 ring-rose-500'
                          : 'bg-slate-800 border-slate-700 hover:border-slate-600 text-slate-300'
                      }`}
                    >
                      <AlertTriangle className="w-6 h-6 mx-auto mb-1 text-rose-400" />
                      <span className="block font-black text-sm">Não foi sanada</span>
                      <span className="text-[10px] opacity-75">Gravação salva p/ auditoria</span>
                    </button>
                  </div>
                </div>

                {/* Se Dúvida Foi Sanada: Avaliação por Estrelas */}
                {doubtResolved === true && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-2">
                        Avalie o atendimento do monitor (1 a 5 estrelas):
                      </label>
                      <div className="flex items-center gap-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => setStudentRating(star)}
                            className={`p-2 rounded-xl transition-transform ${
                              star <= studentRating ? 'text-brand-yellow scale-110' : 'text-slate-600'
                            }`}
                          >
                            <Star className="w-6 h-6 fill-current" />
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">
                        Comentário ou feedback (opcional):
                      </label>
                      <textarea
                        rows={2}
                        value={studentFeedback}
                        onChange={(e) => setStudentFeedback(e.target.value)}
                        placeholder="Ex: Explicou com muita clareza e paciência..."
                        className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-brand-purple"
                      />
                    </div>
                  </div>
                )}

                {/* Se Dúvida NÃO Foi Sanada: Descrição e Gravação Salva */}
                {doubtResolved === false && (
                  <div className="space-y-3 p-4 rounded-2xl bg-rose-950/40 border border-rose-900/60 animate-in fade-in duration-200">
                    <div className="flex items-start gap-2 text-rose-300 text-xs">
                      <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5 text-rose-400" />
                      <p>
                        A gravação da chamada será anexada e salva para análise pela equipe de ouvidoria do Hintlink. O pagamento ao monitor permanecerá congelado.
                      </p>
                    </div>

                    <label className="block text-xs font-bold text-slate-200">
                      Descreva o que ocorreu (mínimo 5 caracteres):
                    </label>
                    <textarea
                      rows={3}
                      value={disputeReason}
                      onChange={(e) => setDisputeReason(e.target.value)}
                      placeholder="Ex: O monitor não sabia resolver os exercícios propostos de derivada..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-rose-800/80 text-xs text-white focus:outline-none focus:border-rose-500"
                    />
                  </div>
                )}

                {/* Ações Finais */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsEndModalOpen(false)}
                    disabled={isSubmittingFinish}
                    className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 text-xs font-bold"
                  >
                    Voltar à Aula
                  </button>

                  {doubtResolved === true && (
                    <button
                      type="button"
                      onClick={handleConfirmResolved}
                      disabled={isSubmittingFinish}
                      className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-lg shadow-emerald-900/40 flex items-center gap-2"
                    >
                      {isSubmittingFinish && <RefreshCw className="w-4 h-4 animate-spin" />}
                      <span>Confirmar & Liberar Pagamento</span>
                    </button>
                  )}

                  {doubtResolved === false && (
                    <button
                      type="button"
                      onClick={handleConfirmDispute}
                      disabled={isSubmittingFinish}
                      className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black shadow-lg shadow-rose-900/40 flex items-center gap-2"
                    >
                      {isSubmittingFinish && <RefreshCw className="w-4 h-4 animate-spin" />}
                      <span>Salvar Gravação & Enviar p/ Análise</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
