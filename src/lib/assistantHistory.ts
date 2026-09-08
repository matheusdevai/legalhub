import type { AssistantLog } from '@/types'

// Lógica pura de filtro/rotulagem do Histórico do Assistente (milestone 5).
// A tela (AssistantPage) só chama supabase.from('ai_assistant_logs').select()
// sem nenhum filtro de tenant/usuário manual — a RLS já aprovada
// (ai_assistant_logs_select_own_or_admin) resolve isso sozinha. Tudo daqui
// pra baixo é filtro/rótulo local sobre o que a RLS já devolveu.

export type HistoryPeriod = 'today' | '7d' | '30d' | 'all'
export type HistoryChannelFilter = '' | AssistantLog['channel']
export type HistoryStatusFilter = '' | AssistantLog['status']

export interface HistoryFilters {
  period: HistoryPeriod
  channel: HistoryChannelFilter
  status: HistoryStatusFilter
}

export const HISTORY_PERIOD_LABELS: Record<HistoryPeriod, string> = {
  today: 'Hoje',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  all: 'Tudo',
}

export const HISTORY_CHANNEL_LABELS: Record<AssistantLog['channel'], string> = {
  chat: 'Chat',
  slash_command: 'Comando de barra',
  action: 'Ação',
}

export const HISTORY_STATUS_LABELS: Record<AssistantLog['status'], string> = {
  completed: 'Concluído',
  proposed: 'Aguardando confirmação',
  confirmed: 'Confirmado',
  cancelled: 'Cancelado',
  error: 'Erro',
}

const GENERATION_TOOLS = new Set(['gerar_minuta', 'analisar_documento'])
const SUMMARY_MAX_LENGTH = 140

/** Início (00:00) do corte de período, em ISO — `null` para "tudo" (sem corte). */
export function periodCutoffISO(period: HistoryPeriod, now: Date = new Date()): string | null {
  if (period === 'all') return null
  const cutoff = new Date(now)
  cutoff.setHours(0, 0, 0, 0)
  if (period === '7d') cutoff.setDate(cutoff.getDate() - 6)
  if (period === '30d') cutoff.setDate(cutoff.getDate() - 29)
  return cutoff.toISOString()
}

export function filterAssistantLogs(
  logs: AssistantLog[],
  filters: HistoryFilters,
  now: Date = new Date(),
): AssistantLog[] {
  const cutoff = periodCutoffISO(filters.period, now)
  return logs.filter(log => {
    if (cutoff && log.created_at < cutoff) return false
    if (filters.channel && log.channel !== filters.channel) return false
    if (filters.status && log.status !== filters.status) return false
    return true
  })
}

/** "Tipo" exibido na linha: distingue ação confirmada/cancelada/proposta dentro do canal 'action'. */
export function historyTypeLabel(log: AssistantLog): string {
  if (log.channel === 'action') {
    if (log.status === 'confirmed') return 'Ação confirmada'
    if (log.status === 'cancelled') return 'Ação cancelada'
    if (log.status === 'error') return 'Ação com erro'
    return 'Ação proposta'
  }
  return HISTORY_CHANNEL_LABELS[log.channel]
}

/** Pergunta a exibir: comando de barra formatado, ou a pergunta em linguagem natural. */
export function historyQuestionLabel(log: AssistantLog): string {
  return log.slash_command ? `/${log.slash_command}` : log.question
}

export function truncateText(text: string, maxLength: number = SUMMARY_MAX_LENGTH): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength).trimEnd()}…`
}

/**
 * Resumo curto da resposta pra linha da lista. Respostas de geração longa
 * (gerar_minuta/analisar_documento) nunca aparecem por inteiro aqui — só um
 * indicativo; o texto completo só é mostrado ao expandir a linha.
 */
export function historyAnswerSummary(log: AssistantLog): string {
  if (log.status === 'error') {
    return log.error_message ? truncateText(log.error_message) : 'Não foi possível concluir.'
  }
  const toolsCalled = Array.isArray(log.tools_called) ? log.tools_called : []
  if (toolsCalled.includes('analisar_documento')) return 'Análise de documento gerada.'
  if (toolsCalled.includes('gerar_minuta')) return 'Minuta gerada.'
  if (!log.answer) return log.status === 'proposed' ? 'Aguardando confirmação do usuário.' : '—'
  return truncateText(log.answer)
}

/** Resposta completa é uma resposta de geração (minuta/análise) — usado pra decidir como exibir a linha expandida. */
export function isGenerationAnswer(log: AssistantLog): boolean {
  const toolsCalled = Array.isArray(log.tools_called) ? log.tools_called : []
  return toolsCalled.some(t => GENERATION_TOOLS.has(t))
}
