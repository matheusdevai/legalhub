import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Building2, Download } from 'lucide-react'
import { Button, EmptyState, Spinner } from '@/components/ui'
import { toast } from '@/components/ui/Toast'
import { cn, toLocalISODate } from '@/lib/utils'
import { fetchAllOfficesHealth, fetchPilotDeadlines, setPilotMode, type OfficeHealth, type PilotDeadline } from '@/lib/deadlines/api'
import { healthItems, overallLevel } from '@/lib/deadlines/health'
import { divergencesAsBatteryCsv, pilotSummary } from '@/lib/deadlines/reports'
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
  const [pilot, setPilot] = useState<PilotDeadline[]>([])
  const load = useCallback(() => {
    fetchAllOfficesHealth().then(setRows).catch(() => setRows([]))
    fetchPilotDeadlines().then(setPilot).catch(() => setPilot([]))
  }, [])
  useEffect(() => { load() }, [load])

  async function togglePilot(o: OfficeHealth) {
    const { error } = await setPilotMode(o.tenantId, !o.pilotMode)
    if (error) { toast(`Não foi possível mudar o piloto: ${error.message}`, 'error'); return }
    toast(o.pilotMode ? `Piloto desligado em ${o.name}.` : `Piloto ligado em ${o.name}: cada prazo pede a data do controle atual.`, 'success')
    load()
  }

  // As divergências viram linhas da planilha da bateria (data correta em branco: o advogado decide).
  function exportDivergences() {
    const officeName = (tenantId: string) => rows?.find(r => r.tenantId === tenantId)?.name || ''
    const csv = divergencesAsBatteryCsv(pilot, i => officeName((i as PilotDeadline).tenant_id))
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `divergencias-piloto-${toLocalISODate()}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const pilotTotals = pilotSummary(pilot)
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
      {pilotTotals.compared > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm dark:border-violet-900/50 dark:bg-violet-900/15">
          <p className="text-slate-700 dark:text-slate-200">
            <span className="font-semibold">Piloto:</span> {pilotTotals.compared} prazo(s) comparado(s), {pilotTotals.divergent} divergência(s), {pilotTotals.unexplained} sem explicação.
          </p>
          <Button size="sm" variant="secondary" onClick={exportDivergences} disabled={!pilotTotals.divergent}><Download className="w-4 h-4" /> Divergências como casos da bateria (CSV)</Button>
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
              <Button size="sm" variant={o.pilotMode ? 'secondary' : 'ghost'} onClick={() => togglePilot(o)}>{o.pilotMode ? 'Piloto ligado · desligar' : 'Ligar piloto'}</Button>
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
