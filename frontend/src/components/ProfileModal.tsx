'use client'

import { useState } from 'react'
import { api, setAuthToken } from '@/services/api'
import { User, GraduationCap, CheckCircle2, RefreshCw } from 'lucide-react'
import axios from 'axios'

interface UserData {
  id: string
  name: string
  email: string
  cpf: string
  role: 'STUDENT' | 'TUTOR' | 'ADMIN'
  rating: number
  totalReviews: number
}

interface ProfileModalProps {
  user: UserData
  onClose: () => void
  onUserUpdated: (updatedUser: UserData) => void
}

export function ProfileModal({ user, onClose, onUserUpdated }: ProfileModalProps) {
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  async function handleToggleRole() {
    setLoading(true)
    setFeedback(null)

    try {
      const response = await api.patch('/me/role')
      setAuthToken(response.data.token)
      onUserUpdated(response.data.user)
      setFeedback(response.data.message)
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setFeedback(err.response?.data?.message || 'Erro ao alterar papel.')
      } else {
        setFeedback('Erro inesperado ao alterar modalidade.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl relative space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-brand-blue/10 text-brand-blue">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-lg text-brand-blue leading-none">Seu Perfil</h3>
              <span className="text-[11px] text-slate-500 font-medium">Dados e modalidade de conta</span>
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
          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{feedback}</span>
          </div>
        )}

        {/* Informações Pessoais */}
        <div className="space-y-3 bg-brand-light p-4 rounded-2xl border border-slate-200 text-xs">
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
              ? 'Quero ser Monitor (Ativar Painel de Aulas)'
              : 'Mudar para Modo Aluno (Pedir Aulas)'}
          </button>
        </div>

        <div className="text-center pt-2">
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
