// ============================================================================
// Motor de cálculo de prazos processuais — Fase 1 do Controle de Prazos.
//
// TypeScript puro, sem imports: roda igual na tela (Vite) e nas rotinas do
// servidor (Deno), para o cálculo da tela e o recálculo automático nunca
// divergirem. Datas são sempre strings 'YYYY-MM-DD' e toda a aritmética é em
// UTC — nada depende do fuso de quem roda.
//
// Princípio: o motor SUGERE e explica (memória de cálculo); quem confirma é o
// advogado. Na dúvida, a data mais cedo: um dia não útil esquecido antecipa o
// prazo (seguro); um dia não útil a mais o adia (perigoso). Por isso o motor só
// traz embutidos os feriados nacionais por lei — Carnaval, Semana Santa,
// Corpus Christi e feriados locais vêm do calendário do tribunal, com fonte.
// ============================================================================

export const RULES_VERSION = '2026.1'

export type Regime = 'civel' | 'juizado' | 'trabalhista' | 'administrativo' | 'fixado_juiz'

/** Como o ato chegou ao advogado — define o marco inicial da contagem. */
export type StartEvent =
  | 'djen'              // disponibilizado no DJEN/diário eletrônico (Lei 11.419/2006, art. 4º, §§ 3º e 4º)
  | 'sistema_ciencia'   // intimação eletrônica consultada no sistema (Lei 11.419/2006, art. 5º, § 1º)
  | 'sistema_tacita'    // intimação eletrônica não consultada: ciência após 10 dias corridos (art. 5º, § 3º)
  | 'juntada'           // juntada aos autos do mandado/carta cumprido (CPC, art. 231)
  | 'audiencia'         // intimação em audiência (CPC, art. 1.003, § 1º)
  | 'data_inicial'      // outra data inicial informada pelo advogado

export type Unit = 'dias_uteis' | 'dias_corridos' | 'meses' | 'anos'

/**
 * Dia com regra especial no calendário forense:
 * - holiday / no_court: não é dia útil (não conta em dias úteis; não pode iniciar nem vencer)
 * - suspension: prazos suspensos — não conta nem em dias corridos
 * - altered_hours: expediente encerrado antes ou iniciado depois — conta, mas não pode iniciar
 *   nem vencer o prazo (CPC, art. 224, § 1º)
 * - outage: indisponibilidade do sistema — não suspende: conta e pode iniciar, mas o prazo que
 *   venceria nesse dia passa ao 1º dia útil seguinte (Lei 11.419/2006, art. 10, § 2º; Res. CNJ 185/2013)
 */
export type CalendarKind = 'holiday' | 'no_court' | 'outage' | 'suspension' | 'altered_hours'

export interface CalendarEntry {
  date: string
  kind: CalendarKind
  label: string
  source?: string
}

export interface DeadlineInput {
  regime: Regime
  startEvent: StartEvent
  /** Data do evento: disponibilização (djen), consulta (sistema_ciencia), envio (sistema_tacita), juntada, audiência ou data inicial. */
  eventDate: string
  amount: number
  /** Padrão: dias úteis nos regimes judiciais, dias corridos no administrativo. */
  unit?: Unit
  /** Prazo em dobro (CPC, arts. 180, 183, 186, 229) — o motivo fica no registro do prazo. */
  doubled?: boolean
  /** Recesso de 20/12 a 20/01. Padrão: aplica no cível e no trabalhista; nos juizados só se marcado. */
  applyRecess?: boolean
  /** Dias de antecedência do prazo interno, em dias úteis. Padrão: 2. */
  internalMarginDays?: number
  /** Feriados locais, suspensões e expedientes alterados do tribunal/comarca/escritório. */
  calendar?: CalendarEntry[]
}

export type MemoryKind = 'evento' | 'publicacao' | 'ciencia' | 'nao_conta' | 'conta' | 'vencimento' | 'prorrogacao'

export interface MemoryDay {
  date: string
  kind: MemoryKind
  /** Número do dia na contagem (1, 2, 3…), só nos dias que contam. */
  n?: number
  note: string
  source?: string
}

export interface DeadlineResult {
  /** Marco a partir do qual a contagem começa (data da publicação, da ciência ou do evento). */
  referenceDate: string
  /** Primeiro dia contado. */
  startDate: string
  fatalDate: string
  internalDate: string
  amount: number
  unit: Unit
  memory: MemoryDay[]
  warnings: string[]
  rulesVersion: string
}

// ── Datas (UTC, 'YYYY-MM-DD') ───────────────────────────────────────────────

