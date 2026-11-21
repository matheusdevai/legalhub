import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, CalendarClock, FileSearch, Info, LineChart, Minus, Plus, Quote } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Regime } from '@/lib/deadlines/engine'
import {
  DEMO_COURTS, DEMO_FINANCE_ITEMS, DEMO_INTIMACOES, DEMO_OPENING_BALANCE, DEMO_REGIMES, MONTHS_SHORT, UNIT_LABELS,
  brDate, computeDemoDeadline, demoCashFlow, demoDefaultDate, demoRegimeFor, demoTimeline, demoUnitFor, formatBRL,
  mentionsDoubled, niceCeil, triageIntimacao, weekdayShort,
  type DemoCourt, type DemoFinanceItem, type DemoTimelineDay,
} from '@/lib/landingDemo'
import { TRIAL_DAYS } from './landingData'

// ════════════════════════════════════════════════════════════════════════════
// "Toque você mesmo" — sandbox da landing pública. Sem login e sem backend:
// estado local, dados fictícios, e o MESMO motor de cálculo do sistema (a lógica
// fica em src/lib/landingDemo.ts, com testes). Nada aqui grava ou envia dados.
// ════════════════════════════════════════════════════════════════════════════

type TabId = 'prazo' | 'triagem' | 'financeiro'

const TABS: { id: TabId; label: string; short: string; icon: typeof CalendarClock }[] = [
  { id: 'prazo', label: 'Calculadora de prazo', short: 'Prazo', icon: CalendarClock },
  { id: 'triagem', label: 'Triagem de intimação', short: 'Triagem', icon: FileSearch },
  { id: 'financeiro', label: 'Fluxo de caixa', short: 'Financeiro', icon: LineChart },
]

const EASE = 'cubic-bezier(0.16,1,0.3,1)'

const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const fieldCls =
  'w-full rounded-xl border border-[color:var(--lh-border)] bg-[#050b16] px-3.5 py-2.5 text-sm text-[color:var(--lh-fg)] ' +
  'transition-colors hover:border-[color:var(--lh-border-strong)] focus:border-[#1677FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1677FF]/50 [color-scheme:dark]'

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--lh-muted)] mb-2">
      {children}
    </label>
  )
}

