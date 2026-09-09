import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, BarChart3, ListChecks, FileEdit, FileSearch,
  CalendarClock, XCircle, Ban,
} from 'lucide-react'
import { Card, Select, Spinner, StatsCard } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import type { AssistantLog } from '@/types'
import {
  REPORT_PERIOD_LABELS, reportPeriodCutoffISO, buildAssistantReportMetrics, buildDailySeries,
  type ReportPeriod,
} from '@/lib/assistantRelatorio'

// Relatório do Assistente (milestone 7, seções 50-51 da spec). Só leitura/
// agregação sobre `ai_assistant_logs` — sem CRUD, sem exportação (CSV/PDF
// fica pra depois se pedirem). A RLS (ai_assistant_logs_select_own_or_admin)
// já resolve quem vê o quê, então a query abaixo só filtra por período —
// nenhum filtro manual de tenant/usuário, mesmo padrão de AssistantHistory.
//
// De propósito, NÃO mostramos "horas economizadas" (spec seção 51): exigiria
// estimar arbitrariamente quanto tempo cada ação da IA economiza, o que
// ninguém validou. Só métricas operacionais diretas e verificáveis.

const AssistantInteractionsBarChart = lazy(() =>
  import('./AssistantRelatorioChart').then(m => ({ default: m.AssistantInteractionsBarChart })),
)

export function AssistantRelatorio() {
  const [period, setPeriod] = useState<ReportPeriod>('30d')
  const [logs, setLogs] = useState<AssistantLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period])

  async function load() {
    setLoading(true)
    setError('')
    const { data, error: fetchErr } = await supabase
      .from('ai_assistant_logs')
      .select('*')
      .gte('created_at', reportPeriodCutoffISO(period))
      .order('created_at', { ascending: false })
    if (fetchErr) {
      setError('Não foi possível carregar o relatório do assistente. Tente novamente.')
      setLoading(false)
      return
    }
    setLogs((data || []) as AssistantLog[])
    setLoading(false)
  }

  const metrics = useMemo(() => buildAssistantReportMetrics(logs), [logs])
  const dailySeries = useMemo(() => buildDailySeries(logs, period), [logs, period])

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Select label="Período" value={period} onChange={e => setPeriod(e.target.value as ReportPeriod)}>
            {(Object.keys(REPORT_PERIOD_LABELS) as ReportPeriod[]).map(p => (
              <option key={p} value={p}>{REPORT_PERIOD_LABELS[p]}</option>
            ))}
          </Select>
        </div>
      </Card>

      {error && (
        <Card className="p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
          <button onClick={load} className="text-sm font-semibold text-primary-600 hover:underline flex-shrink-0">
            Tentar novamente
          </button>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner className="w-6 h-6" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard label="Interações no período" value={metrics.totalInteractions} icon={ListChecks} color="blue" />
            <StatsCard label="Tarefas/lembretes criados pela IA" value={metrics.tasksCreated} icon={CalendarClock} color="green" />
            <StatsCard label="Minutas geradas" value={metrics.minutasGeneratedCount} icon={FileEdit} color="purple" />
            <StatsCard label="Documentos analisados" value={metrics.documentsAnalyzedCount} icon={FileSearch} color="indigo" />
            <StatsCard label="Alertas/consultas de prazo" value={metrics.deadlineAlertsCount} icon={BarChart3} color="orange" />
            <StatsCard label="Erros" value={metrics.errorsCount} icon={XCircle} color="red" />
            <StatsCard label="Ações canceladas" value={metrics.cancelledCount} icon={Ban} color="pink" />
          </div>

          {period !== 'today' && (
            <Card className="p-4">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Interações por dia</h2>
              <Suspense fallback={<div className="flex items-center justify-center py-10"><Spinner className="w-5 h-5" /></div>}>
                <AssistantInteractionsBarChart data={dailySeries} />
              </Suspense>
            </Card>
          )}

          <p className="text-xs text-slate-400">
            Indicadores operacionais do assistente — não são garantia de produtividade.
          </p>
        </>
      )}
    </div>
  )
}