const DAY_MS = 86_400_000
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`)
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10)
export const addDays = (d: string, n: number) => fromMs(toMs(d) + n * DAY_MS)
const weekday = (d: string) => new Date(toMs(d)).getUTCDay() // 0 = domingo
const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

export function isValidDate(d: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(toMs(d)) && fromMs(toMs(d)) === d
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function easterSunday(year: number): string {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * Datas móveis que os tribunais costumam declarar sem expediente — NÃO entram
 * no cálculo sozinhas: servem para pré-preencher o calendário de um tribunal,
 * que só vale depois de cadastrado com a portaria/resolução de origem.
 */
export function movableCourtDates(year: number) {
  const easter = easterSunday(year)
  return {
    carnavalSegunda: addDays(easter, -48),
    carnavalTerca: addDays(easter, -47),
    quartaDeCinzas: addDays(easter, -46),
    quartaSanta: addDays(easter, -4),
    quintaSanta: addDays(easter, -3),
    sextaSanta: addDays(easter, -2),
    corpusChristi: addDays(easter, 60),
  }
}

/** Feriados nacionais por lei federal (Lei 662/1949, Lei 6.802/1980, Lei 14.759/2023). */
export function nationalHolidays(year: number): CalendarEntry[] {
  const src = 'Feriado nacional (lei federal)'
  const fixed: [string, string][] = [
    ['01-01', 'Confraternização Universal'],
    ['04-21', 'Tiradentes'],
    ['05-01', 'Dia do Trabalho'],
    ['09-07', 'Independência do Brasil'],
    ['10-12', 'Nossa Senhora Aparecida'],
    ['11-02', 'Finados'],
    ['11-15', 'Proclamação da República'],
    ['11-20', 'Dia Nacional de Zumbi e da Consciência Negra'],
    ['12-25', 'Natal'],
  ]
  return fixed.map(([md, label]) => ({ date: `${year}-${md}`, kind: 'holiday' as const, label, source: src }))
}

/** Recesso forense: prazos suspensos de 20/12 a 20/01, inclusive (CPC, art. 220; CLT, art. 775-A). */
function inRecess(d: string): boolean {
  const md = d.slice(5)
  return md >= '12-20' || md <= '01-20'
}

// ── Calendário consolidado ──────────────────────────────────────────────────

interface DayInfo { kind: CalendarKind | 'weekend' | 'recess'; label: string; source?: string }

class ForensicCalendar {
  private byDate = new Map<string, CalendarEntry[]>()
  private years = new Set<number>()

  constructor(private extra: CalendarEntry[], private recess: boolean) {
    for (const e of extra) this.add(e)
  }

  private add(e: CalendarEntry) {
    const list = this.byDate.get(e.date)
    if (list) list.push(e); else this.byDate.set(e.date, [e])
  }

  private ensureYear(d: string) {
    const y = Number(d.slice(0, 4))
    if (this.years.has(y)) return
    this.years.add(y)
    for (const h of nationalHolidays(y)) this.add(h)
  }

  /** O que torna o dia especial, na ordem de força: suspensão > não útil > expediente alterado. */
  info(d: string): DayInfo | null {
    this.ensureYear(d)
    const entries = this.byDate.get(d) || []
    const suspension = entries.find(e => e.kind === 'suspension')
    if (suspension) return suspension
    if (this.recess && inRecess(d)) return { kind: 'recess', label: 'Recesso forense (20/12 a 20/01)', source: 'CPC, art. 220' }
    const closed = entries.find(e => e.kind === 'holiday' || e.kind === 'no_court')
    if (closed) return closed
    const wd = weekday(d)
    if (wd === 0 || wd === 6) return { kind: 'weekend', label: WEEKDAYS[wd] }
    return entries.find(e => e.kind === 'altered_hours') || entries.find(e => e.kind === 'outage') || null
  }

  /** Dia em que a publicação, a ciência ou a contagem podem começar. */
  canStart(d: string): boolean {
    const i = this.info(d)
    return i === null || i.kind === 'outage'
  }

  /** Dia em que o prazo pode vencer (útil, expediente normal, sistema disponível). */
  canEnd(d: string): boolean {
    return this.info(d) === null
  }

  /** Dia que conta em dias úteis (útil; expediente alterado e indisponibilidade contam). */
  countsAsBusinessDay(d: string): boolean {
    const i = this.info(d)
    return i === null || i.kind === 'altered_hours' || i.kind === 'outage'
  }

  /** Dia que conta em dias corridos (tudo, menos suspensão e recesso). */
  countsAsCalendarDay(d: string): boolean {
    const i = this.info(d)
    return !(i && (i.kind === 'suspension' || i.kind === 'recess'))
  }
}

// ── Cálculo ─────────────────────────────────────────────────────────────────

const DEFAULT_UNIT: Record<Regime, Unit> = {
  civel: 'dias_uteis', juizado: 'dias_uteis', trabalhista: 'dias_uteis',
  administrativo: 'dias_corridos', fixado_juiz: 'dias_uteis',
}

const DEFAULT_RECESS: Record<Regime, boolean> = {
  civel: true, juizado: false, trabalhista: true, administrativo: false, fixado_juiz: true,
}

const fmt = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`
const MAX_SPAN_DAYS = 3 * 366 // trava contra laço infinito com calendário mal cadastrado

