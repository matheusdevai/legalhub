import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { CountUp } from './Reveal'
import { DEADLINE_EXAMPLE, deadlineCalendar, shortDateLabel } from './motionData'
import { revealStyle, useReveal } from './useReveal'

const DRAW_MS = 1400
const WEEK_HEAD = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']

/**
 * Linha do tempo de um prazo real, calculado pelo motor do Controle de Prazos:
 * a linha vertical se desenha (SVG stroke-dashoffset), cada marco acende quando
 * a linha passa por ele e o calendário ao lado preenche os 15 dias úteis, um a
 * um, deixando os fins de semana de fora.
 */
export function DeadlineTimeline() {
  const { ref, visible, reduced } = useReveal<HTMLDivElement>(0.25)
  const cells = useMemo(() => deadlineCalendar(), [])
  const steps = DEADLINE_EXAMPLE.steps
  const stepDelay = (i: number) => (reduced ? 0 : 120 + (i / (steps.length - 1)) * DRAW_MS)

  return (
    <div ref={ref} className="mt-14 sm:mt-16 rounded-3xl border border-[color:var(--lh-border)] bg-[color:var(--lh-card)] lh-card overflow-hidden">
      <div className="px-6 sm:px-8 pt-6 sm:pt-7 pb-5 border-b border-[color:var(--lh-divider)] flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#1677FF]">Memória de cálculo · exemplo</p>
          <h3 className="mt-2 font-display text-xl sm:text-2xl font-bold tracking-[-0.02em] text-[color:var(--lh-fg)]" style={{ textWrap: 'balance' } as React.CSSProperties}>
            Da intimação ao prazo fatal, dia por dia
          </h3>
        </div>
        <p className="text-xs text-[color:var(--lh-muted)] sm:text-right max-w-xs leading-relaxed">
          Regime cível, 15 dias úteis, calculado pelo mesmo motor que roda no sistema.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12">
        {/* Linha do tempo */}
        <ol className="relative lg:col-span-6 px-6 sm:px-8 py-7 sm:py-8">
          <svg aria-hidden className="absolute left-[30px] sm:left-[38px] top-12 w-[2px] h-[calc(100%-6.6rem)] overflow-visible"
            viewBox="0 0 2 100" preserveAspectRatio="none">
            <line x1="1" y1="0" x2="1" y2="100" stroke="var(--lh-divider)" strokeWidth="2" />
            <line x1="1" y1="0" x2="1" y2="100" stroke="#1677FF" strokeWidth="2" pathLength={1} strokeDasharray="1"
              style={{
                strokeDashoffset: visible ? 0 : 1,
                transition: reduced ? 'none' : `stroke-dashoffset ${DRAW_MS}ms cubic-bezier(0.65, 0, 0.35, 1) 120ms`,
              }} />
          </svg>
          {steps.map((s, i) => {
            const last = s.key === 'fatal'
            return (
              <li key={s.key} className="relative flex gap-4 sm:gap-5 py-2.5" style={revealStyle(visible, stepDelay(i), reduced)}>
                <span className={cn('relative z-10 mt-1 w-[14px] h-[14px] flex-shrink-0 rounded-full border-2 transition-colors duration-300',
                  last ? 'bg-[color:var(--lh-fg)] border-[color:var(--lh-fg)]' : 'bg-[color:var(--lh-card)] border-[#1677FF]')}
                  style={{ transitionDelay: `${stepDelay(i)}ms` }} />
                <div className="min-w-0 flex-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[color:var(--lh-fg)]">{s.label}</p>
                    <p className="text-xs text-[color:var(--lh-muted)] leading-relaxed">{s.detail}</p>
                  </div>
                  <time dateTime={s.date} className={cn('font-mono text-xs tabular-nums whitespace-nowrap', last ? 'text-[color:var(--lh-fg)] font-semibold' : 'text-[color:var(--lh-muted)]')}>
                    {shortDateLabel(s.date)}
                  </time>
                </div>
              </li>
            )
          })}
        </ol>

        {/* Calendário: os dias que contam */}
        <div className="lg:col-span-6 px-6 sm:px-8 py-7 sm:py-8 border-t lg:border-t-0 lg:border-l border-[color:var(--lh-divider)] bg-[color:var(--lh-card-2)]">
          <div className="flex items-end justify-between gap-4">
            <p className="text-sm text-[color:var(--lh-muted)]">
              <span className="font-display text-4xl font-bold tracking-[-0.03em] text-[color:var(--lh-fg)]">
                <CountUp value={DEADLINE_EXAMPLE.businessDays} duration={DRAW_MS + 400} />
              </span>{' '}dias úteis contados
            </p>
            <p className="text-xs text-[color:var(--lh-muted)] text-right">
              <CountUp value={DEADLINE_EXAMPLE.weekendDaysSkipped} className="font-semibold text-[color:var(--lh-fg)]" /> dias de fim de semana fora
            </p>
          </div>

          <div className="mt-5 grid grid-cols-7 gap-1.5" role="img"
            aria-label={`Calendário de agosto de 2026: disponibilização em ${shortDateLabel(steps[0].date)}, publicação em ${shortDateLabel(steps[1].date)}, contagem de ${shortDateLabel(steps[2].date)} a ${shortDateLabel(steps[4].date)}, sem contar sábados e domingos.`}>
            {WEEK_HEAD.map(d => (
              <span key={d} aria-hidden className="pb-1 text-center font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--lh-muted)]">{d}</span>
            ))}
            {cells.map(c => {
              const lit = visible && (c.n !== undefined)
              const delay = reduced || c.n === undefined ? 0 : 200 + ((c.n - 1) / (DEADLINE_EXAMPLE.businessDays - 1)) * DRAW_MS
              return (
                <span key={c.date} aria-hidden
                  className={cn(
                    'relative aspect-square rounded-md sm:rounded-lg flex flex-col items-center justify-center text-[11px] sm:text-xs font-semibold tabular-nums border transition-colors duration-300',
                    c.kind === 'fora' && 'border-transparent text-[color:var(--lh-muted)] opacity-40',
                    c.kind === 'nao_conta' && 'border-dashed border-[color:var(--lh-border-strong)] text-[color:var(--lh-muted)]',
                    (c.kind === 'evento' || c.kind === 'publicacao') && 'border-[#1677FF]/50 text-[#1677FF] bg-[color:var(--lh-card)]',
                    c.kind === 'conta' && !c.fatal && (lit ? 'border-[#1677FF] bg-[#1677FF] text-white' : 'border-[color:var(--lh-border)] bg-[color:var(--lh-card)] text-[color:var(--lh-fg)]'),
                    c.fatal && (lit ? 'border-[color:var(--lh-fg)] bg-[color:var(--lh-fg)] text-[color:var(--lh-card)]' : 'border-[color:var(--lh-border)] bg-[color:var(--lh-card)] text-[color:var(--lh-fg)]'),
                  )}
                  style={{ transitionDelay: `${delay}ms` }}>
                  {c.day}
                  {c.n !== undefined && (
                    <span className={cn('absolute top-0.5 right-1 text-[8px] sm:text-[9px] font-mono transition-opacity duration-300', lit ? 'opacity-80' : 'opacity-0')}
                      style={{ transitionDelay: `${delay}ms` }}>{c.n}</span>
                  )}
                  {c.interno && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white" />}
                </span>
              )
            })}
          </div>

          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-[color:var(--lh-muted)]">
            <li className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#1677FF]" />conta</li>
            <li className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm border border-dashed border-[color:var(--lh-border-strong)]" />não conta</li>
            <li className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm border border-[#1677FF]/50" />disponibilização e publicação</li>
            <li className="flex items-center gap-1.5"><span className="relative w-2.5 h-2.5 rounded-sm bg-[#1677FF]"><span className="absolute bottom-px left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white" /></span>prazo interno</li>
            <li className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[color:var(--lh-fg)]" />fatal</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
