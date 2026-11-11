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
  const [screenHasAudio, setScreenHasAudio] = useState(false)
  const [isRemoteScreenSharing, setIsRemoteScreenSharing] = useState(false)
  const [remoteHasScreenAudio, setRemoteHasScreenAudio] = useState(false)
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false)
  const [audioVolumeLevel, setAudioVolumeLevel] = useState(0) // 0 to 100 for VU meter
  const [hasRemoteStream, setHasRemoteStream] = useState(false)
  const [isP2PConnected, setIsP2PConnected] = useState(false)
  const [isPartnerInRoom, setIsPartnerInRoom] = useState(false)
  const [remoteIsVideoEnabled, setRemoteIsVideoEnabled] = useState(false)
  const [remoteIsAudioEnabled, setRemoteIsAudioEnabled] = useState(true)
  const [isInsecureContextAlert, setIsInsecureContextAlert] = useState(false)
  const [needsUserInteractionForAudio, setNeedsUserInteractionForAudio] = useState(false)

  // Verifica se o navegador bloqueou acesso à mídia por ser HTTP em rede local
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isLocalhost =
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname === '[::1]'
      if (!window.isSecureContext && !isLocalhost) {
        setIsInsecureContextAlert(true)
      }
    }
  }, [])

  // Focus Mode: Ambos ficam visíveis, apenas alternando o foco principal
  const [focusMode, setFocusMode] = useState<'VIDEO' | 'WHITEBOARD'>('VIDEO')
  const [isChatOpen, setIsChatOpen] = useState(false)

  // Whiteboard State
  const [drawColor, setDrawColor] = useState('#163A5F')
  const [lineWidth, setLineWidth] = useState(3)
  const [isEraser, setIsEraser] = useState(false)
  const strokeHistoryRef = useRef<StrokeData[]>([])

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
      text: 'Sala iniciada. Conexão WebRTC ponto a ponto ativa.',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ])
  const [newMessageText, setNewMessageText] = useState('')

  // Refs
  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null)
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null)
  const remoteScreenVideoRef = useRef<HTMLVideoElement | null>(null)
  const screenVideoRef = useRef<HTMLVideoElement | null>(null)
  const whiteboardCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteStreamRef = useRef<MediaStream | null>(null)
  const remoteScreenStreamRef = useRef<MediaStream | null>(null)
  const localStreamPromiseRef = useRef<{
    promise: Promise<MediaStream>
    resolve: (stream: MediaStream) => void
    reject: (err: unknown) => void
  } | null>(null)
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([])
  const screenStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const screenAudioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const mixedAudioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null)
  const micAudioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const hasRealAudioRef = useRef<boolean>(false)
  const hasRealVideoRef = useRef<boolean>(false)
  const isNegotiatingRef = useRef<boolean>(false)
  const offerTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isDrawingRef = useRef(false)
  const lastPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  // Inicializa o promise da mídia local uma única vez
  if (!localStreamPromiseRef.current) {
    let resolveStream!: (stream: MediaStream) => void
    let rejectStream!: (err: unknown) => void
    const promise = new Promise<MediaStream>((res, rej) => {
      resolveStream = res
      rejectStream = rej
    })
    localStreamPromiseRef.current = { promise, resolve: resolveStream, reject: rejectStream }
  }

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

  // Helper para obter ou aguardar a mídia local antes da negociação WebRTC
  const getOrWaitLocalStream = useCallback(async (): Promise<MediaStream | null> => {
    if (localStreamRef.current) return localStreamRef.current
    if (localStreamPromiseRef.current) {
      try {
        return await Promise.race([
          localStreamPromiseRef.current.promise,
          new Promise<null>((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000)),
        ])
      } catch {
        return localStreamRef.current
      }
    }
    return null
  }, [])

  const isVideoEnabledRef = useRef(isVideoEnabled)
  isVideoEnabledRef.current = isVideoEnabled
  const isAudioEnabledRef = useRef(isAudioEnabled)
  isAudioEnabledRef.current = isAudioEnabled
  const isScreenSharingRef = useRef(isScreenSharing)
  isScreenSharingRef.current = isScreenSharing
  const screenHasAudioRef = useRef(screenHasAudio)
  screenHasAudioRef.current = screenHasAudio

  // Sincroniza as faixas locais (Microfone, Câmera e Tela Compartilhada) nos 3 transceivers determinísticos (mid 0, 1, 2)
  const syncLocalTracksToPc = useCallback(async (pc: RTCPeerConnection, streamToAttach?: MediaStream | null) => {
    const stream = streamToAttach || localStreamRef.current
    const screenStream = screenStreamRef.current
    const transceivers = pc.getTransceivers()

    const audioTransceiver =
      transceivers.find((t) => t.mid === '0') ||
      transceivers.find((t) => t.receiver.track?.kind === 'audio' || t.sender.track?.kind === 'audio')
    const videoTransceivers = transceivers.filter(
      (t) => t.receiver.track?.kind === 'video' || t.sender.track?.kind === 'video'
    )
    const cameraTransceiver = transceivers.find((t) => t.mid === '1') || videoTransceivers[0]
    const screenTransceiver = transceivers.find((t) => t.mid === '2') || videoTransceivers[1]

    // 1. Canal de Áudio (mid: 0) - Usa áudio mixado se compartilhando tela com áudio, senão microfone local
    if (audioTransceiver) {
      audioTransceiver.direction = 'sendrecv'
      const mixedTrack = mixedAudioDestinationRef.current?.stream.getAudioTracks()[0]
      const micTrack = stream?.getAudioTracks()[0] || null
      const targetAudioTrack = mixedTrack || micTrack
      if (audioTransceiver.sender && audioTransceiver.sender.track !== targetAudioTrack) {
        try {
          await audioTransceiver.sender.replaceTrack(targetAudioTrack)
        } catch (err) {
          console.warn('[WebRTC] Erro ao sincronizar faixa de áudio:', err)
        }
      }
    }

    // 2. Canal de Vídeo 0 - Câmera (mid: 1)
    if (cameraTransceiver) {
      cameraTransceiver.direction = 'sendrecv'
      const cameraTrack = stream?.getVideoTracks()[0] || null
      if (cameraTransceiver.sender && cameraTransceiver.sender.track !== cameraTrack) {
        try {
          await cameraTransceiver.sender.replaceTrack(cameraTrack)
        } catch (err) {
          console.warn('[WebRTC] Erro ao sincronizar faixa de câmera:', err)
        }
      }
    }

    // 3. Canal de Vídeo 1 - Compartilhamento de Tela (mid: 2)
    if (screenTransceiver) {
      screenTransceiver.direction = 'sendrecv'
      const screenTrack = screenStream?.getVideoTracks()[0] || null
      if (screenTransceiver.sender) {
        if (screenTransceiver.sender.track !== screenTrack) {
          try {
            await screenTransceiver.sender.replaceTrack(screenTrack)
          } catch (err) {
            console.warn('[WebRTC] Erro ao sincronizar faixa de tela:', err)
          }
        }
        if (screenTrack) {
          try {
            const params = screenTransceiver.sender.getParameters()
            if (!params.encodings || params.encodings.length === 0) {
              params.encodings = [{}]
            }
            params.encodings[0].maxBitrate = 2000000 // 2.0 Mbps máx (evita acúmulo no buffer do Wi-Fi)
            params.encodings[0].maxFramerate = 15
            params.degradationPreference = 'maintain-resolution'
            await screenTransceiver.sender.setParameters(params)
          } catch {}
        }
      }
    }
  }, [])

  // Vincula os receptores remotos (mid 0: Áudio, mid 1: Câmera, mid 2: Tela) aos respectivos elementos HTML
  const attachRemoteReceiverTracks = useCallback((pc: RTCPeerConnection) => {
    const transceivers = pc.getTransceivers()
    const audioTransceiver =
      transceivers.find((t) => t.mid === '0') ||
      transceivers.find((t) => t.receiver.track?.kind === 'audio')
    const videoTransceivers = transceivers.filter((t) => t.receiver.track?.kind === 'video')
    const cameraTransceiver = transceivers.find((t) => t.mid === '1') || videoTransceivers[0]
    const screenTransceiver = transceivers.find((t) => t.mid === '2') || videoTransceivers[1]

    // 1. Áudio Remoto (mid: 0)
    const remoteAudioTrack = audioTransceiver?.receiver?.track
    if (remoteAudioTrack) {
      remoteAudioTrack.onunmute = () => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = new MediaStream([remoteAudioTrack])
          remoteAudioRef.current.play().catch((err) => {
            if (err.name === 'NotAllowedError') setNeedsUserInteractionForAudio(true)
          })
        }
      }
      if (remoteAudioRef.current) {
        const currentAudioTracks =
          (remoteAudioRef.current.srcObject as MediaStream | null)?.getAudioTracks() || []
        if (currentAudioTracks[0]?.id !== remoteAudioTrack.id) {
          remoteAudioRef.current.srcObject = new MediaStream([remoteAudioTrack])
        }
        remoteAudioRef.current.play().catch((err) => {
          if (err.name === 'NotAllowedError') setNeedsUserInteractionForAudio(true)
        })
      }
    }

    // 2. Câmera Remota (mid: 1)
    const remoteCameraTrack = cameraTransceiver?.receiver?.track
    if (remoteCameraTrack) {
      if (!remoteStreamRef.current || remoteStreamRef.current.getVideoTracks()[0]?.id !== remoteCameraTrack.id) {
        remoteStreamRef.current = new MediaStream([remoteCameraTrack])
      }
      if (!remoteCameraTrack.muted) {
        setRemoteIsVideoEnabled(true)
      }
      remoteCameraTrack.onunmute = () => {
        setRemoteIsVideoEnabled(true)
        remoteStreamRef.current = new MediaStream([remoteCameraTrack])
        if (remoteVideoRef.current) {
          remoteVideoRef.current.muted = true
          remoteVideoRef.current.srcObject = remoteStreamRef.current
          remoteVideoRef.current.play().catch(() => {})
        }
      }
      if (remoteVideoRef.current) {
        const currentCamTracks =
          (remoteVideoRef.current.srcObject as MediaStream | null)?.getVideoTracks() || []
        if (
          currentCamTracks[0]?.id !== remoteCameraTrack.id ||
          remoteVideoRef.current.videoWidth === 0
        ) {
          remoteStreamRef.current = new MediaStream([remoteCameraTrack])
          remoteVideoRef.current.srcObject = remoteStreamRef.current
        }
        remoteVideoRef.current.muted = true
        remoteVideoRef.current.play().catch(() => {})
      }
    }

    // 3. Tela Compartilhada Remota (mid: 2)
    const remoteScreenTrack = screenTransceiver?.receiver?.track
    if (remoteScreenTrack) {
      if (
        !remoteScreenStreamRef.current ||
        remoteScreenStreamRef.current.getVideoTracks()[0]?.id !== remoteScreenTrack.id
      ) {
        remoteScreenStreamRef.current = new MediaStream([remoteScreenTrack])
      }
      remoteScreenTrack.onunmute = () => {
        remoteScreenStreamRef.current = new MediaStream([remoteScreenTrack])
        if (remoteScreenVideoRef.current) {
          remoteScreenVideoRef.current.muted = true
          remoteScreenVideoRef.current.srcObject = remoteScreenStreamRef.current
          remoteScreenVideoRef.current.play().catch(() => {})
        }
      }
      if (remoteScreenVideoRef.current) {
        const currentScreenTracks =
          (remoteScreenVideoRef.current.srcObject as MediaStream | null)?.getVideoTracks() || []
        if (
          currentScreenTracks[0]?.id !== remoteScreenTrack.id ||
          remoteScreenVideoRef.current.videoWidth === 0
        ) {
          remoteScreenStreamRef.current = new MediaStream([remoteScreenTrack])
          remoteScreenVideoRef.current.srcObject = remoteScreenStreamRef.current
        }
        remoteScreenVideoRef.current.muted = true
        remoteScreenVideoRef.current.play().catch(() => {})
      }
    }
  }, [])

  // Initialize WebRTC Peer Connection
  const createPeerConnection = useCallback(
    (streamToAttach?: MediaStream | null) => {
      if (peerConnectionRef.current && peerConnectionRef.current.signalingState !== 'closed') {
        const pc = peerConnectionRef.current
        if (pc.getTransceivers().length > 0) {
          syncLocalTracksToPc(pc, streamToAttach)
        }
        return pc
      }

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
        ],
      })

      pc.ontrack = () => {
        setIsP2PConnected(true)
        setHasRemoteStream(true)
        attachRemoteReceiverTracks(pc)
      }

      pc.oniceconnectionstatechange = () => {
        console.log('[WebRTC] iceConnectionState:', pc.iceConnectionState)
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          setIsP2PConnected(true)
          setHasRemoteStream(true)
          attachRemoteReceiverTracks(pc)
        }
      }

      pc.onconnectionstatechange = () => {
        console.log('[WebRTC] connectionState:', pc.connectionState)
        if (pc.connectionState === 'connected') {
          setIsP2PConnected(true)
          setHasRemoteStream(true)
          attachRemoteReceiverTracks(pc)
        }
      }

      pc.onicecandidate = (event) => {
        if (event.candidate && !isDemoMode) {
          sendMessageRef.current?.('RTC_ICE_CANDIDATE', event.candidate, sessionId)
        }
      }

      peerConnectionRef.current = pc
      return pc
    },
    [sessionId, isDemoMode, syncLocalTracksToPc, attachRemoteReceiverTracks]
  )

  // Iniciar Negociação WebRTC de forma segura e idempotente (Tutor cria os 3 transceivers mid 0, 1, 2)
  const initiateOffer = useCallback(async () => {
    if (isDemoMode) return
    console.log('[WebRTC] initiateOffer chamado por:', currentUser.role)
    try {
      const stream = await getOrWaitLocalStream()
      const pc = createPeerConnection(stream)

      // Apenas quem cria a oferta inicial adiciona os 3 transceivers caso ainda não existam.
      // Assim o Answerer (Aluno) cria exatamente os mesmos 3 transceivers (mid 0, 1, 2) via setRemoteDescription!
      if (pc.getTransceivers().length === 0) {
        pc.addTransceiver('audio', { direction: 'sendrecv' }) // mid: 0 (Áudio)
        pc.addTransceiver('video', { direction: 'sendrecv' }) // mid: 1 (Câmera)
        pc.addTransceiver('video', { direction: 'sendrecv' }) // mid: 2 (Compartilhamento de Tela)
      }

      await syncLocalTracksToPc(pc, stream)

      if (pc.signalingState === 'stable') {
        isNegotiatingRef.current = false
      }

      if (isNegotiatingRef.current && pc.signalingState !== 'stable') {
        console.log('[WebRTC] Negociação já em andamento, ignorando nova oferta concorrente.')
        return
      }

      if (pc.signalingState !== 'stable') {
        console.log('[WebRTC] signalingState:', pc.signalingState)
        if (pc.signalingState === 'have-local-offer' && pc.localDescription) {
          console.log('[WebRTC] Reenviando oferta existente para o parceiro...')
          sendMessageRef.current?.('RTC_OFFER', pc.localDescription, sessionId)
        }
        return
      }

      isNegotiatingRef.current = true
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      sendMessageRef.current?.('RTC_OFFER', offer, sessionId)
      sendMessageRef.current?.(
        'ROOM_MEDIA_STATE_CHANGED',
        {
          video: hasRealVideoRef.current && isVideoEnabledRef.current,
          audio: hasRealAudioRef.current && isAudioEnabledRef.current,
        },
        sessionId
      )
      if (isScreenSharingRef.current) {
        sendMessageRef.current?.(
          'ROOM_SCREEN_SHARE_CHANGED',
          { isSharing: true, hasAudio: screenHasAudioRef.current },
          sessionId
        )
      }
      console.log('[WebRTC] RTC_OFFER enviado com sucesso por:', currentUser.role)
    } catch (err) {
      console.warn('Erro ao criar WebRTC offer:', err)
      isNegotiatingRef.current = false
    }
  }, [createPeerConnection, getOrWaitLocalStream, syncLocalTracksToPc, isDemoMode, sessionId, currentUser.role])

  // Debounce para evitar tempestade de ofertas em conexões simultâneas
  const debouncedInitiateOffer = useCallback(() => {
    if (offerTimeoutRef.current) clearTimeout(offerTimeoutRef.current)
    offerTimeoutRef.current = setTimeout(() => {
      initiateOffer()
    }, 250)
  }, [initiateOffer])

  // Refs de estabilização para impedir loops infinitos de montagem e re-subscrição de sala
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const debouncedInitiateOfferRef = useRef(debouncedInitiateOffer)
  debouncedInitiateOfferRef.current = debouncedInitiateOffer

  const initiateOfferRef = useRef(initiateOffer)
  initiateOfferRef.current = initiateOffer

  const sendMessageRef = useRef(sendMessage)
  sendMessageRef.current = sendMessage

  const getOrWaitLocalStreamRef = useRef(getOrWaitLocalStream)
  getOrWaitLocalStreamRef.current = getOrWaitLocalStream

  const createPeerConnectionRef = useRef(createPeerConnection)
  createPeerConnectionRef.current = createPeerConnection

  const syncLocalTracksToPcRef = useRef(syncLocalTracksToPc)
  syncLocalTracksToPcRef.current = syncLocalTracksToPc

  const attachRemoteReceiverTracksRef = useRef(attachRemoteReceiverTracks)
  attachRemoteReceiverTracksRef.current = attachRemoteReceiverTracks

  // WebSocket Subscription for Real-time Sync (Draw, Chat, WebRTC, Call End)
  useEffect(() => {
    if (isDemoMode || !subscribe) return

    sendMessageRef.current?.('JOIN_ROOM', {}, sessionId)

    const unsubscribe = subscribe(async (msg) => {
      if (msg.sessionId && msg.sessionId !== sessionId) return

      if (msg.type === 'CONNECTED') {
        sendMessageRef.current?.('JOIN_ROOM', {}, sessionId)
      }

      // Se outro usuário entrou OU se o Tutor entrou e o Aluno já estava na sala OU sob solicitação
      if (msg.type === 'USER_JOINED_ROOM') {
        setIsPartnerInRoom(true)
        if (currentUser.role === 'TUTOR') {
          debouncedInitiateOfferRef.current()
        } else if (currentUser.role === 'STUDENT') {
          sendMessageRef.current?.('REQUEST_OFFER', {}, sessionId)
        }
      }

      if (msg.type === 'ROOM_USERS') {
        const p = ((msg.payload as { participants?: unknown[] })?.participants) || []
        if (p.length > 0) {
          setIsPartnerInRoom(true)
        }
        if (currentUser.role === 'TUTOR') {
          debouncedInitiateOfferRef.current()
        }
        if (currentUser.role === 'STUDENT') {
          sendMessageRef.current?.('REQUEST_OFFER', {}, sessionId)
        }
      }

      if (msg.type === 'REQUEST_OFFER') {
        setIsPartnerInRoom(true)
        if (currentUser.role === 'TUTOR') {
          debouncedInitiateOfferRef.current()
        }
      }

      // Notificação de Estado de Câmera/Microfone do Parceiro
      if (msg.type === 'ROOM_MEDIA_STATE_CHANGED' && msg.payload) {
        const payload = msg.payload as { video?: boolean; audio?: boolean }
        if (payload.video !== undefined) setRemoteIsVideoEnabled(payload.video)
        if (payload.audio !== undefined) setRemoteIsAudioEnabled(payload.audio)
        if (peerConnectionRef.current) {
          attachRemoteReceiverTracksRef.current(peerConnectionRef.current)
        }
      }

      if (msg.type === 'RTC_OFFER' && msg.payload) {
        // Aguarda a mídia do usuário estar pronta antes de responder à oferta
        const stream = await getOrWaitLocalStreamRef.current()
        const pc = createPeerConnectionRef.current(stream)
        try {
          // 1. Define a oferta remota PRIMEIRO (cria automaticamente os 3 transceivers mid 0, 1, 2 no Aluno!)
          await pc.setRemoteDescription(new RTCSessionDescription(msg.payload as RTCSessionDescriptionInit))

          // 2. Sincroniza as faixas locais do Aluno (Áudio, Câmera e Tela) nos 3 transceivers como 'sendrecv' ANTES do createAnswer!
          await syncLocalTracksToPcRef.current(pc, stream)

          // 3. Esvazia candidatos ICE recebidos antes do remoteDescription
          while (pendingIceCandidatesRef.current.length > 0) {
            const cand = pendingIceCandidatesRef.current.shift()
            if (cand) {
              await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(console.warn)
            }
          }

          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          sendMessageRef.current?.('RTC_ANSWER', answer, sessionId)
          sendMessageRef.current?.(
            'ROOM_MEDIA_STATE_CHANGED',
            {
              video: hasRealVideoRef.current && isVideoEnabledRef.current,
              audio: hasRealAudioRef.current && isAudioEnabledRef.current,
            },
            sessionId
          )
          if (isScreenSharingRef.current) {
            sendMessageRef.current?.(
              'ROOM_SCREEN_SHARE_CHANGED',
              { isSharing: true, hasAudio: screenHasAudioRef.current },
              sessionId
            )
          }

          attachRemoteReceiverTracksRef.current(pc)
          ;[120, 350, 800].forEach((delay) => {
            setTimeout(() => {
              if (peerConnectionRef.current) {
                attachRemoteReceiverTracksRef.current(peerConnectionRef.current)
              }
            }, delay)
          })
          console.log('[WebRTC] RTC_ANSWER enviado com sucesso')
        } catch (err) {
          console.warn('Erro ao processar WebRTC offer:', err)
        }
      }

      if (msg.type === 'RTC_ANSWER' && msg.payload) {
        const pc = peerConnectionRef.current
        if (pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.payload as RTCSessionDescriptionInit))
            console.log('[WebRTC] RTC_ANSWER processado com sucesso')
            isNegotiatingRef.current = false
            while (pendingIceCandidatesRef.current.length > 0) {
              const cand = pendingIceCandidatesRef.current.shift()
              if (cand) {
                await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(console.warn)
              }
            }
            attachRemoteReceiverTracksRef.current(pc)
            ;[120, 350, 800].forEach((delay) => {
              setTimeout(() => {
                if (peerConnectionRef.current) {
                  attachRemoteReceiverTracksRef.current(peerConnectionRef.current)
                }
              }, delay)
            })
          } catch (err) {
            console.warn('Erro ao processar WebRTC answer:', err)
            isNegotiatingRef.current = false
          }
        }
      }

      if (msg.type === 'RTC_ICE_CANDIDATE' && msg.payload) {
        const pc = peerConnectionRef.current
        const cand = msg.payload as RTCIceCandidateInit

        const candidatesToAdd: RTCIceCandidateInit[] = [cand]
        if (cand.candidate && cand.candidate.includes('.local') && typeof window !== 'undefined') {
          const hostIp = window.location.hostname
          if (hostIp && hostIp !== 'localhost' && hostIp !== '127.0.0.1') {
            candidatesToAdd.push({
              ...cand,
              candidate: cand.candidate.replace(/[a-zA-Z0-9-]+\.local/g, hostIp),
            })
          }
        }

        for (const c of candidatesToAdd) {
          if (pc && pc.remoteDescription && pc.remoteDescription.type) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(c))
            } catch (err) {
              console.warn('Erro ao adicionar ICE candidate:', err)
            }
          } else {
            pendingIceCandidatesRef.current.push(c)
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

      // Notificação de Compartilhamento de Tela & Áudio pelo Parceiro
      if (msg.type === 'ROOM_SCREEN_SHARE_CHANGED' && msg.payload) {
        const payload = msg.payload as { isSharing: boolean; hasAudio?: boolean }
        setIsRemoteScreenSharing(!!payload.isSharing)
        setRemoteHasScreenAudio(!!payload.hasAudio)

        if (payload.isSharing) {
          if (peerConnectionRef.current) {
            attachRemoteReceiverTracksRef.current(peerConnectionRef.current)
          }
          ;[50, 150, 350, 700, 1200].forEach((delay) => {
            setTimeout(() => {
              if (peerConnectionRef.current) {
                attachRemoteReceiverTracksRef.current(peerConnectionRef.current)
              }
            }, delay)
          })
        } else {
          if (remoteScreenVideoRef.current) {
            remoteScreenVideoRef.current.srcObject = null
          }
          remoteScreenStreamRef.current = null
        }
      }

      // Aluno encerrou a chamada -> Monitor fecha automaticamente
      if (msg.type === 'CALL_ENDED_BY_STUDENT') {
        setAutoCloseAlert(
          'O aluno encerrou a monitoria e enviou a avaliação de conformidade. A sala foi finalizada.'
        )
        setTimeout(() => {
          onCloseRef.current()
        }, 3000)
      }
    })

    return () => {
      sendMessageRef.current?.('LEAVE_ROOM', {}, sessionId)
      unsubscribe()
    }
  }, [isDemoMode, subscribe, sessionId, currentUser.role])

  // Auto-retry periódico para garantir sincronização caso o pacote inicial WebRTC tenha sido descartado na LAN
  useEffect(() => {
    if (isDemoMode) return
    const retryTimer = setTimeout(() => {
      const pc = peerConnectionRef.current
      if (!isP2PConnected && pc && pc.connectionState !== 'connected' && pc.iceConnectionState !== 'connected') {
        console.log('[WebRTC] Auto-retry (4s): parceiro não conectado, solicitando renegociação...')
        if (currentUser.role === 'TUTOR') {
          if (pc.signalingState === 'stable') {
            initiateOfferRef.current()
          }
        } else {
          sendMessageRef.current?.('REQUEST_OFFER', {}, sessionId)
        }
      }
    }, 4000)
    return () => clearTimeout(retryTimer)
  }, [isP2PConnected, isDemoMode, currentUser.role, sessionId])

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
        let stream: MediaStream | null = null

        // 1. Tenta obter mídia real do navegador se a API estiver disponível
        if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
          try {
            // Tenta obter vídeo e áudio combinados
            stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: true,
            })
            hasRealVideoRef.current = true
            hasRealAudioRef.current = true
            setIsVideoEnabled(true)
            setIsAudioEnabled(true)
          } catch (comboErr) {
            console.warn('Falha ao obter vídeo e áudio juntos. Tentando apenas áudio...', comboErr)
            try {
              // Fallback: Apenas áudio (ex: computadores sem webcam)
              stream = await navigator.mediaDevices.getUserMedia({
                video: false,
                audio: true,
              })
              hasRealAudioRef.current = true
              hasRealVideoRef.current = false
              setIsAudioEnabled(true)
              setIsVideoEnabled(false)
            } catch (audioOnlyErr) {
              console.warn('Falha ao obter microfone. Tentando apenas vídeo...', audioOnlyErr)
              try {
                // Fallback: Apenas vídeo
                stream = await navigator.mediaDevices.getUserMedia({
                  video: true,
                  audio: false,
                })
                hasRealVideoRef.current = true
                hasRealAudioRef.current = false
                setIsVideoEnabled(true)
                setIsAudioEnabled(false)
              } catch (videoOnlyErr) {
                console.warn('Nenhum dispositivo físico de mídia ou permissão negada.', videoOnlyErr)
              }
            }
          }
        } else {
          console.warn('navigator.mediaDevices não disponível (HTTP em rede local).')
          setIsInsecureContextAlert(true)
        }

        // 2. Fallback de Trilha Sintética: Garante que WebRTC e os botões tenham trilha ativa
        if (!stream) {
          hasRealAudioRef.current = false
          hasRealVideoRef.current = false
          try {
            const AudioContextClass =
              window.AudioContext ||
              (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
            if (AudioContextClass) {
              const fallbackCtx = new AudioContextClass()
              const dest = fallbackCtx.createMediaStreamDestination()
              const osc = fallbackCtx.createOscillator()
              const gain = fallbackCtx.createGain()
              gain.gain.value = 0.00001
              osc.connect(gain)
              gain.connect(dest)
              osc.start()
              stream = dest.stream
            } else {
              stream = new MediaStream()
            }
          } catch {
            stream = new MediaStream()
          }
          setIsAudioEnabled(false)
          setIsVideoEnabled(false)
        }

        localStreamRef.current = stream
        localStreamPromiseRef.current?.resolve(stream)

        if (localVideoRef.current && stream.getVideoTracks().length > 0) {
          localVideoRef.current.srcObject = stream
        }

        if (peerConnectionRef.current) {
          await syncLocalTracksToPcRef.current(peerConnectionRef.current, stream)
        }

        if (!isDemoMode) {
          sendMessageRef.current?.(
            'ROOM_MEDIA_STATE_CHANGED',
            {
              video: hasRealVideoRef.current,
              audio: hasRealAudioRef.current,
            },
            sessionId
          )
        }

        // Setup Audio Analyser for VU meter se houver áudio
        if (stream.getAudioTracks().length > 0) {
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
        }
      } catch (err) {
        console.warn('Falha no initMedia:', err)
        localStreamPromiseRef.current?.reject(err)
      }
    }

    initMedia()

    return () => {
      cancelAnimationFrame(animationFrameId)
      if (screenAudioSourceRef.current) {
        try {
          screenAudioSourceRef.current.disconnect()
        } catch {}
        screenAudioSourceRef.current = null
      }
      if (micAudioSourceRef.current) {
        try {
          micAudioSourceRef.current.disconnect()
        } catch {}
        micAudioSourceRef.current = null
      }
      if (mixedAudioDestinationRef.current) {
        try {
          mixedAudioDestinationRef.current.disconnect()
        } catch {}
        mixedAudioDestinationRef.current = null
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Garante a vinculação e reprodução do fluxo da câmera remota
  useEffect(() => {
    if (peerConnectionRef.current) {
      attachRemoteReceiverTracksRef.current(peerConnectionRef.current)
    }
  }, [hasRemoteStream, remoteIsVideoEnabled, isP2PConnected])

  // Garante a vinculação e reprodução do fluxo da tela compartilhada remota
  useEffect(() => {
    if (isRemoteScreenSharing && peerConnectionRef.current) {
      attachRemoteReceiverTracksRef.current(peerConnectionRef.current)
      const timers = [60, 200, 500].map((delay) =>
        setTimeout(() => {
          if (peerConnectionRef.current) {
            attachRemoteReceiverTracksRef.current(peerConnectionRef.current)
          }
        }, delay)
      )
      return () => timers.forEach(clearTimeout)
    }
  }, [isRemoteScreenSharing])

  // Garante a vinculação da tela local assim que o compartilhamento de tela for ativado
  useEffect(() => {
    if (isScreenSharing && screenStreamRef.current && screenVideoRef.current) {
      if (screenVideoRef.current.srcObject !== screenStreamRef.current) {
        screenVideoRef.current.srcObject = screenStreamRef.current
      }
      screenVideoRef.current.play().catch(() => {})
    }
  }, [isScreenSharing])

  // Toggle Camera
  async function toggleVideo() {
    if (hasRealVideoRef.current && localStreamRef.current && localStreamRef.current.getVideoTracks().length > 0) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0]
      videoTrack.enabled = !videoTrack.enabled
      isVideoEnabledRef.current = videoTrack.enabled
      setIsVideoEnabled(videoTrack.enabled)
      if (!isDemoMode) {
        sendMessageRef.current?.('ROOM_MEDIA_STATE_CHANGED', { video: videoTrack.enabled }, sessionId)
      }
      return
    }

    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true })
        const newTrack = stream.getVideoTracks()[0]
        if (newTrack) {
          hasRealVideoRef.current = true
          if (!localStreamRef.current) {
            localStreamRef.current = new MediaStream()
          } else {
            localStreamRef.current.getVideoTracks().forEach((t) => {
              t.stop()
              localStreamRef.current?.removeTrack(t)
            })
          }
          localStreamRef.current.addTrack(newTrack)
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = localStreamRef.current
            localVideoRef.current.play().catch(() => {})
          }
          isVideoEnabledRef.current = true
          setIsVideoEnabled(true)
          if (!isDemoMode) {
            sendMessageRef.current?.('ROOM_MEDIA_STATE_CHANGED', { video: true }, sessionId)
          }

          const pc = peerConnectionRef.current
          if (pc) {
            await syncLocalTracksToPc(pc, localStreamRef.current)
            if (pc.signalingState === 'stable') {
              if (currentUser.role === 'TUTOR') {
                debouncedInitiateOfferRef.current()
              } else {
                sendMessageRef.current?.('REQUEST_OFFER', {}, sessionId)
              }
            }
          }
        }
      } catch {
        alert('Câmera não detectada ou permissão negada neste computador.')
      }
    } else {
      setIsInsecureContextAlert(true)
    }
  }

  // Toggle Microphone
  async function toggleAudio() {
    if (hasRealAudioRef.current && localStreamRef.current && localStreamRef.current.getAudioTracks().length > 0) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0]
      audioTrack.enabled = !audioTrack.enabled
      isAudioEnabledRef.current = audioTrack.enabled
      setIsAudioEnabled(audioTrack.enabled)
      if (!isDemoMode) {
        sendMessageRef.current?.('ROOM_MEDIA_STATE_CHANGED', { audio: audioTrack.enabled }, sessionId)
      }
      return
    }

    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const newTrack = stream.getAudioTracks()[0]
        if (newTrack) {
          hasRealAudioRef.current = true
          if (!localStreamRef.current) {
            localStreamRef.current = new MediaStream()
          } else {
            localStreamRef.current.getAudioTracks().forEach((t) => {
              t.stop()
              localStreamRef.current?.removeTrack(t)
            })
          }
          localStreamRef.current.addTrack(newTrack)
          isAudioEnabledRef.current = true
          setIsAudioEnabled(true)
          if (!isDemoMode) {
            sendMessageRef.current?.('ROOM_MEDIA_STATE_CHANGED', { audio: true }, sessionId)
          }

          const pc = peerConnectionRef.current
          if (pc) {
            await syncLocalTracksToPc(pc, localStreamRef.current)
            if (pc.signalingState === 'stable') {
              if (currentUser.role === 'TUTOR') {
                debouncedInitiateOfferRef.current()
              } else {
                sendMessageRef.current?.('REQUEST_OFFER', {}, sessionId)
              }
            }
          }

          // Reinicializa o VU meter com o microfone real
          try {
            const AudioContextClass =
              window.AudioContext ||
              (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
            if (AudioContextClass) {
              const audioCtx = new AudioContextClass()
              audioContextRef.current = audioCtx
              const source = audioCtx.createMediaStreamSource(localStreamRef.current)
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
                requestAnimationFrame(updateVU)
              }
              updateVU()
            }
          } catch {}
        }
      } catch {
        alert('Microfone não detectado ou permissão negada neste computador.')
      }
    } else {
      setIsInsecureContextAlert(true)
    }
  }

  // Parar Compartilhamento de Tela e Restaurar Câmera / Microfone Originais
  const stopScreenSharing = useCallback(async () => {
    // 1. Desconectar e limpar nós do Web Audio API
    if (screenAudioSourceRef.current) {
      try {
        screenAudioSourceRef.current.disconnect()
      } catch {}
      screenAudioSourceRef.current = null
    }
    if (micAudioSourceRef.current) {
      try {
        micAudioSourceRef.current.disconnect()
      } catch {}
      micAudioSourceRef.current = null
    }
    if (mixedAudioDestinationRef.current) {
      try {
        mixedAudioDestinationRef.current.disconnect()
      } catch {}
      mixedAudioDestinationRef.current = null
    }

    // 2. Parar tracks de tela
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop())
      screenStreamRef.current = null
    }

    if (screenVideoRef.current) {
      screenVideoRef.current.srcObject = null
    }

    isScreenSharingRef.current = false
    screenHasAudioRef.current = false
    setIsScreenSharing(false)
    setScreenHasAudio(false)

    // 3. Restaurar tracks no WebRTC PeerConnection (Câmera continua ativa; limpa canal de tela mid 2)
    const pc = peerConnectionRef.current
    if (pc) {
      await syncLocalTracksToPc(pc, localStreamRef.current)
    }

    if (!isDemoMode) {
      sendMessageRef.current?.('ROOM_SCREEN_SHARE_CHANGED', { isSharing: false, hasAudio: false }, sessionId)
    }

    if (pc && pc.signalingState === 'stable') {
      if (currentUser.role === 'TUTOR') {
        debouncedInitiateOfferRef.current()
      } else {
        sendMessageRef.current?.('REQUEST_OFFER', {}, sessionId)
      }
    }
  }, [sessionId, isDemoMode, currentUser.role, syncLocalTracksToPc])

  // Alternar Compartilhamento de Tela / Janela com Áudio (Estilo Discord)
  async function toggleScreenSharing() {
    if (isScreenSharing) {
      await stopScreenSharing()
    } else {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
        setIsInsecureContextAlert(true)
        alert(
          'O compartilhamento de tela exige uma origem segura (HTTPS ou localhost) ou a flag habilitada no Chrome/Edge deste computador: chrome://flags/#unsafely-treat-insecure-origin-as-secure'
        )
        return
      }

      try {
        let displayStream: MediaStream
        try {
          // Permite escolha de Tela Inteira, Janela específica ou Guia com áudio (Taxa de quadros e resolução otimizadas para latência zero)
          displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              frameRate: { max: 15, ideal: 15 },
              width: { max: 1920 },
              height: { max: 1080 },
            },
            audio: true,
          })
        } catch (audioErr) {
          console.warn('Captura com áudio falhou ou não suportada, tentando apenas vídeo:', audioErr)
          displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              frameRate: { max: 15, ideal: 15 },
              width: { max: 1920 },
              height: { max: 1080 },
            },
            audio: false,
          })
        }

        screenStreamRef.current = displayStream
        isScreenSharingRef.current = true
        setIsScreenSharing(true)

        const screenVideoTrack = displayStream.getVideoTracks()[0]
        const screenAudioTracks = displayStream.getAudioTracks()
        const hasAudio = screenAudioTracks.length > 0
        screenHasAudioRef.current = hasAudio
        setScreenHasAudio(hasAudio)

        if (screenVideoTrack) {
          screenVideoTrack.onunmute = () => {
            if (screenVideoRef.current) {
              screenVideoRef.current.play().catch(() => {})
            }
          }
        }

        ;[30, 100, 250].forEach((delay) => {
          setTimeout(() => {
            const el = screenVideoRef.current
            if (el && displayStream) {
              el.muted = true
              if (el.srcObject !== displayStream) {
                el.srcObject = displayStream
              }
              el.play().catch(() => {})
            }
          }, delay)
        })

        const pc = peerConnectionRef.current

        // Mixagem de Áudio estilo Discord: Microfone + Áudio da Janela/Sistema
        if (hasAudio) {
          try {
            const AudioContextClass =
              window.AudioContext ||
              (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
            if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
              audioContextRef.current = new AudioContextClass()
            }
            const audioCtx = audioContextRef.current
            if (audioCtx.state === 'suspended') {
              await audioCtx.resume()
            }

            const mixedDestination = audioCtx.createMediaStreamDestination()
            mixedAudioDestinationRef.current = mixedDestination

            // Conecta microfone se disponível
            if (localStreamRef.current && localStreamRef.current.getAudioTracks().length > 0) {
              const micStream = new MediaStream([localStreamRef.current.getAudioTracks()[0]])
              const micSource = audioCtx.createMediaStreamSource(micStream)
              micSource.connect(mixedDestination)
              micAudioSourceRef.current = micSource
            }

            // Conecta áudio da janela/tela compartilhada
            const screenAudioStream = new MediaStream([screenAudioTracks[0]])
            const screenSource = audioCtx.createMediaStreamSource(screenAudioStream)
            screenSource.connect(mixedDestination)
            screenAudioSourceRef.current = screenSource
          } catch (audioMixErr) {
            console.warn('Erro ao mixar áudio da tela com microfone:', audioMixErr)
          }
        }

        // Trata o botão nativo flutuante do navegador "Interromper compartilhamento"
        if (screenVideoTrack) {
          screenVideoTrack.onended = () => {
            stopScreenSharing()
          }
        }

        // Sincroniza a faixa de tela (mid 2) e o áudio mixado (mid 0) no PeerConnection
        if (pc) {
          await syncLocalTracksToPc(pc, localStreamRef.current)
          if (currentUser.role === 'TUTOR') {
            isNegotiatingRef.current = false
            initiateOfferRef.current()
          } else {
            sendMessageRef.current?.('REQUEST_OFFER', {}, sessionId)
          }
        }

        if (!isDemoMode) {
          sendMessageRef.current?.('ROOM_SCREEN_SHARE_CHANGED', { isSharing: true, hasAudio }, sessionId)
        }
      } catch (err) {
        console.warn('Compartilhamento de tela cancelado pelo usuário ou não suportado:', err)
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

      setActionSuccessMessage(
        'Sessão finalizada com sucesso! O Pix em custódia foi liberado para o monitor.'
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

  // Abrir Disputa de Dúvida Não Sanada (EXCLUSIVO ALUNO)
  async function handleConfirmDispute() {
    if (!disputeReason.trim() || disputeReason.length < 5) {
      alert('Por favor, descreva em detalhes por que sua dúvida não foi sanada.')
      return
    }

    setIsSubmittingFinish(true)
    try {
      if (!isDemoMode) {
        await api.post(`/sessions/${sessionId}/dispute`, {
          reason: disputeReason,
        })
        sendMessage?.('CALL_ENDED_BY_STUDENT', { resolved: false }, sessionId)
      }

      setActionSuccessMessage(
        'Ticket de ouvidoria aberto com sucesso! O caso foi enviado para análise da administração do Hintlink e o pagamento em custódia foi congelado.'
      )

      setTimeout(() => {
        onClose()
      }, 3000)
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.message || 'Erro ao enviar contestação.'
        : 'Erro inesperado.'
      alert(msg)
    } finally {
      setIsSubmittingFinish(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col font-sans select-none overflow-hidden">
      {/* Alerta de Contexto Inseguro (HTTP na Rede Local) */}
      {isInsecureContextAlert && (
        <div className="bg-amber-500/20 border-b border-amber-500/40 text-amber-200 px-4 py-2 text-xs sm:text-sm flex items-center justify-between gap-3 z-50">
          <div className="flex items-center gap-2">
            <span className="text-base">⚠️</span>
            <span>
              <strong>Aviso de Rede Local:</strong> O navegador bloqueia microfone e captura de tela em conexões HTTP fora de localhost. Para liberar no Chrome/Edge deste computador, ative a flag:
              <code className="mx-1 bg-black/40 px-1.5 py-0.5 rounded text-amber-300 font-mono text-xs select-all">
                chrome://flags/#unsafely-treat-insecure-origin-as-secure
              </code>
              adicionando <code className="bg-black/40 px-1.5 py-0.5 rounded text-amber-300 font-mono text-xs">{typeof window !== 'undefined' ? window.location.origin : ''}</code> e reinicie o navegador.
            </span>
          </div>
          <button
            onClick={() => setIsInsecureContextAlert(false)}
            className="text-amber-300 hover:text-white font-bold text-xs px-2 py-1 rounded bg-amber-500/30 whitespace-nowrap"
          >
            Entendi
          </button>
        </div>
      )}

      {/* Top Bar da Chamada */}
      <header className="h-16 px-4 sm:px-6 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="font-black text-sm text-slate-100 tracking-tight">
              {isDemoMode ? '🧪 Laboratório de Testes de Chamada (UFABC)' : 'Sala de Monitoria Hintlink'}
            </span>
          </div>

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
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => {
              sendMessageRef.current?.('JOIN_ROOM', {}, sessionId)
              if (currentUser.role === 'TUTOR') {
                isNegotiatingRef.current = false
                initiateOfferRef.current()
              } else {
                sendMessageRef.current?.('REQUEST_OFFER', {}, sessionId)
              }
            }}
            title="Clique para reconectar áudio e vídeo P2P"
            className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700 flex items-center gap-1.5 transition-all shadow-sm"
          >
            <span className={`w-2 h-2 rounded-full ${isP2PConnected ? 'bg-emerald-400 shadow-sm shadow-emerald-400/80' : 'bg-amber-400 animate-ping'}`} />
            <RefreshCw className={`w-3.5 h-3.5 ${!isP2PConnected ? 'text-amber-400 animate-spin' : 'text-emerald-400'}`} />
            <span className="hidden sm:inline">{isP2PConnected ? 'P2P Ativo' : 'Reconectar'}</span>
          </button>

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
            {/* COLUNA 1: USUÁRIO LOCAL (Você) */}
            <div className={`flex flex-col gap-3 min-h-0 ${focusMode === 'VIDEO' ? 'w-full h-full' : ''}`}>
              {/* Quadro da Câmera Local */}
              <div
                className={`relative bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-xl flex items-center justify-center transition-all ${
                  focusMode === 'VIDEO'
                    ? isScreenSharing
                      ? 'h-1/2 flex-1'
                      : 'h-full flex-1'
                    : 'w-36 h-24 sm:w-44 sm:h-28'
                }`}
              >
                <video
                  ref={(el) => {
                    localVideoRef.current = el
                    if (el && localStreamRef.current && el.srcObject !== localStreamRef.current) {
                      el.srcObject = localStreamRef.current
                      el.play().catch(() => {})
                    }
                  }}
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
                  className={`absolute bottom-2 left-2 bg-slate-950/80 backdrop-blur-md rounded-xl border border-slate-700/60 flex items-center gap-1.5 flex-wrap ${
                    focusMode === 'VIDEO' ? 'px-3.5 py-1.5 text-xs' : 'px-2 py-0.5 text-[10px]'
                  }`}
                >
                  <span className="font-bold text-slate-100 flex items-center gap-1">
                    {`Você (${currentUser.name.split(' ')[0]})`}
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

              {/* Novo Quadro: Adicionado ABAIXO da câmera com a Tela Compartilhada do Usuário Local */}
              {isScreenSharing && (
                <div
                  className={`relative bg-slate-950 rounded-2xl overflow-hidden border border-indigo-500/50 shadow-2xl flex items-center justify-center transition-all ${
                    focusMode === 'VIDEO' ? 'h-1/2 flex-1' : 'w-36 h-24 sm:w-44 sm:h-28'
                  }`}
                >
                  <video
                    ref={(el) => {
                      screenVideoRef.current = el
                      if (el) {
                        el.muted = true
                        if (screenStreamRef.current && el.srcObject !== screenStreamRef.current) {
                          el.srcObject = screenStreamRef.current
                        }
                        el.play().catch(() => {})
                      }
                    }}
                    autoPlay
                    muted
                    playsInline
                    onLoadedMetadata={(e) => {
                      const v = e.target as HTMLVideoElement
                      v.muted = true
                      v.play().catch(() => {})
                    }}
                    className="w-full h-full object-contain bg-black"
                  />

                  <div
                    className={`absolute bottom-2 left-2 bg-slate-950/85 backdrop-blur-md rounded-xl border border-indigo-500/40 flex items-center gap-2 ${
                      focusMode === 'VIDEO' ? 'px-3.5 py-1.5 text-xs' : 'px-2 py-0.5 text-[10px]'
                    }`}
                  >
                    <span className="font-bold text-indigo-300 flex items-center gap-1.5">
                      <span>🖥️</span>
                      <span>Sua Tela/Janela Compartilhada</span>
                    </span>
                    {screenHasAudio && (
                      <span className="px-1.5 py-0.5 rounded-md bg-emerald-950/90 border border-emerald-600/70 text-emerald-300 text-[10px] font-bold">
                        🔊 Áudio Ativo
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* COLUNA 2: PARCEIRO REMOTO */}
            <div className={`flex flex-col gap-3 min-h-0 ${focusMode === 'VIDEO' ? 'w-full h-full' : ''}`}>
              {/* Quadro da Câmera Remota */}
              <div
                className={`relative bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-xl flex items-center justify-center transition-all ${
                  focusMode === 'VIDEO'
                    ? isRemoteScreenSharing
                      ? 'h-1/2 flex-1'
                      : 'h-full flex-1'
                    : 'w-36 h-24 sm:w-44 sm:h-28'
                }`}
              >
                {/* Canal de Áudio Remoto Dedicado (Garante reprodução incondicional mesmo com câmera desligada) */}
                <audio
                  ref={(el) => {
                    remoteAudioRef.current = el
                    if (el && remoteStreamRef.current && el.srcObject !== remoteStreamRef.current) {
                      el.srcObject = remoteStreamRef.current
                      el.play().catch((err) => {
                        if (err.name === 'NotAllowedError') setNeedsUserInteractionForAudio(true)
                      })
                    }
                  }}
                  autoPlay
                  playsInline
                  muted={isSpeakerMuted}
                />

                <video
                  ref={(el) => {
                    remoteVideoRef.current = el
                    if (el) {
                      el.muted = true
                      if (remoteStreamRef.current && el.srcObject !== remoteStreamRef.current) {
                        el.srcObject = remoteStreamRef.current
                      } else if (peerConnectionRef.current) {
                        attachRemoteReceiverTracksRef.current(peerConnectionRef.current)
                      }
                      el.play().catch(() => {})
                    }
                  }}
                  autoPlay
                  playsInline
                  muted
                  onLoadedMetadata={(e) => {
                    const v = e.target as HTMLVideoElement
                    v.muted = true
                    v.play().catch(() => {})
                  }}
                  className={`w-full h-full object-cover ${(!remoteIsVideoEnabled || !isP2PConnected) && !isDemoMode ? 'hidden' : ''}`}
                />

                {/* Se P2P está conectado mas a câmera do parceiro está desligada */}
                {isP2PConnected && !remoteIsVideoEnabled && !isDemoMode && (
                  <div className="flex flex-col items-center justify-center text-slate-400">
                    <div
                      className={`rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-300 ${
                        focusMode === 'VIDEO' ? 'h-20 w-20 text-2xl mb-3' : 'h-10 w-10 text-sm'
                      }`}
                    >
                      {isStudent ? 'M' : 'A'}
                    </div>
                    {focusMode === 'VIDEO' && (
                      <>
                        <p className="font-extrabold text-slate-200 text-sm">
                          {isStudent ? 'Monitor' : 'Aluno'}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">Câmera Desligada • Áudio Conectado 🎙️</p>
                      </>
                    )}
                  </div>
                )}

                {/* Se o parceiro está na sala mas o P2P ainda está sincronizando */}
                {isPartnerInRoom && !isP2PConnected && !isDemoMode && (
                  <div className="flex flex-col items-center justify-center text-center p-3 text-slate-400 animate-pulse">
                    <div
                      className={`rounded-full bg-brand-purple/20 text-brand-purple flex items-center justify-center font-black border border-brand-purple/40 ${
                        focusMode === 'VIDEO' ? 'h-16 w-16 text-2xl mb-2' : 'h-8 w-8 text-xs'
                      }`}
                    >
                      🔄
                    </div>
                    {focusMode === 'VIDEO' && (
                      <>
                        <p className="font-extrabold text-slate-200 text-sm">Sincronizando Chamada...</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">Estabelecendo conexão P2P de áudio e vídeo...</p>
                      </>
                    )}
                  </div>
                )}

                {/* Se o parceiro ainda não entrou na sala */}
                {!isPartnerInRoom && !isP2PConnected && !isDemoMode && (
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
                        <p className="text-[11px] text-slate-500 mt-0.5">O link da sala está aberto aguardando entrada.</p>
                      </>
                    )}
                  </div>
                )}

                {/* Botão de desbloqueio caso a Autoplay Policy do navegador pause o áudio */}
                {needsUserInteractionForAudio && (
                  <div className="absolute inset-0 z-30 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center">
                    <p className="text-white text-sm font-bold mb-3">
                      🔊 O navegador requer confirmação para liberar o áudio/vídeo da chamada.
                    </p>
                    <button
                      onClick={() => {
                        if (remoteAudioRef.current) {
                          remoteAudioRef.current.play().catch(() => {})
                        }
                        if (remoteVideoRef.current) {
                          remoteVideoRef.current.play().catch(() => {})
                        }
                        if (remoteScreenVideoRef.current) {
                          remoteScreenVideoRef.current.play().catch(() => {})
                        }
                        setNeedsUserInteractionForAudio(false)
                      }}
                      className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg"
                    >
                      <Volume2 className="w-4 h-4" />
                      Ativar Áudio e Vídeo Agora
                    </button>
                  </div>
                )}

                {isDemoMode && !hasRemoteStream && (
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

                {/* Card do Usuário Remoto */}
                <div
                  className={`absolute bottom-2 left-2 bg-slate-950/80 backdrop-blur-md rounded-xl border border-slate-700/60 flex items-center gap-1.5 flex-wrap ${
                    focusMode === 'VIDEO' ? 'px-3.5 py-1.5 text-xs' : 'px-2 py-0.5 text-[10px]'
                  }`}
                >
                  <span className="font-bold text-slate-100 flex items-center gap-1">
                    {isDemoMode ? 'Lucas Mendes (Monitor)' : isStudent ? 'Monitor' : 'Aluno'}
                  </span>
                  {!remoteIsAudioEnabled && isP2PConnected && (
                    <span title="Microfone desligado">
                      <MicOff className="w-3 h-3 text-rose-400" />
                    </span>
                  )}
                </div>
              </div>

              {/* Novo Quadro: Adicionado ABAIXO da câmera com a Tela Compartilhada do Parceiro */}
              {isRemoteScreenSharing && (
                <div
                  className={`relative bg-slate-950 rounded-2xl overflow-hidden border border-indigo-500/50 shadow-2xl flex items-center justify-center transition-all ${
                    focusMode === 'VIDEO' ? 'h-1/2 flex-1' : 'w-36 h-24 sm:w-44 sm:h-28'
                  }`}
                >
                  <video
                    ref={(el) => {
                      remoteScreenVideoRef.current = el
                      if (el) {
                        el.muted = true
                        if (remoteScreenStreamRef.current && el.srcObject !== remoteScreenStreamRef.current) {
                          el.srcObject = remoteScreenStreamRef.current
                        }
                        if (peerConnectionRef.current) {
                          attachRemoteReceiverTracksRef.current(peerConnectionRef.current)
                        }
                        el.play().catch(() => {})
                      }
                    }}
                    autoPlay
                    playsInline
                    muted
                    onLoadedMetadata={(e) => {
                      const v = e.target as HTMLVideoElement
                      v.muted = true
                      v.play().catch(() => {})
                    }}
                    className="w-full h-full object-contain bg-black"
                  />

                  <div
                    className={`absolute bottom-2 left-2 bg-slate-950/85 backdrop-blur-md rounded-xl border border-indigo-500/40 flex items-center gap-2 ${
                      focusMode === 'VIDEO' ? 'px-3.5 py-1.5 text-xs' : 'px-2 py-0.5 text-[10px]'
                    }`}
                  >
                    <span className="font-bold text-indigo-300 flex items-center gap-1.5">
                      <span>🖥️</span>
                      <span>Tela de {isStudent ? 'Monitor' : 'Aluno'}</span>
                    </span>
                    {remoteHasScreenAudio && (
                      <span className="px-1.5 py-0.5 rounded-md bg-emerald-950/90 border border-emerald-600/70 text-emerald-300 text-[10px] font-bold">
                        🔊 Áudio da Tela Ativo
                      </span>
                    )}
                  </div>
                </div>
              )}
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

        {/* Toggle Screen Share (Estilo Discord com Áudio e Seleção de Janela/Tela) */}
        <button
          onClick={toggleScreenSharing}
          className={`p-3.5 rounded-2xl transition-all flex items-center gap-2 ${
            isScreenSharing
              ? 'bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black shadow-lg shadow-emerald-500/40 ring-2 ring-emerald-300'
              : 'bg-slate-800 hover:bg-slate-700 text-white'
          }`}
          title={
            isScreenSharing
              ? 'Interromper Compartilhamento de Tela/Janela'
              : 'Compartilhar Tela ou Janela com Áudio (Estilo Discord)'
          }
        >
          {isScreenSharing ? (
            <>
              <MonitorX className="w-5 h-5" />
              <span className="text-xs hidden sm:inline font-bold">Transmitindo Tela</span>
            </>
          ) : (
            <>
              <MonitorUp className="w-5 h-5" />
              <span className="text-xs hidden lg:inline font-semibold">Compartilhar Tela</span>
            </>
          )}
        </button>

        {/* Toggle Speaker */}
        <button
          onClick={() => {
            const next = !isSpeakerMuted
            setIsSpeakerMuted(next)
            if (remoteVideoRef.current) {
              remoteVideoRef.current.muted = next
              if (!next) {
                remoteVideoRef.current.play().catch(() => {})
              }
            }
          }}
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
                      <span className="text-[10px] opacity-75">Liberar monitor</span>
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
                      <span className="text-[10px] opacity-75">Contestar atendimento</span>
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

                {/* Se Dúvida NÃO Foi Sanada: Descrição da Contestação */}
                {doubtResolved === false && (
                  <div className="space-y-3 p-4 rounded-2xl bg-rose-950/40 border border-rose-900/60 animate-in fade-in duration-200">
                    <div className="flex items-start gap-2 text-rose-300 text-xs">
                      <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5 text-rose-400" />
                      <p>
                        Seu relato será enviado diretamente para a administração do Hintlink analisar o chamado. O pagamento ao monitor permanecerá congelado.
                      </p>
                    </div>

                    <label className="block text-xs font-bold text-slate-200">
                      Descreva o que ocorreu (mínimo 5 caracteres):
                    </label>
                    <textarea
                      rows={3}
                      value={disputeReason}
                      onChange={(e) => setDisputeReason(e.target.value)}
                      placeholder="Ex: O monitor não compareceu ou não soube esclarecer a dúvida..."
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
                      <span>Enviar Contestação p/ Análise</span>
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
