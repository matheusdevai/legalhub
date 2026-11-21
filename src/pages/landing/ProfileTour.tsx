import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight, BarChart2, Briefcase, CalendarDays, CheckSquare, DollarSign, LayoutDashboard, Newspaper, Search, Users, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { CountUp, formatBRL, formatInt, useInView } from './landingMotion'
import { PROFILE_TOUR, type HotspotAnchor, type ProfileHotspot, type ProfileId, type RowTone, profileTour } from './profileTourData'

/**
 * Tour por perfil: seletor (Advogado autônomo | Escritório | Previdenciário |
 * Trabalhista) que troca a tela ilustrativa, os números e os atalhos. Pontos
 * numerados (hotspots) abrem um balão curto — clicáveis e acessíveis por
 * teclado (Tab, Enter/Espaço, Esc fecha e devolve o foco). Os mesmos pontos
 * aparecem como lista ao lado, para quem não quer caçar o número na tela.
 * Dados fictícios em profileTourData.ts.
 */

const TONE: Record<RowTone, string> = {
  blue: 'bg-[#1677FF]/10 text-[#0B5CFF]',
  amber: 'bg-amber-100 text-amber-800',
  green: 'bg-emerald-50 text-emerald-700',
  red: 'bg-rose-50 text-rose-700',
  neutral: 'bg-slate-100 text-slate-600',
}

const SIDE_NAV: { icon: React.ElementType; label: string; path: string }[] = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
  { icon: CalendarDays, label: 'Agenda', path: '/agenda' },
  { icon: CheckSquare, label: 'Atividades', path: '/tarefas' },
  { icon: Users, label: 'Clientes', path: '/clientes' },
  { icon: Briefcase, label: 'Processos', path: '/processos' },
  { icon: Newspaper, label: 'Intimações', path: '/publicacoes' },
  { icon: DollarSign, label: 'Financeiro', path: '/financeiro' },
  { icon: BarChart2, label: 'Relatórios', path: '/relatorios' },
]