export function DemoSandbox() {
  const [tab, setTab] = useState<TabId>('prazo')
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const baseId = useId()

  // Estado da calculadora fica aqui em cima: a triagem pode mandar um prazo para ela.
  const [court, setCourt] = useState<DemoCourt>('tjpb')
  const [regime, setRegime] = useState<Regime>('civel')
  const [date, setDate] = useState(() => demoDefaultDate(todayISO()))
  const [amount, setAmount] = useState(15)
  const [doubled, setDoubled] = useState(false)
  const [handoff, setHandoff] = useState<string | null>(null)

  function selectTab(i: number, focus = false) {
    const t = TABS[(i + TABS.length) % TABS.length]
    setTab(t.id)
    if (focus) tabRefs.current[(i + TABS.length) % TABS.length]?.focus()
  }

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const keys: Record<string, number> = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }
    if (e.key in keys) { e.preventDefault(); selectTab(keys[e.key], true) }
  }

  function sendToCalculator(p: { amount: number; regime: Regime; court?: DemoCourt; doubled: boolean; act: string | null }) {
    if (p.court) setCourt(p.court)
    setRegime(p.regime)
    setAmount(p.amount)
    setDoubled(p.doubled)
    setHandoff(`${p.act ?? 'Prazo'} · ${p.amount} ${UNIT_LABELS[demoUnitFor(p.regime)]}${p.doubled ? ' em dobro (confira)' : ''}, vindo da triagem.`)
    selectTab(0, true)
  }

  return (
    <section id="teste-voce-mesmo" aria-labelledby={`${baseId}-title`}
      className="relative py-20 sm:py-28 px-4 sm:px-8 border-t border-[color:var(--lh-divider)] overflow-hidden">
      <style>{`
        @keyframes lhsb-in { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
        @keyframes lhsb-cell { from { opacity: 0; transform: translateY(8px) scale(.96) } to { opacity: 1; transform: none } }
        .lhsb-in { animation: lhsb-in .5s ${EASE} both }
        .lhsb-cell { animation: lhsb-cell .45s ${EASE} both }
        .lhsb-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.18) transparent }
        .lhsb-scroll::-webkit-scrollbar { height: 6px }
        .lhsb-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,.16); border-radius: 99px }
        .lhsb-skip { background-image: repeating-linear-gradient(135deg, rgba(255,255,255,.05) 0 4px, transparent 4px 8px) }
        .lhsb-bar { transition: top .6s ${EASE}, height .6s ${EASE}, background-color .3s }
        .lhsb-num { font-variant-numeric: tabular-nums }
        #teste-voce-mesmo input[type=number]::-webkit-inner-spin-button { opacity: .4 }
        @media (prefers-reduced-motion: reduce) {
          .lhsb-in, .lhsb-cell { animation: none !important }
          .lhsb-bar { transition: none !important }
        }
      `}</style>

      <div className="relative max-w-6xl mx-auto">
        {/* Cabeçalho — alinhado à esquerda, contraponto aos títulos centrados da página */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end mb-10 sm:mb-12">
          <div>
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#1677FF]">Toque você mesmo</span>
            <h2 id={`${baseId}-title`} className="mt-3 font-display text-3xl sm:text-[2.6rem] sm:leading-[1.08] font-bold tracking-[-0.035em] text-[color:var(--lh-fg)]"
              style={{ textWrap: 'balance' } as React.CSSProperties}>
              Teste o motor do LegalHub agora, <span className="text-[#1677FF]">sem cadastro</span>
            </h2>
          </div>
          <p className="text-[color:var(--lh-muted)] leading-relaxed lg:pb-1.5">
            Calcule um prazo, cole uma intimação, mexa no caixa do mês. É o mesmo cálculo que roda dentro do sistema —
            aqui com dados fictícios e nada salvo.
          </p>
        </div>

        <div role="note" className="mb-5 flex items-start gap-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-4 py-3 text-[13px] leading-relaxed text-amber-100/90">
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-300" aria-hidden />
          <p>
            <strong className="font-semibold text-amber-200">Demonstração com dados fictícios.</strong>{' '}
            Nada é salvo nem enviado. O calendário aqui é de exemplo — no LegalHub ele vem do ato oficial de cada tribunal —
            e todo prazo calculado precisa da conferência do advogado antes do protocolo.
          </p>
        </div>

        {/* "Janela" do produto */}
        <div className="rounded-2xl border border-[color:var(--lh-border)] bg-[#030a17] shadow-[0_30px_80px_-40px_rgba(11,92,255,0.45)] overflow-hidden">
          <div className="flex items-center gap-3 border-b border-[color:var(--lh-divider)] px-3 sm:px-4">
            <div className="hidden sm:flex gap-1.5 pr-2" aria-hidden>
              {[0, 1, 2].map(i => <span key={i} className="w-2.5 h-2.5 rounded-full bg-white/10" />)}
            </div>
            <div role="tablist" aria-label="Simulações" className="flex flex-1 min-w-0">
              {TABS.map((t, i) => {
                const active = tab === t.id
                return (
                  <button
                    key={t.id}
                    ref={el => { tabRefs.current[i] = el }}
                    id={`${baseId}-tab-${t.id}`}
                    role="tab"
                    type="button"
                    aria-selected={active}
                    aria-controls={`${baseId}-panel-${t.id}`}
                    tabIndex={active ? 0 : -1}
                    onClick={() => selectTab(i)}
                    onKeyDown={e => onTabKey(e, i)}
                    className={cn(
                      'relative flex flex-1 sm:flex-none items-center justify-center gap-2 px-2 sm:px-4 py-3.5 text-[13px] sm:text-sm font-medium transition-colors',
                      active ? 'text-[color:var(--lh-fg)]' : 'text-[color:var(--lh-muted)] hover:text-[color:var(--lh-fg)]',
                    )}
                  >
                    <t.icon className={cn('w-4 h-4 flex-shrink-0', active && 'text-[#1677FF]')} aria-hidden />
                    <span className="sm:hidden">{t.short}</span>
                    <span className="hidden sm:inline">{t.label}</span>
                    <span aria-hidden className={cn('absolute inset-x-2 sm:inset-x-3 -bottom-px h-0.5 rounded-full bg-[#1677FF] transition-transform duration-300 origin-left motion-reduce:transition-none', active ? 'scale-x-100' : 'scale-x-0')} />
                  </button>
                )
              })}
            </div>
            <span className="hidden md:inline text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--lh-muted)] opacity-70">Modo demonstração</span>
          </div>

          {TABS.map(t => (
            <div
              key={t.id}
              id={`${baseId}-panel-${t.id}`}
              role="tabpanel"
              aria-labelledby={`${baseId}-tab-${t.id}`}
              hidden={tab !== t.id}
              tabIndex={0}
              className="p-4 sm:p-7 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1677FF]/40"
            >
              {tab === t.id && t.id === 'prazo' && (
                <DeadlinePanel
                  court={court} regime={regime} date={date} amount={amount} doubled={doubled} handoff={handoff}
                  onCourt={c => { setCourt(c); setRegime(demoRegimeFor(c)); setHandoff(null) }}
                  onRegime={r => { setRegime(r); setHandoff(null) }}
                  onDate={setDate}
                  onAmount={setAmount}
                  onDoubled={setDoubled}
                />
              )}
              {tab === t.id && t.id === 'triagem' && <TriagePanel onCalculate={sendToCalculator} />}
              {tab === t.id && t.id === 'financeiro' && <FinancePanel />}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── CTA contextual ──────────────────────────────────────────────────────────

function DemoCta({ children }: { children: ReactNode }) {
  return (
    <div className="mt-8 flex flex-col gap-4 rounded-xl border border-[#1677FF]/25 bg-[#0B5CFF]/[0.07] p-4 sm:p-5 md:flex-row md:items-center md:justify-between">
      <p className="text-sm leading-relaxed text-[color:var(--lh-soft)] max-w-[62ch]">{children}</p>
      <Link
        to="/login"
        state={{ mode: 'signup' }}
        className="group inline-flex flex-shrink-0 items-center justify-center gap-2 rounded-full bg-[#0B5CFF] px-5 py-3 text-sm font-semibold text-white transition-all hover:brightness-110 active:scale-[0.97] motion-reduce:transition-none"
      >
        <span>Faça isso com seus processos reais — teste grátis</span>
        <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
      </Link>
    </div>
  )
}

// ── (a) Calculadora de prazo ────────────────────────────────────────────────

const TONE_CLS: Record<DemoTimelineDay['tone'], string> = {
  marco: 'border-white/25 bg-white/[0.04] text-[color:var(--lh-fg)]',
  conta: 'border-[#1677FF]/35 bg-[#1677FF]/[0.12] text-[color:var(--lh-fg)]',
  pula: 'lhsb-skip border-white/[0.06] text-[color:var(--lh-muted)] opacity-70',
  interno: 'border-[#1677FF] bg-[#1677FF]/[0.18] text-[color:var(--lh-fg)] ring-1 ring-inset ring-[#1677FF]',
  fatal: 'border-[#1677FF] bg-[#1677FF] text-white shadow-[0_8px_24px_-8px_rgba(22,119,255,0.9)]',
}

function DeadlinePanel(p: {
  court: DemoCourt; regime: Regime; date: string; amount: number; doubled: boolean; handoff: string | null
  onCourt: (c: DemoCourt) => void; onRegime: (r: Regime) => void; onDate: (d: string) => void
  onAmount: (n: number) => void; onDoubled: (b: boolean) => void
}) {
  const id = useId()
  const calc = useMemo(
    () => computeDemoDeadline({ court: p.court, regime: p.regime, disponibilizacao: p.date, amount: p.amount, doubled: p.doubled }),
    [p.court, p.regime, p.date, p.amount, p.doubled],
  )
  const r = calc.result
  const timeline = useMemo(() => (r ? demoTimeline(r) : []), [r])
  const unit = demoUnitFor(p.regime)
  const resultKey = r ? `${r.fatalDate}|${r.internalDate}|${r.amount}` : 'erro'

  return (
    <div className="lhsb-in">
      {p.handoff && (
        <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-[#1677FF]/10 px-3 py-1.5 text-xs text-[#8fbaff]" role="status">
          <FileSearch className="w-3.5 h-3.5" aria-hidden /> {p.handoff}
        </p>
      )}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Entradas */}
        <div className="space-y-5">
          <fieldset>
            <legend className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--lh-muted)] mb-2">Tribunal</legend>
            <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-[color:var(--lh-border)] bg-[#050b16] p-1">
              {DEMO_COURTS.map(c => (
                <label key={c.value} className={cn(
                  'relative cursor-pointer rounded-lg px-2 py-2 text-center transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#1677FF]',
                  p.court === c.value ? 'bg-[#1677FF]/15 text-[color:var(--lh-fg)]' : 'text-[color:var(--lh-muted)] hover:bg-white/[0.04]',
                )}>
                  <input type="radio" name={`${id}-court`} value={c.value} checked={p.court === c.value}
                    onChange={() => p.onCourt(c.value)} className="sr-only" />
                  <span className="block text-sm font-semibold">{c.value.toUpperCase()}</span>
                  <span className="block text-[10px] leading-tight opacity-80">{c.hint}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <FieldLabel htmlFor={`${id}-regime`}>Regime de contagem</FieldLabel>
            <select id={`${id}-regime`} value={p.regime} onChange={e => p.onRegime(e.target.value as Regime)} className={fieldCls}>
              {DEMO_REGIMES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <p className="mt-1.5 text-[11px] text-[color:var(--lh-muted)]">Sugerido pelo tribunal; você pode trocar.</p>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
            <div>
              <FieldLabel htmlFor={`${id}-date`}>Disponibilizada no DJEN em</FieldLabel>
              <input id={`${id}-date`} type="date" value={p.date} onChange={e => p.onDate(e.target.value)} className={cn(fieldCls, 'lhsb-num')} />
            </div>
            <div>
              <FieldLabel htmlFor={`${id}-amount`}>Prazo</FieldLabel>
              <div className="flex items-stretch rounded-xl border border-[color:var(--lh-border)] bg-[#050b16] focus-within:border-[#1677FF]">
                <button type="button" aria-label="Diminuir prazo" onClick={() => p.onAmount(Math.max(1, (p.amount || 2) - 1))}
                  className="px-2.5 text-[color:var(--lh-muted)] hover:text-[color:var(--lh-fg)] rounded-l-xl"><Minus className="w-3.5 h-3.5" /></button>
                <input id={`${id}-amount`} type="number" inputMode="numeric" min={1} max={120} value={Number.isFinite(p.amount) ? p.amount : ''}
                  onChange={e => p.onAmount(e.target.value === '' ? NaN : Math.round(Number(e.target.value)))}
                  aria-describedby={`${id}-unit`}
                  className="lhsb-num w-12 bg-transparent text-center text-sm text-[color:var(--lh-fg)] focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
                <button type="button" aria-label="Aumentar prazo" onClick={() => p.onAmount(Math.min(120, (p.amount || 0) + 1))}
                  className="px-2.5 text-[color:var(--lh-muted)] hover:text-[color:var(--lh-fg)] rounded-r-xl"><Plus className="w-3.5 h-3.5" /></button>
              </div>
              <p id={`${id}-unit`} className="mt-1.5 text-[11px] text-[color:var(--lh-muted)] text-center">{UNIT_LABELS[unit]}</p>
            </div>
          </div>

          <label className="flex items-start gap-3 cursor-pointer text-sm text-[color:var(--lh-soft)]">
            <input type="checkbox" checked={p.doubled} onChange={e => p.onDoubled(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-white/20 bg-transparent accent-[#1677FF]" />
            <span>Prazo em dobro <span className="text-[color:var(--lh-muted)]">(Fazenda Pública, Defensoria, MP, litisconsortes)</span></span>
          </label>
        </div>

        {/* Resultado */}
        <div aria-live="polite" className="min-w-0">
          {!r ? (
            <p className="rounded-xl border border-[color:var(--lh-border)] p-5 text-sm text-[color:var(--lh-muted)]">{calc.error}</p>
          ) : (
            <div key={resultKey} className="lhsb-in">
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[color:var(--lh-border)] bg-[color:var(--lh-border)]">
                <div className="col-span-2 bg-[#030a17] p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--lh-muted)]">Prazo fatal</p>
                  <p className="mt-1 flex flex-wrap items-baseline gap-x-3 font-display">
                    <span className="lhsb-num text-4xl sm:text-5xl font-bold tracking-[-0.04em] text-[color:var(--lh-fg)]">{brDate(r.fatalDate)}</span>
                    <span className="text-sm text-[color:var(--lh-muted)]">{weekdayShort(r.fatalDate)}</span>
                  </p>
                </div>
                <div className="bg-[#030a17] p-4 sm:p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--lh-muted)]">Prazo interno</p>
                  <p className="lhsb-num mt-1 text-xl font-semibold text-[#8fbaff]">{brDate(r.internalDate)}</p>
                  <p className="text-[11px] text-[color:var(--lh-muted)]">2 dias úteis de folga</p>
                </div>
                <div className="bg-[#030a17] p-4 sm:p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--lh-muted)]">Dias contados</p>
                  <p className="lhsb-num mt-1 text-xl font-semibold text-[color:var(--lh-fg)]">{calc.countedDays} <span className="text-sm font-normal text-[color:var(--lh-muted)]">{UNIT_LABELS[r.unit]}</span></p>
                  <p className="text-[11px] text-[color:var(--lh-muted)]">{calc.skippedDays} dias pulados · {calc.calendarSpan} no calendário</p>
                </div>
              </div>

              <p className="mt-4 text-[13px] text-[color:var(--lh-muted)] leading-relaxed">
                Publicada em <span className="lhsb-num text-[color:var(--lh-soft)]">{brDate(r.referenceDate)}</span> (1º dia útil após a disponibilização) ·
                contagem a partir de <span className="lhsb-num text-[color:var(--lh-soft)]">{brDate(r.startDate)}</span>.
              </p>

              {r.warnings.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {r.warnings.map(w => (
                    <li key={w} className="flex gap-2 text-[13px] leading-relaxed text-amber-200/90">
                      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-300" aria-hidden />{w}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      {r && <Timeline days={timeline} />}

      <DemoCta>
        No LegalHub, as intimações do DJEN chegam sozinhas pela sua OAB e viram tarefa com a data fatal, a interna e o
        calendário do seu tribunal — e a memória de cálculo fica registrada para conferência.
      </DemoCta>
    </div>
  )
}

function Timeline({ days }: { days: DemoTimelineDay[] }) {
  const legend: [DemoTimelineDay['tone'], string][] = [['marco', 'Disponibilização / publicação'], ['conta', 'Conta'], ['pula', 'Não conta'], ['interno', 'Interno'], ['fatal', 'Fatal']]
  return (
    <div className="mt-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--lh-muted)]">Memória de cálculo, dia a dia</p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Legenda">
          {legend.map(([tone, label]) => (
            <li key={tone} className="flex items-center gap-1.5 text-[11px] text-[color:var(--lh-muted)]">
              <span aria-hidden className={cn('inline-block h-2.5 w-2.5 rounded-[3px] border', TONE_CLS[tone])} />{label}
            </li>
          ))}
        </ul>
      </div>
      <ol className="lhsb-scroll -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0" aria-label="Dias da contagem">
        {days.map((d, i) => (
          <li key={d.date}
            title={d.note}
            style={{ animationDelay: `${Math.min(i, 40) * 18}ms` }}
            className={cn('lhsb-cell flex w-[52px] flex-shrink-0 flex-col items-center rounded-lg border px-1 py-2 text-center', TONE_CLS[d.tone])}>
            <span className="text-[10px] uppercase tracking-wide opacity-75">{weekdayShort(d.date)}</span>
            <span className="lhsb-num text-sm font-semibold leading-tight">{d.date.slice(8, 10)}/{d.date.slice(5, 7)}</span>
            <span className="lhsb-num mt-0.5 h-3.5 text-[10px] font-semibold leading-none">
              {d.tone === 'fatal' ? 'fatal' : d.tone === 'marco' ? (i === 0 ? 'DJEN' : 'pub.') : d.n ? `${d.n}º` : '—'}
            </span>
            <span className="sr-only">: {d.note}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

// ── (b) Triagem de intimação ────────────────────────────────────────────────

const CONF_STEPS = { baixa: 1, media: 2, alta: 3 } as const

function TriagePanel({ onCalculate }: { onCalculate: (p: { amount: number; regime: Regime; court?: DemoCourt; doubled: boolean; act: string | null }) => void }) {
  const id = useId()
  const [text, setText] = useState(DEMO_INTIMACOES[0].text)
  const [regime, setRegime] = useState<Regime>(DEMO_INTIMACOES[0].regime)
  const [exampleId, setExampleId] = useState<string | null>(DEMO_INTIMACOES[0].id)
  const triage = useMemo(() => triageIntimacao(text, regime), [text, regime])
  const s = triage.suggestion
  const example = DEMO_INTIMACOES.find(e => e.id === exampleId)

  return (
    <div className="lhsb-in grid gap-8 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--lh-muted)] mr-1">Exemplos</span>
          {DEMO_INTIMACOES.map(ex => (
            <button key={ex.id} type="button" aria-pressed={exampleId === ex.id}
              onClick={() => { setText(ex.text); setRegime(ex.regime); setExampleId(ex.id) }}
              className={cn('rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                exampleId === ex.id ? 'border-[#1677FF]/60 bg-[#1677FF]/15 text-[color:var(--lh-fg)]' : 'border-[color:var(--lh-border)] text-[color:var(--lh-muted)] hover:text-[color:var(--lh-fg)] hover:border-[color:var(--lh-border-strong)]')}>
              {ex.label}
            </button>
          ))}
        </div>
        <FieldLabel htmlFor={`${id}-text`}>Texto da intimação</FieldLabel>
        <textarea id={`${id}-text`} value={text} rows={8}
          onChange={e => { setText(e.target.value); setExampleId(null) }}
          placeholder="Cole aqui o texto de uma intimação (sem dados reais de clientes)…"
          className={cn(fieldCls, 'resize-y leading-relaxed min-h-[11rem]')} />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor={`${id}-regime`} className="text-xs text-[color:var(--lh-muted)]">Regime</label>
            <select id={`${id}-regime`} value={regime} onChange={e => setRegime(e.target.value as Regime)} className={cn(fieldCls, 'w-auto py-1.5 text-xs')}>
              {DEMO_REGIMES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <p className="text-[11px] text-[color:var(--lh-muted)]">A leitura roda no seu navegador. Nada é enviado.</p>
        </div>
      </div>

      <div aria-live="polite" className="min-w-0">
        <div className="rounded-xl border border-[color:var(--lh-border)] bg-[#050b16]">
          <dl className="grid grid-cols-2 divide-x divide-[color:var(--lh-border)] border-b border-[color:var(--lh-border)]">
            <div className="p-4">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--lh-muted)]">Ato</dt>
              <dd className="mt-1 text-base font-semibold text-[color:var(--lh-fg)]">{s.actType ?? <span className="text-[color:var(--lh-muted)] font-normal">não identificado</span>}</dd>
            </div>
            <div className="p-4">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--lh-muted)]">Prazo</dt>
              <dd className="lhsb-num mt-1 text-base font-semibold text-[color:var(--lh-fg)]">{triage.prazoLabel ?? <span className="text-[color:var(--lh-muted)] font-normal">não sugerido</span>}</dd>
            </div>
          </dl>
          <div className="p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--lh-muted)]">Confiança</p>
              <p className="text-xs text-[color:var(--lh-soft)]">{triage.confidenceLabel}</p>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1" role="meter" aria-valuemin={1} aria-valuemax={3} aria-valuenow={CONF_STEPS[s.confidence]} aria-label={`Confiança: ${triage.confidenceLabel}`}>
              {[1, 2, 3].map(n => (
                <span key={n} className={cn('h-1.5 rounded-full transition-colors duration-500 motion-reduce:transition-none',
                  n <= CONF_STEPS[s.confidence] ? (s.confidence === 'baixa' ? 'bg-amber-400' : 'bg-[#1677FF]') : 'bg-white/10')} />
              ))}
            </div>

            {s.evidence.length > 0 && (
              <div className="mt-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--lh-muted)]">Por quê</p>
                <ul className="mt-2 space-y-2">
                  {s.evidence.map(ev => (
                    <li key={ev} className="flex gap-2 text-[13px] leading-relaxed text-[color:var(--lh-soft)]">
                      <Quote className="w-3.5 h-3.5 mt-1 flex-shrink-0 text-[#1677FF]" aria-hidden /><span className="italic">{ev}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {s.notes.length > 0 && (
              <ul className="mt-5 space-y-2">
                {s.notes.map(n => (
                  <li key={n} className="flex gap-2 text-[13px] leading-relaxed text-amber-200/90">
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-300" aria-hidden />{n}
                  </li>
                ))}
              </ul>
            )}

            <button type="button" disabled={!triage.canCalculate}
              onClick={() => s.amount && onCalculate({ amount: s.amount, regime, court: example?.court, doubled: mentionsDoubled(s), act: s.actType })}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#1677FF]/50 px-4 py-2.5 text-sm font-semibold text-[color:var(--lh-fg)] transition-colors hover:bg-[#1677FF]/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent">
              <CalendarClock className="w-4 h-4" aria-hidden /> Calcular a data deste prazo
            </button>
            {!triage.canCalculate && text.trim() && (
              <p className="mt-2 text-[11px] text-[color:var(--lh-muted)] text-center">Leitura incerta não preenche o prazo — no sistema, dá para pedir uma segunda leitura à IA.</p>
            )}
          </div>
        </div>
      </div>

      <div className="lg:col-span-2 -mt-8">
        <DemoCta>
          No LegalHub, cada intimação chega com o texto integral, a leitura sugere ato e prazo e você confere antes de criar a
          tarefa — com responsável, prazo interno e aviso antes do vencimento.
        </DemoCta>
      </div>
    </div>
  )
}

// ── (c) Fluxo de caixa ──────────────────────────────────────────────────────

const CHART_H = 200

function FinancePanel() {
  const id = useId()
  const year = useMemo(() => new Date().getFullYear() + (new Date().getMonth() >= 10 ? 1 : 0), [])
  const [items, setItems] = useState<DemoFinanceItem[]>(DEMO_FINANCE_ITEMS)
  const [opening, setOpening] = useState(DEMO_OPENING_BALANCE)
  const cf = useMemo(() => demoCashFlow(items, opening, year), [items, opening, year])
  const [selected, setSelected] = useState<number | null>(null)
  const sel = cf.months[selected ?? cf.lowest.month]

  const patch = (itemId: string, p: Partial<DemoFinanceItem>) => setItems(list => list.map(i => (i.id === itemId ? { ...i, ...p } : i)))

  // Escala: barras = resultado do mês; linha = saldo acumulado. Zero no meio só se houver negativo.
  const maxPos = niceCeil(Math.max(0, ...cf.months.map(m => Math.max(m.result, m.balance))))
  const minNeg = Math.min(0, ...cf.months.map(m => Math.min(m.result, m.balance)))
  const lo = minNeg < 0 ? -niceCeil(minNeg) : 0
  const range = maxPos - lo || 1
  const yPct = (v: number) => ((maxPos - v) / range) * 100
  const zero = yPct(0)
  const linePts = cf.months.map((m, i) => `${(i + 0.5) * (100 / 12)},${yPct(m.balance)}`).join(' ')
  const chartLabel = `Saldo previsto de ${formatBRL(cf.opening)} em janeiro a ${formatBRL(cf.closing)} em dezembro de ${year}; menor saldo em ${MONTHS_SHORT[cf.lowest.month]}: ${formatBRL(cf.lowest.balance)}.`

  return (
    <div className="lhsb-in grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* Lançamentos */}
      <div className="min-w-0">
        <div className="flex items-end justify-between gap-3 mb-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--lh-muted)]">Lançamentos de {year} <span className="normal-case tracking-normal font-normal">(fictícios)</span></p>
        </div>
        <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-[color:var(--lh-border)] bg-[#050b16] px-3.5 py-2.5">
          <label htmlFor={`${id}-opening`} className="text-sm text-[color:var(--lh-soft)]">Saldo em caixa em 1º/jan</label>
          <MoneyInput id={`${id}-opening`} value={opening} onChange={setOpening} allowNegative />
        </div>
        <ul className="divide-y divide-[color:var(--lh-divider)] rounded-xl border border-[color:var(--lh-border)] bg-[#050b16]">
          {items.map(it => (
            <li key={it.id} className={cn('grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3.5 py-3 transition-opacity', !it.enabled && 'opacity-45')}>
              <input type="checkbox" checked={it.enabled} onChange={e => patch(it.id, { enabled: e.target.checked })}
                aria-label={`Incluir ${it.label}`} className="h-4 w-4 rounded accent-[#1677FF]" />
              <div className="min-w-0">
                <p className="truncate text-sm text-[color:var(--lh-fg)]" title={it.label}>{it.label}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[color:var(--lh-muted)]">
                  <span className={cn('inline-block h-1.5 w-1.5 rounded-full', it.type === 'receivable' ? 'bg-[#1677FF]' : 'bg-rose-400')} aria-hidden />
                  {it.type === 'receivable' ? 'Entrada' : 'Saída'} ·{' '}
                  {it.recurring ? 'todo mês' : (
                    <>
                      <label htmlFor={`${id}-m-${it.id}`} className="sr-only">Mês de {it.label}</label>
                      <select id={`${id}-m-${it.id}`} value={it.month} onChange={e => patch(it.id, { month: Number(e.target.value) })}
                        className="rounded bg-transparent text-[11px] text-[color:var(--lh-soft)] underline decoration-dotted underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1677FF] [color-scheme:dark]">
                        {MONTHS_SHORT.map((m, i) => <option key={m} value={i}>em {m}</option>)}
                      </select>
                    </>
                  )}
                </p>
              </div>
              <MoneyInput id={`${id}-a-${it.id}`} label={`Valor de ${it.label}`} value={it.amount} onChange={v => patch(it.id, { amount: v })} disabled={!it.enabled} />
            </li>
          ))}
        </ul>
      </div>

      {/* Fluxo */}
      <div className="min-w-0">
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-[color:var(--lh-border)] bg-[color:var(--lh-border)]">
          {[
            ['Entradas no ano', formatBRL(cf.totalIncome, { compact: true }), 'text-[color:var(--lh-fg)]'],
            ['Saídas no ano', formatBRL(cf.totalExpense, { compact: true }), 'text-[color:var(--lh-fg)]'],
            ['Saldo em dez', formatBRL(cf.closing, { compact: true }), cf.closing < 0 ? 'text-rose-300' : 'text-[#8fbaff]'],
          ].map(([k, v, c]) => (
            <div key={k} className="bg-[#030a17] p-3 sm:p-4">
              <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--lh-muted)]">{k}</p>
              <p className={cn('lhsb-num mt-1 text-base sm:text-xl font-semibold tracking-[-0.02em]', c)}>{v}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-xl border border-[color:var(--lh-border)] bg-[#050b16] p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--lh-muted)]">Fluxo de caixa previsto</p>
            <div className="flex gap-3 text-[11px] text-[color:var(--lh-muted)]" aria-hidden>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#1677FF]" />Resultado do mês</span>
              <span className="flex items-center gap-1.5"><span className="h-0.5 w-3.5 rounded-full bg-white" />Saldo acumulado</span>
            </div>
          </div>

          <div className="relative" role="img" aria-label={chartLabel} style={{ height: CHART_H }}>
            {/* zero */}
            <div className="absolute inset-x-0 border-t border-dashed border-white/15" style={{ top: `${zero}%` }} aria-hidden />
            <span className="lhsb-num absolute right-0 -translate-y-full pb-0.5 text-[10px] text-[color:var(--lh-muted)]" style={{ top: `${zero}%` }} aria-hidden>R$ 0</span>
            <span className="lhsb-num absolute right-0 top-0 text-[10px] text-[color:var(--lh-muted)]" aria-hidden>{formatBRL(maxPos, { compact: true })}</span>
            {/* barras */}
            <div className="absolute inset-0 grid grid-cols-12" aria-hidden>
              {cf.months.map(m => {
                const top = m.result >= 0 ? yPct(m.result) : zero
                const h = Math.abs(yPct(m.result) - zero)
                const active = (selected ?? cf.lowest.month) === m.month
                return (
                  <div key={m.month} className="relative">
                    <div className={cn('lhsb-bar absolute left-[22%] right-[22%] rounded-[3px]',
                      m.result >= 0 ? 'bg-[#1677FF]' : 'bg-rose-400/80', !active && 'opacity-55')}
                      style={{ top: `${top}%`, height: `${Math.max(h, 0.6)}%` }} />
                  </div>
                )
              })}
            </div>
            {/* linha do saldo */}
            <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
              <polyline points={linePts} fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </svg>
            {/* pontos do saldo (HTML, para não distorcer) */}
            <div className="absolute inset-0 grid grid-cols-12 pointer-events-none" aria-hidden>
              {cf.months.map(m => (
                <div key={m.month} className="relative">
                  <span className={cn('absolute left-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white transition-[top] duration-500 motion-reduce:transition-none',
                    m.balance < 0 ? 'bg-rose-400' : 'bg-[#030a17]')}
                    style={{ top: `${yPct(m.balance)}%` }} />
                </div>
              ))}
            </div>
          </div>

          {/* meses: botões que detalham o mês */}
          <div className="mt-2 grid grid-cols-12" role="group" aria-label="Detalhar mês">
            {cf.months.map(m => {
              const active = (selected ?? cf.lowest.month) === m.month
              return (
                <button key={m.month} type="button" onClick={() => setSelected(m.month)} aria-pressed={active}
                  aria-label={`${MONTHS_SHORT[m.month]}: saldo ${formatBRL(m.balance)}`}
                  className={cn('rounded py-1 text-[10px] sm:text-[11px] uppercase transition-colors',
                    active ? 'text-[color:var(--lh-fg)] font-semibold' : 'text-[color:var(--lh-muted)] hover:text-[color:var(--lh-fg)]',
                    m.balance < 0 && !active && 'text-rose-300/80')}>
                  {m.label}
                </button>
              )
            })}
          </div>

          <dl key={sel.month} className="lhsb-in mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-[color:var(--lh-divider)] pt-3 text-[12px]">
            {[
              ['Entradas', formatBRL(sel.income)],
              ['Saídas', formatBRL(sel.expense)],
              ['Resultado', formatBRL(sel.result)],
              [`Saldo fim de ${sel.label}`, formatBRL(sel.balance)],
            ].map(([k, v], i) => (
              <div key={k}>
                <dt className="text-[color:var(--lh-muted)]">{k}</dt>
                <dd className={cn('lhsb-num font-semibold', (i >= 2 && (i === 2 ? sel.result : sel.balance) < 0) ? 'text-rose-300' : 'text-[color:var(--lh-fg)]')}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p aria-live="polite" className={cn('mt-4 flex gap-2 text-[13px] leading-relaxed', cf.negativeMonths.length ? 'text-amber-200/90' : 'text-[color:var(--lh-ok)]')}>
          {cf.negativeMonths.length ? (
            <>
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-300" aria-hidden />
              O saldo fica negativo em {cf.negativeMonths.map(m => MONTHS_SHORT[m]).join(', ')} — menor saldo {formatBRL(cf.lowest.balance)} em {MONTHS_SHORT[cf.lowest.month]}.
              Tente mudar o mês da perícia ou o valor dos honorários.
            </>
          ) : (
            <>O caixa fica positivo o ano todo — menor saldo {formatBRL(cf.lowest.balance)} em {MONTHS_SHORT[cf.lowest.month]}.</>
          )}
        </p>
      </div>

      <div className="lg:col-span-2 -mt-8">
        <DemoCta>
          No LegalHub, o fluxo de caixa sai dos seus lançamentos reais — recorrências projetadas mês a mês, previsto × realizado
          e aviso do mês que vai fechar no vermelho. {TRIAL_DAYS} dias grátis, sem cartão para começar.
        </DemoCta>
      </div>
    </div>
  )
}

function MoneyInput({ id, value, onChange, label, disabled, allowNegative }: {
  id: string; value: number; onChange: (n: number) => void; label?: string; disabled?: boolean; allowNegative?: boolean
}) {
  return (
    <div className={cn('flex items-center gap-1 rounded-lg border border-[color:var(--lh-border)] bg-[#030a17] px-2 focus-within:border-[#1677FF]', disabled && 'pointer-events-none')}>
      <span className="text-[11px] text-[color:var(--lh-muted)]" aria-hidden>R$</span>
      <input id={id} type="number" inputMode="decimal" step={100} min={allowNegative ? undefined : 0} max={999999}
        aria-label={label} disabled={disabled}
        value={Number.isFinite(value) ? value : ''}
        onChange={e => {
          const n = Number(e.target.value)
          onChange(e.target.value === '' || !Number.isFinite(n) ? 0 : Math.min(999999, allowNegative ? n : Math.max(0, n)))
        }}
        className="lhsb-num w-[5.5rem] bg-transparent py-1.5 text-right text-sm text-[color:var(--lh-fg)] focus:outline-none [color-scheme:dark]" />
    </div>
  )
}
