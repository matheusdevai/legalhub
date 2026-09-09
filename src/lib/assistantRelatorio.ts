import { addDays, differenceInCalendarDays, format, startOfDay, startOfMonth } from 'date-fns'
import type { AssistantLog } from '@/types'

// Relatório do Assistente (milestone 7, seções 50-51 da spec). Pura
// agregação sobre `ai_assistant_logs` já filtrado pela RLS
// (ai_assistant_logs_select_own_or_admin — dono ou admin/super_admin do
// tenant, ver 20260908120000_ai_assistant_logs.sql) — o componente não
// reimplementa nenhum filtro manual de tenant/usuário, só busca por período.
//
// De propósito, NÃO implementamos a métrica "horas economizadas" da seção 51
// original: ela exigiria uma estimativa arbitrária de quanto tempo cada ação
// da IA economiza, que ninguém validou. As métricas abaixo são todas
// contagens diretas e verificáveis sobre colunas existentes.

export type ReportPeriod = 'today' | '7d' | '30d' | 'month'

export const REPORT_PERIOD_LABELS: Record<ReportPeriod, string> = {
  today: 'Hoje',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  month: 'Mês atual',
}

export interface AssistantReportMetrics {
  totalInteractions: number
  tasksCreated: number
  minutasGeneratedCount: number
  documentsAnalyzedCount: number
  deadlineAlertsCount: number
  errorsCount: number
  cancelledCount: number
}

export interface ReportDayPoint {
  /** yyyy-MM-dd local */
  date: string
  total: number
}

const DEADLINE_TOOLS = new Set(['consultar_prazos', 'consultar_processos'])

/** Início (00:00 local) do período selecionado. 'month' = dia 1 do mês corrente. */
export function reportPeriodStart(period: ReportPeriod, now: Date = new Date()): Date {
  const today = startOfDay(now)
  if (period === '7d') return addDays(today, -6)
  if (period === '30d') return addDays(today, -29)
  if (period === 'month') return startOfMonth(now)
  return today
}

export function reportPeriodCutoffISO(period: ReportPeriod, now: Date = new Date()): string {
  return reportPeriodStart(period, now).toISOString()
}

export function filterLogsByReportPeriod(
  logs: AssistantLog[],
  period: ReportPeriod,
  now: Date = new Date(),
): AssistantLog[] {
  const cutoff = reportPeriodCutoffISO(period, now)
  return logs.filter(log => log.created_at >= cutoff)
}

function hasTool(log: AssistantLog, tool: string): boolean {
  return Array.isArray(log.tools_called) && log.tools_called.includes(tool)
}

/**
 * Métricas agregadas do Relatório do Assistente. `logs` já deve vir
 * filtrado pelo período desejado (ver `filterLogsByReportPeriod`).
 *
 * - `totalInteractions`: total de linhas no período (qualquer canal/status) —
 *   cada pergunta, comando de barra ou decisão de ação (confirmar/cancelar)
 *   gera uma linha própria.
 * - `tasksCreated`: tarefas/lembretes efetivamente criados pela IA — linhas
 *   confirmadas (`status: 'confirmed'`) com `action_type` preenchido,
 *   contando `created_task_id` distintos (evita contar duas vezes a mesma
 *   tarefa, caso ela apareça em mais de uma linha).
 */
export function buildAssistantReportMetrics(logs: AssistantLog[]): AssistantReportMetrics {
  const createdTaskIds = new Set<string>()
  let minutasGeneratedCount = 0
  let documentsAnalyzedCount = 0
  let deadlineAlertsCount = 0
  let errorsCount = 0
  let cancelledCount = 0

  for (const log of logs) {
    if (log.status === 'confirmed' && log.action_type && log.created_task_id) {
      createdTaskIds.add(log.created_task_id)
    }
    if (hasTool(log, 'gerar_minuta')) minutasGeneratedCount++
    if (hasTool(log, 'analisar_documento')) documentsAnalyzedCount++
    if (Array.isArray(log.tools_called) && log.tools_called.some(t => DEADLINE_TOOLS.has(t))) {
      deadlineAlertsCount++
    }
    if (log.status === 'error') errorsCount++
    if (log.status === 'cancelled') cancelledCount++
  }

  return {
    totalInteractions: logs.length,
    tasksCreated: createdTaskIds.size,
    minutasGeneratedCount,
    documentsAnalyzedCount,
    deadlineAlertsCount,
    errorsCount,
    cancelledCount,
  }
}

/**
 * Série diária de interações totais dentro do período, com dias sem
 * nenhuma linha preenchidos com 0 (pra o gráfico não "pular" dias).
 */
export function buildDailySeries(
  logs: AssistantLog[],
  period: ReportPeriod,
  now: Date = new Date(),
): ReportDayPoint[] {
  const start = reportPeriodStart(period, now)
  const today = startOfDay(now)
  const dayCount = differenceInCalendarDays(today, start) + 1

  const buckets = new Map<string, number>()
  for (let i = 0; i < dayCount; i++) {
    buckets.set(dayKey(addDays(start, i)), 0)
  }
  for (const log of logs) {
    const key = dayKey(startOfDay(new Date(log.created_at)))
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) || 0) + 1)
  }
  return Array.from(buckets.entries()).map(([date, total]) => ({ date, total }))
}

// format() (não toISOString()) de propósito: usa os getters locais do Date,
// então o rótulo do dia não muda conforme o fuso horário de quem executa
// (toISOString converte pra UTC, o que quebraria o dia em fusos à frente
// de UTC, ex. meia-noite local vira o dia anterior em UTC).
function dayKey(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}
