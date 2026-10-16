import { useMemo } from 'react'
import {
  AlertCircle, Ban, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, CircleDashed, Clock,
  MinusCircle, Pencil, Plus, Repeat, TrendingUp, Edit3,
} from 'lucide-react'
import { Card } from '@/components/ui'
import type { Financial } from '@/types'
import { cn, formatCurrency, formatDate, toLocalISODate } from '@/lib/utils'
import {
  recurringMonthCell, monthlyEquivalent, recurringAlerts, INTERVAL_LABELS,
  type CellState, type MonthCell,
} from '@/lib/recurringMatrix'

const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const NUMBER_FMT = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const STATE_META: Record<CellState, { label: string; icon: typeof CheckCircle2 | null; cls: string }> = {
  paid:      { label: 'Pago',      icon: CheckCircle2, cls: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400' },
  pending:   { label: 'Pendente',  icon: Clock,        cls: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400' },
  overdue:   { label: 'Atrasado',  icon: AlertCircle,  cls: 'text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400' },
  projected: { label: 'Previsto',  icon: CircleDashed, cls: 'text-violet-500 bg-violet-50/60 dark:bg-violet-900/10 dark:text-violet-300' },
  skipped:   { label: 'Pulado',    icon: MinusCircle,  cls: 'text-slate-400 bg-slate-50 dark:bg-dark-700/40' },
  none:      { label: '',          icon: null,         cls: '' },
}

type Props = {
  templates: Financial[]
  financials: Financial[]
  year: number
  onYearChange: (year: number) => void
  /** clique numa célula com 1 ocorrência (ou num alerta): alterna pago */
  onTogglePaid: (occurrence: Financial) => void
  /** clique numa célula com várias ocorrências (semanal): abre a planilha daquele mês */
  onOpenMonth: (year: number, month: number) => void
  onAdjust: (template: Financial) => void
  onEdit: (template: Financial) => void
  onStop: (template: Financial) => void
  onNew: () => void
}

export function RecurringTab({ templates, financials, year, onYearChange, onTogglePaid, onOpenMonth, onAdjust, onEdit, onStop, onNew }: Props) {
  const today = toLocalISODate()
  const now = new Date()

  const sorted = useMemo(() => [...templates].sort((a, b) =>
    a.type === b.type ? a.description.localeCompare(b.description) : a.type === 'receivable' ? -1 : 1
  ), [templates])

  const matrix = useMemo(() => sorted.map(t => ({
    template: t,
    cells: MONTHS_SHORT.map((_, m) => recurringMonthCell(t, financials, year, m, today)),
  })), [sorted, financials, year, today])

  const alerts = useMemo(() => recurringAlerts(templates, financials, today), [templates, financials, today])

  const fixedIncome = templates.filter(t => t.type === 'receivable').reduce((s, t) => s + monthlyEquivalent(t), 0)
  const fixedExpense = templates.filter(t => t.type === 'payable').reduce((s, t) => s + monthlyEquivalent(t), 0)

  const monthTotals = MONTHS_SHORT.map((_, m) => {
    let income = 0, expense = 0
    for (const { template, cells } of matrix) {
      if (template.type === 'receivable') income += cells[m].total
      else expense += cells[m].total
    }
    return { income, expense, result: income - expense }
  })

  function cellTitle(t: Financial, cell: MonthCell, m: number): string {
    const head = `${MONTHS_SHORT[m]}/${year}`
    if (cell.state === 'none') return head
    const lines = cell.occurrences.map(o => {
      const st = o.id.startsWith('proj:') ? 'Previsto' : STATE_META[o.status === 'cancelled' ? 'skipped' : o.status === 'paid' ? 'paid' : (o.status === 'overdue' || (o.due_date && o.due_date < today)) ? 'overdue' : 'pending'].label
      return `${formatDate(o.due_date)} · ${st}${o.paid_date ? ` em ${formatDate(o.paid_date)}` : ''} · ${formatCurrency(o.amount)}`
    })
    const hint = cell.occurrences.length > 1 ? 'clique para abrir o mês na planilha' : cell.state === 'paid' ? 'clique para marcar como pendente' : cell.state === 'skipped' ? '' : 'clique para marcar como pago'
    return [`${head} — ${t.description}`, ...lines, hint].filter(Boolean).join('\n')
  }

  function onCellClick(cell: MonthCell, m: number) {
    if (cell.state === 'none' || cell.state === 'skipped') return
    if (cell.occurrences.length > 1) return onOpenMonth(year, m)
    onTogglePaid(cell.occurrences[0])
  }

  return (
    <div className="space-y-4" data-testid="recurring-tab">
      {/* Fixos por mês */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4 border-l-4 border-emerald-500">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Entradas fixas / mês</p>
          <p className="text-2xl font-bold mt-1.5 text-emerald-600 dark:text-emerald-400" data-testid="fixed-income">{formatCurrency(fixedIncome)}</p>
        </Card>
        <Card className="p-4 border-l-4 border-red-500">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Saídas fixas / mês</p>
          <p className="text-2xl font-bold mt-1.5 text-red-600 dark:text-red-400" data-testid="fixed-expense">{formatCurrency(fixedExpense)}</p>
        </Card>
        <Card className="p-4 border-l-4 border-primary-500">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Resultado fixo / mês</p>
          <p className={cn('text-2xl font-bold mt-1.5', fixedIncome - fixedExpense >= 0 ? 'text-slate-900 dark:text-white' : 'text-red-600 dark:text-red-400')}>
            {formatCurrency(fixedIncome - fixedExpense)}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">semanais e anuais convertidos para o mês</p>
        </Card>
      </div>

      {/* Alertas */}
      {(alerts.overdue.length > 0 || alerts.dueSoon.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {alerts.overdue.length > 0 && (
            <AlertList tone="red" icon={AlertCircle} data-testid="alert-overdue"
              title={`${alerts.overdue.length} recorrente${alerts.overdue.length !== 1 ? 's' : ''} atrasada${alerts.overdue.length !== 1 ? 's' : ''}`}
              items={alerts.overdue} onTogglePaid={onTogglePaid} />
          )}
          {alerts.dueSoon.length > 0 && (
            <AlertList tone="amber" icon={CalendarClock} data-testid="alert-due-soon"
              title={`${alerts.dueSoon.length} vence${alerts.dueSoon.length !== 1 ? 'm' : ''} nos próximos 7 dias`}
              items={alerts.dueSoon} onTogglePaid={onTogglePaid} />
          )}
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 dark:border-dark-700/50 bg-slate-50/50 dark:bg-dark-800/30 flex-wrap">
          <h2 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-1.5"><Repeat className="w-4 h-4 text-violet-500" /> Recorrentes</h2>
          <div className="flex items-center gap-1 ml-2">
            <button onClick={() => onYearChange(year - 1)} aria-label="Ano anterior" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-700 text-slate-500"><ChevronLeft className="w-3.5 h-3.5" /></button>
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 min-w-[40px] text-center" data-testid="recurring-year">{year}</span>
            <button onClick={() => onYearChange(year + 1)} aria-label="Próximo ano" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-700 text-slate-500"><ChevronRight className="w-3.5 h-3.5" /></button>
          </div>
          <div className="flex-1" />
          <button onClick={onNew} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-lg shadow-button">
            <Plus className="w-3.5 h-3.5" /> Nova recorrência
          </button>
        </div>

        {templates.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-10">Nenhuma recorrência ativa. Crie uma com “Nova recorrência” (aluguel, assinaturas, mensalidades de clientes…).</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse" data-testid="recurring-matrix">
              <thead>
                <tr className="border-b border-slate-200 dark:border-dark-700 bg-slate-50 dark:bg-dark-700/30 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="sticky left-0 z-10 bg-slate-50 dark:bg-dark-800 px-3 py-2 text-left min-w-[200px]">Recorrente</th>
                  <th className="px-2.5 py-2 text-right">Valor</th>
                  <th className="px-2.5 py-2 text-left">Freq.</th>
                  <th className="px-2.5 py-2 text-left">Termina</th>
                  {MONTHS_SHORT.map((m, i) => (
                    <th key={m} className={cn('px-1.5 py-2 text-center min-w-[64px]', year === now.getFullYear() && i === now.getMonth() && 'text-primary-600 dark:text-primary-400')}>{m}</th>
                  ))}
                  <th className="px-2 py-2 w-24" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-dark-700/40">
                {matrix.map(({ template: t, cells }) => (
                  <tr key={t.id} data-testid="recurring-row" className="group hover:bg-slate-50/60 dark:hover:bg-dark-700/20">
                    <td className="sticky left-0 z-10 bg-white dark:bg-dark-800 group-hover:bg-slate-50 dark:group-hover:bg-dark-700 px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', t.type === 'receivable' ? 'bg-emerald-500' : 'bg-red-400')} />
                        <span className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-[200px]">{t.description}</span>
                      </div>
                      {t.client_name && <p className="text-[11px] text-slate-400 truncate pl-3">{t.client_name}</p>}
                    </td>
                    <td className={cn('px-2.5 py-2 text-right font-semibold whitespace-nowrap', t.type === 'receivable' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                      {formatCurrency(t.amount)}
                    </td>
                    <td className="px-2.5 py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {INTERVAL_LABELS[t.recurrence_interval || 'monthly']}
                      {t.recurrence_interval !== 'weekly' && t.due_date && <span className="text-slate-400"> · dia {Number(t.due_date.slice(8, 10))}</span>}
                    </td>
                    <td className="px-2.5 py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">{t.recurrence_end_date ? formatDate(t.recurrence_end_date, 'MM/yyyy') : '—'}</td>
                    {cells.map((cell, m) => {
                      const meta = STATE_META[cell.state]
                      const Icon = meta.icon
                      const multi = cell.occurrences.length > 1
                      const paidCount = cell.occurrences.filter(o => o.status === 'paid').length
                      return (
                        <td key={m} className="px-1 py-1.5 text-center">
                          {cell.state !== 'none' && (
                            <button type="button" data-testid={`cell-${m}`} data-state={cell.state}
                              title={cellTitle(t, cell, m)}
                              onClick={() => onCellClick(cell, m)}
                              disabled={cell.state === 'skipped'}
                              className={cn('w-full inline-flex items-center justify-center gap-1 px-1.5 py-1 rounded-lg font-semibold transition-colors hover:ring-1 hover:ring-current disabled:hover:ring-0 disabled:cursor-default', meta.cls)}>
                              {Icon && <Icon className="w-3.5 h-3.5" />}
                              {multi && <span className="text-[10px]">{paidCount}/{cell.occurrences.length}</span>}
                            </button>
                          )}
                        </td>
                      )
                    })}
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                        <button onClick={() => onAdjust(t)} title="Reajustar valor a partir de um mês" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-600 text-slate-400 hover:text-primary-600"><TrendingUp className="w-3.5 h-3.5" /></button>
                        <button onClick={() => onEdit(t)} title="Editar recorrência" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-600 text-slate-400 hover:text-primary-600"><Edit3 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => onStop(t)} title="Encerrar recorrência" className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500"><Ban className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="text-[11px] font-semibold border-t-2 border-slate-200 dark:border-dark-600 bg-slate-50 dark:bg-dark-700/30">
                {([
                  { key: 'income', label: 'Entradas fixas', cls: 'text-emerald-600 dark:text-emerald-400' },
                  { key: 'expense', label: 'Saídas fixas', cls: 'text-red-600 dark:text-red-400' },
                  { key: 'result', label: 'Resultado', cls: '' },
                ] as const).map(r => (
                  <tr key={r.key} data-testid={`total-${r.key}`}>
                    <td className="sticky left-0 z-10 bg-slate-50 dark:bg-dark-800 px-3 py-1.5 uppercase tracking-wider text-slate-500 dark:text-slate-400" colSpan={1}>{r.label}</td>
                    <td colSpan={3} />
                    {monthTotals.map((t, m) => {
                      const v = t[r.key]
                      return (
                        <td key={m} className={cn('px-1 py-1.5 text-center whitespace-nowrap', r.cls || (v >= 0 ? 'text-slate-700 dark:text-slate-200' : 'text-red-600 dark:text-red-400'))}>
                          {v === 0 ? '—' : NUMBER_FMT.format(v)}
                        </td>
                      )
                    })}
                    <td />
                  </tr>
                ))}
              </tfoot>
            </table>
          </div>
        )}

        {/* Legenda */}
        <div className="flex items-center gap-4 flex-wrap px-4 py-2.5 border-t border-slate-100 dark:border-dark-700/50 text-[11px] text-slate-500 dark:text-slate-400">
          {(['paid', 'pending', 'overdue', 'projected', 'skipped'] as CellState[]).map(s => {
            const meta = STATE_META[s]
            const Icon = meta.icon!
            return <span key={s} className="flex items-center gap-1"><Icon className={cn('w-3.5 h-3.5', meta.cls.split(' ')[0])} />{meta.label}</span>
          })}
          <span className="ml-auto flex items-center gap-1"><Pencil className="w-3 h-3" /> Clique na célula para marcar como pago. Para pular um mês, use a lixeira na planilha.</span>
        </div>
      </Card>
    </div>
  )
}

function AlertList({ tone, icon: Icon, title, items, onTogglePaid, ...rest }: {
  tone: 'red' | 'amber'
  icon: typeof AlertCircle
  title: string
  items: Financial[]
  onTogglePaid: (f: Financial) => void
  'data-testid'?: string
}) {
  const box = tone === 'red'
    ? 'border-red-200 dark:border-red-900/40 bg-red-50/60 dark:bg-red-900/10'
    : 'border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-900/10'
  const head = tone === 'red' ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'
  return (
    <div className={cn('rounded-2xl border p-3', box)} data-testid={rest['data-testid']}>
      <p className={cn('text-xs font-bold flex items-center gap-1.5 mb-2', head)}><Icon className="w-4 h-4" /> {title}</p>
      <ul className="space-y-1">
        {items.slice(0, 5).map(f => (
          <li key={f.id} className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 dark:text-slate-400 w-12 flex-shrink-0">{formatDate(f.due_date, 'dd/MM')}</span>
            <span className="flex-1 truncate text-slate-700 dark:text-slate-200">{f.description}</span>
            <span className={cn('font-semibold whitespace-nowrap', f.type === 'receivable' ? 'text-emerald-600' : 'text-red-600')}>{formatCurrency(f.amount)}</span>
            <button onClick={() => onTogglePaid(f)} className="text-[11px] font-semibold text-primary-600 dark:text-primary-400 hover:underline whitespace-nowrap">
              {f.type === 'receivable' ? 'Recebido' : 'Pago'}
            </button>
          </li>
        ))}
        {items.length > 5 && <li className="text-[11px] text-slate-400">+ {items.length - 5} outras</li>}
      </ul>
    </div>
  )
}
