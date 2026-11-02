'use client'

import { useState, useEffect, useRef } from 'react'
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
} from 'lucide-react'
import axios from 'axios'

interface VirtualRoomProps {
  sessionId: string
  currentUser: {
    id: string
    name: string
    role: 'STUDENT' | 'TUTOR' | 'ADMIN'
  }
  isDemoMode?: boolean
  onClose: () => void
}

interface ChatMessage {
  id: string
  senderName: string
  senderRole: string
  text: string
  time: string
}

export function VirtualRoom({ sessionId, currentUser, isDemoMode = false, onClose }: VirtualRoomProps) {
  // Media State
  const [isVideoEnabled, setIsVideoEnabled] = useState(true)
  const [isAudioEnabled, setIsAudioEnabled] = useState(true)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false)
  const [audioVolumeLevel, setAudioVolumeLevel] = useState(0) // 0 to 100 for VU meter

  // View Mode: 'SPLIT' | 'VIDEO_FOCUS' | 'WHITEBOARD_FOCUS'
  const [activeTab, setActiveTab] = useState<'CALL' | 'WHITEBOARD'>('CALL')
  const [isChatOpen, setIsChatOpen] = useState(false)

  // Whiteboard State
  const [drawColor, setDrawColor] = useState('#163A5F')
  const [lineWidth, setLineWidth] = useState(3)
  const [isEraser, setIsEraser] = useState(false)

  // MediaRecorder / Pre-recording State
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDurationSeconds, setRecordingDurationSeconds] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])

  // Finish / Dispute Modal State
  const [isEndModalOpen, setIsEndModalOpen] = useState(false)
  const [doubtResolved, setDoubtResolved] = useState<boolean | null>(null)
  const [studentRating, setStudentRating] = useState<number>(5)
  const [studentFeedback, setStudentFeedback] = useState('')
  const [disputeReason, setDisputeReason] = useState('')
  const [isSubmittingFinish, setIsSubmittingFinish] = useState(false)
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null)

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
  const screenVideoRef = useRef<HTMLVideoElement | null>(null)
  const whiteboardCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const isDrawingRef = useRef(false)
  const lastPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  // Initialize Media Streams & Continuous Pre-Recording
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

          recorder.start(1000) // coletar chunks a cada 1 segundo
          mediaRecorderRef.current = recorder
          setIsRecording(true)
        } catch (recorderErr) {
          console.warn('MediaRecorder não suportado neste navegador:', recorderErr)
        }
      } catch (err) {
        console.warn('Permissão de câmera/microfone não concedida ou dispositivo ausente:', err)
      }
    }

    initMedia()

    // Timer de gravação
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
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {})
      }
    }
  }, [])

  // Whiteboard Canvas Setup
  useEffect(() => {
    const canvas = whiteboardCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Ajusta resolução do canvas
    canvas.width = canvas.parentElement?.clientWidth || 800
    canvas.height = 480
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }, [activeTab])

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

  // Toggle Screen Sharing
  async function toggleScreenSharing() {
    if (isScreenSharing) {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop())
        screenStreamRef.current = null
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
        stream.getVideoTracks()[0].onended = () => {
          setIsScreenSharing(false)
        }
        setIsScreenSharing(true)
      } catch (err) {
        console.warn('Compartilhamento de tela cancelado:', err)
      }
    }
  }

  // Canvas Drawing Handlers
  function startDrawing(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = whiteboardCanvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    isDrawingRef.current = true
    lastPosRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }

  function draw(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current) return
    const canvas = whiteboardCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    const currentX = e.clientX - rect.left
    const currentY = e.clientY - rect.top

    ctx.beginPath()
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y)
    ctx.lineTo(currentX, currentY)
    ctx.strokeStyle = isEraser ? '#FFFFFF' : drawColor
    ctx.lineWidth = isEraser ? lineWidth * 4 : lineWidth
    ctx.stroke()

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
    ctx.fillRect(0, 0, canvas.width, canvas.height)
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
      senderName: currentUser.name,
      senderRole: currentUser.role,
      text: newMessageText.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
    setChatMessages((prev) => [...prev, msg])
    setNewMessageText('')
  }

  // Finalizar Sessão (Quando Dúvida Foi Sanada) -> Descarta gravação temporária e libera Pix
  async function handleConfirmResolved() {
    setIsSubmittingFinish(true)
    try {
      if (!isDemoMode) {
        await api.post(`/sessions/${sessionId}/finish`, {
          studentRating,
          studentFeedback: studentFeedback.trim() || undefined,
        })
      }

      // Descarta explicitamente o buffer de gravação da memória
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

  // Abrir Disputa com a Gravação Prévia Anexada -> Envia vídeo para ouvidoria e congela Pix
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

  // Formatação do Timer
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60)
    const s = secs % 60
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col font-sans select-none overflow-hidden">
      {/* Top Bar da Chamada */}
      <header className="h-16 px-6 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
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

        {/* Alternância de Abas: Chamada / Quadro Branco */}
        <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('CALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
              activeTab === 'CALL'
                ? 'bg-brand-blue text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Vídeo & Tela
          </button>
          <button
            onClick={() => setActiveTab('WHITEBOARD')}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
              activeTab === 'WHITEBOARD'
                ? 'bg-brand-purple text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Quadro Branco
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

          <button
            onClick={() => setIsEndModalOpen(true)}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs flex items-center gap-2 shadow-lg shadow-rose-900/40 transition-all"
          >
            <PhoneOff className="w-4 h-4" />
            <span>Encerrar Sessão</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Stage Central */}
        <div className="flex-1 p-4 flex flex-col items-center justify-center relative bg-slate-900/50">
          {activeTab === 'CALL' ? (
            <div className="w-full h-full grid grid-cols-1 md:grid-cols-2 gap-4 max-w-6xl">
              {/* Local Video Box */}
              <div className="relative bg-slate-900 rounded-3xl overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center group">
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className={`w-full h-full object-cover ${!isVideoEnabled ? 'hidden' : ''}`}
                />
                {!isVideoEnabled && (
                  <div className="flex flex-col items-center justify-center text-slate-500">
                    <div className="h-20 w-20 rounded-full bg-slate-800 flex items-center justify-center mb-3 text-slate-400 font-bold text-2xl">
                      {currentUser.name.charAt(0).toUpperCase()}
                    </div>
                    <p className="font-semibold text-sm">Câmera Desligada</p>
                  </div>
                )}

                {/* Card do Usuário Local */}
                <div className="absolute bottom-4 left-4 bg-slate-950/80 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-slate-700/60 flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-100">
                    Você ({currentUser.name.split(' ')[0]})
                  </span>
                  {!isAudioEnabled && <MicOff className="w-3.5 h-3.5 text-rose-400" />}

                  {/* VU Meter Visualizer */}
                  {isAudioEnabled && (
                    <div className="flex items-center gap-0.5 ml-1">
                      <span
                        className="w-1 bg-emerald-400 rounded-full transition-all"
                        style={{ height: `${Math.max(4, (audioVolumeLevel / 100) * 16)}px` }}
                      ></span>
                      <span
                        className="w-1 bg-emerald-400 rounded-full transition-all"
                        style={{ height: `${Math.max(4, (audioVolumeLevel / 100) * 20)}px` }}
                      ></span>
                      <span
                        className="w-1 bg-emerald-400 rounded-full transition-all"
                        style={{ height: `${Math.max(4, (audioVolumeLevel / 100) * 12)}px` }}
                      ></span>
                    </div>
                  )}
                </div>
              </div>

              {/* Remote / Screen Share / Peer Video Box */}
              <div className="relative bg-slate-900 rounded-3xl overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center">
                {isScreenSharing ? (
                  <video
                    ref={screenVideoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-contain bg-black"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-center p-6 text-slate-400">
                    <div className="h-20 w-20 rounded-full bg-brand-purple/20 text-brand-purple flex items-center justify-center mb-3 font-black text-2xl border border-brand-purple/40">
                      {isDemoMode ? 'LM' : '🧑‍🏫'}
                    </div>
                    <p className="font-extrabold text-slate-200 text-base">
                      {isDemoMode ? 'Prof. Lucas Mendes (Monitor de Cálculo I)' : 'Participante Conectado'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {isDemoMode
                        ? 'Monitor simulado no ambiente de teste'
                        : 'Aguardando fluxo de mídia do parceiro'}
                    </p>
                    <span className="mt-4 px-3 py-1 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/80 text-[11px] font-bold">
                      ● Áudio e Vídeo Sincronizados
                    </span>
                  </div>
                )}

                <div className="absolute bottom-4 left-4 bg-slate-950/80 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-slate-700/60 flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-100">
                    {isScreenSharing ? '🖥️ Compartilhamento de Tela' : isDemoMode ? 'Lucas Mendes (Monitor)' : 'Parceiro'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            /* Whiteboard View */
            <div className="w-full h-full max-w-5xl flex flex-col bg-slate-900 rounded-3xl overflow-hidden border border-slate-800 shadow-2xl">
              {/* Whiteboard Toolbar */}
              <div className="p-3 bg-slate-800 border-b border-slate-700 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {/* Colors */}
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
                      onClick={() => {
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

                  {/* Stroke Width */}
                  {[2, 4, 8].map((w) => (
                    <button
                      key={w}
                      onClick={() => setLineWidth(w)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                        lineWidth === w ? 'bg-brand-blue text-white' : 'text-slate-400 hover:bg-slate-700'
                      }`}
                    >
                      {w === 2 ? 'Fino' : w === 4 ? 'Médio' : 'Grosso'}
                    </button>
                  ))}

                  <div className="h-5 w-px bg-slate-600 mx-2" />

                  {/* Eraser */}
                  <button
                    onClick={() => setIsEraser(!isEraser)}
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
                    onClick={clearWhiteboard}
                    className="p-1.5 px-3 rounded-lg text-xs font-bold text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 flex items-center gap-1 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Limpar</span>
                  </button>
                  <button
                    onClick={downloadWhiteboard}
                    className="p-1.5 px-3 rounded-lg text-xs font-bold text-slate-200 bg-slate-700 hover:bg-slate-600 flex items-center gap-1 transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Salvar PNG</span>
                  </button>
                </div>
              </div>

              {/* Canvas Board */}
              <div className="flex-1 bg-white relative cursor-crosshair overflow-hidden">
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
          )}
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

      {/* Modal Obrigatório de Encerramento com Análise de Dúvida e Gravação */}
      {isEndModalOpen && (
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