export function ProfileTour() {
  const navigate = useNavigate()
  const sectionRef = useRef<HTMLElement>(null)
  const seen = useInView(sectionRef, { once: true, threshold: 0.15 })
  const [activeId, setActiveId] = useState<ProfileId>('autonomo')
  const [openSpot, setOpenSpot] = useState<string | null>(null)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const profile = profileTour(activeId)

  // Trocar de perfil fecha o balão aberto.
  useEffect(() => { setOpenSpot(null) }, [activeId])

  // Clique fora de qualquer hotspot fecha o balão.
  useEffect(() => {
    if (!openSpot) return
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest?.('[data-hotspot]')) setOpenSpot(null)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [openSpot])

  function onTabKey(e: React.KeyboardEvent, i: number) {
    const n = PROFILE_TOUR.length
    let next = -1
    if (e.key === 'ArrowRight') next = (i + 1) % n
    else if (e.key === 'ArrowLeft') next = (i - 1 + n) % n
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = n - 1
    if (next < 0) return
    e.preventDefault()
    setActiveId(PROFILE_TOUR[next].id)
    tabRefs.current[next]?.focus()
  }

  const spotFor = (anchor: HotspotAnchor) => {
    const i = profile.hotspots.findIndex(h => h.anchor === anchor)
    return i < 0 ? null : { spot: profile.hotspots[i], n: i + 1 }
  }

  const renderSpot = (anchor: HotspotAnchor) => {
    const found = spotFor(anchor)
    if (!found) return null
    return (
      <Hotspot
        key={`${profile.id}-${found.spot.id}`}
        n={found.n}
        spot={found.spot}
        profileId={profile.id}
        open={openSpot === found.spot.id}
        onToggle={() => setOpenSpot(s => (s === found.spot.id ? null : found.spot.id))}
        onClose={() => setOpenSpot(null)}
      />
    )
  }

  return (
    <section ref={sectionRef} id="perfis" className="lh-light lh-light-alt relative py-20 sm:py-28 px-5 sm:px-8 border-t border-[color:var(--lh-divider)]">
      <style>{PROFILE_CSS}</style>
      <div className="max-w-6xl mx-auto">
        <div className={cn('max-w-2xl mx-auto text-center mb-10 sm:mb-12', seen ? 'lhp-in' : 'opacity-0 motion-reduce:opacity-100')}>
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#1677FF]">Do seu jeito de advogar</span>
          <h2 className="mt-3 font-display text-3xl sm:text-4xl font-bold tracking-[-0.03em] text-[color:var(--lh-fg)]" style={{ textWrap: 'balance' } as React.CSSProperties}>
            Veja o LegalHub pela rotina do <span className="text-[#1677FF]">seu tipo de escritório</span>
          </h2>
          <p className="mt-4 text-[color:var(--lh-muted)] leading-relaxed">
            Escolha um perfil. A tela, os números e os atalhos mudam para o que importa nele. Toque nos pontos numerados para entender cada parte.
          </p>
        </div>

        {/* Seletor de perfil */}
        <div className="flex justify-center mb-8 sm:mb-10">
          <div className="relative max-w-full">
          <div role="tablist" aria-label="Perfil de escritório"
            className="flex max-w-full overflow-x-auto gap-1 p-1 rounded-full border border-[color:var(--lh-border)] bg-white lh-card [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {PROFILE_TOUR.map((p, i) => {
              const on = p.id === activeId
              return (
                <button
                  key={p.id}
                  ref={el => { tabRefs.current[i] = el }}
                  id={`perfil-tab-${p.id}`}
                  role="tab"
                  type="button"
                  aria-selected={on}
                  aria-controls="perfil-painel"
                  tabIndex={on ? 0 : -1}
                  onClick={() => setActiveId(p.id)}
                  onKeyDown={e => onTabKey(e, i)}
                  className={cn(
                    'flex-shrink-0 whitespace-nowrap px-4 sm:px-5 py-2.5 rounded-full text-sm font-semibold transition-colors duration-200',
                    on ? 'bg-[#0b1220] text-white' : 'text-[color:var(--lh-muted)] hover:text-[color:var(--lh-fg)] hover:bg-[color:var(--lh-chip)]',
                  )}
                >
                  {p.tab}
                </button>
              )
            })}
          </div>
          {/* Dica de rolagem no celular: a borda direita esmaece quando há mais abas */}
          <div aria-hidden className="sm:hidden pointer-events-none absolute inset-y-px right-px w-10 rounded-r-full bg-gradient-to-l from-white to-transparent" />
          </div>
        </div>

        <div id="perfil-painel" role="tabpanel" aria-labelledby={`perfil-tab-${profile.id}`}
          className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
          {/* Texto + lista de destaques */}
          <div key={`txt-${profile.id}`} className="lg:col-span-4 lhp-in">
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[color:var(--lh-muted)]">{profile.persona}</p>
            <h3 className="mt-2 font-display text-2xl sm:text-[28px] leading-[1.15] font-bold tracking-[-0.03em] text-[color:var(--lh-fg)]" style={{ textWrap: 'balance' } as React.CSSProperties}>
              {profile.headline}
            </h3>
            <p className="mt-3 text-[15px] text-[color:var(--lh-muted)] leading-relaxed">{profile.summary}</p>

            <p className="mt-7 text-xs font-bold uppercase tracking-[0.12em] text-[color:var(--lh-fg)]">O que observar na tela</p>
            <ol className="mt-3 space-y-1.5">
              {profile.hotspots.map((h, i) => {
                const on = openSpot === h.id
                return (
                  <li key={h.id}>
                    <button
                      type="button"
                      data-hotspot
                      aria-expanded={on}
                      aria-controls={`hs-${profile.id}-${h.id}`}
                      onClick={() => setOpenSpot(s => (s === h.id ? null : h.id))}
                      className={cn(
                        'w-full flex items-center gap-3 text-left rounded-xl px-3 py-2.5 border transition-colors',
                        on ? 'border-[#1677FF]/40 bg-white' : 'border-transparent hover:bg-white/70',
                      )}
                    >
                      <span className={cn('w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 tabular-nums',
                        on ? 'bg-[#0B5CFF] text-white' : 'bg-[#0b1220] text-white')}>{i + 1}</span>
                      <span className="text-sm font-medium text-[color:var(--lh-fg)]">{h.title}</span>
                    </button>
                  </li>
                )
              })}
            </ol>

            <button
              type="button"
              onClick={() => navigate('/login', { state: { mode: 'signup' } })}
              className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-[#0B5CFF] hover:gap-3 transition-all"
            >
              Testar com os dados do meu escritório <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Tela ilustrativa */}
          <figure className="lg:col-span-8 m-0" aria-label={`Tela ilustrativa do perfil ${profile.tab}, com dados fictícios`}>
            <div className="relative rounded-2xl border border-[color:var(--lh-border)] bg-white"
              style={{ boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 30px 70px -30px rgba(16,24,40,0.28)' }}>
              {/* Barra do navegador */}
              <div aria-hidden className="flex items-center gap-3 px-3 sm:px-4 h-9 rounded-t-2xl border-b border-[color:var(--lh-divider)] bg-[#f3f5f9]">
                <div className="flex gap-1.5 flex-shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                </div>
                <div className="flex-1 min-w-0 flex justify-center">
                  <span className="truncate max-w-xs w-full text-center text-[11px] text-slate-500 bg-white rounded-md px-3 py-0.5 border border-[color:var(--lh-divider)]">
                    legalhubgestor.vercel.app<span className="text-slate-800">{profile.path}</span>
                  </span>
                </div>
                <span className="w-10 flex-shrink-0" />
              </div>

              <div className="flex">
                {/* Barra lateral (escura, como no app) */}
                <div aria-hidden className="hidden sm:flex flex-col w-12 md:w-40 flex-shrink-0 rounded-bl-2xl bg-[#0a1628] py-3 px-2 gap-0.5">
                  <div className="flex items-center gap-2 px-1.5 mb-3">
                    <span className="w-6 h-6 rounded-md overflow-hidden bg-[#06152D] flex-shrink-0">
                      <img src="/logomarca.png" alt="" className="w-full h-full object-cover" style={{ objectPosition: '0% 50%' }} />
                    </span>
                    <span className="hidden md:block text-[13px] font-bold tracking-tight text-white">LegalHub</span>
                  </div>
                  {SIDE_NAV.map(item => {
                    const on = item.path === profile.path
                    return (
                      <span key={item.label} className={cn('relative flex items-center gap-2.5 rounded-lg px-2 h-8 text-[12px] transition-colors duration-300',
                        on ? 'bg-white/[0.08] text-white' : 'text-white/45')}>
                        <item.icon className="w-[15px] h-[15px] flex-shrink-0" />
                        <span className="hidden md:block truncate">{item.label}</span>
                        {on && <span className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-l-full bg-[#1677FF]" />}
                      </span>
                    )
                  })}
                </div>

                <div className="flex-1 min-w-0 p-4 sm:p-5 rounded-b-2xl sm:rounded-bl-none">
                  {/* Cabeçalho */}
                  <div className="relative flex items-center gap-3 mb-4" data-anchor="header">
                    <div key={`h-${profile.id}`} className="min-w-0 flex-1 lhp-in">
                      <p className="text-[15px] font-semibold tracking-[-0.01em] text-slate-900 truncate">{profile.screenTitle}</p>
                      <p className="text-[11px] text-slate-500 truncate">{profile.screenSub}</p>
                    </div>
                    <span aria-hidden className="hidden md:flex items-center gap-2 w-44 h-8 rounded-md bg-slate-50 border border-slate-200 px-2 text-[11px] text-slate-400">
                      <Search className="w-3 h-3" /> Buscar…
                    </span>
                    <span aria-hidden className="w-8 h-8 rounded-full bg-[#1677FF]/10 text-[#0B5CFF] text-[10px] font-bold flex items-center justify-center">
                      {profile.id === 'escritorio' ? 'HP' : 'MS'}
                    </span>
                    {renderSpot('header')}
                  </div>

                  {/* Números */}
                  <div className="relative grid grid-cols-3 gap-2 sm:gap-3">
                    {profile.stats.map((s, i) => {
                      const fmt = s.format === 'brl' ? formatBRL : formatInt
                      return (
                        <div key={i} className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 sm:p-3 min-w-0">
                          <p key={`l-${profile.id}`} className="lhp-in text-[9px] sm:text-[10px] uppercase tracking-[0.06em] text-slate-500 leading-tight line-clamp-2 min-h-[2.2em]">{s.label}</p>
                          <span aria-hidden>
                            <CountUp value={s.value} start={seen} format={fmt} duration={900}
                              className="block mt-1 text-base sm:text-2xl font-bold tracking-[-0.03em] text-slate-900 tabular-nums truncate" />
                          </span>
                          <span className="sr-only">{fmt(s.value)}</span>
                        </div>
                      )
                    })}
                    {renderSpot('stats')}
                  </div>

                  <div className="mt-4 grid grid-cols-1 lg:grid-cols-5 gap-3">
                    {/* Lista */}
                    <div className="relative lg:col-span-3 rounded-xl border border-slate-200 p-2.5 sm:p-3">
                      <p className="text-xs font-semibold text-slate-900 mb-1 px-1">{profile.listTitle}</p>
                      <ul key={`rows-${profile.id}`}>
                        {profile.rows.map((r, i) => (
                          <li key={r.title} className="lhp-row flex items-center gap-2.5 px-1 py-2 border-t border-slate-100 first:border-t-0"
                            style={{ animationDelay: `${i * 60}ms` }}>
                            <div className="min-w-0 flex-1">
                              <p className="text-[12px] sm:text-[13px] font-medium text-slate-900 truncate">{r.title}</p>
                              <p className="text-[11px] text-slate-500 truncate">{r.meta}</p>
                            </div>
                            <span className="flex flex-col items-end gap-0.5 flex-shrink-0">
                              <span className={cn('px-1.5 py-[1px] rounded text-[10px] font-semibold whitespace-nowrap', TONE[r.tone])}>{r.tag}</span>
                              <span className="text-[10px] text-slate-500 tabular-nums whitespace-nowrap">{r.when}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                      {renderSpot('list')}
                    </div>

                    {/* Atalhos */}
                    <div className="relative lg:col-span-2 rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 sm:p-3">
                      <p className="text-xs font-semibold text-slate-900 mb-2 px-1">Atalhos</p>
                      <ul key={`sc-${profile.id}`} className="space-y-1.5">
                        {profile.shortcuts.map((s, i) => (
                          <li key={s.label} className="lhp-row flex items-center gap-2.5 rounded-lg bg-white border border-slate-200 px-2.5 py-2"
                            style={{ animationDelay: `${120 + i * 70}ms` }}>
                            <span aria-hidden className="w-6 h-6 rounded-md bg-[#1677FF]/10 text-[#0B5CFF] flex items-center justify-center flex-shrink-0">
                              <ArrowRight className="w-3 h-3" />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-[12px] font-medium text-slate-900 truncate">{s.label}</span>
                              <span className="block text-[10px] text-slate-500 truncate">{s.detail}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                      {renderSpot('shortcuts')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <figcaption className="mt-3 text-center text-[11px] text-[color:var(--lh-muted)] opacity-80">
              Tela ilustrativa com dados fictícios.
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  )
}

function Hotspot({ n, spot, profileId, open, onToggle, onClose }: {
  n: number
  spot: ProfileHotspot
  profileId: ProfileId
  open: boolean
  onToggle: () => void
  onClose: () => void
}) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const id = `hs-${profileId}-${spot.id}`

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      onClose()
      btnRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <div data-hotspot className={cn('absolute -top-3 -right-3', open ? 'z-40' : 'z-20')}>
      <button
        ref={btnRef}
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={id}
        aria-label={`Ponto ${n}: ${spot.title}`}
        className={cn(
          'relative w-7 h-7 rounded-full text-[12px] font-bold text-white flex items-center justify-center tabular-nums ring-4 ring-white transition-transform duration-200 hover:scale-110',
          open ? 'bg-[#0b1220]' : 'bg-[#0B5CFF]',
        )}
        style={{ boxShadow: '0 6px 16px -4px rgba(11,92,255,0.55)' }}
      >
        {!open && <span aria-hidden className="lhp-pulse absolute inset-0 rounded-full border-2 border-[#1677FF]" />}
        {n}
      </button>
      <div
        id={id}
        hidden={!open}
        className="lhp-pop absolute right-0 top-full mt-2 w-64 max-w-[calc(100vw-56px)] rounded-xl bg-[#0b1220] text-white p-4 pr-9 text-left"
        style={{ boxShadow: '0 24px 50px -16px rgba(5,7,12,0.55)' }}
      >
        <p className="text-sm font-semibold tracking-[-0.01em]">{spot.title}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-[#cfd6e2]">{spot.body}</p>
        <button type="button" onClick={() => { onClose(); btnRef.current?.focus() }} aria-label="Fechar"
          className="absolute top-2.5 right-2.5 w-6 h-6 rounded-md flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

const PROFILE_CSS = `
  @keyframes lhp-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
  .lhp-in { animation: lhp-in 600ms cubic-bezier(0.16, 1, 0.3, 1) both; }
  .lhp-row { animation: lhp-in 520ms cubic-bezier(0.16, 1, 0.3, 1) both; }
  @keyframes lhp-pop { from { opacity: 0; transform: translateY(-4px) scale(0.97); } to { opacity: 1; transform: none; } }
  .lhp-pop:not([hidden]) { animation: lhp-pop 220ms cubic-bezier(0.16, 1, 0.3, 1) both; transform-origin: top right; }
  @keyframes lhp-pulse { 0% { transform: scale(1); opacity: .7; } 80%, 100% { transform: scale(1.9); opacity: 0; } }
  .lhp-pulse { animation: lhp-pulse 2.2s cubic-bezier(0, 0, 0.2, 1) infinite; }
  @media (prefers-reduced-motion: reduce) {
    .lhp-in, .lhp-row, .lhp-pop:not([hidden]), .lhp-pulse { animation: none !important; }
  }
`
