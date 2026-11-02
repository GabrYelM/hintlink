'use client'

import { useState } from 'react'
import { api, setAuthToken } from '@/services/api'
import { HintlinkLogo } from '@/components/HintlinkLogo'
import { BookOpen, Clock, ShieldCheck, ArrowRight, CheckCircle2 } from 'lucide-react'
import axios from 'axios'

interface UserProfile {
  id: string
  name: string
  email: string
  cpf: string
  role: 'STUDENT' | 'TUTOR' | 'ADMIN'
  rating: number
  totalReviews: number
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<'LOGIN' | 'REGISTER'>('LOGIN')
  const [role, setRole] = useState<'STUDENT' | 'TUTOR'>('STUDENT')

  // Form States
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [cpf, setCpf] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loggedUser, setLoggedUser] = useState<UserProfile | null>(null)

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)

    try {
      const response = await api.post('/auth/register', {
        name,
        email,
        cpf,
        password,
        role,
      })

      setAuthToken(response.data.token)
      setLoggedUser(response.data.user)
      setSuccess(`Conta criada com sucesso como ${role === 'STUDENT' ? 'Aluno' : 'Monitor'}!`)
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message || 'Falha ao realizar cadastro.')
      } else {
        setError('Erro inesperado.')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)

    try {
      const response = await api.post('/auth/login', {
        email,
        password,
      })

      setAuthToken(response.data.token)
      setLoggedUser(response.data.user)
      setSuccess(`Bem-vindo de volta, ${response.data.user.name}!`)
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message || 'Credenciais inválidas.')
      } else {
        setError('Erro inesperado.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-brand-light text-brand-dark flex flex-col justify-between selection:bg-brand-yellow selection:text-brand-dark">
      {/* Top Navbar */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-18 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <HintlinkLogo size={40} />
            <div className="flex flex-col">
              <span className="text-2xl font-black tracking-tight text-brand-blue leading-none">
                Hintlink
              </span>
              <span className="text-[10px] font-medium text-brand-yellow tracking-wider uppercase mt-0.5">
                by Hefesto Company
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-blue/5 text-brand-blue border border-brand-blue/15 font-semibold">
              <span className="h-2 w-2 rounded-full bg-brand-yellow animate-pulse"></span>
              UFABC • Conexão Ativa
            </span>
          </div>
        </div>
      </header>

      {/* Hero & Auth Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 lg:py-20 flex-1 grid lg:grid-cols-12 gap-12 items-center">
        {/* Left Column: Proposta de Valor Conforme Brand Guideline */}
        <div className="lg:col-span-7 space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-purple/10 border border-brand-purple/20 text-xs font-semibold text-brand-purple">
            <BookOpen className="w-4 h-4 text-brand-purple" />
            <span>Uma plataforma de conexão de conhecimento para universitários</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.1] text-brand-blue">
            A ajuda que você precisa, de <span className="text-brand-purple">universitário</span> para <span className="text-brand-yellow">universitário</span>.
          </h1>

          <p className="text-slate-600 text-base sm:text-lg max-w-xl leading-relaxed">
            Dúvida na matéria? Conecte-se rapidamente com quem já domina o conteúdo. Atendimentos imediatos sob demanda com segurança acadêmica e transacional.
          </p>

          <div className="grid sm:grid-cols-3 gap-4 pt-6 border-t border-slate-200">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-brand-yellow/15 text-brand-yellow">
                <Clock className="w-5 h-5 shrink-0" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-brand-blue">Ágil</h4>
                <p className="text-xs text-slate-500">Atendimento sob demanda, imediato ou agendado.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-brand-purple/15 text-brand-purple">
                <ShieldCheck className="w-5 h-5 shrink-0" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-brand-blue">Inteligente</h4>
                <p className="text-xs text-slate-500">Monitores aprovados na grade curricular.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-brand-blue/10 text-brand-blue">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-brand-blue">Colaborativa</h4>
                <p className="text-xs text-slate-500">Valorização real da troca de conhecimento.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Card de Autenticação / Perfil */}
        <div className="lg:col-span-5">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/50 relative overflow-hidden">
            {loggedUser ? (
              <div className="space-y-6 text-center py-4">
                <div className="h-16 w-16 mx-auto rounded-full bg-brand-purple/10 text-brand-purple flex items-center justify-center font-bold text-2xl border border-brand-purple/20">
                  {loggedUser.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-brand-blue">{loggedUser.name}</h3>
                  <p className="text-xs text-slate-500 font-mono mt-1">{loggedUser.email}</p>
                  <span className="inline-block mt-3 px-3 py-1 rounded-full text-xs font-semibold bg-brand-purple/10 text-brand-purple border border-brand-purple/20">
                    {loggedUser.role === 'STUDENT' ? '🎓 Aluno' : '👨‍🏫 Monitor'}
                  </span>
                </div>

                <div className="bg-brand-light p-4 rounded-xl border border-slate-200 text-left text-xs space-y-2 font-mono">
                  <div className="flex justify-between text-slate-600">
                    <span>Avaliação:</span>
                    <span className="text-brand-yellow font-bold">{loggedUser.rating} ★ ({loggedUser.totalReviews} avaliações)</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>ID do Usuário:</span>
                    <span className="text-brand-blue truncate max-w-[180px] font-semibold">{loggedUser.id}</span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setAuthToken(null)
                    setLoggedUser(null)
                  }}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                >
                  Sair da Conta
                </button>
              </div>
            ) : (
              <div>
                {/* Abas Login / Cadastro */}
                <div className="flex bg-brand-light p-1 rounded-xl mb-6 border border-slate-200">
                  <button
                    onClick={() => { setActiveTab('LOGIN'); setError(null); setSuccess(null) }}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                      activeTab === 'LOGIN' ? 'bg-white text-brand-blue shadow-sm' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Entrar
                  </button>
                  <button
                    onClick={() => { setActiveTab('REGISTER'); setError(null); setSuccess(null) }}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                      activeTab === 'REGISTER' ? 'bg-white text-brand-blue shadow-sm' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Criar Conta
                  </button>
                </div>

                {error && (
                  <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-xs font-medium">
                    {error}
                  </div>
                )}

                {success && (
                  <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
                    {success}
                  </div>
                )}

                {activeTab === 'LOGIN' ? (
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">E-mail Universitário</label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="seu.email@ufabc.edu.br"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-brand-light border border-slate-200 text-sm text-brand-dark placeholder:text-slate-400 focus:outline-none focus:border-brand-blue"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Senha</label>
                      <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-brand-light border border-slate-200 text-sm text-brand-dark placeholder:text-slate-400 focus:outline-none focus:border-brand-blue"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full mt-2 py-3 rounded-xl bg-brand-yellow hover:bg-amber-400 text-brand-dark font-extrabold text-sm flex items-center justify-center gap-2 shadow-md shadow-brand-yellow/30 transition-all disabled:opacity-50"
                    >
                      {loading ? 'Entrando...' : 'Começar Agora'}
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleRegister} className="space-y-3.5">
                    {/* Role Selection */}
                    <div className="grid grid-cols-2 gap-2 pb-1">
                      <button
                        type="button"
                        onClick={() => setRole('STUDENT')}
                        className={`p-2.5 rounded-xl border text-xs font-bold text-center transition-all ${
                          role === 'STUDENT'
                            ? 'bg-brand-blue/10 border-brand-blue text-brand-blue'
                            : 'bg-brand-light border-slate-200 text-slate-500'
                        }`}
                      >
                        Sou Aluno
                      </button>
                      <button
                        type="button"
                        onClick={() => setRole('TUTOR')}
                        className={`p-2.5 rounded-xl border text-xs font-bold text-center transition-all ${
                          role === 'TUTOR'
                            ? 'bg-brand-purple/10 border-brand-purple text-brand-purple'
                            : 'bg-brand-light border-slate-200 text-slate-500'
                        }`}
                      >
                        Quero ser Monitor
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Nome Completo</label>
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Nome Sobrenome"
                        className="w-full px-3 py-2 rounded-xl bg-brand-light border border-slate-200 text-sm text-brand-dark placeholder:text-slate-400 focus:outline-none focus:border-brand-blue"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">E-mail</label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="aluno@ufabc.edu.br"
                        className="w-full px-3 py-2 rounded-xl bg-brand-light border border-slate-200 text-sm text-brand-dark placeholder:text-slate-400 focus:outline-none focus:border-brand-blue"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">CPF</label>
                        <input
                          type="text"
                          required
                          value={cpf}
                          onChange={(e) => setCpf(e.target.value)}
                          placeholder="000.000.000-00"
                          className="w-full px-3 py-2 rounded-xl bg-brand-light border border-slate-200 text-sm text-brand-dark placeholder:text-slate-400 focus:outline-none focus:border-brand-blue"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Senha</label>
                        <input
                          type="password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Mín. 6 chars"
                          className="w-full px-3 py-2 rounded-xl bg-brand-light border border-slate-200 text-sm text-brand-dark placeholder:text-slate-400 focus:outline-none focus:border-brand-blue"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full mt-2 py-3 rounded-xl bg-brand-yellow hover:bg-amber-400 text-brand-dark font-extrabold text-sm flex items-center justify-center gap-2 shadow-md shadow-brand-yellow/30 transition-all disabled:opacity-50"
                    >
                      {loading ? 'Cadastrando...' : `Cadastrar como ${role === 'STUDENT' ? 'Aluno' : 'Monitor'}`}
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        <p>Hintlink by Hefesto Company © 2026 — Inovações para Engenharia (UFABC)</p>
      </footer>
    </main>
  )
}
