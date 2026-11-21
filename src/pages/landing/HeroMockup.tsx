import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  Bell, Briefcase, CalendarDays, CheckSquare, DollarSign, LayoutDashboard, Newspaper, Pause, Play, Search, Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { CountUp, useInView, useMediaQuery, usePrefersReducedMotion } from './landingMotion'

/**
 * Hero "entre no sistema": o painel do LegalHub desenhado em React/CSS (não é
 * imagem nem vídeo). Todos os dados são fictícios.
 *
 * - Tilt 3D sutil (até 6°) seguindo o mouse + parallax em camadas (CSS vars --mx/--my).
 * - Contadores animando quando o painel aparece.
 * - História em loop no Painel: chega uma intimação (toast) → cursor fantasma clica em
 *   "Criar tarefa de prazo" → a tarefa entra na lista → o prazo aparece na agenda.
 * - Desktop alto: a área fica "presa" (sticky) e a rolagem troca Painel → Processos → Prazos.
 *   Celular, telas baixas e prefers-reduced-motion: sem sticky, troca pelos botões; com
 *   movimento reduzido, tudo estático no estado final (tarefa e prazo já na agenda).
 */

type ScreenId = 'painel' | 'processos' | 'prazos'

const SCREENS: { id: ScreenId; label: string; caption: string; path: string }[] = [
  { id: 'painel', label: 'Painel', caption: 'O dia do escritório numa tela', path: '/dashboard' },
  { id: 'processos', label: 'Processos', caption: 'Fase e próximo prazo de cada caso', path: '/processos' },
  { id: 'prazos', label: 'Prazos', caption: 'Intimação vira tarefa com data fatal', path: '/tarefas' },
]

const NAV: { icon: React.ElementType; label: string; screen?: ScreenId }[] = [
  { icon: LayoutDashboard, label: 'Dashboard', screen: 'painel' },
  { icon: CalendarDays, label: 'Agenda' },
  { icon: CheckSquare, label: 'Atividades', screen: 'prazos' },
  { icon: Users, label: 'Clientes' },
  { icon: Briefcase, label: 'Processos', screen: 'processos' },
  { icon: Newspaper, label: 'Intimações' },
  { icon: DollarSign, label: 'Financeiro' },
]

// ── História da intimação (só no Painel) ─────────────────────────────────────
type Phase = 'idle' | 'toast' | 'aim' | 'click' | 'task' | 'aimAgenda' | 'agenda' | 'reset'
const PHASES: [Phase, number][] = [
  ['idle', 1500], ['toast', 1500], ['aim', 950], ['click', 420], ['task', 1500],
  ['aimAgenda', 1000], ['agenda', 3000], ['reset', 700],
]

const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'

