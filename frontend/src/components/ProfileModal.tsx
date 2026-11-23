'use client'

import { useState } from 'react'
import { api, setAuthToken } from '@/services/api'
import { User, GraduationCap, CheckCircle2, RefreshCw, Calendar, Save, AlertCircle } from 'lucide-react'
import axios from 'axios'

export interface AvailabilitySlot {
  day: string
  startTime: string
  endTime: string
}

const WEEKDAYS = [
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
  'Domingo',
]

interface UserData {
  id: string
  name: string
  email: string
  cpf: string
  role: 'STUDENT' | 'TUTOR' | 'ADMIN'
  rating: number
  totalReviews: number
  credits?: number | string
  availability?: AvailabilitySlot[]
}

interface ProfileModalProps {
  user: UserData
  onClose: () => void
  onUserUpdated: (updatedUser: UserData) => void
}

export function ProfileModal({ user, onClose, onUserUpdated }: ProfileModalProps) {
  const [loading, setLoading] = useState(false)
  const [savingAvailability, setSavingAvailability] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [availability, setAvailability] = useState<AvailabilitySlot[]>(
    Array.isArray(user.availability) && user.availability.length > 0
      ? user.availability
      : [
          { day: 'Segunda-feira', startTime: '14:00', endTime: '18:00' },
          { day: 'Quarta-feira', startTime: '14:00', endTime: '18:00' },
        ]
  )

  function toggleDay(day: string) {
    setAvailability((prev) => {
      const exists = prev.find((item) => item.day === day)
      if (exists) {
        return prev.filter((item) => item.day !== day)
      }
      return [...prev, { day, startTime: '14:00', endTime: '18:00' }]
    })
  }

  function updateSlotTime(day: string, field: 'startTime' | 'endTime', value: string) {
    setAvailability((prev) =>
      prev.map((item) => (item.day === day ? { ...item, [field]: value } : item))
    )
  }

  async function handleSaveAvailability() {
    if (availability.length === 0) {
      setFeedback({
        type: 'error',
        message: 'Selecione pelo menos um dia e horário de disponibilidade.',
      })
      return
    }

    setSavingAvailability(true)
    setFeedback(null)

    try {
      const response = await api.put('/me/availability', { availability })
      onUserUpdated(response.data.user)
      setFeedback({
        type: 'success',
        message: response.data.message || 'Disponibilidade salva com sucesso!',
      })
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setFeedback({
          type: 'error',
          message: err.response?.data?.message || 'Erro ao salvar disponibilidade.',
        })
      } else {
        setFeedback({
          type: 'error',
          message: 'Erro inesperado ao salvar disponibilidade.',
        })
      }
    } finally {
      setSavingAvailability(false)
    }
  }

  async function handleToggleRole() {
    if (user.role === 'STUDENT' && availability.length === 0) {
      setFeedback({
        type: 'error',
        message: 'Para ativar o modo Monitor, selecione pelo menos um dia e horário na grade abaixo.',
      })
      return
    }

    setLoading(true)
    setFeedback(null)

    try {
      const response = await api.patch('/me/role', {
        availability: user.role === 'STUDENT' ? availability : undefined,
      })
      setAuthToken(response.data.token)
      onUserUpdated(response.data.user)
      setFeedback({
        type: 'success',
        message: response.data.message,
      })
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setFeedback({
          type: 'error',
          message: err.response?.data?.message || 'Erro ao alterar papel.',
        })
      } else {
        setFeedback({
          type: 'error',
          message: 'Erro inesperado ao alterar modalidade.',
        })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative space-y-5 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-brand-blue/10 text-brand-blue">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-lg text-brand-blue leading-none">Seu Perfil</h3>
              <span className="text-[11px] text-slate-500 font-medium">Dados, disponibilidade e modalidade de conta</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-sm font-bold p-1 rounded-lg"
          >
            ✕
          </button>
        </div>

        {feedback && (
          <div
            className={`p-3.5 rounded-2xl text-xs font-semibold flex items-center gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border border-rose-200 text-rose-700'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Informações Pessoais */}
        <div className="space-y-2.5 bg-brand-light p-4 rounded-2xl border border-slate-200 text-xs">
          <div className="flex justify-between py-1 border-b border-slate-200/60">
            <span className="text-slate-500 font-medium">Nome Completo:</span>
            <span className="font-bold text-brand-dark">{user.name}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-200/60">
            <span className="text-slate-500 font-medium">E-mail:</span>
            <span className="font-mono text-slate-700">{user.email}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-200/60">
            <span className="text-slate-500 font-medium">CPF:</span>
            <span className="font-mono text-slate-700">{user.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.***.***-$4')}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-slate-500 font-medium">Avaliação Geral:</span>
            <span className="font-bold text-brand-yellow">{user.rating} ★ ({user.totalReviews} avaliações)</span>
          </div>
        </div>

        {/* Grade de Dias e Horários de Monitoria (Editável no Perfil) */}
        <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-brand-blue">
              <Calendar className="w-4 h-4 text-brand-purple" />
              <h4 className="font-extrabold text-xs sm:text-sm">
                Meus Dias e Horários Disponíveis para Monitoria
              </h4>
            </div>
            <button
              type="button"
              onClick={handleSaveAvailability}
              disabled={savingAvailability}
              className="px-3 py-1.5 rounded-xl bg-brand-blue hover:bg-slate-800 text-white font-extrabold text-[11px] flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savingAvailability ? 'Salvando...' : 'Salvar Horários'}</span>
            </button>
          </div>

          <p className="text-[11px] text-slate-500">
            {user.role === 'TUTOR'
              ? 'Altere a qualquer momento os dias e faixas de horário em que você pode atender monitorias:'
              : 'Configure seus dias e horários disponíveis (obrigatório caso deseje ativar o modo Monitor):'}
          </p>

          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((day) => {
              const isSelected = availability.some((s) => s.day === day)
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                    isSelected
                      ? 'bg-brand-purple text-white border-brand-purple shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {day.replace('-feira', '')}
                </button>
              )
            })}
          </div>

          {availability.length === 0 ? (
            <p className="text-[11px] text-rose-600 font-semibold py-2">
              Nenhum dia selecionado. Clique em pelo menos um dia acima para definir o horário.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
              {availability.map((slot) => (
                <div
                  key={slot.day}
                  className="flex items-center justify-between gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 text-xs"
                >
                  <span className="font-bold text-brand-dark truncate w-28">{slot.day}</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="time"
                      value={slot.startTime}
                      onChange={(e) => updateSlotTime(slot.day, 'startTime', e.target.value)}
                      className="px-2 py-1 rounded-lg bg-brand-light border border-slate-200 text-[11px] font-semibold"
                    />
                    <span className="text-slate-400 text-[10px]">às</span>
                    <input
                      type="time"
                      value={slot.endTime}
                      onChange={(e) => updateSlotTime(slot.day, 'endTime', e.target.value)}
                      className="px-2 py-1 rounded-lg bg-brand-light border border-slate-200 text-[11px] font-semibold"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Alternar Modalidade (Aluno <-> Monitor) */}
        <div className="p-4 rounded-2xl border border-brand-purple/20 bg-brand-purple/5 space-y-3">
          <div className="flex items-center gap-2 text-brand-purple">
            <GraduationCap className="w-5 h-5" />
            <h4 className="font-extrabold text-sm">Modalidade de Acesso</h4>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Você está operando atualmente no modo{' '}
            <strong className="text-brand-purple">
              {user.role === 'STUDENT' ? 'Aluno (pedindo monitorias)' : 'Monitor (atendendo dúvidas)'}
            </strong>.
          </p>

          <button
            onClick={handleToggleRole}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-brand-purple hover:bg-purple-700 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-md shadow-brand-purple/20 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading
              ? 'Alternando...'
              : user.role === 'STUDENT'
              ? 'Quero ser Monitor (Salvar Horários e Ativar Painel)'
              : 'Mudar para Modo Aluno (Pedir Aulas)'}
          </button>
        </div>

        <div className="text-center pt-1">
          <button
            onClick={onClose}
            className="text-xs text-slate-500 hover:text-slate-800 font-bold"
          >
            Fechar Janela
          </button>
        </div>
      </div>
    </div>
  )
}
