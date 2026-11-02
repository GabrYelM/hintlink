import axios from 'axios'

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333/api/v1',
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
