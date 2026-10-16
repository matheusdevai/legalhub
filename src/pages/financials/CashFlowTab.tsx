import { lazy, Suspense, useMemo } from 'react'
import { Download, TrendingUp } from 'lucide-react'
import { Card } from '@/components/ui'
import type { Financial } from '@/types'
import { cn, formatCurrency } from '@/lib/utils'
import { buildCashFlow, cashFlowYears, type CashFlow, type CashFlowMode, type CashFlowRow } from '@/lib/cashFlow'

const AnnualRevenueBarChart = lazy(() => import('./FinancialsCharts').then(m => ({ default: m.AnnualRevenueBarChart })))

const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const NUMBER_FMT = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num = (v: number) => (v === 0 ? '—' : NUMBER_FMT.format(v))

type Props = {
  financials: Financial[]
  year: number
  onYearChange: (year: number) => void
  mode: CashFlowMode
  onModeChange: (mode: CashFlowMode) => void
  categoryLabels: Record<string, string>
  /** clique numa célula de categoria: abre o mês na Planilha filtrado pela categoria */
  onOpenCell: (month: number, category: string, type: Financial['type']) => void
  onExport: (cf: CashFlow) => void
}

export function CashFlowTab({ financials, year, onYearChange, mode, onModeChange, categoryLabels, onOpenCell, onExport }: Props) {
  const now = new Date()
  const cf = useMemo(() => buildCashFlow(financials, year, mode), [financials, year, mode])
  const years = useMemo(() => {
    const ys = cashFlowYears(financials, now.getFullYear())
    return ys.includes(year) ? ys : [year, ...ys].sort((a, b) => b - a)
  }, [financials, year]) // eslint-disable-line react-hooks/exhaustive-deps
  const chartData = MONTHS_SHORT.map((month, i) => ({ month, receitas: cf.incomeTotals[i], despesas: cf.expenseTotals[i] }))
  const finalBalance = cf.balances[11]
  const negativeMonths = cf.balances.filter(b => b < 0).length
  const isCurrentMonth = (m: number) => year === now.getFullYear() && m === now.getMonth()
  const label = (c: string) => categoryLabels[c] || c || 'Sem categoria'

  function categoryRows(rows: CashFlowRow[], type: Financial['type']) {
    return rows.map(r => (
      <tr key={`${type}-${r.category}`} data-testid={`cf-row-${type}-${r.category || 'none'}`} className="hover:bg-slate-50/60 dark:hover:bg-dark-700/20">
        <td className="sticky left-0 z-10 bg-white dark:bg-dark-800 px-3 py-1.5 pl-6 text-slate-600 dark:text-slate-300 whitespace-nowrap">{label(r.category)}</td>
        {r.values.map((v, m) => (
          <td key={m} className={cn('px-2 py-1.5 text-right whitespace-nowrap', isCurrentMonth(m) && 'bg-primary-50/40 dark:bg-primary-900/10')}>
            {v === 0 ? <span className="text-slate-300 dark:text-dark-500">—</span> : (
              <button type="button" onClick={() => onOpenCell(m, r.category, type)} title={`Ver na planilha: ${label(r.category)} · ${MONTHS_SHORT[m]}/${year}`}
                className="text-slate-700 dark:text-slate-200 hover:text-primary-600 hover:underline">{NUMBER_FMT.format(v)}</button>
            )}
          </td>
        ))}
        <td className="px-3 py-1.5 text-right font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">{num(r.total)}</td>
      </tr>
    ))
  }

  function totalRow(key: string, labelText: string, values: number[], total: number, cls: string) {
    return (
      <tr data-testid={key} className="font-bold bg-slate-50 dark:bg-dark-700/30">
        <td className="sticky left-0 z-10 bg-slate-50 dark:bg-dark-800 px-3 py-2 text-slate-700 dark:text-slate-200 whitespace-nowrap">{labelText}</td>
        {values.map((v, m) => <td key={m} className={cn('px-2 py-2 text-right whitespace-nowrap', cls)}>{num(v)}</td>)}
        <td className={cn('px-3 py-2 text-right whitespace-nowrap', cls)}>{num(total)}</td>
      </tr>
    )
  }

  const sectionHeader = (text: string, cls: string) => (
    <tr><td colSpan={14} className={cn('sticky left-0 px-3 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider', cls)}>{text}</td></tr>
  )

  return (
    <div className="space-y-4" data-testid="cashflow-tab">
      <div className="flex items-center gap-3 flex-wrap">
        <select aria-label="Ano" value={year} onChange={e => onYearChange(Number(e.target.value))}
          className="px-3 py-2 text-sm border border-slate-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-slate-900 dark:text-slate-100">
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <div className="flex rounded-lg border border-slate-200 dark:border-dark-600 overflow-hidden text-xs font-semibold" role="group" aria-label="Modo">
          {([['forecast', 'Previsto'], ['actual', 'Realizado']] as const).map(([m, l]) => (
            <button key={m} type="button" onClick={() => onModeChange(m)} aria-pressed={mode === m}
              className={cn('px-3 py-2 transition-colors', mode === m ? 'bg-primary-600 text-white' : 'bg-white dark:bg-dark-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-dark-700')}>
              {l}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-400">
          {mode === 'forecast'
            ? 'Tudo que não foi cancelado, pelo vencimento — inclui as recorrências previstas.'
            : 'Só o que foi pago/recebido, pela data de pagamento.'}
        </p>
        <div className="flex-1" />
        <button onClick={() => onExport(cf)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-dark-600 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-700">
          <Download className="w-3.5 h-3.5" /> Exportar
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4 border-l-4 border-emerald-500">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Entradas {year}</p>
          <p className="text-xl font-bold mt-1.5 text-emerald-600 dark:text-emerald-400" data-testid="cf-total-income">{formatCurrency(cf.totalIncome)}</p>
        </Card>
        <Card className="p-4 border-l-4 border-red-500">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Saídas {year}</p>
          <p className="text-xl font-bold mt-1.5 text-red-600 dark:text-red-400" data-testid="cf-total-expense">{formatCurrency(cf.totalExpense)}</p>
        </Card>
        <Card className="p-4 border-l-4 border-primary-500">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Resultado {year}</p>
          <p className={cn('text-xl font-bold mt-1.5', cf.totalResult >= 0 ? 'text-slate-900 dark:text-white' : 'text-red-600 dark:text-red-400')} data-testid="cf-total-result">{formatCurrency(cf.totalResult)}</p>
        </Card>
        <Card className={cn('p-4 border-l-4', finalBalance >= 0 ? 'border-slate-400' : 'border-orange-500')}>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Saldo em dez/{year}</p>
          <p className={cn('text-xl font-bold mt-1.5', finalBalance >= 0 ? 'text-slate-900 dark:text-white' : 'text-red-600 dark:text-red-400')} data-testid="cf-final-balance">{formatCurrency(finalBalance)}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">saldo inicial {formatCurrency(cf.opening)}</p>
        </Card>
      </div>

      {negativeMonths > 0 && (
        <div className="rounded-2xl border border-orange-200 dark:border-orange-900/40 bg-orange-50/60 dark:bg-orange-900/10 px-4 py-2.5 text-xs text-orange-700 dark:text-orange-400" data-testid="cf-negative-alert">
          Saldo acumulado fica negativo em {negativeMonths} {negativeMonths === 1 ? 'mês' : 'meses'} de {year}
          {' '}({MONTHS_SHORT.filter((_, m) => cf.balances[m] < 0).join(', ')}).
        </div>
      )}

      <Card className="p-5">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-4 text-sm flex items-center gap-1.5"><TrendingUp className="w-4 h-4" /> Entradas × Saídas — {year} ({mode === 'forecast' ? 'previsto' : 'realizado'})</h3>
        <Suspense fallback={<div className="h-[240px] animate-pulse bg-slate-100 dark:bg-dark-700 rounded-xl" />}>
          <AnnualRevenueBarChart data={chartData} />
        </Suspense>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse" data-testid="cashflow-table">
            <thead>
              <tr className="border-b border-slate-200 dark:border-dark-700 bg-slate-50 dark:bg-dark-700/30 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="sticky left-0 z-10 bg-slate-50 dark:bg-dark-800 px-3 py-2 text-left min-w-[150px]">Categoria</th>
                {MONTHS_SHORT.map((m, i) => (
                  <th key={m} className={cn('px-2 py-2 text-right min-w-[84px]', isCurrentMonth(i) && 'text-primary-600 dark:text-primary-400')}>{m}</th>
                ))}
                <th className="px-3 py-2 text-right min-w-[100px]">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-dark-700/40">
              {sectionHeader('Entradas', 'text-emerald-600 dark:text-emerald-400')}
              {cf.income.length === 0 && <tr><td colSpan={14} className="px-6 py-2 text-slate-400">Nenhuma entrada no ano.</td></tr>}
              {categoryRows(cf.income, 'receivable')}
              {totalRow('cf-income-totals', 'Total entradas', cf.incomeTotals, cf.totalIncome, 'text-emerald-600 dark:text-emerald-400')}

              {sectionHeader('Saídas', 'text-red-600 dark:text-red-400')}
              {cf.expense.length === 0 && <tr><td colSpan={14} className="px-6 py-2 text-slate-400">Nenhuma saída no ano.</td></tr>}
              {categoryRows(cf.expense, 'payable')}
              {totalRow('cf-expense-totals', 'Total saídas', cf.expenseTotals, cf.totalExpense, 'text-red-600 dark:text-red-400')}
            </tbody>
            <tfoot className="border-t-2 border-slate-300 dark:border-dark-600">
              <tr data-testid="cf-results" className="font-bold">
                <td className="sticky left-0 z-10 bg-white dark:bg-dark-800 px-3 py-2 text-slate-800 dark:text-white">Resultado</td>
                {cf.results.map((v, m) => (
                  <td key={m} className={cn('px-2 py-2 text-right whitespace-nowrap', v < 0 ? 'text-red-600 dark:text-red-400 bg-red-50/60 dark:bg-red-900/10' : 'text-slate-800 dark:text-slate-100')}>
                    {v === 0 ? '—' : `${v > 0 ? '+' : ''}${NUMBER_FMT.format(v)}`}
                  </td>
                ))}
                <td className={cn('px-3 py-2 text-right whitespace-nowrap', cf.totalResult < 0 ? 'text-red-600' : 'text-slate-800 dark:text-slate-100')}>
                  {`${cf.totalResult > 0 ? '+' : ''}${NUMBER_FMT.format(cf.totalResult)}`}
                </td>
              </tr>
              <tr data-testid="cf-balances" className="bg-slate-50 dark:bg-dark-700/30">
                <td className="sticky left-0 z-10 bg-slate-50 dark:bg-dark-800 px-3 py-2 font-semibold text-slate-600 dark:text-slate-300" title={`Saldo inicial (realizado até 31/12/${year - 1}): ${formatCurrency(cf.opening)}`}>Saldo acumulado</td>
                {cf.balances.map((v, m) => (
                  <td key={m} className={cn('px-2 py-2 text-right whitespace-nowrap font-semibold', v < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-300')}>{NUMBER_FMT.format(v)}</td>
                ))}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  )
}
