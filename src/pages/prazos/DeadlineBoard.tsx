import { useMemo } from 'react'
import { AlertTriangle, Clock, PenLine, UserX } from 'lucide-react'
import { Badge } from '@/components/ui'
import { cn, formatDate, toLocalISODate } from '@/lib/utils'
import { businessDaysUntil, type CalendarEntry } from '@/lib/deadlines/engine'
import { BOARD_COLUMNS, deadlineFlags, groupBoard, STATUS_COLORS, STATUS_LABELS, type BoardColumn, type DeadlineRow } from '@/lib/deadlines/workflow'
import type { ProcessOption, TeamMember } from '@/lib/deadlines/api'

const COLUMN_STYLE: Record<BoardColumn, string> = {
  vencidos: 'border-t-red-600',
  hoje: 'border-t-red-500',
  tres_dias: 'border-t-amber-500',
  semana: 'border-t-blue-500',
  depois: 'border-t-slate-300',
}

interface Props {
  deadlines: DeadlineRow[]
  team: TeamMember[]
  processes: ProcessOption[]
  calendar: CalendarEntry[]
  onOpen: (d: DeadlineRow) => void
}

export function DeadlineBoard({ deadlines, team, processes, calendar, onOpen }: Props) {
  const today = toLocalISODate()
  const board = useMemo(() => groupBoard(deadlines, today, calendar), [deadlines, today, calendar])
  const name = (id: string | null) => team.find(t => t.id === id)?.name || '—'

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
      {BOARD_COLUMNS.map(col => (
        <section key={col.id} aria-label={col.label} className={cn('rounded-2xl bg-slate-50 dark:bg-dark-800/60 border-t-4 p-3 min-h-[8rem]', COLUMN_STYLE[col.id])}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">{col.label}</h3>
            <span className="text-xs font-semibold text-slate-400">{board[col.id].length}</span>
          </div>
          <div className="space-y-2">
            {board[col.id].map(d => {
              const f = deadlineFlags(d, today)
              const proc = processes.find(p => p.id === d.process_id)
              const left = businessDaysUntil(today, d.fatal_date, calendar)
              return (
                <button key={d.id} onClick={() => onOpen(d)}
                  className="w-full text-left rounded-xl bg-white dark:bg-dark-800 border border-slate-100 dark:border-dark-700 p-3 shadow-card hover:shadow-card-hover transition-shadow">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white leading-snug">{d.act_type}</p>
                    <span className={cn('flex-shrink-0 text-xs font-bold tabular-nums', col.id === 'vencidos' || col.id === 'hoje' ? 'text-red-600' : 'text-slate-700 dark:text-slate-200')}>
                      {formatDate(d.fatal_date, 'dd/MM')}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500 truncate">{proc ? `${proc.client_name || proc.title} · ${proc.number}` : 'Sem processo vinculado'}</p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {col.id === 'vencidos' ? 'Venceu sem protocolo' : col.id === 'hoje' ? 'Vence hoje' : `${left} ${left === 1 ? 'dia útil' : 'dias úteis'}`} · interno {formatDate(d.internal_date, 'dd/MM')} · {name(d.responsible_id)}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge className={STATUS_COLORS[d.status]}>{STATUS_LABELS[d.status]}</Badge>
                    {f.semConferente && <span title="Sem conferente" className="text-red-600"><UserX className="w-3.5 h-3.5" /></span>}
                    {f.internoVencido && <span title="Prazo interno vencido" className="text-amber-600"><Clock className="w-3.5 h-3.5" /></span>}
                    {f.ajustadoManualmente && <span title="Data ajustada manualmente" className="text-amber-600"><PenLine className="w-3.5 h-3.5" /></span>}
                    {d.review_note && d.status === 'calculado' && <span title="Devolvido pelo conferente" className="text-amber-600"><AlertTriangle className="w-3.5 h-3.5" /></span>}
                  </div>
                </button>
              )
            })}
            {board[col.id].length === 0 && <p className="text-xs text-slate-400 py-2 text-center">Nenhum prazo</p>}
          </div>
        </section>
      ))}
    </div>
  )
}
