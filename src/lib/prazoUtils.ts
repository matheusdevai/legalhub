/**
 * Soma dias úteis (seg-sex) a uma data. Não considera feriados nacionais/locais —
 * o resultado é um ponto de partida, não o prazo legal definitivo; sempre revisar.
 */
export function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date)
  let remaining = days
  while (remaining > 0) {
    result.setDate(result.getDate() + 1)
    const day = result.getDay()
    if (day !== 0 && day !== 6) remaining--
  }
  return result
}

/** Soma dias corridos a uma data. */
export function addCalendarDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export function computePrazo(baseDate: Date, days: number, unit: 'uteis' | 'corridos'): Date {
  return unit === 'uteis' ? addBusinessDays(baseDate, days) : addCalendarDays(baseDate, days)
}
