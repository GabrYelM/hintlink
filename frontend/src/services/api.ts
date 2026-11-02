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

// Interceptor para garantir que requisições feitas no navegador usem o hostname atual (IP da rede local)
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined' && !process.env.NEXT_PUBLIC_API_URL) {
    config.baseURL = `http://${window.location.hostname}:3333/api/v1`
  }
  return config
})

// Anexa o token JWT automaticamente se estiver salvo no navegador
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
