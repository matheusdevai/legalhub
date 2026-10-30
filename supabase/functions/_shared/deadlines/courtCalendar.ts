import { addDays, type CalendarEntry, type CalendarKind } from './engine.ts'

/** Linha de `court_calendar` como vem do banco. */
export interface CourtCalendarRow {
  scope: 'national' | 'court' | 'tenant'
  court: string | null
  county: string | null
  date_from: string
  date_to: string
  kind: CalendarKind
  label: string
  source_ref: string | null
  version: number
}

const norm = (s: string | null | undefined) => (s || '').trim().toLowerCase()

/**
 * Entradas do calendário que valem para um processo, já abertas dia a dia para
 * o motor. Vale: tudo do escopo nacional; do tribunal do processo, as da
 * comarca do processo e as sem comarca (tribunal todo); do escritório, as sem
 * tribunal (gerais) ou do mesmo tribunal/comarca.
 */
export function calendarForProcess(rows: CourtCalendarRow[], where: { court?: string | null; county?: string | null }): CalendarEntry[] {
  const court = norm(where.court)
  const county = norm(where.county)
  const applies = (r: CourtCalendarRow) => {
    if (r.scope === 'national') return true
    if (r.scope === 'court' && norm(r.court) !== court) return false
    if (r.scope === 'tenant' && r.court && norm(r.court) !== court) return false
    return !r.county || norm(r.county) === county
  }
  const out: CalendarEntry[] = []
  for (const r of rows.filter(applies)) {
    const from = r.date_from.slice(0, 10), to = r.date_to.slice(0, 10)
    for (let d = from; d <= to; d = addDays(d, 1)) {
      out.push({ date: d, kind: r.kind, label: r.label, source: r.source_ref || (r.scope === 'tenant' ? 'Cadastrado pelo escritório' : undefined) })
    }
  }
  return out
}

/**
 * Impressão digital do calendário usado num cálculo — gravada no prazo para
 * detectar depois que o calendário mudou (inclusão, remoção ou edição).
 */
export function calendarVersion(rows: CourtCalendarRow[]): string {
  const keys = rows
    .map(r => [r.scope, norm(r.court), norm(r.county), r.date_from.slice(0, 10), r.date_to.slice(0, 10), r.kind, r.version].join('|'))
    .sort()
    .join('\n')
  let h = 0x811c9dc5 // FNV-1a 32 bits
  for (let i = 0; i < keys.length; i++) { h ^= keys.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return `${rows.length}-${h.toString(16).padStart(8, '0')}`
}
