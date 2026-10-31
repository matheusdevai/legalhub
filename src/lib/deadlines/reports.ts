// Relatório mensal do Controle de Prazos (especificação, seção 9): indicadores
// do escritório e por advogado, para o sócio ver onde há sobrecarga antes que
// ela vire prazo perdido. Lógica pura; a tela só busca os dados e desenha.

import { addDays, businessDaysUntil, type CalendarEntry } from './engine'
import { brasiliaNow } from './alerts'

export interface ReportDeadline {
  id: string
  status: string
  responsible_id: string
  fatal_date: string
  internal_date: string
  reviewed_at: string | null
  protocol_at: string | null
  manually_adjusted: boolean
  deleted_at?: string | null
}

export interface ReportCommunication {
  created_at: string
  triage_status: string
  triaged_at: string | null
}

export type IndicatorKey = 'triagem' | 'conferencia' | 'folga' | 'no_dia' | 'ajustes' | 'perdidos' | 'sem_fontes'

export interface Indicator {
  key: IndicatorKey
  label: string
  goal: string
  /** Percentual (0–100) ou contagem, conforme `kind`. null = sem base no mês. */
  value: number | null
  kind: 'percent' | 'count'
  /** Base do percentual (quantos itens entraram na conta). */
  base: number
  ok: boolean | null
}

const localDay = (iso: string) => brasiliaNow(new Date(iso)).date
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null)

function monthBounds(month: string) {
  const first = `${month}-01`
  const next = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)).toISOString().slice(0, 10)
  return { first, last: addDays(next, -1) }
}

/** Dias úteis do mês até `upTo` (inclusive). */
function businessDaysOfMonth(month: string, upTo: string, calendar: CalendarEntry[]) {
  const { first, last } = monthBounds(month)
  const end = upTo < last ? upTo : last
  if (end < first) return [] as string[]
  const days: string[] = []
  for (let d = first; d <= end; d = addDays(d, 1)) {
    if (businessDaysUntil(addDays(d, -1), d, calendar) === 1) days.push(d)
  }
  return days
}

/**
 * Indicadores de um mês (AAAA-MM). Prazos entram pelo mês do FATAL; intimações,
 * pelo mês em que chegaram. `today` limita o que ainda não aconteceu (um prazo
 * que vence amanhã não conta como perdido nem como protocolado no dia).
 */
export function monthlyIndicators(input: {
  month: string
  today: string
  deadlines: ReportDeadline[]
  communications: ReportCommunication[]
  sourceCheckDays: string[]
  calendar?: CalendarEntry[]
}): Indicator[] {
  const { month, today, calendar = [] } = input
  const { first, last } = monthBounds(month)
  const inMonth = (d: string) => d >= first && d <= last

  // Triagem em até 1 dia útil (as ainda pendentes há mais de 1 dia útil contam como fora da meta)
  const comms = input.communications.filter(c => inMonth(localDay(c.created_at)))
  const triageBase = comms.filter(c => c.triage_status !== 'pending' || businessDaysUntil(localDay(c.created_at), today, calendar) > 1)
  const triagedInTime = triageBase.filter(c => c.triaged_at && businessDaysUntil(localDay(c.created_at), localDay(c.triaged_at), calendar) <= 1).length

  const ds = input.deadlines.filter(d => !d.deleted_at && inMonth(d.fatal_date) && d.status !== 'cancelado')
  // Conferidos antes do prazo interno (só os que já chegaram ao interno ou já foram conferidos)
  const reviewBase = ds.filter(d => d.reviewed_at || d.internal_date <= today)
  const reviewedInTime = reviewBase.filter(d => d.reviewed_at && localDay(d.reviewed_at) <= d.internal_date).length
  // Protocolo: com folga x no dia do fatal (base: os protocolados)
  const protocoled = ds.filter(d => d.status === 'protocolado' && d.protocol_at)
  const early = protocoled.filter(d => localDay(d.protocol_at!) < d.fatal_date).length
  const sameDay = protocoled.filter(d => localDay(d.protocol_at!) === d.fatal_date).length
  // Perdidos: marcados como perdidos ou fatal já passou sem protocolo
  const lost = ds.filter(d => d.status === 'perdido' || (d.status !== 'protocolado' && d.fatal_date < today)).length
  const adjusted = ds.filter(d => d.manually_adjusted).length
  // Dias úteis do mês (até hoje) sem a conferência diária das fontes
  const checked = new Set(input.sourceCheckDays)
  const noSources = businessDaysOfMonth(month, today, calendar).filter(d => !checked.has(d)).length

  const triagePct = pct(triagedInTime, triageBase.length)
  const reviewPct = pct(reviewedInTime, reviewBase.length)
  const earlyPct = pct(early, protocoled.length)
  const sameDayPct = pct(sameDay, protocoled.length)
  return [
    { key: 'triagem', label: 'Intimações triadas em até 1 dia útil', goal: '100%', value: triagePct, kind: 'percent', base: triageBase.length, ok: triagePct === null ? null : triagePct === 100 },
    { key: 'conferencia', label: 'Prazos conferidos antes do prazo interno', goal: '100%', value: reviewPct, kind: 'percent', base: reviewBase.length, ok: reviewPct === null ? null : reviewPct === 100 },
    { key: 'folga', label: 'Protocolados com folga (antes do fatal)', goal: 'acima de 90%', value: earlyPct, kind: 'percent', base: protocoled.length, ok: earlyPct === null ? null : earlyPct > 90 },
    { key: 'no_dia', label: 'Protocolados no dia do fatal', goal: 'abaixo de 10%', value: sameDayPct, kind: 'percent', base: protocoled.length, ok: sameDayPct === null ? null : sameDayPct < 10 },
    { key: 'ajustes', label: 'Datas ajustadas manualmente', goal: 'acompanhar', value: adjusted, kind: 'count', base: ds.length, ok: null },
    { key: 'perdidos', label: 'Prazos perdidos', goal: '0', value: lost, kind: 'count', base: ds.length, ok: lost === 0 },
    { key: 'sem_fontes', label: 'Dias sem conferência das fontes oficiais', goal: '0', value: noSources, kind: 'count', base: 0, ok: noSources === 0 },
  ]
}

