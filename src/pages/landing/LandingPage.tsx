import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  Users, Briefcase, CalendarDays, DollarSign, Bell, Handshake,
  ShieldCheck, Layers, LineChart, ArrowRight, Menu, X, CheckCircle2,
  Sparkles, UserPlus, Settings2, Rocket, Building2, Lock, Zap,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="rounded-xl overflow-hidden flex-shrink-0" style={{ width: size, height: size }}>
        <img src="/logomarca.png" alt="LegalHub"
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '0% 50%' }} />
      </div>
      <span className="font-bold text-lg text-white tracking-tight">LegalHub</span>
    </div>
  )
}

/** Revela o conteúdo com fade + slide-up assim que entra na viewport. */
function Reveal({ children, delay = 0, className = '', style }: { children: React.ReactNode; delay?: number; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); obs.disconnect() }
    }, { threshold: 0.15 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={cn('transition-all duration-700 ease-out', visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8', className)}
      style={{ transitionDelay: `${delay}ms`, ...style }}
    >
      {children}
    </div>
  )
}

const NAV_LINKS = [
  { href: '#recursos', label: 'Recursos' },
  { href: '#como-funciona', label: 'Como funciona' },
  { href: '#vantagens', label: 'Vantagens' },
]

const FEATURES = [
  {
    icon: CalendarDays,
    title: 'Agenda conectada ao Google Calendar',
    description: 'Tarefas com prazo viram compromisso automaticamente — na agenda do escritório e no Google Calendar de cada advogado, sem nenhum passo manual.',
    flagship: true,
  },
  {
    icon: Users,
    title: 'Clientes & Contatos',
    description: 'Cadastro completo de pessoa física e jurídica, com busca automática de CPF/CNPJ e alerta de contatos duplicados.',
  },
  {
    icon: Briefcase,
    title: 'Processos',
    description: 'Acompanhe cada caso por fase — negociação, conhecimento, recursal, execução — com honorários e prazos organizados.',
  },
  {
    icon: DollarSign,
    title: 'Financeiro',
    description: 'Contas a pagar e a receber, comissões de parceiros e indicadores de faturamento em um só painel.',
  },
  {
    icon: Bell,
    title: 'Publicações & Intimações',
    description: 'Sincronização automática com o DataJud (CNJ) para você nunca perder uma intimação.',
  },
  {
    icon: Handshake,
    title: 'Parceiros & Indicações',
    description: 'Controle comissões, indicações e desempenho de cada parceiro ou colaborador do escritório.',
  },
]

const STEPS = [
  {
    icon: UserPlus,
    title: 'Crie sua conta',
    description: 'Cadastre seu escritório em minutos — sem cartão de crédito, sem instalação.',
  },
  {
    icon: Settings2,
    title: 'Configure seu time',
    description: 'Convide advogados, estagiários e parceiros, cada um com o nível de acesso certo.',
  },
  {
    icon: Rocket,
    title: 'Centralize tudo',
    description: 'Clientes, processos, tarefas e financeiro passam a viver em um só lugar, conectados.',
  },
]

const BENEFITS = [
  {
    icon: Layers,
    title: 'Tudo integrado',
    description: 'Clientes, processos, tarefas, agenda e financeiro conversam entre si — sem planilhas soltas ou retrabalho.',
  },
  {
    icon: ShieldCheck,
    title: 'Segurança de dados',
    description: 'Cada escritório opera isolado, com controle de acesso por função: administrador, advogado, estagiário ou financeiro.',
  },
  {
    icon: LineChart,
    title: 'Decisões com dados',
    description: 'Relatórios de desempenho e produtividade para você enxergar o escritório com clareza, não achismo.',
  },
]

const STATS = [
  { icon: Layers, value: '10+', label: 'Módulos integrados' },
  { icon: Building2, value: '100%', label: 'Dados isolados por escritório' },
  { icon: Zap, value: 'Automática', label: 'Sincronização com CNJ e Google' },
  { icon: Lock, value: 'Por função', label: 'Controle de acesso' },
]

function GridBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(ellipse 70% 60% at 50% 20%, black, transparent)',
        }}
      />
      <div
        className="absolute -top-40 left-1/4 w-[36rem] h-[36rem] rounded-full blur-3xl opacity-30 animate-[float_9s_ease-in-out_infinite]"
        style={{ background: 'radial-gradient(circle, #6d28d9, transparent 70%)' }}
      />
      <div
        className="absolute top-1/3 -right-32 w-[30rem] h-[30rem] rounded-full blur-3xl opacity-30 animate-[float_11s_ease-in-out_infinite_1.5s]"
        style={{ background: 'radial-gradient(circle, #2563eb, transparent 70%)' }}
      />
    </div>
  )
}