export class DeadlineInputError extends Error {}

export function calculateDeadline(input: DeadlineInput): DeadlineResult {
  const unit = input.unit ?? DEFAULT_UNIT[input.regime]
  const recess = input.applyRecess ?? DEFAULT_RECESS[input.regime]
  const margin = input.internalMarginDays ?? 2
  if (!isValidDate(input.eventDate)) throw new DeadlineInputError('Data do evento inválida.')
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new DeadlineInputError('O prazo precisa ser um número inteiro maior que zero.')
  if (!Number.isInteger(margin) || margin < 0) throw new DeadlineInputError('A margem do prazo interno precisa ser um número inteiro de 0 ou mais.')

  const cal = new ForensicCalendar(input.calendar ?? [], recess)
  const memory: MemoryDay[] = []
  const warnings: string[] = []
  const amount = input.doubled ? input.amount * 2 : input.amount
  const reasonOf = (d: string) => { const i = cal.info(d); return i ? { note: i.label, source: i.source } : { note: 'dia útil' } }

  /** Próximo dia (depois de `d`) em que o prazo pode começar ('start') ou vencer ('end'), registrando os dias pulados. */
  const nextDay = (d: string, mode: 'start' | 'end', log: boolean): string => {
    let cur = addDays(d, 1)
    for (let i = 0; i < MAX_SPAN_DAYS; i++, cur = addDays(cur, 1)) {
      if (mode === 'start' ? cal.canStart(cur) : cal.canEnd(cur)) return cur
      if (log) memory.push({ date: cur, kind: 'nao_conta', ...reasonOf(cur) })
    }
    throw new DeadlineInputError('Calendário sem dia útil por mais de 3 anos — verifique as suspensões cadastradas.')
  }

  // 1) Marco: a partir de quando a contagem começa
  memory.push({ date: input.eventDate, kind: 'evento', note: eventLabel(input.startEvent) })
  let reference = input.eventDate
  if (input.startEvent === 'djen') {
    reference = nextDay(input.eventDate, 'start', true)
    memory.push({ date: reference, kind: 'publicacao', note: 'Considera-se publicada no 1º dia útil seguinte à disponibilização', source: 'Lei 11.419/2006, art. 4º, § 3º' })
  } else if (input.startEvent === 'sistema_tacita') {
    const tacit = addDays(input.eventDate, 10)
    reference = cal.canStart(tacit) ? tacit : nextDay(tacit, 'start', false)
    memory.push({ date: reference, kind: 'ciencia', note: 'Ciência tácita: 10 dias corridos após o envio, sem consulta', source: 'Lei 11.419/2006, art. 5º, § 3º' })
  } else if (input.startEvent === 'sistema_ciencia' && !cal.canStart(input.eventDate)) {
    reference = nextDay(input.eventDate, 'start', false)
    memory.push({ date: reference, kind: 'ciencia', note: 'Consulta em dia não útil: ciência no 1º dia útil seguinte', source: 'Lei 11.419/2006, art. 5º, § 2º' })
  }

  // 2) Contagem
  let startDate: string
  let fatal: string
  if (unit === 'dias_uteis') {
    startDate = nextDay(reference, 'start', true)
    let n = 0
    let cur = startDate
    for (let i = 0; i < MAX_SPAN_DAYS; i++, cur = addDays(cur, 1)) {
      if (cal.countsAsBusinessDay(cur)) {
        n++
        const altered = cal.info(cur)
        memory.push({ date: cur, kind: 'conta', n, note: altered ? `dia útil (${altered.label})` : 'dia útil', source: altered?.source })
        if (n === amount) break
      } else if (cur !== startDate) {
        memory.push({ date: cur, kind: 'nao_conta', ...reasonOf(cur) })
      }
    }
    if (n < amount) throw new DeadlineInputError('Calendário sem dias úteis suficientes — verifique as suspensões cadastradas.')
    fatal = cur
  } else if (unit === 'dias_corridos') {
    // Exclui o dia do começo e conta os seguintes, inclusive não úteis (Lei 9.784/1999, art. 66; CPC, art. 224)
    let n = 0
    let cur = addDays(reference, 1)
    startDate = cur
    for (let i = 0; i < MAX_SPAN_DAYS; i++, cur = addDays(cur, 1)) {
      if (cal.countsAsCalendarDay(cur)) {
        if (n === 0) startDate = cur
        n++
        memory.push({ date: cur, kind: 'conta', n, note: cal.info(cur)?.label ?? 'dia corrido' })
        if (n === amount) break
      } else {
        memory.push({ date: cur, kind: 'nao_conta', ...reasonOf(cur) })
      }
    }
    fatal = cur
  } else {
    // Meses/anos: vence no dia de igual número; sem correspondência, no dia imediato (Código Civil, art. 132, § 3º)
    const months = unit === 'meses' ? amount : amount * 12
    const [y, m, d] = reference.split('-').map(Number)
    const target = new Date(Date.UTC(y, m - 1 + months, 1))
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
    fatal = d <= lastDay
      ? fromMs(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), d))
      : fromMs(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 1))
    startDate = addDays(reference, 1)
    memory.push({ date: fatal, kind: 'conta', note: `${months} ${months === 1 ? 'mês' : 'meses'} a partir de ${fmt(reference)}`, source: 'Código Civil, art. 132, § 3º' })
    if (recess && rangeTouchesRecess(reference, fatal)) {
      warnings.push('O período atravessa o recesso forense: confira se a suspensão se aplica a este prazo em meses/anos.')
    }
  }

  // 3) Vencimento em dia sem expediente normal → 1º dia útil seguinte (CPC, art. 224, § 1º; Lei 11.419/2006, art. 10, § 2º)
  if (!cal.canEnd(fatal)) {
    const why = cal.info(fatal)
    const moved = nextDay(fatal, 'end', true)
    memory.push({ date: moved, kind: 'prorrogacao', note: `Vencimento cairia em ${fmt(fatal)} (${why?.label ?? 'dia não útil'}): prorrogado para o 1º dia útil seguinte`, source: 'CPC, art. 224, § 1º' })
    fatal = moved
  }
  memory.push({ date: fatal, kind: 'vencimento', note: 'Prazo fatal' })

  // 4) Prazo interno: N dias úteis antes do fatal (nunca antes do início)
  let internal = fatal
  for (let k = 0; k < margin; k++) {
    let prev = addDays(internal, -1)
    while (!cal.canEnd(prev) && prev > startDate) prev = addDays(prev, -1)
    if (prev < startDate) break
    internal = prev
  }
  if (margin > 0 && internal === fatal) warnings.push('Não há dias úteis suficientes para a margem do prazo interno: o prazo interno coincide com o fatal.')

  if (input.regime === 'juizado' && input.applyRecess === undefined) {
    warnings.push('Juizados: o recesso não foi aplicado. Se o tribunal suspende os prazos no recesso, marque essa opção.')
  }

  return { referenceDate: reference, startDate, fatalDate: fatal, internalDate: internal, amount, unit, memory, warnings, rulesVersion: RULES_VERSION }
}