export interface LawyerRow {
  responsibleId: string
  total: number
  open: number
  protocoled: number
  early: number
  sameDay: number
  lost: number
  adjusted: number
}

/** Por advogado (responsável), no mês do fatal — onde está a sobrecarga. */
export function indicatorsByLawyer(deadlines: ReportDeadline[], month: string, today: string): LawyerRow[] {
  const { first, last } = monthBounds(month)
  const rows = new Map<string, LawyerRow>()
  for (const d of deadlines) {
    if (d.deleted_at || d.status === 'cancelado' || d.fatal_date < first || d.fatal_date > last) continue
    const r = rows.get(d.responsible_id) || { responsibleId: d.responsible_id, total: 0, open: 0, protocoled: 0, early: 0, sameDay: 0, lost: 0, adjusted: 0 }
    r.total++
    if (d.manually_adjusted) r.adjusted++
    if (d.status === 'protocolado' && d.protocol_at) {
      r.protocoled++
      const p = localDay(d.protocol_at)
      if (p < d.fatal_date) r.early++
      else if (p === d.fatal_date) r.sameDay++
    } else if (d.status === 'perdido' || d.fatal_date < today) r.lost++
    else r.open++
    rows.set(d.responsible_id, r)
  }
  return [...rows.values()].sort((a, b) => b.total - a.total)
}

// ── Piloto (fase 4) ─────────────────────────────────────────────────────────

export interface PilotItem {
  id: string
  act_type: string
  regime: string
  start_event: string
  start_date: string
  amount: number
  unit: string
  court: string | null
  county: string | null
  status: string
  fatal_date: string
  pilot_reference_date?: string | null
  pilot_divergence_note?: string | null
}

export interface PilotSummary { compared: number; equal: number; divergent: number; unexplained: number }

/** Critério de saída do piloto: zero divergência sem explicação. */
export function pilotSummary(items: PilotItem[]): PilotSummary {
  const compared = items.filter(i => i.pilot_reference_date && i.status !== 'cancelado')
  const divergent = compared.filter(i => i.pilot_reference_date !== i.fatal_date)
  return {
    compared: compared.length,
    equal: compared.length - divergent.length,
    divergent: divergent.length,
    unexplained: divergent.filter(i => !i.pilot_divergence_note?.trim()).length,
  }
}

const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`
const csvCell = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)

export const BATTERY_HEADER = 'id;tribunal;comarca;tipo do ato;regime (civel/juizado/trabalhista/administrativo/fixado_juiz/penal);como chegou (djen/sistema_ciencia/sistema_tacita/juntada/audiencia/data_inicial);data do evento (dd/mm/aaaa);prazo (número);unidade (dias_uteis/dias_corridos/meses/anos);prazo em dobro? (sim/não + motivo);recesso se aplica? (sim/não);feriados ou suspensões no período (data + motivo + fonte);DATA FATAL CORRETA (dd/mm/aaaa);como chegou nessa data (resumo);conferido por (nome + OAB)'

/**
 * Cada divergência do piloto vira uma linha da planilha da bateria, com a
 * "DATA FATAL CORRETA" em branco: quem decide é o advogado (o importador
 * recusa a linha até ela ser preenchida e conferida).
 */
export function divergencesAsBatteryCsv(items: PilotItem[], officeOf: (i: PilotItem) => string = () => ''): string {
  const rows = items
    .filter(i => i.pilot_reference_date && i.pilot_reference_date !== i.fatal_date && i.status !== 'cancelado')
    .map(i => [
      `piloto-${i.id.slice(0, 8)}`, (i.court || '').toUpperCase(), i.county || '', i.act_type, i.regime, i.start_event,
      br(i.start_date), String(i.amount), i.unit, '', '', '', '',
      `Sistema: ${br(i.fatal_date)}; controle do escritório: ${br(i.pilot_reference_date!)}${i.pilot_divergence_note ? `; explicação: ${i.pilot_divergence_note}` : ''}${officeOf(i) ? `; escritório: ${officeOf(i)}` : ''}`,
      '',
    ].map(csvCell).join(';'))
  return [BATTERY_HEADER, ...rows].join('\n')
}
