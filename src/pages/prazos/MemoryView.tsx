import { cn, formatDate } from '@/lib/utils'
import type { MemoryDay } from '@/lib/deadlines/engine'

const KIND_STYLE: Record<MemoryDay['kind'], string> = {
  evento: 'bg-slate-100 text-slate-700 dark:bg-dark-700 dark:text-slate-200',
  publicacao: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  ciencia: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  conta: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  nao_conta: 'bg-slate-50 text-slate-400 dark:bg-dark-800 dark:text-slate-500',
  prorrogacao: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  vencimento: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
}

const KIND_LABEL: Record<MemoryDay['kind'], string> = {
  evento: 'Evento', publicacao: 'Publicação', ciencia: 'Ciência', conta: 'Conta',
  nao_conta: 'Não conta', prorrogacao: 'Prorrogação', vencimento: 'Vencimento',
}

const WEEKDAY = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/**
 * Memória de cálculo dia a dia: o que contou, o que foi pulado e por qual
 * regra. É o que o conferente usa para conferir — nunca esconder.
 */
export function MemoryView({ memory, compact = false }: { memory: MemoryDay[]; compact?: boolean }) {
  if (memory.length === 0) return <p className="text-xs text-slate-400">Preencha os dados para ver a contagem.</p>
  return (
    <ol className={cn('divide-y divide-slate-100 dark:divide-dark-700 rounded-xl border border-slate-100 dark:border-dark-700 overflow-y-auto', compact ? 'max-h-64' : 'max-h-[28rem]')}
      aria-label="Memória de cálculo">
      {memory.map((m, i) => {
        const wd = WEEKDAY[new Date(`${m.date}T12:00:00Z`).getUTCDay()]
        const strong = m.kind === 'vencimento' || m.kind === 'prorrogacao'
        return (
          <li key={`${m.date}-${m.kind}-${i}`} className={cn('flex items-start gap-3 px-3 py-2 text-xs', m.kind === 'nao_conta' && 'opacity-70')}>
            <span className="w-24 flex-shrink-0 tabular-nums text-slate-600 dark:text-slate-300">
              {formatDate(m.date)} <span className="text-slate-400">{wd}</span>
            </span>
            <span className={cn('w-20 flex-shrink-0 text-center rounded-md px-1.5 py-0.5 font-medium', KIND_STYLE[m.kind])}>
              {m.kind === 'conta' && m.n ? `${m.n}º dia` : KIND_LABEL[m.kind]}
            </span>
            <span className={cn('min-w-0 flex-1 text-slate-600 dark:text-slate-300', strong && 'font-semibold text-slate-900 dark:text-white')}>
              {m.note}
              {m.source && <span className="block text-[11px] text-slate-400">{m.source}</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
