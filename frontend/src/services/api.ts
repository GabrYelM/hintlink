import axios from 'axios'

function getInitialBaseURL() {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL
  if (typeof window !== 'undefined') {
    return `http://${window.location.hostname}:3333/api/v1`
  }
  return 'http://localhost:3333/api/v1'
}

export const api = axios.create({
  baseURL: getInitialBaseURL(),
})

// Interceptor para garantir que requisições usem o hostname atual e anexe o token JWT mais recente
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    if (!process.env.NEXT_PUBLIC_API_URL) {
      config.baseURL = `http://${window.location.hostname}:3333/api/v1`
    }
    const token = localStorage.getItem('@hintlink:token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  return config
})

// Anexa o token JWT automaticamente se já estiver salvo no navegador
if (typeof window !== 'undefined') {
  const token = localStorage.getItem('@hintlink:token')
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`
  }
}

export function setAuthToken(token: string | null) {
  if (token) {
    localStorage.setItem('@hintlink:token', token)
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`
  } else {
    localStorage.removeItem('@hintlink:token')
    delete api.defaults.headers.common['Authorization']
  }
}