/** Textura de ruído sutil para tirar a "chapada" do fundo escuro. */
const NOISE_BG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E\")"

export function LandingPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 8) }
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const prev = document.documentElement.style.scrollBehavior
    document.documentElement.style.scrollBehavior = 'smooth'
    return () => { document.documentElement.style.scrollBehavior = prev }
  }, [])

  if (!loading && session) return <Navigate to="/dashboard" replace />

  function goToLogin(mode: 'login' | 'signup' = 'login') {
    navigate('/login', { state: { mode } })
  }

  return (
    <div className="min-h-screen text-white relative" style={{ background: '#050b15' }}>
      <div className="pointer-events-none fixed inset-0 z-0" style={{ backgroundImage: NOISE_BG }} />

      <style>{`
        @keyframes float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-24px) } }
        @keyframes floatCard { 0%,100% { transform: translateY(0) rotate(var(--rot,0deg)) } 50% { transform: translateY(-10px) rotate(var(--rot,0deg)) } }
        @keyframes shine { 0% { transform: translateX(-120%) skewX(-15deg) } 100% { transform: translateX(220%) skewX(-15deg) } }
      `}</style>

      {/* ══ NAVBAR ══ */}
      <header
        className="fixed top-0 inset-x-0 z-50 transition-colors duration-200"
        style={{
          background: scrolled ? 'rgba(5,11,21,0.85)' : 'transparent',
          backdropFilter: scrolled ? 'blur(12px)' : 'none',
          borderBottom: scrolled ? '1px solid rgba(255,255,255,0.08)' : '1px solid transparent',
        }}
      >
        <div className="max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <BrandMark size={34} />

          <nav className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map(l => (
              <a key={l.href} href={l.href} className="relative text-sm text-slate-300 hover:text-white transition-colors group">
                {l.label}
                <span className="absolute -bottom-1.5 left-0 w-0 h-px bg-gradient-to-r from-indigo-400 to-blue-400 transition-all duration-300 group-hover:w-full" />
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <button onClick={() => goToLogin('login')} className="text-sm font-medium text-slate-300 hover:text-white transition-colors px-3 py-2">
              Entrar
            </button>
            <button
              onClick={() => goToLogin('signup')}
              className="relative overflow-hidden flex items-center gap-1.5 text-sm font-semibold text-white px-4 py-2.5 rounded-xl transition-all active:scale-[0.97] hover:brightness-110"
              style={{ background: 'linear-gradient(135deg,#4338ca,#2563eb)', boxShadow: '0 4px 18px rgba(37,99,235,0.35)' }}
            >
              Começar agora <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <button className="md:hidden text-slate-200" onClick={() => setMenuOpen(v => !v)}>
            {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {menuOpen && (
          <div className="md:hidden px-5 pb-5 pt-1 space-y-3" style={{ background: 'rgba(5,11,21,0.98)' }}>
            {NAV_LINKS.map(l => (
              <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)} className="block text-sm text-slate-300 py-1.5">
                {l.label}
              </a>
            ))}
            <div className="flex flex-col gap-2 pt-2">
              <button onClick={() => goToLogin('login')} className="w-full text-center text-sm font-medium text-slate-200 border border-white/15 rounded-xl py-2.5">
                Entrar
              </button>
              <button
                onClick={() => goToLogin('signup')}
                className="w-full text-center text-sm font-semibold text-white rounded-xl py-2.5"
                style={{ background: 'linear-gradient(135deg,#4338ca,#2563eb)' }}
              >
                Começar agora
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ══ HERO ══ */}
      <section className="relative pt-36 pb-28 sm:pt-48 sm:pb-40 px-5 sm:px-8 overflow-hidden">
        <GridBackdrop />
        <div className="relative max-w-4xl mx-auto text-center">
          <Reveal>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium text-violet-200 border border-violet-400/30 bg-violet-500/10 mb-7">
              <Sparkles className="w-3.5 h-3.5 text-violet-300" />
              Gestão jurídica em um só lugar
            </div>
          </Reveal>

          <Reveal delay={80}>
            <h1 className="text-4xl sm:text-6xl lg:text-[4.25rem] font-bold tracking-tight leading-[1.1] max-w-4xl mx-auto" style={{ textWrap: 'balance' } as React.CSSProperties}>
              Tecnologia e inteligência para transformar a gestão do{' '}
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: 'linear-gradient(90deg,#a5b4fc,#818cf8,#60a5fa)' }}
              >
                seu escritório
              </span>
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p className="mt-7 text-base sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
              Centralize clientes, processos, tarefas, agenda e financeiro do seu escritório de advocacia
              em uma única plataforma — com sincronização automática e dados sempre à mão para decidir com segurança.
            </p>
          </Reveal>

          <Reveal delay={240}>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => goToLogin('signup')}
                className="relative overflow-hidden group w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-[0.98] hover:-translate-y-0.5"
                style={{ background: 'linear-gradient(135deg,#4338ca,#2563eb)', boxShadow: '0 8px 28px rgba(37,99,235,0.45)' }}
              >
                <span
                  className="absolute inset-0 opacity-0 group-hover:opacity-100"
                  style={{ background: 'linear-gradient(115deg,transparent,rgba(255,255,255,0.35),transparent)', animation: 'shine 1.1s ease' }}
                />
                <span className="relative">Começar agora</span>
                <ArrowRight className="relative w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </button>
              <button
                onClick={() => goToLogin('login')}
                className="w-full sm:w-auto px-7 py-3.5 rounded-xl text-sm font-semibold text-slate-200 border border-white/15 hover:bg-white/5 hover:border-white/25 transition-all"
              >
                Já tenho uma conta
              </button>
            </div>
          </Reveal>

          <Reveal delay={300}>
            <p className="mt-5 text-xs text-slate-500">Não é necessário cartão de crédito para começar.</p>
          </Reveal>
        </div>

        {/* Mockup do produto com cards flutuantes */}
        <Reveal delay={360} className="relative max-w-5xl mx-auto mt-20 sm:mt-24">
          <div
            className="rounded-2xl border border-white/10 overflow-hidden"
            style={{ background: 'linear-gradient(180deg,#0b1424,#070d18)', boxShadow: '0 40px 100px -20px rgba(0,0,0,0.65)' }}
          >
            <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400/60" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/60" />
              <div className="ml-4 flex-1 max-w-xs h-6 rounded-md bg-white/5 border border-white/5" />
            </div>
            <div className="flex">
              {/* Mini sidebar */}
              <div className="hidden sm:flex flex-col items-center gap-3 py-6 px-3 border-r border-white/5">
                {[BrandMark, Users, Briefcase, CalendarDays, DollarSign].map((Comp, i) => (
                  <div key={i} className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center',
                    i === 0 ? 'bg-gradient-to-br from-indigo-500 to-blue-500' : 'bg-white/5'
                  )}>
                    {i > 0 && <Comp className="w-4 h-4 text-slate-400" />}
                  </div>
                ))}
              </div>

              <div className="flex-1 p-5 sm:p-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { label: 'Processos ativos', value: '128', accent: '#60a5fa' },
                  { label: 'Tarefas concluídas no mês', value: '342', accent: '#34d399' },
                  { label: 'Honorários a receber', value: 'R$ 84.2k', accent: '#c084fc' },
                ].map(card => (
                  <div key={card.label} className="rounded-xl p-5 border border-white/10 transition-transform hover:-translate-y-0.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <p className="text-2xl font-bold text-white">{card.value}</p>
                    <p className="text-xs text-slate-400 mt-1">{card.label}</p>
                    <div className="h-1 w-8 rounded-full mt-3" style={{ background: card.accent }} />
                  </div>
                ))}
                <div className="sm:col-span-3 rounded-xl border border-white/10 p-5" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm font-semibold text-slate-200">Quadro de atividades</p>
                    <span className="text-[11px] text-slate-500">Sincronizado com a agenda</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {['Hoje', 'Próximos 7 dias', 'Fazendo', 'Concluídas'].map((col, i) => (
                      <div key={col} className="rounded-lg border border-white/5 p-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
                        <p className="text-[11px] font-semibold text-slate-400 mb-2">{col}</p>
                        <div className="space-y-1.5">
                          {Array.from({ length: i === 3 ? 1 : 2 }).map((_, j) => (
                            <div key={j} className="h-2 rounded-full bg-white/10" style={{ width: `${70 - j * 15}%` }} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Cards flutuantes de destaque */}
          <div
            className="hidden lg:flex absolute -left-10 top-16 items-center gap-2.5 px-4 py-3 rounded-xl border border-white/10 shadow-2xl"
            style={{ background: 'rgba(11,20,36,0.9)', backdropFilter: 'blur(8px)', animation: 'floatCard 6s ease-in-out infinite', ['--rot' as any]: '-3deg' }}
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-emerald-500/20">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">Tarefa sincronizada</p>
              <p className="text-[10px] text-slate-400">Google Calendar atualizado</p>
            </div>
          </div>

          <div
            className="hidden lg:flex absolute -right-8 bottom-20 items-center gap-2.5 px-4 py-3 rounded-xl border border-white/10 shadow-2xl"
            style={{ background: 'rgba(11,20,36,0.9)', backdropFilter: 'blur(8px)', animation: 'floatCard 7s ease-in-out infinite 1s', ['--rot' as any]: '2deg' }}
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-indigo-500/20">
              <Bell className="w-4 h-4 text-indigo-300" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">Nova intimação CNJ</p>
              <p className="text-[10px] text-slate-400">Sincronizada automaticamente</p>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ══ TRUST / STATS BAR ══ */}
      <section className="relative border-y border-white/5 py-10 px-5 sm:px-8" style={{ background: 'rgba(255,255,255,0.015)' }}>
        <div className="max-w-6xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-6">
          {STATS.map((s, i) => (
            <Reveal key={s.label} delay={i * 80} className="flex items-center gap-3 justify-center lg:justify-start">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.2),rgba(37,99,235,0.2))' }}>
                <s.icon className="w-5 h-5 text-indigo-300" />
              </div>
              <div>
                <p className="text-lg font-bold text-white leading-none">{s.value}</p>
                <p className="text-[11px] text-slate-400 mt-1">{s.label}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ══ RECURSOS (bento) ══ */}
      <section id="recursos" className="relative py-24 sm:py-32 px-5 sm:px-8 border-b border-white/5">
        <div className="max-w-6xl mx-auto">
          <Reveal className="max-w-2xl mx-auto text-center mb-16">
            <span className="text-xs font-bold uppercase tracking-widest text-indigo-400">Recursos</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">Tudo que o seu escritório precisa</h2>
            <p className="mt-4 text-slate-400 leading-relaxed">
              Um sistema pensado para o dia a dia jurídico — do primeiro contato do cliente até a conclusão do processo.
            </p>
          </Reveal>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => (
              <Reveal
                key={f.title}
                delay={i * 70}
                className={cn(
                  'group relative rounded-2xl p-7 border overflow-hidden transition-all duration-300 hover:-translate-y-1',
                  f.flagship
                    ? 'lg:col-span-2 lg:row-span-1 border-indigo-400/25 hover:border-indigo-400/40'
                    : 'border-white/10 hover:border-white/20'
                )}
                style={{ background: f.flagship ? 'linear-gradient(135deg,rgba(67,56,202,0.14),rgba(37,99,235,0.08))' : 'rgba(255,255,255,0.02)' }}
              >
                {f.flagship && (
                  <div
                    className="pointer-events-none absolute -top-16 -right-16 w-48 h-48 rounded-full blur-3xl opacity-50"
                    style={{ background: 'radial-gradient(circle, #4f46e5, transparent 70%)' }}
                  />
                )}
                <div
                  className="relative w-11 h-11 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110"
                  style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.28),rgba(37,99,235,0.28))' }}
                >
                  <f.icon className="w-5 h-5 text-indigo-300" />
                </div>
                <h3 className="relative text-base sm:text-lg font-semibold text-white">{f.title}</h3>
                <p className="relative mt-2 text-sm text-slate-400 leading-relaxed max-w-md">{f.description}</p>
                {f.flagship && (
                  <div className="relative mt-5 flex items-center gap-2 flex-wrap">
                    {['Tarefa criada', 'Agenda do escritório', 'Google Calendar'].map((step, idx, arr) => (
                      <div key={step} className="flex items-center gap-2">
                        <span className="text-[11px] font-medium text-indigo-200 bg-indigo-500/10 border border-indigo-400/20 px-2.5 py-1 rounded-full">{step}</span>
                        {idx < arr.length - 1 && <ArrowRight className="w-3 h-3 text-indigo-400/50" />}
                      </div>
                    ))}
                  </div>
                )}
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ COMO FUNCIONA ══ */}
      <section id="como-funciona" className="relative py-24 sm:py-32 px-5 sm:px-8 border-b border-white/5">
        <div className="max-w-5xl mx-auto">
          <Reveal className="max-w-2xl mx-auto text-center mb-16">
            <span className="text-xs font-bold uppercase tracking-widest text-indigo-400">Como funciona</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">Do cadastro ao dia a dia, em três passos</h2>
          </Reveal>

          <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-10">
            <div className="hidden sm:block absolute top-7 left-[16.5%] right-[16.5%] h-px" style={{ background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.15),transparent)' }} />
            {STEPS.map((s, i) => (
              <Reveal key={s.title} delay={i * 120} className="relative text-center">
                <div
                  className="relative z-10 w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-5 border border-white/10"
                  style={{ background: 'linear-gradient(135deg,#151235,#0b1424)' }}
                >
                  <s.icon className="w-6 h-6 text-indigo-300" />
                  <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center text-white" style={{ background: 'linear-gradient(135deg,#4338ca,#2563eb)' }}>
                    {i + 1}
                  </span>
                </div>
                <h3 className="text-base font-semibold text-white">{s.title}</h3>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed max-w-xs mx-auto">{s.description}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ VANTAGENS ══ */}
      <section id="vantagens" className="relative py-24 sm:py-32 px-5 sm:px-8 border-b border-white/5">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{ background: 'radial-gradient(60% 50% at 50% 0%, rgba(99,102,241,0.12), transparent)' }}
        />
        <div className="relative max-w-6xl mx-auto">
          <Reveal className="max-w-2xl mx-auto text-center mb-16">
            <span className="text-xs font-bold uppercase tracking-widest text-indigo-400">Vantagens</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">Por que escritórios escolhem o LegalHub</h2>
          </Reveal>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {BENEFITS.map((b, i) => (
              <Reveal key={b.title} delay={i * 100} className="text-center sm:text-left">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5 mx-auto sm:mx-0"
                  style={{ background: 'linear-gradient(135deg,#4338ca,#2563eb)' }}
                >
                  <b.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-white">{b.title}</h3>
                <p className="mt-2.5 text-sm text-slate-400 leading-relaxed">{b.description}</p>
              </Reveal>
            ))}
          </div>

          <Reveal delay={200} className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
            {['Multi-tenant e multiusuário', 'Controle de acesso por função', 'Relatórios de desempenho'].map(item => (
              <div key={item} className="flex items-center gap-2.5 text-sm text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                {item}
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ══ CTA FINAL ══ */}
      <section id="contato" className="relative py-24 sm:py-32 px-5 sm:px-8">
        <Reveal className="relative max-w-4xl mx-auto text-center rounded-3xl px-6 py-16 sm:px-16 sm:py-20 overflow-hidden border border-white/10">
          <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg,#151235,#0b1424)' }} />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage: 'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />
          <div
            className="pointer-events-none absolute -top-24 -right-24 w-72 h-72 rounded-full blur-3xl opacity-40 animate-[float_8s_ease-in-out_infinite]"
            style={{ background: 'radial-gradient(circle, #6d28d9, transparent 70%)' }}
          />
          <div
            className="pointer-events-none absolute -bottom-24 -left-24 w-72 h-72 rounded-full blur-3xl opacity-30 animate-[float_10s_ease-in-out_infinite_1s]"
            style={{ background: 'radial-gradient(circle, #2563eb, transparent 70%)' }}
          />
          <h2 className="relative text-3xl sm:text-4xl font-bold tracking-tight">Pronto para organizar seu escritório?</h2>
          <p className="relative mt-4 text-slate-400 max-w-xl mx-auto leading-relaxed">
            Crie sua conta e comece a centralizar clientes, processos e tarefas hoje mesmo.
          </p>
          <div className="relative mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => goToLogin('signup')}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-[0.98] hover:-translate-y-0.5"
              style={{ background: 'linear-gradient(135deg,#4338ca,#2563eb)', boxShadow: '0 8px 28px rgba(37,99,235,0.4)' }}
            >
              Começar agora <ArrowRight className="w-4 h-4" />
            </button>
            <a
              href="mailto:contato@legalhub.com.br"
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl text-sm font-semibold text-slate-200 border border-white/15 hover:bg-white/5 transition-all"
            >
              Falar com nosso time
            </a>
          </div>
        </Reveal>
      </section>

      {/* ══ FOOTER ══ */}
      <footer className="relative border-t border-white/5 px-5 sm:px-8 py-12">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex flex-col items-center sm:items-start gap-2">
            <BrandMark size={30} />
            <p className="text-xs text-slate-500">Gestão jurídica inteligente para escritórios de advocacia.</p>
          </div>
          <nav className="flex items-center gap-6">
            {NAV_LINKS.map(l => (
              <a key={l.href} href={l.href} className="text-xs text-slate-400 hover:text-white transition-colors">
                {l.label}
              </a>
            ))}
          </nav>
          <p className="text-xs text-slate-500">© 2026 LegalHub · Todos os direitos reservados</p>
        </div>
      </footer>
    </div>
  )
}
