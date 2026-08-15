import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  Users, Briefcase, CalendarDays, DollarSign, Bell, Handshake,
  ShieldCheck, Layers, LineChart, ArrowRight, Menu, X, CheckCircle2,
  Sparkles, UserPlus, Settings2, Rocket, Building2, Lock, Zap,
  AlertTriangle, Clock, FolderOpen, Wallet, TrendingDown, CalendarClock,
  Quote, Star, Bot, FileText, ChevronRight,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

/** Logomarca oficial (a mesma do Login e do Sidebar) — ícone recortado num chip
 *  escuro, já que /logomarca.png é branca e foi feita para fundo escuro. */
function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="rounded-xl overflow-hidden flex-shrink-0 bg-sidebar-900" style={{ width: size, height: size }}>
        <img src="/logomarca.png" alt="LegalHub"
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '0% 50%' }} />
      </div>
      <span className="font-bold text-lg text-slate-900 tracking-tight">LegalHub</span>
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
  { href: '#dores', label: 'Por que o LegalHub' },
  { href: '#recursos', label: 'Funcionalidades' },
  { href: '#como-funciona', label: 'Como funciona' },
  { href: '#depoimentos', label: 'Depoimentos' },
]

// ─── Dores do cliente que o sistema resolve ────────────────────────────────
const PAIN_POINTS = [
  {
    icon: AlertTriangle,
    problem: 'Prazos e intimações perdidos por falta de acompanhamento manual.',
    solution: 'Sincronização automática com o CNJ (DataJud), PJe, Escavador e Jusbrasil — nenhuma publicação passa despercebida.',
  },
  {
    icon: FolderOpen,
    problem: 'Informação de clientes e processos espalhada em planilhas, WhatsApp e papel.',
    solution: 'Clientes, processos, tarefas e documentos centralizados em um só lugar, conectados entre si.',
  },
  {
    icon: Wallet,
    problem: 'Financeiro do escritório sem controle real de recebíveis, comissões e despesas.',
    solution: 'Contas a pagar e a receber, comissões de parceiros e despesas pessoais organizadas por mês, com metas de orçamento.',
  },
  {
    icon: TrendingDown,
    problem: 'Falta de visibilidade sobre a produtividade e o desempenho da equipe.',
    solution: 'Dashboard e relatórios de desempenho mostram o que cada advogado, estagiário e colaborador está entregando.',
  },
  {
    icon: Users,
    problem: 'Cliente sem retorno sobre o andamento do próprio processo, gerando ligações e cobranças.',
    solution: 'Portal do Cliente exclusivo, onde cada cliente acompanha processos, financeiro e documentos em tempo real.',
  },
  {
    icon: CalendarClock,
    problem: 'Agenda do escritório desencontrada da agenda pessoal de cada advogado.',
    solution: 'Tarefas com prazo viram compromisso automaticamente na agenda do escritório e no Google Calendar de cada um.',
  },
]

// ─── Funcionalidades demonstradas ───────────────────────────────────────────
const FEATURES = [
  {
    icon: Layers,
    title: 'Dashboard inteligente',
    description: 'Visão geral, lista, quadro kanban e desempenho — acompanhe o escritório do jeito que fizer mais sentido pra você.',
  },
  {
    icon: Users,
    title: 'Clientes',
    description: 'Cadastro completo de pessoa física e jurídica, com busca automática de CPF/CNPJ, importação por CSV e alerta de clientes duplicados.',
  },
  {
    icon: Briefcase,
    title: 'Processos',
    description: 'Acompanhe cada caso por fase — negociação, conhecimento, recursal, execução — com honorários, prazos e valores organizados.',
  },
  {
    icon: CheckCircle2,
    title: 'Tarefas & Atividades',
    description: 'Quadro kanban com recorrência semanal, mensal ou anual, notificações automáticas e cálculo de prazo processual.',
  },
  {
    icon: CalendarDays,
    title: 'Agenda conectada ao Google',
    description: 'Tarefas com prazo viram compromisso automaticamente na agenda do escritório e no Google Calendar de cada advogado.',
    flagship: true,
  },
  {
    icon: DollarSign,
    title: 'Financeiro completo',
    description: 'Contas a pagar e a receber, comissões de parceiros e um board kanban mensal para suas despesas pessoais, com metas por categoria.',
  },
  {
    icon: Bell,
    title: 'Publicações & Intimações',
    description: 'Sincronização automática com CNJ, PJe, Escavador e Jusbrasil para você nunca perder um prazo por falta de aviso.',
  },
  {
    icon: Building2,
    title: 'Portal do Cliente',
    description: 'Um espaço exclusivo onde cada cliente acompanha seus próprios processos, financeiro e documentos — sem ligar pra saber novidades.',
  },
  {
    icon: Bot,
    title: 'Copiloto de IA',
    description: 'Um assistente dentro do próprio sistema, pronto para ajudar sua equipe a encontrar informação e agilizar tarefas do dia a dia.',
  },
]

