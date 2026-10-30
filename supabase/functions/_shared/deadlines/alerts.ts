// Cronograma de alertas do Controle de Prazos (especificação, seção 7).
// Código puro, sem dependências além do motor: a Edge Function `deadline-alerts`
// avalia estas regras a cada execução e grava cada alerta uma única vez
// (deadline_alerts tem chave única por assunto + regra + destinatário + canal),
// então uma regra pode "valer" em várias execuções seguidas sem duplicar aviso.

import { businessDaysUntil, type CalendarEntry } from './engine.ts'

export type Audience = 'responsible' | 'reviewer' | 'admins' | 'triage'

export type DeadlineAlertRule =
  | 'criado' | 'sem_conferencia_1' | 'sem_conferencia_2' | 'd5' | 'interno'
  | 'd1' | 'fatal_7h' | 'fatal_escalonamento' | 'pos_fatal'

export type TriageAlertRule = 'triagem_1' | 'triagem_2'

export interface DueAlert<R extends string = string> {
  rule: R
  audience: Audience[]
  email: boolean
  /** Crítico: dia do fatal, depois do fatal e recálculo para data mais cedo. */
  critical: boolean
  title: string
  message: string
}

export interface AlertDeadline {
  status: string
  act_type: string
  fatal_date: string
  internal_date: string
  created_at: string
}

export interface AlertCommunication {
  created_at: string
  title: string | null
}

/** Data (AAAA-MM-DD) e hora local de Brasília — os prazos seguem o expediente local. */
export function brasiliaNow(now: Date): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  const get = (t: string) => parts.find(p => p.type === t)?.value || ''
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) }
}

const CLOSED = new Set(['protocolado', 'cancelado', 'perdido'])
const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`

/**
 * Alertas que valem agora para um prazo. `escalationHour` é o horário do
 * escalonamento no dia do fatal (padrão 14h, configurável, nunca desligado).
 */
export function dueDeadlineAlerts(
  d: AlertDeadline,
  now: { date: string; hour: number },
  calendar: CalendarEntry[] = [],
  escalationHour = 14,
): DueAlert<DeadlineAlertRule>[] {
  if (CLOSED.has(d.status)) return []
  const out: DueAlert<DeadlineAlertRule>[] = []
  const today = now.date
  const ato = d.act_type
  const fatal = br(d.fatal_date)

  out.push({ rule: 'criado', audience: ['responsible', 'reviewer'], email: false, critical: false,
    title: `Novo prazo: ${ato}`, message: `Prazo fatal ${fatal}. Confira o cálculo na ficha do prazo.` })

  if (d.status === 'calculado') {
    const created = brasiliaNow(new Date(d.created_at)).date
    const age = businessDaysUntil(created, today, calendar)
    if (age >= 1) out.push({ rule: 'sem_conferencia_1', audience: ['reviewer'], email: true, critical: false,
      title: `Prazo aguardando sua conferência: ${ato}`, message: `Cadastrado há ${age} dia(s) útil(eis) e ainda sem conferência. Fatal ${fatal}.` })
    if (age >= 2) out.push({ rule: 'sem_conferencia_2', audience: ['reviewer', 'admins'], email: true, critical: false,
      title: `Prazo sem conferência há ${age} dias úteis: ${ato}`, message: `Ninguém conferiu o cálculo ainda. Fatal ${fatal}.` })
  }

  if (today > d.fatal_date) {
    out.push({ rule: 'pos_fatal', audience: ['admins'], email: true, critical: true,
      title: `Prazo vencido sem protocolo: ${ato}`, message: `O prazo fatal era ${fatal} e não há protocolo registrado. Registre o protocolo ou encerre o prazo com o motivo.` })
    return out
  }

  if (today === d.fatal_date) {
    if (now.hour >= 7) out.push({ rule: 'fatal_7h', audience: ['responsible', 'reviewer'], email: true, critical: true,
      title: `VENCE HOJE: ${ato}`, message: `O prazo fatal é hoje (${fatal}) e ainda não há protocolo registrado.` })
    if (now.hour >= escalationHour) out.push({ rule: 'fatal_escalonamento', audience: ['responsible', 'reviewer', 'admins'], email: true, critical: true,
      title: `VENCE HOJE e ainda sem protocolo: ${ato}`, message: `São ${escalationHour}h do dia do fatal (${fatal}) e o protocolo não foi registrado.` })
  } else {
    const left = businessDaysUntil(today, d.fatal_date, calendar)
    if (left <= 1) out.push({ rule: 'd1', audience: ['responsible', 'reviewer'], email: true, critical: false,
      title: `Vence amanhã: ${ato}`, message: `Prazo fatal no próximo dia útil (${fatal}) e ainda sem protocolo.` })
    else if (left <= 5) out.push({ rule: 'd5', audience: ['responsible'], email: false, critical: false,
      title: `Vence em ${left} dias úteis: ${ato}`, message: `Prazo fatal ${fatal}.` })
  }

  if (today >= d.internal_date && d.status !== 'pronto') out.push({ rule: 'interno', audience: ['responsible'], email: true, critical: false,
    title: `Prazo interno chegou: ${ato}`, message: `O prazo interno era ${br(d.internal_date)} e a peça ainda não está pronta para protocolo. Fatal ${fatal}.` })

  return out
}

/** Intimação parada na caixa A triar: 1 dia útil → responsável; 2 → também o administrador. */
export function dueTriageAlerts(c: AlertCommunication, now: { date: string }, calendar: CalendarEntry[] = []): DueAlert<TriageAlertRule>[] {
  const age = businessDaysUntil(brasiliaNow(new Date(c.created_at)).date, now.date, calendar)
  const what = c.title || 'Intimação'
  const out: DueAlert<TriageAlertRule>[] = []
  if (age >= 1) out.push({ rule: 'triagem_1', audience: ['triage'], email: true, critical: false,
    title: `Intimação sem triagem: ${what}`, message: `Está na caixa A triar há ${age} dia(s) útil(eis). Decida se gera prazo.` })
  if (age >= 2) out.push({ rule: 'triagem_2', audience: ['triage', 'admins'], email: true, critical: false,
    title: `Intimação sem triagem há ${age} dias úteis: ${what}`, message: `Ninguém decidiu ainda se ela gera prazo.` })
  return out
}
