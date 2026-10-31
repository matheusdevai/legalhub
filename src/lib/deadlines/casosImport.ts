// Converte a planilha "Bateria de casos — Controle de Prazos.csv" (preenchida
// por advogado) nos casos de casosReais.data.json, que viram testes automáticos
// (casosReais.test.ts). Sem imports de valor: roda direto no Node
// (scripts/prazos/importar-casos.ts) e no Vitest.

import type { CalendarEntry, CalendarKind, DeadlineInput, Regime, StartEvent, Unit } from './engine'
import type { RealCase } from './casosReais'

const REGIMES: Regime[] = ['civel', 'juizado', 'trabalhista', 'administrativo', 'fixado_juiz', 'penal']
const EVENTS: StartEvent[] = ['djen', 'sistema_ciencia', 'sistema_tacita', 'juntada', 'audiencia', 'data_inicial']
const UNITS: Unit[] = ['dias_uteis', 'dias_corridos', 'meses', 'anos']

/** Separa uma linha CSV com `;`, respeitando aspas ("a;b" fica num campo só). */
export function splitCsvLine(line: string, sep = ';'): string[] {
  const out: string[] = []
  let cur = '', quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === sep) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out.map(s => s.trim())
}

/** "29/10/2026" → "2026-10-29"; null se inválida. */
export function brDate(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  const d = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

function kindOf(text: string): CalendarKind {
  const t = fold(text)
  if (/indisponibilidade|sistema fora|instabilidade/.test(t)) return 'outage'
  if (/suspens/.test(t)) return 'suspension'
  if (/expediente (reduzido|encerrado|ate|das)|meio expediente/.test(t)) return 'altered_hours'
  if (/feriado/.test(t)) return 'holiday'
  return 'no_court'
}

/**
 * Coluna "feriados ou suspensões no período": datas dd/mm ou dd/mm/aaaa
 * seguidas do motivo. Sem ano, usa o ano do evento (ou o seguinte, se o mês já
 * passou — prazo que atravessa a virada do ano).
 */
export function parseCalendarColumn(text: string, eventDate: string): CalendarEntry[] {
  if (!text || /^[—–-]?$/.test(text.trim())) return []
  const out: CalendarEntry[] = []
  const re = /(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s*([^0-9]*)/g
  const evYear = Number(eventDate.slice(0, 4)), evMonth = Number(eventDate.slice(5, 7))
  for (const m of text.matchAll(re)) {
    const month = Number(m[2])
    const year = m[3] ? Number(m[3]) : month < evMonth ? evYear + 1 : evYear
    const date = brDate(`${m[1]}/${m[2]}/${year}`)
    if (!date) continue
    const label = m[4].replace(/^[\s–—-]+|[\s,;e]+$/g, '').trim() || 'Dia sem expediente'
    out.push({ date, kind: kindOf(label), label, source: 'Informado na bateria de casos' })
  }
  return out
}

export interface ImportResult { cases: RealCase[]; errors: string[]; skipped: number }

export function parseCasesCsv(csv: string): ImportResult {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim())
  const cases: RealCase[] = [], errors: string[] = []
  let skipped = 0
  const ids = new Set<string>()
  for (let i = 1; i < lines.length; i++) {
    const c = splitCsvLine(lines[i])
    const row = i + 1
    const [id, tribunal, comarca, ato, regime, evento, dataEvento, prazo, unidade, dobro, recesso, feriados, fatal, comoChegou, conferidoPor] = c
    if (!id) continue
    if (/exemplo/i.test(conferidoPor || '')) { skipped++; continue }
    const problems: string[] = []
    const eventDate = brDate(dataEvento || '')
    const fatalDate = brDate(fatal || '')
    const amount = Number(prazo)
    const reg = fold(regime || '') as Regime
    const ev = fold(evento || '') as StartEvent
    const un = fold(unidade || '').replace(/\s+/g, '_') as Unit
    if (ids.has(id)) problems.push(`id "${id}" repetido`)
    if (!REGIMES.includes(reg)) problems.push(`regime inválido "${regime}"`)
    if (!EVENTS.includes(ev)) problems.push(`"como chegou" inválido "${evento}"`)
    if (!eventDate) problems.push(`data do evento inválida "${dataEvento}"`)
    if (!Number.isInteger(amount) || amount <= 0) problems.push(`prazo inválido "${prazo}"`)
    if (unidade && !UNITS.includes(un)) problems.push(`unidade inválida "${unidade}"`)
    if (!fatalDate) problems.push(`data fatal inválida "${fatal}"`)
    if (!conferidoPor?.trim()) problems.push('falta "conferido por" (nome + OAB)')
    if (problems.length) { errors.push(`Linha ${row} (${id}): ${problems.join('; ')}`); continue }
    ids.add(id)
    const input: DeadlineInput = {
      regime: reg, startEvent: ev, eventDate: eventDate!, amount,
      ...(unidade ? { unit: un } : {}),
      ...(/^sim/i.test(dobro || '') ? { doubled: true } : {}),
      ...(recesso ? { applyRecess: /^sim/i.test(recesso) } : {}),
    }
    const calendar = parseCalendarColumn(feriados || '', eventDate!)
    cases.push({
      id, descricao: [tribunal, comarca, ato].filter(s => s && s !== '—').join(' — '),
      input, fatalEsperada: fatalDate!, justificativa: comoChegou || '', conferidoPor,
      ...(calendar.length ? { calendar } : {}),
    })
  }
  return { cases, errors, skipped }
}
