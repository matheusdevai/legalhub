import { useEffect, useState } from 'react'
import { AlertTriangle, Building2 } from 'lucide-react'
import { EmptyState, Spinner } from '@/components/ui'
import { cn } from '@/lib/utils'
import { fetchAllOfficesHealth, type OfficeHealth } from '@/lib/deadlines/api'
import { healthItems, overallLevel } from '@/lib/deadlines/health'
import { brasiliaNow } from '@/lib/deadlines/alerts'
import type { CourtCalendarRow } from '@/lib/deadlines/courtCalendar'

const DOT = { ok: 'bg-emerald-500', warn: 'bg-amber-500', error: 'bg-red-600' }
/** Tribunais da cobertura inicial (especificação, seção 14). */
const COVERED_COURTS = ['tjpb', 'trt13', 'trf5']

/**
 * Painel interno do LegalHub (só super_admin): a saúde de todos os escritórios
 * numa tela, para a equipe agir antes do cliente perceber — e o aviso de que o
 * calendário do ano seguinte ainda não foi carregado (a partir de 1º de novembro).
 */
export function OfficesHealth({ calendarRows }: { calendarRows: CourtCalendarRow[] }) {
  const [rows, setRows] = useState<OfficeHealth[] | null>(null)
  useEffect(() => { fetchAllOfficesHealth().then(setRows).catch(() => setRows([])) }, [])
  const now = brasiliaNow(new Date())
  const nextYear = Number(now.date.slice(0, 4)) + 1
  const missingNextYear = now.date.slice(5) >= '11-01'
    ? COVERED_COURTS.filter(c => !calendarRows.some(r => r.court === c && r.date_from.startsWith(String(nextYear))))
    : []

  if (!rows) return <div className="flex justify-center py-10"><Spinner /></div>
  return (
    <div className="space-y-3">
      {missingNextYear.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          Calendário de {nextYear} ainda não carregado para: {missingNextYear.map(c => c.toUpperCase()).join(', ')}. Cadastre as portarias assim que os tribunais publicarem.
        </div>
      )}
      {rows.length === 0 && <EmptyState icon={Building2} title="Nenhum escritório com o Controle de Prazos ligado" description="Os escritórios do piloto aparecem aqui." />}
      {rows.map(o => {
        const items = healthItems({ now, ...o.snapshot })
        const level = overallLevel(items)
        return (
          <div key={o.tenantId} className="rounded-xl border border-slate-100 dark:border-dark-700 bg-white dark:bg-dark-800 p-4">
            <div className="flex items-center gap-2">
              <span className={cn('w-2.5 h-2.5 rounded-full', DOT[level])} />
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{o.name}</p>
              <span className="ml-auto text-xs text-slate-500">{o.openDeadlines} prazo(s) aberto(s)</span>
            </div>
            <ul className="mt-2 space-y-0.5 text-xs">
              {items.map(i => (
                <li key={i.key} className={cn(i.level === 'error' ? 'text-red-600' : i.level === 'warn' ? 'text-amber-600' : 'text-slate-500')}>
                  {i.label}{i.detail && i.level !== 'ok' ? ` — ${i.detail}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