const MORE_FEATURES = [
  { icon: FileText, label: 'Biblioteca de documentos' },
  { icon: Handshake, label: 'Parceiros & comissões' },
  { icon: LineChart, label: 'Relatórios de desempenho' },
  { icon: Lock, label: 'Controle de acesso por função' },
  { icon: ShieldCheck, label: 'Dados isolados por escritório' },
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

const STATS = [
  { icon: Layers, value: '10+', label: 'Módulos integrados' },
  { icon: Building2, value: '100%', label: 'Dados isolados por escritório' },
  { icon: Zap, value: 'Automática', label: 'Sincronização com CNJ e Google' },
  { icon: Lock, value: 'Por função', label: 'Controle de acesso' },
]

// Depoimentos — placeholders prontos para receber avaliações reais de clientes.
const TESTIMONIALS = [
  {
    quote: 'Escreva aqui o que o seu cliente disse sobre o resultado que teve com o LegalHub — o quanto de tempo economizou, quantos prazos deixou de perder, etc.',
    name: 'Nome do cliente',
    role: 'Cargo · Nome do escritório',
  },
  {
    quote: 'Escreva aqui um segundo depoimento, de preferência sobre um módulo diferente do sistema — financeiro, portal do cliente, agenda.',
    name: 'Nome do cliente',
    role: 'Cargo · Nome do escritório',
  },
  {
    quote: 'Escreva aqui um terceiro depoimento, curto e direto, focado no problema que o escritório tinha antes de usar o LegalHub.',
    name: 'Nome do cliente',
    role: 'Cargo · Nome do escritório',
  },
]

/** Fundo com pontos sutis + manchas de luz azul, para seções claras. */
function SoftBackdrop({ className = '' }: { className?: string }) {
  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      <div
        className="absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          maskImage: 'radial-gradient(ellipse 65% 55% at 50% 15%, black, transparent)',
        }}
      />
      <div
        className="absolute -top-32 left-1/4 w-[34rem] h-[34rem] rounded-full blur-3xl opacity-[0.18] animate-[float_9s_ease-in-out_infinite]"
        style={{ background: 'radial-gradient(circle, #3b82f6, transparent 70%)' }}
      />
      <div
        className="absolute top-1/3 -right-32 w-[28rem] h-[28rem] rounded-full blur-3xl opacity-[0.14] animate-[float_11s_ease-in-out_infinite_1.5s]"
        style={{ background: 'radial-gradient(circle, #2563eb, transparent 70%)' }}
      />
    </div>
  )
}

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
    <div className="min-h-screen bg-white text-slate-900 relative">
      <style>{`
        @keyframes float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-24px) } }
        @keyframes floatCard { 0%,100% { transform: translateY(0) rotate(var(--rot,0deg)) } 50% { transform: translateY(-10px) rotate(var(--rot,0deg)) } }
        @keyframes shine { 0% { transform: translateX(-120%) skewX(-15deg) } 100% { transform: translateX(220%) skewX(-15deg) } }
      `}</style>

      {/* ══ NAVBAR ══ */}
      <header
        className="fixed top-0 inset-x-0 z-50 transition-colors duration-200"
        style={{
          background: scrolled ? 'rgba(255,255,255,0.9)' : 'transparent',
          backdropFilter: scrolled ? 'blur(12px)' : 'none',
          borderBottom: scrolled ? '1px solid #e2e8f0' : '1px solid transparent',
        }}
      >
        <div className="max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <BrandMark size={32} />

          <nav className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map(l => (
              <a key={l.href} href={l.href} className="relative text-sm text-slate-600 hover:text-slate-900 transition-colors group">
                {l.label}
                <span className="absolute -bottom-1.5 left-0 w-0 h-px bg-blue-600 transition-all duration-300 group-hover:w-full" />
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <button onClick={() => goToLogin('login')} className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors px-3 py-2">
              Entrar
            </button>
            <button
              onClick={() => goToLogin('signup')}
              className="relative overflow-hidden flex items-center gap-1.5 text-sm font-semibold text-white px-4 py-2.5 rounded-xl transition-all active:scale-[0.97] hover:brightness-110 bg-blue-600"
              style={{ boxShadow: '0 4px 18px rgba(37,99,235,0.30)' }}
            >
              Começar agora <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <button className="md:hidden text-slate-700" onClick={() => setMenuOpen(v => !v)}>
            {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {menuOpen && (
          <div className="md:hidden px-5 pb-5 pt-1 space-y-3 bg-white border-b border-slate-100">
            {NAV_LINKS.map(l => (
              <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)} className="block text-sm text-slate-600 py-1.5">
                {l.label}
              </a>
            ))}
            <div className="flex flex-col gap-2 pt-2">
              <button onClick={() => goToLogin('login')} className="w-full text-center text-sm font-medium text-slate-700 border border-slate-200 rounded-xl py-2.5">
                Entrar
              </button>
              <button
                onClick={() => goToLogin('signup')}
                className="w-full text-center text-sm font-semibold text-white rounded-xl py-2.5 bg-blue-600"
              >
                Começar agora
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ══ HERO ══ */}
      <section className="relative pt-36 pb-24 sm:pt-48 sm:pb-32 px-5 sm:px-8 overflow-hidden">
        <SoftBackdrop />
        <div className="relative max-w-4xl mx-auto text-center">
          <Reveal>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold text-blue-700 border border-blue-200 bg-blue-50 mb-7">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              Gestão jurídica em um só lugar
            </div>
          </Reveal>

          <Reveal delay={80}>
            <h1 className="text-4xl sm:text-6xl lg:text-[4.25rem] font-bold tracking-tight leading-[1.1] max-w-4xl mx-auto text-slate-900" style={{ textWrap: 'balance' } as React.CSSProperties}>
              Chega de prazo perdido e planilha solta.{' '}
              <span className="text-blue-600">
                Gestão jurídica de verdade
              </span>
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p className="mt-7 text-base sm:text-lg text-slate-500 max-w-2xl mx-auto leading-relaxed">
              Centralize clientes, processos, tarefas, agenda e financeiro do seu escritório de advocacia
              em uma única plataforma — com sincronização automática ao CNJ e ao Google Agenda, e dados
              sempre à mão para decidir com segurança.
            </p>
          </Reveal>

          <Reveal delay={240}>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => goToLogin('signup')}
                className="relative overflow-hidden group w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-[0.98] hover:-translate-y-0.5 bg-blue-600"
                style={{ boxShadow: '0 8px 28px rgba(37,99,235,0.35)' }}
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
                className="w-full sm:w-auto px-7 py-3.5 rounded-xl text-sm font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all"
              >
                Já tenho uma conta
              </button>
            </div>
          </Reveal>

          <Reveal delay={300}>
            <p className="mt-5 text-xs text-slate-400">Não é necessário cartão de crédito para começar.</p>
          </Reveal>
        </div>

        {/* Mockup do produto com cards flutuantes */}
        <Reveal delay={360} className="relative max-w-5xl mx-auto mt-20 sm:mt-24">
          <div
            className="rounded-2xl border border-slate-200 overflow-hidden bg-white"
            style={{ boxShadow: '0 40px 100px -20px rgba(15,23,42,0.18)' }}
          >
            <div className="flex items-center gap-1.5 px-4 py-3 border-b border-slate-100 bg-slate-50">
              <span className="w-2.5 h-2.5 rounded-full bg-red-300" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-300" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-300" />
              <div className="ml-4 flex-1 max-w-xs h-6 rounded-md bg-white border border-slate-200" />
            </div>
            <div className="flex">
              {/* Mini sidebar, igual à sidebar real do sistema */}
              <div className="hidden sm:flex flex-col items-center gap-3 py-6 px-3 border-r border-slate-100" style={{ background: '#0a1628' }}>
                {[Users, Briefcase, CalendarDays, DollarSign].map((Icon, i) => (
                  <div key={i} className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center',
                    i === 0 ? 'bg-blue-600' : 'bg-white/5'
                  )}>
                    <Icon className="w-4 h-4 text-slate-300" />
                  </div>
                ))}
              </div>

              <div className="flex-1 p-5 sm:p-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { label: 'Processos ativos', value: '128', accent: 'bg-blue-500' },
                  { label: 'Tarefas concluídas no mês', value: '342', accent: 'bg-emerald-500' },
                  { label: 'Honorários a receber', value: 'R$ 84.2k', accent: 'bg-violet-500' },
                ].map(card => (
                  <div key={card.label} className="rounded-xl p-5 border border-slate-200 bg-white transition-transform hover:-translate-y-0.5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <p className="text-2xl font-bold text-slate-900">{card.value}</p>
                    <p className="text-xs text-slate-500 mt-1">{card.label}</p>
                    <div className={cn('h-1 w-8 rounded-full mt-3', card.accent)} />
                  </div>
                ))}
                <div className="sm:col-span-3 rounded-xl border border-slate-200 p-5 bg-slate-50">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm font-semibold text-slate-700">Quadro de atividades</p>
                    <span className="text-[11px] text-slate-400">Sincronizado com a agenda</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {['Hoje', 'Próximos 7 dias', 'Fazendo', 'Concluídas'].map((col, i) => (
                      <div key={col} className="rounded-lg border border-slate-200 p-3 bg-white">
                        <p className="text-[11px] font-semibold text-slate-500 mb-2">{col}</p>
                        <div className="space-y-1.5">
                          {Array.from({ length: i === 3 ? 1 : 2 }).map((_, j) => (
                            <div key={j} className="h-2 rounded-full bg-slate-100" style={{ width: `${70 - j * 15}%` }} />
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
            className="hidden lg:flex absolute -left-10 top-16 items-center gap-2.5 px-4 py-3 rounded-xl border border-slate-200 bg-white"
            style={{ boxShadow: '0 12px 32px rgba(15,23,42,0.12)', animation: 'floatCard 6s ease-in-out infinite', ['--rot' as any]: '-3deg' }}
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-emerald-50">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-800">Tarefa sincronizada</p>
              <p className="text-[10px] text-slate-400">Google Calendar atualizado</p>
            </div>
          </div>

          <div
            className="hidden lg:flex absolute -right-8 bottom-20 items-center gap-2.5 px-4 py-3 rounded-xl border border-slate-200 bg-white"
            style={{ boxShadow: '0 12px 32px rgba(15,23,42,0.12)', animation: 'floatCard 7s ease-in-out infinite 1s', ['--rot' as any]: '2deg' }}
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-50">
              <Bell className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-800">Nova intimação CNJ</p>
              <p className="text-[10px] text-slate-400">Sincronizada automaticamente</p>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ══ TRUST / STATS BAR ══ */}
      <section className="relative border-y border-slate-100 py-10 px-5 sm:px-8 bg-slate-50">
        <div className="max-w-6xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-6">
          {STATS.map((s, i) => (
            <Reveal key={s.label} delay={i * 80} className="flex items-center gap-3 justify-center lg:justify-start">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-blue-100">
                <s.icon className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900 leading-none">{s.value}</p>
                <p className="text-[11px] text-slate-500 mt-1">{s.label}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ══ DORES DO CLIENTE ══ */}
      <section id="dores" className="relative py-24 sm:py-32 px-5 sm:px-8 border-b border-slate-100">
        <div className="max-w-6xl mx-auto">
          <Reveal className="max-w-2xl mx-auto text-center mb-16">
            <span className="text-xs font-bold uppercase tracking-widest text-blue-600">Por que o LegalHub</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
              Os problemas que consomem o seu dia — resolvidos
            </h2>
            <p className="mt-4 text-slate-500 leading-relaxed">
              Se algum destes cenários é familiar, é exatamente aí que o LegalHub entra.
            </p>
          </Reveal>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {PAIN_POINTS.map((p, i) => (
              <Reveal key={p.problem} delay={i * 70} className="rounded-2xl border border-slate-200 bg-white p-6 hover:shadow-card-hover transition-shadow">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-red-50 mb-4">
                  <p.icon className="w-5 h-5 text-red-500" />
                </div>
                <p className="text-xs font-semibold uppercase tracking-wide text-red-500/80 mb-1.5">O problema</p>
                <p className="text-sm text-slate-700 leading-relaxed">{p.problem}</p>

                <div className="my-4 flex items-center gap-2">
                  <div className="flex-1 h-px bg-slate-100" />
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300 rotate-90" />
                  <div className="flex-1 h-px bg-slate-100" />
                </div>

                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 mb-1.5">Com o LegalHub</p>
                <p className="text-sm text-slate-600 leading-relaxed">{p.solution}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ RECURSOS ══ */}
      <section id="recursos" className="relative py-24 sm:py-32 px-5 sm:px-8 border-b border-slate-100 bg-slate-50/60">
        <div className="max-w-6xl mx-auto">
          <Reveal className="max-w-2xl mx-auto text-center mb-16">
            <span className="text-xs font-bold uppercase tracking-widest text-blue-600">Funcionalidades</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">Tudo que o seu escritório precisa</h2>
            <p className="mt-4 text-slate-500 leading-relaxed">
              Um sistema pensado para o dia a dia jurídico — do primeiro contato do cliente até a conclusão do processo.
            </p>
          </Reveal>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => (
              <Reveal
                key={f.title}
                delay={i * 60}
                className={cn(
                  'group relative rounded-2xl p-7 border overflow-hidden transition-all duration-300 hover:-translate-y-1 bg-white',
                  f.flagship ? 'border-blue-200 hover:border-blue-300' : 'border-slate-200 hover:border-slate-300'
                )}
                style={f.flagship ? { boxShadow: '0 1px 3px rgba(37,99,235,0.06)' } : undefined}
              >
                {f.flagship && (
                  <div
                    className="pointer-events-none absolute -top-16 -right-16 w-48 h-48 rounded-full blur-3xl opacity-[0.12]"
                    style={{ background: 'radial-gradient(circle, #2563eb, transparent 70%)' }}
                  />
                )}
                <div
                  className={cn(
                    'relative w-11 h-11 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110',
                    f.flagship ? 'bg-blue-600' : 'bg-blue-50'
                  )}
                >
                  <f.icon className={cn('w-5 h-5', f.flagship ? 'text-white' : 'text-blue-600')} />
                </div>
                <h3 className="relative text-base sm:text-lg font-semibold text-slate-900">{f.title}</h3>
                <p className="relative mt-2 text-sm text-slate-500 leading-relaxed max-w-md">{f.description}</p>
              </Reveal>
            ))}
          </div>

          <Reveal delay={200} className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">E também</p>
            <div className="flex flex-wrap gap-3">
              {MORE_FEATURES.map(m => (
                <div key={m.label} className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-600">
                  <m.icon className="w-4 h-4 text-blue-600 flex-shrink-0" />
                  {m.label}
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══ COMO FUNCIONA ══ */}
      <section id="como-funciona" className="relative py-24 sm:py-32 px-5 sm:px-8 border-b border-slate-100">
        <div className="max-w-5xl mx-auto">
          <Reveal className="max-w-2xl mx-auto text-center mb-16">
            <span className="text-xs font-bold uppercase tracking-widest text-blue-600">Como funciona</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">Do cadastro ao dia a dia, em três passos</h2>
          </Reveal>

          <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-10">
            <div className="hidden sm:block absolute top-7 left-[16.5%] right-[16.5%] h-px bg-slate-200" />
            {STEPS.map((s, i) => (
              <Reveal key={s.title} delay={i * 120} className="relative text-center">
                <div className="relative z-10 w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-5 border border-slate-200 bg-white" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  <s.icon className="w-6 h-6 text-blue-600" />
                  <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center text-white bg-blue-600">
                    {i + 1}
                  </span>
                </div>
                <h3 className="text-base font-semibold text-slate-900">{s.title}</h3>
                <p className="mt-2 text-sm text-slate-500 leading-relaxed max-w-xs mx-auto">{s.description}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ DEPOIMENTOS ══ */}
      <section id="depoimentos" className="relative py-24 sm:py-32 px-5 sm:px-8 border-b border-slate-100 bg-slate-50/60">
        <div className="max-w-6xl mx-auto">
          <Reveal className="max-w-2xl mx-auto text-center mb-16">
            <span className="text-xs font-bold uppercase tracking-widest text-blue-600">Depoimentos</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">Quem usa, recomenda</h2>
          </Reveal>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {TESTIMONIALS.map((t, i) => (
              <Reveal key={i} delay={i * 100} className="rounded-2xl border border-slate-200 bg-white p-7 flex flex-col">
                <Quote className="w-6 h-6 text-blue-200 mb-4" />
                <div className="flex items-center gap-0.5 mb-3">
                  {Array.from({ length: 5 }).map((_, j) => <Star key={j} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />)}
                </div>
                <p className="text-sm text-slate-600 leading-relaxed flex-1">{t.quote}</p>
                <div className="flex items-center gap-3 mt-6 pt-5 border-t border-slate-100">
                  <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700 flex-shrink-0">
                    {t.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{t.name}</p>
                    <p className="text-xs text-slate-400 truncate">{t.role}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ VANTAGENS ══ */}
      <section id="vantagens" className="relative py-24 sm:py-32 px-5 sm:px-8 border-b border-slate-100">
        <div className="relative max-w-6xl mx-auto">
          <Reveal className="max-w-2xl mx-auto text-center mb-16">
            <span className="text-xs font-bold uppercase tracking-widest text-blue-600">Vantagens</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">Por que escritórios escolhem o LegalHub</h2>
          </Reveal>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {[
              { icon: Layers, title: 'Tudo integrado', description: 'Clientes, processos, tarefas, agenda e financeiro conversam entre si — sem planilhas soltas ou retrabalho.' },
              { icon: ShieldCheck, title: 'Segurança de dados', description: 'Cada escritório opera isolado, com controle de acesso por função: administrador, advogado, estagiário ou financeiro.' },
              { icon: LineChart, title: 'Decisões com dados', description: 'Relatórios de desempenho e produtividade para você enxergar o escritório com clareza, não achismo.' },
            ].map((b, i) => (
              <Reveal key={b.title} delay={i * 100} className="text-center sm:text-left">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5 mx-auto sm:mx-0 bg-blue-600">
                  <b.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">{b.title}</h3>
                <p className="mt-2.5 text-sm text-slate-500 leading-relaxed">{b.description}</p>
              </Reveal>
            ))}
          </div>

          <Reveal delay={200} className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
            {['Multi-tenant e multiusuário', 'Controle de acesso por função', 'Relatórios de desempenho'].map(item => (
              <div key={item} className="flex items-center gap-2.5 text-sm text-slate-600">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                {item}
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ══ CTA FINAL ══ */}
      <section id="contato" className="relative py-24 sm:py-32 px-5 sm:px-8">
        <Reveal className="relative max-w-4xl mx-auto text-center rounded-3xl px-6 py-16 sm:px-16 sm:py-20 overflow-hidden border border-blue-500/20">
          <div className="absolute inset-0 bg-blue-600" />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage: 'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />
          <div
            className="pointer-events-none absolute -top-24 -right-24 w-72 h-72 rounded-full blur-3xl opacity-30 animate-[float_8s_ease-in-out_infinite]"
            style={{ background: 'radial-gradient(circle, #60a5fa, transparent 70%)' }}
          />
          <div
            className="pointer-events-none absolute -bottom-24 -left-24 w-72 h-72 rounded-full blur-3xl opacity-20 animate-[float_10s_ease-in-out_infinite_1s]"
            style={{ background: 'radial-gradient(circle, #1e3a8a, transparent 70%)' }}
          />
          <h2 className="relative text-3xl sm:text-4xl font-bold tracking-tight text-white">Pronto para organizar seu escritório?</h2>
          <p className="relative mt-4 text-blue-100 max-w-xl mx-auto leading-relaxed">
            Crie sua conta e comece a centralizar clientes, processos e tarefas hoje mesmo.
          </p>
          <div className="relative mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => goToLogin('signup')}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-sm font-semibold text-blue-700 bg-white transition-all active:scale-[0.98] hover:-translate-y-0.5"
            >
              Começar agora <ArrowRight className="w-4 h-4" />
            </button>
            <a
              href="mailto:contato@legalhub.com.br"
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl text-sm font-semibold text-white border border-white/30 hover:bg-white/10 transition-all"
            >
              Falar com nosso time
            </a>
          </div>
        </Reveal>
      </section>

      {/* ══ FOOTER ══ */}
      <footer className="relative border-t border-slate-100 px-5 sm:px-8 py-12">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex flex-col items-center sm:items-start gap-2">
            <BrandMark size={28} />
            <p className="text-xs text-slate-400">Gestão jurídica inteligente para escritórios de advocacia.</p>
          </div>
          <nav className="flex items-center gap-6">
            {NAV_LINKS.map(l => (
              <a key={l.href} href={l.href} className="text-xs text-slate-500 hover:text-slate-900 transition-colors">
                {l.label}
              </a>
            ))}
          </nav>
          <p className="text-xs text-slate-400">© 2026 LegalHub · Todos os direitos reservados</p>
        </div>
      </footer>
    </div>
  )
}
