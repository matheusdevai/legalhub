import { useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { Button, Input, Spinner } from '@/components/ui'
import { cn, toLocalISODate } from '@/lib/utils'
import { openExportWindow } from '@/lib/exportUtils'
import { fetchReportInputs, type TeamMember } from '@/lib/deadlines/api'
import { indicatorsByLawyer, monthlyIndicators, type Indicator, type ReportCommunication } from '@/lib/deadlines/reports'
import type { DeadlineRow } from '@/lib/deadlines/workflow'

const fmtValue = (i: Indicator) => (i.value === null ? '—' : i.kind === 'percent' ? `${String(i.value).replace('.', ',')}%` : String(i.value))
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const monthName = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`

/** Relatório mensal do Controle de Prazos (especificação, seção 9). */
export function ReportsTab({ deadlines, team }: { deadlines: DeadlineRow[]; team: TeamMember[] }) {
  const today = toLocalISODate()
  const [month, setMonth] = useState(today.slice(0, 7))
  const [inputs, setInputs] = useState<{ communications: ReportCommunication[]; sourceCheckDays: string[] } | null>(null)

  useEffect(() => {
    let alive = true
    setInputs(null)
    fetchReportInputs(month).then(r => { if (alive) setInputs(r) }).catch(() => { if (alive) setInputs({ communications: [], sourceCheckDays: [] }) })
    return () => { alive = false }
  }, [month])

  const indicators = useMemo(() => (inputs ? monthlyIndicators({ month, today, deadlines, ...inputs }) : []), [inputs, month, today, deadlines])
  const byLawyer = useMemo(() => indicatorsByLawyer(deadlines, month, today), [deadlines, month, today])
  const name = (id: string) => team.find(t => t.id === id)?.name || '—'

  function exportReport() {
    openExportWindow({
      title: 'Controle de Prazos — relatório mensal',
      subtitle: monthName(month),
      filename: `prazos-${month}`,
      stats: indicators.filter(i => ['folga', 'perdidos', 'triagem', 'sem_fontes'].includes(i.key)).map(i => ({ value: fmtValue(i), label: i.label, accent: i.ok === false ? '#dc2626' : '#2563eb' })),
      columns: [],
      rows: [],
      sections: [
        { title: 'Indicadores do escritório', columns: ['Indicador', 'Resultado', 'Meta', 'Base'],
          rows: indicators.map(i => [{ text: i.label }, { text: fmtValue(i), bold: true, danger: i.ok === false }, { text: i.goal }, { text: i.kind === 'percent' ? String(i.base) : '—', right: true }]) },
        { title: 'Por advogado (responsável)', columns: ['Advogado', 'Prazos', 'Abertos', 'Com folga', 'No dia do fatal', 'Perdidos', 'Ajustes'],
          rows: byLawyer.map(r => [{ text: name(r.responsibleId), bold: true }, { text: String(r.total), right: true }, { text: String(r.open), right: true }, { text: String(r.early), right: true }, { text: String(r.sameDay), right: true }, { text: String(r.lost), right: true, danger: r.lost > 0 }, { text: String(r.adjusted), right: true }]) },
      ],
      csvContent: ['Indicador,Resultado,Meta', ...indicators.map(i => `"${i.label}",${fmtValue(i)},"${i.goal}"`), '', 'Advogado,Prazos,Abertos,Com folga,No dia do fatal,Perdidos,Ajustes',
        ...byLawyer.map(r => `"${name(r.responsibleId)}",${r.total},${r.open},${r.early},${r.sameDay},${r.lost},${r.adjusted}`)].join('\n'),
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-48"><Input label="Mês" type="month" value={month} max={today.slice(0, 7)} onChange={e => e.target.value && setMonth(e.target.value)} /></div>
        <Button size="sm" variant="secondary" onClick={exportReport} disabled={!inputs}><Download className="w-4 h-4" /> Exportar</Button>
      </div>
      <p className="text-xs text-slate-500">Prazos entram pelo mês do vencimento (fatal); intimações, pelo mês em que chegaram. Cancelados ficam fora.</p>

      {!inputs ? <div className="flex justify-center py-10"><Spinner /></div> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {indicators.map(i => (
            <div key={i.key} className={cn('rounded-2xl border bg-white dark:bg-dark-800 p-4 shadow-card', i.ok === false ? 'border-red-200 dark:border-red-900/50' : 'border-slate-100 dark:border-dark-700')}>
              <p className="text-xs text-slate-500">{i.label}</p>
              <p className={cn('mt-1 text-2xl font-bold tabular-nums', i.ok === false ? 'text-red-600' : i.ok ? 'text-emerald-600' : 'text-slate-900 dark:text-white')}>{fmtValue(i)}</p>
              <p className="mt-0.5 text-[11px] text-slate-400">Meta: {i.goal}{i.kind === 'percent' && i.base ? ` · base ${i.base}` : ''}</p>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-slate-100 dark:border-dark-700 bg-white dark:bg-dark-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-100 dark:border-dark-700">
              <th className="px-4 py-2 font-semibold">Advogado (responsável)</th>
              {['Prazos', 'Abertos', 'Com folga', 'No dia do fatal', 'Perdidos', 'Ajustes'].map(h => <th key={h} className="px-3 py-2 font-semibold text-right">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {byLawyer.map(r => (
              <tr key={r.responsibleId} className="border-b last:border-0 border-slate-50 dark:border-dark-700">
                <td className="px-4 py-2 font-medium text-slate-800 dark:text-slate-100">{name(r.responsibleId)}</td>
                {[r.total, r.open, r.early, r.sameDay, r.lost, r.adjusted].map((v, k) => (
                  <td key={k} className={cn('px-3 py-2 text-right tabular-nums', k === 4 && v > 0 ? 'text-red-600 font-semibold' : 'text-slate-700 dark:text-slate-200')}>{v}</td>
                ))}
              </tr>
            ))}
            {byLawyer.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-xs text-slate-400">Nenhum prazo com vencimento em {monthName(month)}.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
