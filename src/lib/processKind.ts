import { differenceInCalendarDays, parseISO } from 'date-fns'
import type { AdminStatus, Process } from '@/types'

export type ProcessKind = 'judicial' | 'administrativo'

/**
 * Judicial × administrativo. Só é administrativo o que foi cadastrado assim;
 * o resto é judicial — inclusive os importados pela sincronização (CNJ/DJEN),
 * que chegam com `modalidade` nula.
 */
export function processKind(p: Pick<Process, 'modalidade'>): ProcessKind {
  return p.modalidade === 'administrativo' ? 'administrativo' : 'judicial'
}

export const ADMIN_STATUSES: AdminStatus[] = ['em_analise', 'em_exigencia', 'deferido', 'indeferido']

export const ADMIN_STATUS_LABELS: Record<AdminStatus, string> = {
  em_analise: 'Em análise',
  em_exigencia: 'Em exigência',
  deferido: 'Concluído · deferido',
  indeferido: 'Concluído · indeferido',
}

export const ADMIN_STATUS_SHORT: Record<AdminStatus, string> = {
  em_analise: 'Em análise',
  em_exigencia: 'Em exigência',
  deferido: 'Deferido',
  indeferido: 'Indeferido',
}

export type AdminTone = 'info' | 'warning' | 'danger' | 'success' | 'muted'

export const ADMIN_TONE_CLASSES: Record<AdminTone, string> = {
  info: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:ring-sky-800',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:ring-amber-800',
  danger: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-900/20 dark:text-red-300 dark:ring-red-800',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:ring-emerald-800',
  muted: 'bg-gray-50 text-gray-500 ring-gray-200 dark:bg-dark-700 dark:text-gray-400 dark:ring-dark-600',
}

/** Análise parada a partir disso merece cobrança ao órgão. */
export const ANALISE_LONGA_DIAS = 90

export interface AdminStatusSummary {
  label: string
  tone: AdminTone
  /** Linha curta abaixo do selo: há quanto tempo, ou o prazo da exigência. */
  detail: string | null
  /** Pede atenção (exigência vencendo/vencida, análise longa demais). */
  alert: boolean
}

function plural(n: number, um: string, varios: string) { return n === 1 ? um : varios }

function sinceText(days: number): string {
  if (days <= 0) return 'desde hoje'
  return `há ${days} ${plural(days, 'dia', 'dias')}`
}

type AdminFields = Pick<Process, 'admin_status' | 'admin_status_at' | 'data_requerimento' | 'data_protocolo' | 'next_deadline'>

/** Selo + detalhe da situação administrativa, para a linha da tabela. `today` em yyyy-MM-dd (dia local). */
export function adminStatusSummary(p: AdminFields, today: string): AdminStatusSummary {
  const status = p.admin_status
  if (!status) return { label: 'Informar situação', tone: 'muted', detail: null, alert: false }

  const ref = parseISO(today)
  const days = (iso: string | null | undefined) => iso ? differenceInCalendarDays(ref, parseISO(iso.slice(0, 10))) : null

  if (status === 'em_exigencia') {
    const left = p.next_deadline ? -(days(p.next_deadline) as number) : null
    if (left === null) {
      const since = days(p.admin_status_at)
      return { label: ADMIN_STATUS_SHORT[status], tone: 'warning', detail: since === null ? 'sem prazo informado' : `${sinceText(since)} · sem prazo`, alert: false }
    }
    if (left < 0) return { label: ADMIN_STATUS_SHORT[status], tone: 'danger', detail: `prazo vencido há ${-left} ${plural(-left, 'dia', 'dias')}`, alert: true }
    if (left === 0) return { label: ADMIN_STATUS_SHORT[status], tone: 'danger', detail: 'prazo vence hoje', alert: true }
    return {
      label: ADMIN_STATUS_SHORT[status], tone: 'warning',
      detail: `cumprir em ${left} ${plural(left, 'dia', 'dias')}`, alert: left <= 5,
    }
  }

  if (status === 'em_analise') {
    // Sem data de mudança, conta desde o requerimento (é quando a análise começou).
    const since = days(p.admin_status_at || p.data_requerimento || p.data_protocolo)
    if (since === null) return { label: ADMIN_STATUS_SHORT[status], tone: 'info', detail: null, alert: false }
    return { label: ADMIN_STATUS_SHORT[status], tone: 'info', detail: sinceText(since), alert: since >= ANALISE_LONGA_DIAS }
  }

  const since = days(p.admin_status_at)
  return {
    label: ADMIN_STATUS_SHORT[status],
    tone: status === 'deferido' ? 'success' : 'danger',
    detail: since === null ? 'concluído' : `concluído ${sinceText(since)}`,
    alert: false,
  }
}

export type AdminStatusFilter = AdminStatus | '__sem__' | ''

export function matchesAdminStatus(p: Pick<Process, 'admin_status'>, filter: AdminStatusFilter): boolean {
  if (!filter) return true
  if (filter === '__sem__') return !p.admin_status
  return p.admin_status === filter
}

/** Contagem por situação (para os atalhos da aba Administrativos). */
export function countAdminStatuses(list: Pick<Process, 'admin_status'>[]): Record<AdminStatus | '__sem__', number> {
  const out = { em_analise: 0, em_exigencia: 0, deferido: 0, indeferido: 0, __sem__: 0 }
  for (const p of list) out[p.admin_status ?? '__sem__']++
  return out
}