export function HeroMockup() {
  const reduced = usePrefersReducedMotion()
  const tall = useMediaQuery('(min-width: 1024px) and (min-height: 760px)')
  const finePointer = useMediaQuery('(hover: hover) and (pointer: fine)')
  const pinned = tall && !reduced

  const trackRef = useRef<HTMLDivElement>(null)
  const stickyRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef<HTMLSpanElement>(null)

  const [screen, setScreen] = useState<ScreenId>('painel')
  const [paused, setPaused] = useState(false)
  const inView = useInView(stageRef, { threshold: 0.25 })
  const [seen, setSeen] = useState(false)
  useEffect(() => { if (inView) setSeen(true) }, [inView])

  // ── Rolagem presa: progresso 0..1 → tela ativa + barra de progresso ──
  useEffect(() => {
    const track = trackRef.current
    const sticky = stickyRef.current
    if (!pinned) {
      track?.style.setProperty('--p', '0.5')
      return
    }
    if (!track || !sticky) return
    let raf = 0
    const update = () => {
      raf = 0
      const top = parseFloat(getComputedStyle(sticky).top) || 0
      const span = track.offsetHeight - sticky.offsetHeight
      const p = span > 0 ? Math.min(1, Math.max(0, (top - track.getBoundingClientRect().top) / span)) : 0
      track.style.setProperty('--p', p.toFixed(4))
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${p})`
      const next: ScreenId = p < 1 / 3 ? 'painel' : p < 2 / 3 ? 'processos' : 'prazos'
      setScreen(prev => (prev === next ? prev : next))
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [pinned])

  // Sem rolagem presa a barra acompanha o botão escolhido.
  useEffect(() => {
    if (pinned || !progressRef.current) return
    const i = SCREENS.findIndex(s => s.id === screen)
    progressRef.current.style.transform = `scaleX(${(i + 1) / SCREENS.length})`
  }, [pinned, screen])

  // ── Tilt + parallax pelo mouse (só ponteiro fino e sem movimento reduzido) ──
  useEffect(() => {
    const stage = stageRef.current
    if (!stage || reduced || !finePointer) return
    let raf = 0
    let mx = 0
    let my = 0
    const write = () => {
      raf = 0
      stage.style.setProperty('--mx', mx.toFixed(3))
      stage.style.setProperty('--my', my.toFixed(3))
    }
    const onMove = (e: PointerEvent) => {
      const r = stage.getBoundingClientRect()
      mx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2))
      my = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2))
      if (!raf) raf = requestAnimationFrame(write)
    }
    const onLeave = () => { mx = 0; my = 0; if (!raf) raf = requestAnimationFrame(write) }
    stage.addEventListener('pointermove', onMove)
    stage.addEventListener('pointerleave', onLeave)
    return () => {
      stage.removeEventListener('pointermove', onMove)
      stage.removeEventListener('pointerleave', onLeave)
      cancelAnimationFrame(raf)
      stage.style.setProperty('--mx', '0')
      stage.style.setProperty('--my', '0')
    }
  }, [reduced, finePointer])

  // ── História da intimação ──
  const [phaseIdx, setPhaseIdx] = useState(0)
  const running = screen === 'painel' && inView && !paused && !reduced
  useEffect(() => {
    if (!running) return
    const t = window.setTimeout(() => setPhaseIdx(i => (i + 1) % PHASES.length), PHASES[phaseIdx][1])
    return () => window.clearTimeout(t)
  }, [running, phaseIdx])
  const phase: Phase = reduced ? 'agenda' : PHASES[phaseIdx][0]
  const at = (...ps: Phase[]) => ps.includes(phase)
  const story = {
    toast: at('toast', 'aim', 'click'),
    arrived: at('toast', 'aim', 'click', 'task', 'aimAgenda', 'agenda'),
    task: at('task', 'aimAgenda', 'agenda'),
    event: at('agenda'),
    pressing: at('click'),
    cursor: !reduced && at('aim', 'click', 'task', 'aimAgenda', 'agenda'),
    cursorTarget: (at('aimAgenda', 'agenda') ? 'agenda' : at('aim', 'click', 'task') ? 'button' : 'rest') as 'agenda' | 'button' | 'rest',
  }

  function goTo(i: number) {
    const id = SCREENS[i].id
    if (!pinned) { setScreen(id); return }
    const track = trackRef.current
    const sticky = stickyRef.current
    if (!track || !sticky) return
    const top = parseFloat(getComputedStyle(sticky).top) || 0
    const span = track.offsetHeight - sticky.offsetHeight
    const y = window.scrollY + track.getBoundingClientRect().top - top + span * ((i + 0.5) / SCREENS.length)
    window.scrollTo({ top: y, behavior: 'smooth' })
  }

  const active = SCREENS.find(s => s.id === screen)!

  return (
    <div
      ref={trackRef}
      className="relative max-w-6xl mx-auto mt-14 sm:mt-20"
      style={{ '--p': 0.5 } as React.CSSProperties}
    >
      <style>{HERO_CSS}</style>
      <div
        ref={stickyRef}
        className={cn(pinned && 'sticky')}
        style={pinned ? { top: 'calc(84px + var(--promo-bar-h, 0px))' } : undefined}
      >
        {/* Palco: perspectiva + variáveis do mouse */}
        <div ref={stageRef} className="lhm-stage relative" style={{ '--mx': 0, '--my': 0 } as React.CSSProperties}>
          {/* Camada de fundo: grade pontilhada que corre ao contrário do mouse */}
          <div aria-hidden className="lhm-layer-back pointer-events-none absolute -inset-x-6 -inset-y-8 sm:-inset-x-16 sm:-inset-y-12 -z-10"
            style={{
              backgroundImage: 'radial-gradient(rgba(22,119,255,0.22) 1px, transparent 1px)',
              backgroundSize: '22px 22px',
              maskImage: 'radial-gradient(ellipse 60% 55% at 50% 50%, black, transparent)',
              WebkitMaskImage: 'radial-gradient(ellipse 60% 55% at 50% 50%, black, transparent)',
            }} />

          <div className="lhm-tilt relative">
            <p className="sr-only">
              Demonstração animada do LegalHub com dados fictícios: uma intimação do DJEN chega no painel, vira uma
              tarefa de prazo com data fatal e aparece na agenda. Tela atual: {active.label}.
            </p>

            <AppFrame path={active.path}>
              <div className="flex h-[548px] sm:h-[452px] lg:h-[456px]">
                <AppSidebar screen={screen} />
                <div className="relative flex-1 min-w-0 overflow-hidden">
                  <Screen show={screen === 'painel'}>
                    <PainelScreen story={story} counting={seen} />
                  </Screen>
                  <Screen show={screen === 'processos'}>
                    <ProcessosScreen active={screen === 'processos'} />
                  </Screen>
                  <Screen show={screen === 'prazos'}>
                    <PrazosScreen active={screen === 'prazos'} />
                  </Screen>
                </div>
              </div>
            </AppFrame>

            {/* Camada da frente (desktop): selos que flutuam mais que a tela */}
            <div aria-hidden className="lhm-layer-front hidden lg:flex absolute -left-14 top-[18%] items-center gap-3 rounded-2xl border border-white/10 bg-[#0b1220] px-4 py-3 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)]">
              <span className="relative flex h-2 w-2">
                <span className="lhm-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span className="text-left leading-tight">
                <span className="block text-xs font-semibold text-white">DJEN sincronizado</span>
                <span className="block text-[11px] text-[#A7B0C0]">pela sua OAB, toda madrugada</span>
              </span>
            </div>
            <div aria-hidden className="lhm-layer-front lhm-layer-front-2 hidden lg:flex absolute -right-12 bottom-[16%] items-center gap-3 rounded-2xl border border-white/10 bg-[#0b1220] px-4 py-3 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)]">
              <span className="w-8 h-8 rounded-lg bg-[#1677FF]/15 flex items-center justify-center">
                <CalendarDays className="w-4 h-4 text-[#1677FF]" />
              </span>
              <span className="text-left leading-tight">
                <span className="block text-xs font-semibold text-white">15 dias úteis contados</span>
                <span className="block text-[11px] text-[#A7B0C0]">com o calendário do tribunal</span>
              </span>
            </div>
          </div>
        </div>

        {/* Trilho de telas */}
        <div className="mt-4 sm:mt-5 flex items-stretch gap-3">
          <div className="relative flex-1 grid grid-cols-3 gap-1.5 sm:gap-2" role="group" aria-label="Telas da demonstração">
            <span aria-hidden className="absolute left-0 right-0 -top-px h-px bg-white/10" />
            <span ref={progressRef} aria-hidden className="absolute left-0 right-0 -top-px h-px bg-[#1677FF] origin-left"
              style={{ transform: 'scaleX(0.333)', transition: pinned ? 'none' : `transform 600ms ${EASE}` }} />
            {SCREENS.map((s, i) => {
              const on = s.id === screen
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => goTo(i)}
                  aria-pressed={on}
                  className={cn(
                    'text-left pt-3 pb-1 px-0.5 transition-colors rounded-sm',
                    on ? 'text-white' : 'text-[#A7B0C0] hover:text-white',
                  )}
                >
                  <span className="flex items-baseline gap-2">
                    <span className={cn('font-mono text-[10px] tabular-nums', on ? 'text-[#1677FF]' : 'opacity-60')}>0{i + 1}</span>
                    <span className="text-sm font-semibold tracking-[-0.01em]">{s.label}</span>
                  </span>
                  <span className="hidden sm:block mt-0.5 text-xs text-[#A7B0C0] leading-snug">{s.caption}</span>
                </button>
              )
            })}
          </div>
          {!reduced && (
            <button
              type="button"
              onClick={() => setPaused(p => !p)}
              aria-pressed={paused}
              aria-label={paused ? 'Retomar animação da demonstração' : 'Pausar animação da demonstração'}
              className="self-center flex-shrink-0 w-9 h-9 rounded-full border border-white/15 flex items-center justify-center text-[#A7B0C0] hover:text-white hover:border-white/30 transition-colors"
            >
              {paused ? <Play className="w-3.5 h-3.5" fill="currentColor" /> : <Pause className="w-3.5 h-3.5" fill="currentColor" />}
            </button>
          )}
        </div>
        <p className="mt-2 text-[11px] text-[#A7B0C0]/70">Tela ilustrativa com dados fictícios.</p>
      </div>

      {/* Espaço de rolagem enquanto a tela fica presa */}
      {pinned && <div aria-hidden style={{ height: '150vh' }} />}
    </div>
  )
}

// ── Moldura e casca do app ───────────────────────────────────────────────────

function AppFrame({ path, children }: { path: string; children: React.ReactNode }) {
  return (
    <div aria-hidden className="relative rounded-xl sm:rounded-2xl overflow-hidden border border-white/10 bg-[#0b1220]"
      style={{ boxShadow: '0 50px 120px -30px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.03)' }}>
      <div className="flex items-center gap-3 px-3 sm:px-4 h-8 sm:h-9 border-b border-white/[0.06] bg-[#0e1729]">
        <div className="flex gap-1.5 flex-shrink-0">
          <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
          <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
          <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
        </div>
        <div className="flex-1 min-w-0 flex justify-center">
          <span className="truncate max-w-xs w-full text-center text-[10px] sm:text-[11px] text-[#A7B0C0] bg-white/[0.05] rounded-md px-3 py-0.5">
            legalhubgestor.vercel.app<span className="text-white/80">{path}</span>
          </span>
        </div>
        <span className="w-10 flex-shrink-0" />
      </div>
      {children}
    </div>
  )
}

function AppSidebar({ screen }: { screen: ScreenId }) {
  return (
    <div className="hidden sm:flex flex-col w-12 lg:w-[168px] flex-shrink-0 bg-[#060d1a] border-r border-white/[0.06] py-3 px-2 gap-0.5">
      <div className="flex items-center gap-2 px-1.5 mb-3">
        <span className="w-6 h-6 rounded-md overflow-hidden bg-[#06152D] flex-shrink-0">
          <img src="/logomarca.png" alt="" className="w-full h-full object-cover" style={{ objectPosition: '0% 50%' }} />
        </span>
        <span className="hidden lg:block text-[13px] font-bold tracking-tight text-white">LegalHub</span>
      </div>
      {NAV.map(item => {
        const on = item.screen === screen
        return (
          <span key={item.label}
            className={cn(
              'relative flex items-center gap-2.5 rounded-lg px-2 h-8 text-[12px] transition-colors duration-300',
              on ? 'bg-white/[0.07] text-white' : 'text-white/45',
            )}>
            <item.icon className="w-[15px] h-[15px] flex-shrink-0" />
            <span className="hidden lg:block truncate">{item.label}</span>
            {on && <span className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-l-full bg-[#1677FF]" />}
          </span>
        )
      })}
    </div>
  )
}

function Screen({ show, children }: { show: boolean; children: React.ReactNode }) {
  return (
    <div
      className="absolute inset-0 p-3 sm:p-5 flex flex-col"
      style={{
        opacity: show ? 1 : 0,
        transform: show ? 'none' : 'translateY(14px) scale(0.985)',
        transition: `opacity 450ms ${EASE}, transform 650ms ${EASE}`,
        visibility: show ? 'visible' : 'hidden',
        transitionProperty: 'opacity, transform, visibility',
      }}
    >
      {children}
    </div>
  )
}

function TopBar({ title, sub, alerts = 0 }: { title: string; sub: string; alerts?: number }) {
  return (
    <div className="flex items-center gap-3 mb-3 sm:mb-4">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] sm:text-[15px] font-semibold tracking-[-0.01em] text-white truncate">{title}</p>
        <p className="text-[10px] sm:text-[11px] text-[#A7B0C0] truncate">{sub}</p>
      </div>
      <span className="hidden md:flex items-center gap-2 w-44 h-7 rounded-md bg-white/[0.04] border border-white/[0.06] px-2 text-[11px] text-white/35">
        <Search className="w-3 h-3" /> Buscar processo, cliente…
      </span>
      <span className="relative w-7 h-7 rounded-md bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
        <Bell className="w-3.5 h-3.5 text-white/60" />
        {alerts > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-[#1677FF] text-[9px] font-bold text-white flex items-center justify-center tabular-nums">
            {alerts}
          </span>
        )}
      </span>
      <span className="w-7 h-7 rounded-full bg-[#1677FF]/20 text-[#7fb2ff] text-[10px] font-bold flex items-center justify-center">MS</span>
    </div>
  )
}

const TAG_TONE = {
  prazo: 'bg-amber-400/10 text-amber-300',
  audiencia: 'bg-[#1677FF]/15 text-[#7fb2ff]',
  doc: 'bg-white/[0.06] text-white/60',
  ok: 'bg-emerald-400/10 text-emerald-300',
} as const

function Tag({ tone, children }: { tone: keyof typeof TAG_TONE; children: React.ReactNode }) {
  return <span className={cn('inline-flex items-center px-1.5 py-[1px] rounded text-[9px] sm:text-[10px] font-semibold whitespace-nowrap', TAG_TONE[tone])}>{children}</span>
}

// ── Tela 1: Painel (com a história da intimação) ─────────────────────────────

interface Story {
  toast: boolean
  arrived: boolean
  task: boolean
  event: boolean
  pressing: boolean
  cursor: boolean
  cursorTarget: 'agenda' | 'button' | 'rest'
}

const PAINEL_TASKS = [
  { title: 'Contrarrazões de apelação', meta: '0811032-40.2025.8.15.2001', tag: <Tag tone="prazo">Prazo</Tag>, when: 'fatal 10/12' },
  { title: 'Audiência de conciliação', meta: 'CEJUSC · João Pessoa', tag: <Tag tone="audiencia">Audiência</Tag>, when: '03/12 · 14h' },
  { title: 'Enviar procuração para assinatura', meta: 'Cliente: Ana Beatriz Lins', tag: <Tag tone="doc">Documento</Tag>, when: 'hoje' },
]

// Dezembro/2026 começa numa terça (grade de segunda a domingo).
const DEC_OFFSET = 1
const DEC_DOTS = new Set([3, 10])

function PainelScreen({ story, counting }: { story: Story; counting: boolean }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLSpanElement>(null)
  const dayRef = useRef<HTMLSpanElement>(null)
  const eventRef = useRef<HTMLDivElement>(null)
  const [cursor, setCursor] = useState({ x: 0, y: 0 })

  const place = useCallback(() => {
    const box = boxRef.current
    if (!box) return
    const b = box.getBoundingClientRect()
    let el: HTMLElement | null = null
    if (story.cursorTarget === 'button') el = btnRef.current
    if (story.cursorTarget === 'agenda') el = dayRef.current && dayRef.current.offsetWidth > 0 ? dayRef.current : eventRef.current
    if (!el) { setCursor({ x: b.width * 0.55, y: b.height + 30 }); return }
    const r = el.getBoundingClientRect()
    setCursor({ x: r.left - b.left + r.width * 0.55, y: r.top - b.top + r.height * 0.6 })
  }, [story.cursorTarget])

  useLayoutEffect(() => { place() }, [place, story.event, story.task])

  const stats = [
    { label: 'Prazos na semana', value: 4 + (story.task ? 1 : 0), hot: story.task },
    { label: 'Intimações novas', value: 6 + (story.arrived ? 1 : 0), hot: story.arrived && !story.task },
    { label: 'Atividades pendentes', value: 23 + (story.task ? 1 : 0), hot: false },
    { label: 'Processos ativos', value: 312, hot: false },
  ]

  return (
    <div ref={boxRef} className="relative flex-1 flex flex-col min-h-0">
      <TopBar title="Bom dia, Dra. Marina" sub="segunda-feira, 23 de novembro" alerts={story.arrived ? 1 : 0} />

      {/* Contadores */}
      <div className="lhm-par-1 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {stats.map(s => (
          <div key={s.label}
            className={cn('rounded-lg sm:rounded-xl border p-2.5 sm:p-3 transition-colors duration-500',
              s.hot ? 'border-[#1677FF]/50 bg-[#1677FF]/[0.08]' : 'border-white/[0.07] bg-white/[0.025]')}>
            <p className="text-[9px] sm:text-[10px] uppercase tracking-[0.08em] text-[#A7B0C0] truncate">{s.label}</p>
            <CountUp value={s.value} start={counting} className="block mt-0.5 text-lg sm:text-[26px] font-bold tracking-[-0.03em] text-white tabular-nums leading-tight" />
          </div>
        ))}
      </div>

      <div className="mt-3 sm:mt-4 grid grid-cols-1 sm:grid-cols-5 gap-3 min-h-0">
        {/* Atividades */}
        <div className="lhm-par-2 sm:col-span-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-2.5 sm:p-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] sm:text-xs font-semibold text-white">Atividades de hoje</p>
            <span className="text-[10px] text-[#A7B0C0]">ver todas</span>
          </div>
          <div className={cn('grid transition-[grid-template-rows] duration-700', story.task ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}
            style={{ transitionTimingFunction: EASE }}>
            <div className="overflow-hidden">
              <div className={cn('flex items-center gap-2.5 rounded-lg px-2 py-2 my-0.5 transition-colors duration-1000',
                story.task && !story.event ? 'bg-[#1677FF]/[0.14]' : 'bg-[#1677FF]/[0.06]')}>
                <span className="w-3.5 h-3.5 rounded border border-[#1677FF]/70 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] sm:text-[12px] font-medium text-white truncate">Réplica à contestação</p>
                  <p className="text-[10px] text-[#A7B0C0] truncate">0804417-21.2026.8.15.2001 · criada da intimação</p>
                </div>
                <Tag tone="prazo">Prazo</Tag>
                <span className="hidden md:block text-[10px] text-amber-300 tabular-nums whitespace-nowrap">fatal 14/12</span>
              </div>
            </div>
          </div>
          {PAINEL_TASKS.map((t, i) => (
            <div key={t.title} className={cn('items-center gap-2.5 px-2 py-2 border-t border-white/[0.05] first:border-t-0', i === 2 ? 'hidden sm:flex' : 'flex')}>
              <span className="w-3.5 h-3.5 rounded border border-white/25 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] sm:text-[12px] font-medium text-white/90 truncate">{t.title}</p>
                <p className="text-[10px] text-[#A7B0C0] truncate">{t.meta}</p>
              </div>
              {t.tag}
              <span className="hidden md:block text-[10px] text-[#A7B0C0] tabular-nums whitespace-nowrap">{t.when}</span>
            </div>
          ))}
        </div>

        {/* Agenda */}
        <div className="lhm-par-2 sm:col-span-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-2.5 sm:p-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] sm:text-xs font-semibold text-white">Agenda</p>
            <span className="text-[10px] text-[#A7B0C0]">dezembro</span>
          </div>
          <div className="hidden sm:grid grid-cols-7 gap-y-0.5 text-center">
            {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((d, i) => (
              <span key={i} className="text-[9px] text-white/30 font-semibold">{d}</span>
            ))}
            {Array.from({ length: DEC_OFFSET }, (_, i) => <span key={`b${i}`} />)}
            {Array.from({ length: 31 }, (_, i) => {
              const day = i + 1
              const weekend = (i + DEC_OFFSET) % 7 >= 5
              const target = day === 14
              const lit = target && story.event
              return (
                <span key={day} ref={target ? dayRef : undefined}
                  className={cn('relative mx-auto w-[22px] h-[20px] lg:h-[19px] flex items-center justify-center rounded-md text-[10px] tabular-nums transition-colors duration-500',
                    lit ? 'bg-[#1677FF] text-white font-bold' : weekend ? 'text-white/25' : 'text-white/65')}>
                  {day}
                  {(DEC_DOTS.has(day) || lit) && (
                    <span className={cn('absolute bottom-[1px] w-1 h-1 rounded-full', lit ? 'bg-white' : 'bg-amber-300')} />
                  )}
                </span>
              )
            })}
          </div>
          <div className="sm:mt-2 sm:pt-2 sm:border-t border-white/[0.06] space-y-1">
            <AgendaItem day="03/12" title="Audiência de conciliação" hint="14h" />
            <AgendaItem day="10/12" title="Fatal · Contrarrazões" hint="prazo" className="hidden sm:flex" />
            <div className={cn('grid transition-[grid-template-rows] duration-700', story.event ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}
              style={{ transitionTimingFunction: EASE }}>
              <div className="overflow-hidden">
                <div ref={eventRef}>
                  <AgendaItem day="14/12" title="Fatal · Réplica à contestação" hint="novo" highlight />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toast da intimação chegando */}
      <div
        className="lhm-par-3 absolute top-0 right-0 left-0 sm:left-auto sm:w-[300px] z-10"
        style={{
          opacity: story.toast ? 1 : 0,
          transform: story.toast ? 'translate3d(calc(var(--mx) * 8px), calc(var(--my) * 6px), 0)' : 'translate3d(24px, -6px, 0) scale(0.97)',
          transition: `opacity 400ms ${EASE}, transform 700ms ${EASE}`,
        }}
      >
        <div className="rounded-xl border border-white/[0.12] bg-[#101b31] p-3 shadow-[0_24px_50px_-16px_rgba(0,0,0,0.9)]">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 w-7 h-7 rounded-lg bg-[#1677FF]/15 flex items-center justify-center flex-shrink-0">
              <Bell className="w-3.5 h-3.5 text-[#1677FF]" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-white">Nova intimação · DJEN</p>
              <p className="text-[10px] text-[#A7B0C0]">TJPB · 2ª Vara Cível de João Pessoa</p>
              <p className="mt-1 text-[11px] leading-snug text-white/80">“Intime-se a parte autora para, no prazo de 15 dias, apresentar réplica à contestação.”</p>
            </div>
          </div>
          <div className="mt-2.5 flex items-center justify-end gap-2">
            <span className="text-[10px] text-[#A7B0C0] px-2 py-1">Depois</span>
            <span ref={btnRef}
              className={cn('text-[10px] font-semibold text-white px-2.5 py-1.5 rounded-md bg-[#0B5CFF] transition-transform duration-150',
                story.pressing && 'scale-95 brightness-110')}>
              Criar tarefa de prazo
            </span>
          </div>
        </div>
      </div>

      {/* Cursor fantasma */}
      <div
        className="pointer-events-none absolute left-0 top-0 z-20"
        style={{
          transform: `translate3d(${cursor.x}px, ${cursor.y}px, 0)`,
          opacity: story.cursor ? 1 : 0,
          transition: `transform 900ms cubic-bezier(0.65, 0, 0.35, 1), opacity 300ms ease`,
        }}
      >
        <span className={cn('absolute -left-3 -top-3 w-6 h-6 rounded-full border-2 border-[#1677FF]', story.pressing ? 'lhm-ripple' : 'opacity-0')} />
        <svg width="18" height="20" viewBox="0 0 18 20" className={cn('drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)] transition-transform duration-150', story.pressing && 'scale-90')}>
          <path d="M1.5 1.5 L1.5 16 L5.4 12.4 L8.2 18.4 L10.9 17.2 L8.2 11.3 L13.6 11.3 Z" fill="#fff" stroke="#05070c" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  )
}

function AgendaItem({ day, title, hint, highlight, className }: { day: string; title: string; hint: string; highlight?: boolean; className?: string }) {
  return (
    <div className={cn('items-center gap-2 rounded-md px-1.5 py-1.5', highlight ? 'bg-[#1677FF]/[0.12]' : '', className ?? 'flex')}>
      <span className={cn('text-[10px] font-semibold tabular-nums w-9 flex-shrink-0', highlight ? 'text-[#7fb2ff]' : 'text-white/55')}>{day}</span>
      <span className="flex-1 min-w-0 text-[11px] text-white/85 truncate">{title}</span>
      <span className={cn('text-[9px] uppercase tracking-wide', highlight ? 'text-[#7fb2ff] font-bold' : 'text-white/35')}>{hint}</span>
    </div>
  )
}

// ── Tela 2: Processos ────────────────────────────────────────────────────────

const PROCESSOS: { number: string; client: string; court: string; phase: string; tone: keyof typeof TAG_TONE; next: string }[] = [
  { number: '0804417-21.2026.8.15.2001', client: 'Ana Beatriz Lins', court: 'TJPB', phase: 'Conhecimento', tone: 'audiencia', next: '14/12' },
  { number: '0000873-55.2026.5.13.0003', client: 'Carlos Eduardo Pires', court: 'TRT13', phase: 'Conhecimento', tone: 'audiencia', next: '01/12' },
  { number: '0812290-08.2025.4.05.8200', client: 'Josefa M. da Silva', court: 'TRF5', phase: 'Recursal', tone: 'prazo', next: '07/12' },
  { number: 'Req. INSS 1.842.337.905', client: 'Severino A. Costa', court: 'INSS', phase: 'Em exigência', tone: 'prazo', next: '30/11' },
  { number: '0002101-14.2025.5.13.0022', client: 'Luana T. Ramos', court: 'TRT13', phase: 'Execução', tone: 'ok', next: '02/12' },
  { number: '0801156-73.2024.8.15.0751', client: 'Mercearia Bom Preço Ltda', court: 'TJPB', phase: 'Execução', tone: 'ok', next: '—' },
]

function ProcessosScreen({ active }: { active: boolean }) {
  return (
    <>
      <TopBar title="Processos" sub="312 ativos · 41 administrativos" />
      <div className="flex gap-1.5 mb-3">
        {[['Todos', '312'], ['Judiciais', '271'], ['Administrativos', '41']].map(([l, n], i) => (
          <span key={l} className={cn('text-[10px] sm:text-[11px] px-2 py-1 rounded-md border whitespace-nowrap',
            i === 0 ? 'border-[#1677FF]/50 bg-[#1677FF]/10 text-white' : 'border-white/[0.08] text-[#A7B0C0]')}>
            {l} <span className="tabular-nums opacity-60">{n}</span>
          </span>
        ))}
      </div>
      <div className="lhm-par-2 rounded-xl border border-white/[0.07] overflow-hidden">
        <div className="hidden sm:grid grid-cols-[1.6fr_1.2fr_0.9fr_0.6fr] gap-3 px-3 py-2 bg-white/[0.03] text-[9px] uppercase tracking-[0.08em] text-white/40 font-semibold">
          <span>Número</span><span>Cliente</span><span>Fase</span><span className="text-right">Próx. prazo</span>
        </div>
        {PROCESSOS.map((p, i) => (
          <div key={p.number}
            className={cn('grid grid-cols-[1fr_auto] sm:grid-cols-[1.6fr_1.2fr_0.9fr_0.6fr] items-center gap-x-3 gap-y-0.5 px-3 py-2.5 border-t border-white/[0.05] first:border-t-0',
              active && 'lhm-row-in')}
            style={{ animationDelay: `${120 + i * 70}ms` }}>
            <span className="min-w-0">
              <span className="block text-[11px] font-medium text-white tabular-nums truncate">{p.number}</span>
              <span className="block sm:hidden text-[10px] text-[#A7B0C0] truncate">{p.client} · {p.court}</span>
              <span className="hidden sm:block text-[10px] text-white/35">{p.court}</span>
            </span>
            <span className="hidden sm:block text-[11px] text-white/80 truncate">{p.client}</span>
            <span><Tag tone={p.tone}>{p.phase}</Tag></span>
            <span className="hidden sm:block text-right text-[11px] text-white/80 tabular-nums">{p.next}</span>
          </div>
        ))}
      </div>
    </>
  )
}

// ── Tela 3: Prazos (atividades do tipo prazo, criadas das intimações) ────────

const PRAZOS = [
  { title: 'Recurso ordinário', where: 'TRT13 · 0002101-14.2025.5.13.0022', regime: 'Dias úteis · CLT', internal: '30/11', fatal: '02/12', who: 'HP', left: 'faltam 4 dias úteis', urgent: true },
  { title: 'Contrarrazões de apelação', where: 'TJPB · 0811032-40.2025.8.15.2001', regime: 'Dias úteis · CPC', internal: '07/12', fatal: '10/12', who: 'BR', left: 'faltam 10 dias úteis', urgent: false },
  { title: 'Réplica à contestação', where: 'TJPB · 0804417-21.2026.8.15.2001', regime: 'Dias úteis · CPC', internal: '09/12', fatal: '14/12', who: 'MS', left: 'faltam 15 dias úteis', urgent: false, fresh: true },
  { title: 'Cumprir exigência do INSS', where: 'Req. 1.842.337.905', regime: 'Dias corridos', internal: '27/11', fatal: '30/11', who: 'MS', left: 'faltam 7 dias', urgent: false },
]

const CALC_STEPS = [
  { label: 'Disponibilizada no DJEN', date: 'sex, 20/11' },
  { label: 'Considerada publicada', date: 'seg, 23/11' },
  { label: '1º dia do prazo', date: 'ter, 24/11' },
  { label: 'Prazo interno', date: 'qua, 09/12' },
  { label: 'Prazo fatal · 15 dias úteis', date: 'seg, 14/12', strong: true },
]

function PrazosScreen({ active }: { active: boolean }) {
  return (
    <>
      <TopBar title="Atividades · Prazos" sub="criados a partir das intimações" />
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 min-h-0">
        <div className="sm:col-span-3 space-y-2">
          {PRAZOS.map((p, i) => (
            <div key={p.title}
              className={cn('lhm-par-2 rounded-xl border p-2.5 sm:p-3', p.fresh ? 'border-[#1677FF]/45 bg-[#1677FF]/[0.07]' : 'border-white/[0.07] bg-white/[0.02]',
                active && 'lhm-row-in')}
              style={{ animationDelay: `${100 + i * 80}ms` }}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] sm:text-[12px] font-semibold text-white truncate">{p.title}</p>
                  <p className="text-[10px] text-[#A7B0C0] truncate">{p.where}</p>
                </div>
                <span className="w-6 h-6 rounded-full bg-white/[0.07] text-[9px] font-bold text-white/70 flex items-center justify-center flex-shrink-0">{p.who}</span>
              </div>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <span className="text-[9px] sm:text-[10px] px-1.5 py-[1px] rounded border border-white/10 text-white/60">{p.regime}</span>
                <span className="text-[10px] text-white/50 tabular-nums">interno {p.internal}</span>
                <span className={cn('text-[10px] font-semibold tabular-nums', p.urgent ? 'text-amber-300' : 'text-white/85')}>fatal {p.fatal}</span>
                <span className={cn('ml-auto text-[10px]', p.urgent ? 'text-amber-300' : 'text-[#A7B0C0]')}>{p.left}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="hidden sm:block sm:col-span-2 lhm-par-3">
          <div className="rounded-xl border border-white/[0.07] bg-[#0e1729] p-3">
            <p className="text-[11px] font-semibold text-white">Como a data foi calculada</p>
            <p className="text-[10px] text-[#A7B0C0]">Réplica à contestação · TJPB</p>
            <ol className="mt-3 relative">
              <span className="absolute left-[5px] top-1.5 bottom-1.5 w-px bg-white/10" />
              {CALC_STEPS.map((s, i) => (
                <li key={s.label} className={cn('relative flex items-start gap-2.5 py-1.5', active && 'lhm-row-in')} style={{ animationDelay: `${260 + i * 110}ms` }}>
                  <span className={cn('relative mt-1 w-[11px] h-[11px] rounded-full border-2 flex-shrink-0',
                    s.strong ? 'border-[#1677FF] bg-[#1677FF]' : 'border-white/25 bg-[#0e1729]')} />
                  <span className="flex-1 min-w-0">
                    <span className={cn('block text-[10px] lg:text-[11px]', s.strong ? 'text-white font-semibold' : 'text-white/70')}>{s.label}</span>
                    <span className={cn('block text-[10px] tabular-nums', s.strong ? 'text-[#7fb2ff]' : 'text-[#A7B0C0]')}>{s.date}</span>
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-2 pt-2 border-t border-white/[0.06] text-[10px] leading-snug text-[#A7B0C0]">
              CPC, arts. 219 e 224. Feriados e dias sem expediente do tribunal descontados.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}

// ── CSS da peça (prefixo lhm-) ───────────────────────────────────────────────

const HERO_CSS = `
  .lhm-stage { perspective: 1800px; }
  .lhm-tilt {
    transform-style: preserve-3d;
    transform: rotateX(calc(var(--my) * -6deg)) rotateY(calc(var(--mx) * 6deg));
    transition: transform 500ms ${EASE};
    will-change: transform;
  }
  .lhm-layer-back { transform: translate3d(calc(var(--mx) * -18px), calc(var(--my) * -12px + (var(--p, .5) - .5) * 60px), 0); transition: transform 600ms ${EASE}; }
  .lhm-layer-front { transform: translate3d(calc(var(--mx) * 22px), calc(var(--my) * 16px + (var(--p, .5) - .5) * -90px), 60px); transition: transform 500ms ${EASE}; }
  .lhm-layer-front-2 { transform: translate3d(calc(var(--mx) * 30px), calc(var(--my) * 20px + (var(--p, .5) - .5) * -140px), 80px); }
  .lhm-par-1 { transform: translate3d(calc(var(--mx) * 3px), calc(var(--my) * 2px), 0); transition: transform 500ms ${EASE}; }
  .lhm-par-2 { transform: translate3d(calc(var(--mx) * 5px), calc(var(--my) * 3px), 0); transition: transform 500ms ${EASE}; }
  .lhm-par-3 { transition: transform 500ms ${EASE}; }
  @keyframes lhm-row-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  .lhm-row-in { animation: lhm-row-in 600ms ${EASE} both; }
  @keyframes lhm-ripple { from { opacity: .9; transform: scale(.4); } to { opacity: 0; transform: scale(1.8); } }
  .lhm-ripple { animation: lhm-ripple 450ms ease-out both; }
  @keyframes lhm-ping { 75%, 100% { transform: scale(2.2); opacity: 0; } }
  .lhm-ping { animation: lhm-ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite; }
  @media (prefers-reduced-motion: reduce) {
    .lhm-tilt, .lhm-layer-back, .lhm-layer-front, .lhm-layer-front-2, .lhm-par-1, .lhm-par-2, .lhm-par-3 { transform: none !important; transition: none !important; }
    .lhm-row-in, .lhm-ripple, .lhm-ping { animation: none !important; }
  }
`
