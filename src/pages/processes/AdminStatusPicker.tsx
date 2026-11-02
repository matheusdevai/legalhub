import { useEffect, useRef, useState } from 'react'
import { addDays, format } from 'date-fns'
import { AlertTriangle, Check, ChevronDown } from 'lucide-react'
import type { AdminStatus, Process } from '@/types'
import { cn, toLocalISODate } from '@/lib/utils'
import { ADMIN_STATUSES, ADMIN_STATUS_LABELS, ADMIN_TONE_CLASSES, adminStatusSummary } from '@/lib/processKind'

/** Prazo padrão sugerido para cumprir exigência do INSS (30 dias). */
const EXIGENCIA_PRAZO_PADRAO = 30

/**
 * Selo da situação do processo administrativo, clicável para trocar ali mesmo
 * na linha. "Em exigência" pede o prazo de cumprimento, que vira o próximo
 * prazo do processo (tarefa + Agenda + aviso, como qualquer prazo).
 */
export function AdminStatusPicker({ process: p, onChange, compact }: {
  process: Process
  onChange: (status: AdminStatus, exigenciaPrazo: string | null) => Promise<void>
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  // A tabela (overflow-x-auto) cortaria um menu absoluto, então ele fica fixo na
  // tela, ancorado no selo — e abre para cima quando falta espaço embaixo.
  const [pos, setPos] = useState<React.CSSProperties>({})
  const [pending, setPending] = useState<AdminStatus | null>(null)
  const [prazo, setPrazo] = useState('')
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const today = toLocalISODate()
  const s = adminStatusSummary(p, today)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) close() }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') close() }
    // O menu fixo não acompanharia a linha ao rolar a página.
    function onScroll(e: Event) { if (!(e.target instanceof Node && ref.current?.contains(e.target))) close() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  function close() { setOpen(false); setPending(null) }

  async function commit(status: AdminStatus, deadline: string | null) {
    setSaving(true)
    try { await onChange(status, deadline); close() } finally { setSaving(false) }
  }

  function pick(status: AdminStatus) {
    if (status === 'em_exigencia') {
      setPending(status)
      setPrazo(p.admin_status === 'em_exigencia' && p.next_deadline ? p.next_deadline
        : format(addDays(new Date(`${today}T12:00:00`), EXIGENCIA_PRAZO_PADRAO), 'yyyy-MM-dd'))
      return
    }
    if (status === p.admin_status) { close(); return }
    commit(status, null)
  }

  return (
    <div className="relative inline-block" ref={ref} onClick={e => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => {
          if (!open && ref.current) {
            const r = ref.current.getBoundingClientRect()
            const left = Math.min(r.left, window.innerWidth - 248)
            setPos(window.innerHeight - r.bottom < 340
              ? { left, bottom: window.innerHeight - r.top + 4 }
              : { left, top: r.bottom + 4 })
          }
          setOpen(v => !v)
        }}
        aria-haspopup="menu" aria-expanded={open}
        title="Alterar a situação do processo administrativo"
        className="group/st text-left"
      >
        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap', ADMIN_TONE_CLASSES[s.tone])}>
          {s.alert && <AlertTriangle className="w-3 h-3" />}
          {s.label}
          <ChevronDown className="w-3 h-3 opacity-50 group-hover/st:opacity-100" />
        </span>
        {!compact && s.detail && (
          <span className={cn('block mt-0.5 text-[11px] whitespace-nowrap', s.alert ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-400 dark:text-gray-500')}>
            {s.detail}
          </span>
        )}
      </button>

      {open && (
        <div role="menu" style={pos} className="fixed z-50 w-60 bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-600 rounded-xl shadow-modal p-1.5">
          <p className="px-2.5 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">Situação no órgão</p>
          {ADMIN_STATUSES.map(st => (
            <button key={st} type="button" role="menuitem" disabled={saving}
              onClick={() => pick(st)}
              className={cn('w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs text-left transition-colors',
                (pending ?? p.admin_status) === st
                  ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 font-semibold'
                  : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-dark-700')}>
              {ADMIN_STATUS_LABELS[st]}
              {p.admin_status === st && <Check className="w-3.5 h-3.5" />}
              {st === 'indeferido' && p.admin_status !== st && (
                <span className="text-[10px] font-normal text-gray-400">+ tarefa JFPB</span>
              )}
            </button>
          ))}

          {pending === 'em_exigencia' && (
            <form
              className="mt-1.5 pt-2 px-1 pb-1 border-t border-gray-100 dark:border-dark-700 space-y-2"
              onSubmit={e => { e.preventDefault(); commit('em_exigencia', prazo || null) }}
            >
              <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                Prazo para cumprir a exigência
                <input type="date" value={prazo} onChange={e => setPrazo(e.target.value)} autoFocus
                  className="mt-1 w-full px-2.5 py-1.5 text-xs border border-gray-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500" />
              </label>
              <p className="text-[10px] text-gray-400 leading-snug">Vira o próximo prazo do processo: cria a tarefa e o evento na Agenda.</p>
              <button type="submit" disabled={saving}
                className="w-full py-1.5 rounded-lg text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50">
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
