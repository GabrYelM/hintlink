'use client'

import { useState } from 'react'
import { api, setAuthToken } from '@/services/api'
import { GraduationCap, BookOpen, Clock, ShieldCheck, ArrowRight, CheckCircle2 } from 'lucide-react'
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
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-emerald-500 selection:text-black">
      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-emerald-500/20">
              <GraduationCap className="w-6 h-6" />
            </div>
            <span className="text-xl font-bold tracking-tight">Hint<span className="text-emerald-400">link</span></span>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Backend Conectado
            </span>
          </div>
        </div>
      </header>

      {/* Hero & Auth Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 lg:py-20 flex-1 grid lg:grid-cols-12 gap-12 items-center">
        {/* Left Column: Proposta de Valor */}
        <div className="lg:col-span-7 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-300">
            <BookOpen className="w-4 h-4 text-emerald-400" />
            <span>Monitorias Universitárias Sob Demanda (Estilo Uber)</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.1]">
            A ponte direta entre sua dúvida e quem <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-200">já domina a matéria</span>.
          </h1>

          <p className="text-slate-400 text-base sm:text-lg max-w-xl leading-relaxed">
            Abra um chamado no exato momento da dúvida acadêmica. Conecte-se com alunos veteranos aprovados, estude em sala com quadro branco e pague via Pix seguro retido em custódia.
          </p>

          <div className="grid sm:grid-cols-3 gap-4 pt-4 border-t border-slate-900">
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-slate-200">Instantâneo</h4>
                <p className="text-xs text-slate-400">Atendimento sob demanda sem esperar horário fixo.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-slate-200">Aprovação Real</h4>
                <p className="text-xs text-slate-400">Monitores validados pelo histórico escolar.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-slate-200">Pix com Custódia</h4>
                <p className="text-xs text-slate-400">Dinheiro liberado apenas após sua avaliação.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Card de Autenticação / Perfil */}
        <div className="lg:col-span-5">
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
            {loggedUser ? (
              <div className="space-y-6 text-center py-4">
                <div className="h-16 w-16 mx-auto rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-2xl border border-emerald-500/30">
                  {loggedUser.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-100">{loggedUser.name}</h3>
                  <p className="text-xs text-slate-400 font-mono mt-1">{loggedUser.email}</p>
                  <span className="inline-block mt-3 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-400/10 text-emerald-300 border border-emerald-400/20">
                    {loggedUser.role === 'STUDENT' ? '🎓 Perfil de Aluno' : '👨‍🏫 Perfil de Monitor'}
                  </span>
                </div>

                <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 text-left text-xs space-y-2 font-mono">
                  <div className="flex justify-between text-slate-400">
                    <span>Avaliação:</span>
                    <span className="text-emerald-400 font-bold">{loggedUser.rating} ★ ({loggedUser.totalReviews} avaliações)</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>ID do Usuário:</span>
                    <span className="text-slate-300 truncate max-w-[180px]">{loggedUser.id}</span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setAuthToken(null)
                    setLoggedUser(null)
                  }}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  Sair da Conta
                </button>
              </div>
            ) : (
              <div>
                {/* Abas Login / Cadastro */}
                <div className="flex bg-slate-950 p-1 rounded-xl mb-6 border border-slate-800">
                  <button
                    onClick={() => { setActiveTab('LOGIN'); setError(null); setSuccess(null) }}
                    className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                      activeTab === 'LOGIN' ? 'bg-slate-800 text-slate-100 shadow' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Entrar
                  </button>
                  <button
                    onClick={() => { setActiveTab('REGISTER'); setError(null); setSuccess(null) }}
                    className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                      activeTab === 'REGISTER' ? 'bg-slate-800 text-slate-100 shadow' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Criar Conta
                  </button>
                </div>

                {error && (
                  <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                    {error}
                  </div>
                )}

                {success && (
                  <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
                    {success}
                  </div>
                )}

                {activeTab === 'LOGIN' ? (
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">E-mail</label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="seu.email@universidade.edu.br"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">Senha</label>
                      <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full mt-2 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50"
                    >
                      {loading ? 'Entrando...' : 'Acessar Plataforma'}
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
                        className={`p-2.5 rounded-xl border text-xs font-semibold text-center transition-all ${
                          role === 'STUDENT'
                            ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400'
                            : 'bg-slate-950 border-slate-800 text-slate-400'
                        }`}
                      >
                        Sou Aluno
                      </button>
                      <button
                        type="button"
                        onClick={() => setRole('TUTOR')}
                        className={`p-2.5 rounded-xl border text-xs font-semibold text-center transition-all ${
                          role === 'TUTOR'
                            ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400'
                            : 'bg-slate-950 border-slate-800 text-slate-400'
                        }`}
                      >
                        Quero ser Monitor
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Nome Completo</label>
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Nome Sobrenome"
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">E-mail</label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="aluno@universidade.edu.br"
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">CPF</label>
                        <input
                          type="text"
                          required
                          value={cpf}
                          onChange={(e) => setCpf(e.target.value)}
                          placeholder="000.000.000-00"
                          className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">Senha</label>
                        <input
                          type="password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Mín. 6 chars"
                          className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full mt-2 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50"
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
      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-600">
        <p>Hintlink © 2026 — Plataforma Universitária de Apoio Acadêmico Peer-to-Peer (100% Open Source)</p>
      </footer>
    </main>
  )
}
