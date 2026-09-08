import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, History } from 'lucide-react'
import { Card, Select, Spinner, EmptyState } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { cn, formatDate } from '@/lib/utils'
import type { AssistantLog } from '@/types'
import {
  HISTORY_PERIOD_LABELS, HISTORY_CHANNEL_LABELS, HISTORY_STATUS_LABELS,
  filterAssistantLogs, historyTypeLabel, historyQuestionLabel, historyAnswerSummary,
  type HistoryPeriod, type HistoryChannelFilter, type HistoryStatusFilter,
} from '@/lib/assistantHistory'

// Histórico do Assistente (milestone 5, seções 33-34 da spec). Só leitura —
// sem exportação, edição, exclusão ou busca por texto livre (fica pra uma
// fatia futura, se pedido). A RLS de ai_assistant_logs já resolve sozinha
// quem vê o quê (dono vê as próprias linhas, admin/super_admin veem o
// tenant todo) — por isso a query abaixo não aplica NENHUM filtro manual de
// tenant/usuário, só os filtros de período/canal/status escolhidos na tela.

const PAGE_SIZE = 15
const FETCH_LIMIT = 500

const STATUS_BADGE: Record<AssistantLog['status'], string> = {
  completed: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300',
  proposed: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300',
  confirmed: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300',
  cancelled: 'bg-slate-100 text-slate-500 dark:bg-dark-700 dark:text-slate-400',
  error: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300',
}

export function AssistantHistory() {
  const [logs, setLogs] = useState<AssistantLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [period, setPeriod] = useState<HistoryPeriod>('30d')
  const [channel, setChannel] = useState<HistoryChannelFilter>('')
  const [status, setStatus] = useState<HistoryStatusFilter>('')
  const [page, setPage] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function load() {
    setLoading(true)
    setError('')
    const { data, error: fetchErr } = await supabase
      .from('ai_assistant_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(FETCH_LIMIT)
    if (fetchErr) {
      setError('Não foi possível carregar o histórico do assistente. Tente novamente.')
      setLoading(false)
      return
    }
    setLogs((data || []) as AssistantLog[])
    setLoading(false)
  }

  const filtered = useMemo(
    () => filterAssistantLogs(logs, { period, channel, status }),
    [logs, period, channel, status],
  )
  useEffect(() => { setPage(0) }, [period, channel, status])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Select label="Período" value={period} onChange={e => setPeriod(e.target.value as HistoryPeriod)}>
            {(Object.keys(HISTORY_PERIOD_LABELS) as HistoryPeriod[]).map(p => (
              <option key={p} value={p}>{HISTORY_PERIOD_LABELS[p]}</option>
            ))}
          </Select>
          <Select label="Canal" value={channel} onChange={e => setChannel(e.target.value as HistoryChannelFilter)}>
            <option value="">Todos</option>
            {(Object.keys(HISTORY_CHANNEL_LABELS) as AssistantLog['channel'][]).map(c => (
              <option key={c} value={c}>{HISTORY_CHANNEL_LABELS[c]}</option>
            ))}
          </Select>
          <Select label="Status" value={status} onChange={e => setStatus(e.target.value as HistoryStatusFilter)}>
            <option value="">Todos</option>
            {(Object.keys(HISTORY_STATUS_LABELS) as AssistantLog['status'][]).map(s => (
              <option key={s} value={s}>{HISTORY_STATUS_LABELS[s]}</option>
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
      ) : filtered.length === 0 ? (
        <Card className="p-4">
          <EmptyState icon={History} title="Nenhuma interação encontrada" description="Ajuste os filtros ou volte depois de usar o assistente." />
        </Card>
      ) : (
        <>
          <Card className="p-0 overflow-hidden divide-y divide-slate-100 dark:divide-dark-600">
            {pageItems.map(log => {
              const expanded = expandedId === log.id
              return (
                <div key={log.id}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : log.id)}
                    className="w-full flex items-start gap-3 text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-dark-700 transition-colors"
                  >
                    {expanded ? (
                      <ChevronDown className="w-4 h-4 text-slate-300 flex-shrink-0 mt-1" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0 mt-1" />
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-slate-400 whitespace-nowrap">{formatDate(log.created_at, 'dd/MM/yyyy HH:mm')}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 dark:bg-dark-600 text-slate-500 dark:text-slate-300">
                          {historyTypeLabel(log)}
                        </span>
                        <span className={cn('text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded', STATUS_BADGE[log.status])}>
                          {HISTORY_STATUS_LABELS[log.status]}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{historyQuestionLabel(log)}</p>
                      <p className="text-xs text-slate-400 truncate">{historyAnswerSummary(log)}</p>
                    </div>
                  </button>
                  {expanded && (
                    <div className="px-4 pb-4 pl-11 space-y-2">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Pergunta</p>
                        <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{historyQuestionLabel(log)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Resposta</p>
                        <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
                          {log.status === 'error'
                            ? (log.error_message || 'Não foi possível concluir.')
                            : (log.answer || '—')}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </Card>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-1">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="text-sm font-semibold text-primary-600 hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
              >
                Anterior
              </button>
              <span className="text-xs text-slate-400">Página {page + 1} de {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="text-sm font-semibold text-primary-600 hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
              >
                Próxima
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
