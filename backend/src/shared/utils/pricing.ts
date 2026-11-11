/**
 * Utilitário de precificação por tempo da aula do Hintlink.
 * O aluno não define o preço: o valor é tabelado e calculado
 * automaticamente pelo sistema com base na taxa de R$ 30,00 por hora (R$ 0,50 por minuto).
 */

export const PRICING_TIERS = {
  MIN_DURATION_MINUTES: 15,
  RATE_PER_MINUTE: 0.5, // R$ 30,00 / 60 min = R$ 0,50 por minuto
  PRICE_PER_HOUR: 30.0,
} as const

/**
 * Tabela de preços baseada na taxa de R$ 30,00/hora:
 * - 15 minutos: R$ 7,50
 * - 30 minutos: R$ 15,00
 * - 45 minutos: R$ 22,50
 * - 60 minutos (1 hora): R$ 30,00
 * - Demais durações: R$ 0,50 por minuto
 */
export function calculatePriceByDuration(durationMinutes: number): number {
  if (durationMinutes < PRICING_TIERS.MIN_DURATION_MINUTES) {
    throw new Error(`A duração mínima de monitoria é de ${PRICING_TIERS.MIN_DURATION_MINUTES} minutos.`)
  }

  const total = durationMinutes * PRICING_TIERS.RATE_PER_MINUTE
  return Number(total.toFixed(2))
}