function rangeTouchesRecess(from: string, to: string): boolean {
  for (let cur = from; cur <= to; cur = addDays(cur, 1)) if (inRecess(cur)) return true
  return false
}

function eventLabel(e: StartEvent): string {
  switch (e) {
    case 'djen': return 'Disponibilização no DJEN'
    case 'sistema_ciencia': return 'Ciência da intimação no sistema do tribunal'
    case 'sistema_tacita': return 'Envio da intimação pelo sistema do tribunal'
    case 'juntada': return 'Juntada aos autos do mandado/carta'
    case 'audiencia': return 'Intimação em audiência'
    case 'data_inicial': return 'Data inicial informada'
  }
}

/**
 * Quantos dias úteis há depois de `from` até `to` (inclusive) — 0 se `to` não
 * for depois de `from`. Usado no painel ("vence em N dias úteis").
 */
export function businessDaysUntil(from: string, to: string, calendar: CalendarEntry[] = []): number {
  if (to <= from) return 0
  const cal = new ForensicCalendar(calendar, true)
  let n = 0
  for (let d = addDays(from, 1), i = 0; d <= to && i < MAX_SPAN_DAYS; d = addDays(d, 1), i++) {
    if (cal.canEnd(d)) n++
  }
  return n
}

/**
 * Prazo interno para uma data fatal informada à mão: `margin` dias úteis
 * antes, nunca antes de `notBefore` (o primeiro dia da contagem).
 */
export function internalDateFor(fatal: string, margin: number, calendar: CalendarEntry[] = [], notBefore = '0000-01-01'): string {
  const cal = new ForensicCalendar(calendar, true)
  let internal = fatal
  for (let k = 0; k < margin; k++) {
    let prev = addDays(internal, -1)
    while (!cal.canEnd(prev) && prev > notBefore) prev = addDays(prev, -1)
    if (prev < notBefore) break
    internal = prev
  }
  return internal
}
