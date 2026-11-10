// Cálculo puro do tempo restante até uma data — usado pelo cronômetro da oferta
// de lançamento na landing (PromoCountdownBar). Nunca devolve valores negativos.

export interface TimeLeft {
  /** Milissegundos restantes, mínimo 0. */
  totalMs: number
  days: number
  hours: number
  minutes: number
  seconds: number
  /** true quando não resta nenhum segundo inteiro (fim alcançado ou ultrapassado). */
  expired: boolean
}

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

function toMs(value: Date | string | number): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime()
}

/**
 * Tempo restante entre `now` e `end`, quebrado em dias/horas/minutos/segundos.
 * Frações de segundo contam como 1 segundo restante (ceil), para o relógio chegar
 * a 00:00:01 → fim, e não parar em "0 s" com meio segundo ainda no ar.
 * Data inválida ou já passada → tudo 0 e `expired: true`.
 */
export function timeLeft(end: Date | string | number, now: Date | string | number = Date.now()): TimeLeft {
  const endMs = toMs(end)
  const nowMs = toMs(now)
  const diff = endMs - nowMs
  if (!Number.isFinite(diff) || diff <= 0) {
    return { totalMs: 0, days: 0, hours: 0, minutes: 0, seconds: 0, expired: true }
  }
  const totalSeconds = Math.ceil(diff / SECOND)
  const totalMs = totalSeconds * SECOND
  return {
    totalMs,
    days: Math.floor(totalMs / DAY),
    hours: Math.floor((totalMs % DAY) / HOUR),
    minutes: Math.floor((totalMs % HOUR) / MINUTE),
    seconds: Math.floor((totalMs % MINUTE) / SECOND),
    expired: false,
  }
}
