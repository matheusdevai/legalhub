import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  ArrowRight, Menu, X, CheckCircle2, ChevronRight, Play, Mail, MapPin,
  Bell, CalendarDays, DollarSign, FolderOpen, Sparkles, HardDrive, Users,
  UserCheck, ShieldCheck, Lock, KeyRound, Building2, FileSpreadsheet, Smartphone,
  Briefcase, Clock, Zap,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { BrowserFrame, DemoVideo } from './DemoVideo'
import { ProductTour } from './ProductTour'
import {
  FAQS, PLANS, PROMO_ACTIVE, PROMO_LAST_DAY, PROMO_MONTHLY_PRICE, TRIAL_DAYS,
  recommendedPlanFor, tourVideo,
} from './landingData'

/** Logomarca oficial (a mesma do Login e do Sidebar) — ícone recortado num chip
 *  escuro, já que /logomarca.png é branca e foi feita para fundo escuro. */
function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="rounded-xl overflow-hidden flex-shrink-0 bg-[#06152D]" style={{ width: size, height: size }}>
        <img src="/logomarca.png" alt="LegalHub"
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '0% 50%' }} />
      </div>
      <div className="flex flex-col leading-none">
        <span className="font-bold tracking-tight text-[color:var(--lh-fg)]" style={{ fontSize: size * 0.5 }}>LegalHub</span>
        <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[color:var(--lh-muted)] mt-0.5">Gestão jurídica inteligente</span>
      </div>
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
    }, { threshold: 0.12 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={cn('transition-all duration-700 ease-out motion-reduce:transition-none', visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8 motion-reduce:opacity-100 motion-reduce:translate-y-0', className)}
      style={{ transitionDelay: `${delay}ms`, ...style }}
    >
      {children}
    </div>
  )
}

/** Rótulo pequeno em versalete azul, usado no topo de cada seção. */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#1677FF]">{children}</span>
}

function SectionHeading({ eyebrow, title, subtitle, center = true }: { eyebrow: string; title: React.ReactNode; subtitle?: string; center?: boolean }) {
  return (
    <Reveal className={cn('max-w-2xl mb-12 sm:mb-14', center && 'mx-auto text-center')}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-3 font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-[color:var(--lh-fg)]" style={{ textWrap: 'balance' } as React.CSSProperties}>{title}</h2>
      {subtitle && <p className="mt-4 text-[color:var(--lh-muted)] leading-relaxed">{subtitle}</p>}
    </Reveal>
  )
}

const NAV_LINKS = [
  { href: '#demonstracao', label: 'Demonstração' },
  { href: '#recursos', label: 'Recursos' },
  { href: '#seguranca', label: 'Segurança' },
  { href: '#planos', label: 'Planos' },
  { href: '#faq', label: 'Dúvidas' },
]

// Fontes de dados e serviços com que o sistema de fato se conecta hoje.
const INTEGRATIONS = ['DJEN · Comunica PJe (CNJ)', 'DataJud (CNJ)', 'Google Agenda', 'Google Drive', 'Escavador', 'Jusbrasil', 'Google Gemini']

const PAINS = [
  { icon: Clock, title: 'Prazo perdido no meio de e-mails e planilhas', fix: 'Intimações importadas todo dia e prazo calculado em dias úteis, já com tarefa e lembrete.' },
  { icon: FileSpreadsheet, title: 'Honorários espalhados em cadernos e extratos', fix: 'Planilha de lançamentos, recorrências e fluxo de caixa num só lugar.' },
  { icon: Users, title: 'Ninguém sabe quem está cuidando do quê', fix: 'Tarefas distribuídas automaticamente para quem está com menos carga.' },
]

// Grade de 4 colunas no desktop: `wide` ocupa 2 — a ordem abaixo fecha 3 linhas cheias.
const FEATURES = [
  { icon: Bell, title: 'Intimações automáticas', description: 'Sincronização diária com o DJEN pela sua OAB, cobrindo tribunais estaduais e federais.', wide: true },
  { icon: Clock, title: 'Cálculo de prazos', description: 'Dias úteis ou corridos, com a tarefa criada e a data na agenda.' },
  { icon: FolderOpen, title: 'Processos por fase', description: 'Negociação, conhecimento, recursal, execução. Tudo por cliente e por parceiro.' },
  { icon: CalendarDays, title: 'Agenda + Google', description: 'Audiências, prazos e reuniões sincronizados com o Google Agenda.' },
  { icon: HardDrive, title: 'Escritório Digital', description: 'Documentos organizados por cliente, com integração ao Google Drive.' },
  { icon: DollarSign, title: 'Financeiro completo', description: 'Contas a pagar e receber, recorrentes, fluxo de caixa e comissões de parceiros.', wide: true },
  { icon: Sparkles, title: 'IA jurídica', description: 'Análises de processo, petições e recursos gerados a partir dos autos e dos documentos anexados.', wide: true },
  { icon: UserCheck, title: 'Portal do Cliente', description: 'Seu cliente acompanha os próprios processos, documentos e pagamentos com login próprio.', wide: true },
]

const STEPS = [
  { title: 'Crie a conta', description: `Cadastro em 1 minuto, sem cartão. ${TRIAL_DAYS} dias com todos os recursos do plano Pro.` },
  { title: 'Traga seus dados', description: 'Importe clientes por CSV e conecte sua OAB para puxar processos e intimações.' },
  { title: 'Trabalhe com a equipe', description: 'Convide advogados, estagiários e financeiro, cada um com as permissões da função.' },
]

const SECURITY = [
  { icon: Building2, title: 'Dados isolados por escritório', description: 'Cada escritório só enxerga os próprios registros, regra aplicada direto no banco de dados.' },
  { icon: KeyRound, title: 'Permissões por função', description: 'Administrador, advogado, estagiário e financeiro veem e editam só o que lhes cabe.' },
  { icon: ShieldCheck, title: 'Monitoramento de acessos', description: 'Login incomum, tentativas de força bruta e exportações em massa ficam registrados.' },
  { icon: Lock, title: 'Conexão criptografada', description: 'Todo o tráfego passa por HTTPS. Consentimento LGPD registrado no cadastro do cliente.' },
]

export function LandingPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [showStickyCta, setShowStickyCta] = useState(false)
  const [faqOpen, setFaqOpen] = useState<number | null>(0)
  const [processCount, setProcessCount] = useState(300)

  const recommendedPlanId = recommendedPlanFor(processCount)

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8)
      setShowStickyCta(window.scrollY > 700)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const prev = document.documentElement.style.scrollBehavior
    document.documentElement.style.scrollBehavior = 'smooth'
    return () => { document.documentElement.style.scrollBehavior = prev }
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  if (!loading && session) return <Navigate to="/dashboard" replace />

  function goToLogin(mode: 'login' | 'signup' = 'login') {
    navigate('/login', { state: { mode } })
  }

  const hero = tourVideo('painel')

  return (
    <div className="lh-dark min-h-screen text-[color:var(--lh-fg)] relative overflow-x-clip" style={{ background: '#020711' }}>
      <style>{`
        @keyframes float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-14px) } }
        @keyframes marquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        html { scroll-padding-top: 80px; }
        /* Tema por seção: escuro por padrão; .lh-light deixa a seção branca */
        .lh-dark { --lh-fg: #fff; --lh-muted: #A7B0C0; --lh-soft: #cfd6e2; --lh-border: rgba(255,255,255,0.1);
          --lh-border-strong: rgba(255,255,255,0.18); --lh-divider: rgba(255,255,255,0.06); --lh-card: rgba(255,255,255,0.02);
          --lh-card-2: rgba(255,255,255,0.04); --lh-chip: rgba(255,255,255,0.06); --lh-hover: rgba(255,255,255,0.08); --lh-ok: #34d399; }
        .lh-light { background: #fff; --lh-fg: #0b1220; --lh-muted: #5b6577; --lh-soft: #334155; --lh-border: #e3e8f0;
          --lh-border-strong: #cdd5e1; --lh-divider: #e9edf3; --lh-card: #fff; --lh-card-2: #f5f8ff; --lh-chip: #eef2f8;
          --lh-hover: #e6ebf3; --lh-ok: #059669; }
        .lh-light-alt { background: #f5f7fb; }
        .lh-light .lh-card { box-shadow: 0 1px 2px rgba(16,24,40,0.04), 0 10px 30px -14px rgba(16,24,40,0.12); }
        .lh-demo-video::cue { background: rgba(2,7,17,0.82); color: #fff; font-family: Inter, system-ui, sans-serif; font-size: 15px; line-height: 1.4; }
        .lh-demo-video-lg::cue { font-size: 22px; }
        @media (max-width: 640px) { .lh-demo-video::cue { font-size: 12px; } }
        a:focus-visible, button:focus-visible, input:focus-visible {
          outline: 2px solid #1677FF; outline-offset: 2px; border-radius: 6px;
        }
        @media (prefers-reduced-motion: reduce) {
          .lh-float, .lh-marquee { animation: none !important; }
        }
      `}</style>

      {/* ══ NAVBAR ══ */}
      <header
        className="fixed top-0 inset-x-0 z-50 transition-colors duration-200"
        style={{
          background: scrolled || menuOpen ? 'rgba(2,7,17,0.88)' : 'transparent',
          backdropFilter: scrolled || menuOpen ? 'blur(14px)' : 'none',
          borderBottom: scrolled ? '1px solid rgba(255,255,255,0.08)' : '1px solid transparent',
        }}
      >
        <div className="max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-4">
          <a href="#topo" aria-label="LegalHub, início"><BrandMark size={38} /></a>

          <nav className="hidden lg:flex items-center gap-7" aria-label="Seções">
            {NAV_LINKS.map(l => (
              <a key={l.href} href={l.href} className="relative text-sm text-[color:var(--lh-muted)] hover:text-white transition-colors group">
                {l.label}
                <span className="absolute -bottom-1.5 left-0 w-0 h-px bg-[#1677FF] transition-all duration-300 group-hover:w-full" />
              </a>
            ))}
          </nav>

          <div className="hidden lg:flex items-center gap-2">
            <button onClick={() => goToLogin('login')} className="text-sm font-medium text-[color:var(--lh-muted)] hover:text-white transition-colors px-3 py-2">
              Entrar
            </button>
            <button
              onClick={() => goToLogin('signup')}
              className="flex items-center gap-1.5 text-sm font-semibold text-white px-4 py-2.5 rounded-full transition-all active:scale-[0.97] hover:brightness-110 bg-[#0B5CFF]"
              style={{ boxShadow: '0 4px 18px rgba(11,92,255,0.4)' }}
            >
              Testar grátis <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <button className="lg:hidden w-10 h-10 -mr-2 flex items-center justify-center text-[color:var(--lh-fg)]" onClick={() => setMenuOpen(v => !v)}
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'} aria-expanded={menuOpen} aria-controls="mobile-menu">
            {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {menuOpen && (
          <div id="mobile-menu" className="lg:hidden px-5 pb-6 pt-2 border-b border-[color:var(--lh-border)] animate-fade-in">
            <nav className="flex flex-col" aria-label="Seções">
              {NAV_LINKS.map(l => (
                <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)} className="text-base text-[color:var(--lh-soft)] py-3 border-b border-[color:var(--lh-divider)]">
                  {l.label}
                </a>
              ))}
            </nav>
            <div className="grid grid-cols-2 gap-2 pt-5">
              <button onClick={() => goToLogin('login')} className="text-center text-sm font-medium text-[color:var(--lh-fg)] border border-[color:var(--lh-border-strong)] rounded-full py-3">
                Entrar
              </button>
              <button onClick={() => goToLogin('signup')} className="text-center text-sm font-semibold text-white rounded-full py-3 bg-[#0B5CFF]">
                Testar grátis
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ══ HERO ══ */}
      <section id="topo" className="relative pt-28 sm:pt-36 pb-16 sm:pb-24 px-5 sm:px-8">
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)',
            backgroundSize: '26px 26px',
            maskImage: 'radial-gradient(ellipse 70% 55% at 50% 0%, black, transparent)',
            WebkitMaskImage: 'radial-gradient(ellipse 70% 55% at 50% 0%, black, transparent)',
          }}
        />
        <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[60rem] max-w-[140vw] h-[36rem] rounded-full blur-3xl opacity-25"
          style={{ background: 'radial-gradient(ellipse, #0B5CFF, transparent 65%)' }} />

        <div className="relative max-w-4xl mx-auto text-center">
          <Reveal>
            <div className="inline-flex items-center gap-2 pl-2.5 pr-3.5 py-1.5 rounded-full border border-[color:var(--lh-border)] bg-[color:var(--lh-card-2)] lh-card mb-6">
              <span className="relative flex h-2 w-2 flex-shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#1677FF] opacity-75 motion-reduce:hidden" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#1677FF]" />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[color:var(--lh-muted)]">Intimações do DJEN direto no seu painel</span>
            </div>
          </Reveal>

          <Reveal delay={80}>
            <h1 className="font-serif text-[2.4rem] leading-[1.08] sm:text-6xl lg:text-[4.2rem] font-semibold tracking-tight text-[color:var(--lh-fg)]" style={{ textWrap: 'balance' } as React.CSSProperties}>
              O escritório inteiro em um só sistema. <span className="text-[#1677FF]">Nenhum prazo esquecido.</span>
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p className="mt-6 text-base sm:text-lg text-[color:var(--lh-muted)] max-w-2xl mx-auto leading-relaxed">
              Processos, intimações, prazos, agenda, clientes e financeiro do seu escritório de advocacia, com sincronização automática
              pela sua OAB e inteligência artificial para as peças do dia a dia.
            </p>
          </Reveal>

          <Reveal delay={240}>
            <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => goToLogin('signup')}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-3.5 rounded-full text-sm font-semibold text-white transition-all active:scale-[0.98] hover:-translate-y-0.5 bg-[#0B5CFF] hover:brightness-110"
                style={{ boxShadow: '0 10px 30px rgba(11,92,255,0.45)' }}
              >
                Começar {TRIAL_DAYS} dias grátis <ArrowRight className="w-4 h-4" />
              </button>
              <a
                href="#demonstracao"
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-3.5 rounded-full text-sm font-semibold text-[color:var(--lh-fg)] border border-[color:var(--lh-border-strong)] hover:bg-[color:var(--lh-hover)] transition-all"
              >
                <Play className="w-3.5 h-3.5" fill="currentColor" /> Ver o sistema funcionando
              </a>
            </div>
          </Reveal>

          <Reveal delay={300}>
            <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
              {['Sem cartão de crédito', 'Sem fidelidade', 'Funciona no celular'].map(item => (
                <li key={item} className="flex items-center gap-1.5 text-xs text-[color:var(--lh-muted)]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#1677FF] flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        {/* Vídeo do produto */}
        <Reveal delay={380} className="relative max-w-6xl mx-auto mt-14 sm:mt-20">
          <div className="pointer-events-none absolute -inset-x-10 -inset-y-6 -z-10 rounded-[3rem] blur-3xl opacity-40"
            style={{ background: 'radial-gradient(ellipse at 50% 30%, #0B5CFF, transparent 62%)' }} />
          <BrowserFrame path="/dashboard">
            <DemoVideo src={hero.src} poster={hero.poster} label="Demonstração do painel do LegalHub" />
          </BrowserFrame>

          {/* Cartões flutuantes (desktop) — exemplos de eventos reais do sistema */}
          <div className="lh-float hidden md:flex absolute -left-6 lg:-left-12 top-1/4 items-center gap-3 rounded-2xl border border-[color:var(--lh-border)] bg-[#0b1322]/90 backdrop-blur px-4 py-3 shadow-2xl"
            style={{ animation: 'float 6s ease-in-out infinite' }} aria-hidden>
            <span className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center"><Bell className="w-4 h-4 text-amber-400" /></span>
            <span className="text-left">
              <span className="block text-xs font-semibold text-[color:var(--lh-fg)]">Nova intimação importada</span>
              <span className="block text-[11px] text-[color:var(--lh-muted)]">Prazo de 15 dias úteis · vence 19/11</span>
            </span>
          </div>
          <div className="lh-float hidden md:flex absolute -right-6 lg:-right-10 bottom-1/4 items-center gap-3 rounded-2xl border border-[color:var(--lh-border)] bg-[#0b1322]/90 backdrop-blur px-4 py-3 shadow-2xl"
            style={{ animation: 'float 7s ease-in-out infinite 1.2s' }} aria-hidden>
            <span className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center"><CheckCircle2 className="w-4 h-4 text-[color:var(--lh-ok)]" /></span>
            <span className="text-left">
              <span className="block text-xs font-semibold text-[color:var(--lh-fg)]">Tarefa criada e atribuída</span>
              <span className="block text-[11px] text-[color:var(--lh-muted)]">Réplica à contestação · Dra. Helena</span>
            </span>
          </div>
        </Reveal>
      </section>

      {/* ══ INTEGRAÇÕES ══ */}
      <section aria-label="Integrações" className="relative py-10 border-y border-[color:var(--lh-divider)]">
        <p className="text-center text-xs font-bold uppercase tracking-[0.14em] text-[color:var(--lh-muted)] mb-6 px-5">Conectado às fontes que o escritório já usa</p>
        <div className="relative overflow-hidden" style={{ maskImage: 'linear-gradient(90deg, transparent, black 12%, black 88%, transparent)', WebkitMaskImage: 'linear-gradient(90deg, transparent, black 12%, black 88%, transparent)' }}>
          <div className="lh-marquee flex w-max gap-3" style={{ animation: 'marquee 40s linear infinite' }}>
            {[...INTEGRATIONS, ...INTEGRATIONS].map((name, i) => (
              <span key={i} aria-hidden={i >= INTEGRATIONS.length}
                className="flex-shrink-0 px-4 py-2 rounded-full border border-[color:var(--lh-border)] bg-[color:var(--lh-card)] lh-card text-sm font-medium text-[color:var(--lh-soft)] whitespace-nowrap">
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ══ DOR → SOLUÇÃO ══ */}
      <section className="lh-light relative py-20 sm:py-28 px-5 sm:px-8">
        <div className="max-w-6xl mx-auto">
          <SectionHeading eyebrow="Por que o LegalHub" title={<>Feito para a rotina real de quem <span className="text-[#1677FF]">advoga</span></>} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {PAINS.map((p, i) => (
              <Reveal key={p.title} delay={i * 90} className="rounded-2xl border border-[color:var(--lh-border)] bg-[color:var(--lh-card)] lh-card p-6 sm:p-7 flex flex-col">
                <p.icon className="w-5 h-5 text-[color:var(--lh-muted)]" />
                <p className="mt-4 text-sm text-[color:var(--lh-muted)] line-through decoration-[color:var(--lh-border-strong)]">{p.title}</p>
                <p className="mt-3 text-base font-medium text-[color:var(--lh-fg)] leading-snug flex gap-2">
                  <Zap className="w-4 h-4 text-[#1677FF] flex-shrink-0 mt-1" />{p.fix}
                </p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ DEMONSTRAÇÃO (tour em vídeo) ══ */}
      <section id="demonstracao" className="relative py-20 sm:py-28 px-5 sm:px-8 border-t border-[color:var(--lh-divider)]">
        <div className="pointer-events-none absolute top-1/3 right-0 w-[30rem] h-[30rem] rounded-full blur-3xl opacity-[0.12]"
          style={{ background: 'radial-gradient(circle, #0B5CFF, transparent 70%)' }} />
        <div className="relative max-w-7xl mx-auto">
          <SectionHeading
            eyebrow="Veja funcionando"
            title="Um tour pelo sistema, sem precisar agendar nada"
            subtitle="Gravações reais da plataforma, narradas passo a passo. Escolha uma área e clique em “Ouvir narração”."
          />
          <Reveal><ProductTour /></Reveal>
          <p className="mt-8 text-center text-[11px] text-[color:var(--lh-muted)] opacity-70">Vídeos gravados num escritório de demonstração com dados fictícios.</p>
        </div>
      </section>

      {/* ══ RECURSOS ══ */}
      <section id="recursos" className="lh-light relative py-20 sm:py-28 px-5 sm:px-8 border-t border-[color:var(--lh-divider)]">
        <div className="max-w-6xl mx-auto">
          <SectionHeading
            eyebrow="Recursos"
            title={<>Tudo que o escritório precisa, <span className="text-[#1677FF]">sem colar sistemas</span></>}
            subtitle="Do primeiro atendimento ao recebimento dos honorários."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map((f, i) => (
              <Reveal
                key={f.title}
                delay={(i % 4) * 60}
                className={cn(
                  'group relative rounded-2xl p-6 border border-[color:var(--lh-border)] bg-[color:var(--lh-card)] lh-card hover:border-[#1677FF]/30 hover:bg-[color:var(--lh-card-2)] transition-colors duration-300 overflow-hidden',
                  f.wide && 'lg:col-span-2',
                )}
              >
                <div className="pointer-events-none absolute -top-12 -right-12 w-32 h-32 rounded-full blur-2xl opacity-0 group-hover:opacity-20 transition-opacity" style={{ background: '#1677FF' }} />
                <div className="relative w-10 h-10 rounded-xl flex items-center justify-center mb-4 bg-[#0B5CFF]/15 group-hover:bg-[#0B5CFF] transition-colors">
                  <f.icon className="w-[18px] h-[18px] text-[#1677FF] group-hover:text-white transition-colors" />
                </div>
                <h3 className="relative text-base font-semibold text-[color:var(--lh-fg)]">{f.title}</h3>
                <p className="relative mt-1.5 text-sm text-[color:var(--lh-muted)] leading-relaxed">{f.description}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ RESPONSIVO ══ */}
      <section className="relative py-20 sm:py-28 px-5 sm:px-8 border-t border-[color:var(--lh-divider)] overflow-hidden">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
          <Reveal className="order-2 lg:order-1 flex justify-center">
            <div className="relative w-[250px] sm:w-[280px]">
              <div className="pointer-events-none absolute -inset-12 -z-10 rounded-full blur-3xl opacity-40" style={{ background: 'radial-gradient(circle, #0B5CFF, transparent 65%)' }} />
              <div className="rounded-[2.6rem] border-[10px] border-[#0f1522] bg-[#0f1522] overflow-hidden shadow-[0_40px_90px_-20px_rgba(0,0,0,0.7)]">
                <div className="relative rounded-[1.9rem] overflow-hidden">
                  <DemoVideo src="/demo/mobile.mp4" poster="/demo/mobile.jpg" label="LegalHub no celular" aspect="390 / 844" compact />
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 w-20 h-5 rounded-full bg-black" aria-hidden />
                </div>
              </div>
            </div>
          </Reveal>
          <Reveal delay={120} className="order-1 lg:order-2">
            <Eyebrow>No escritório ou no fórum</Eyebrow>
            <h2 className="mt-3 font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-[color:var(--lh-fg)]">
              O mesmo sistema no <span className="text-[#1677FF]">computador e no celular</span>
            </h2>
            <p className="mt-4 text-[color:var(--lh-muted)] leading-relaxed">
              Confira a pauta do dia na porta da audiência, consulte um processo no corredor do fórum ou registre um pagamento de casa.
              Não precisa instalar nada: o LegalHub roda no navegador e se adapta à tela.
            </p>
            <ul className="mt-6 space-y-3">
              {['Layout pensado para telas pequenas', 'Login seguro em qualquer dispositivo', 'Dados sempre atualizados entre a equipe'].map(item => (
                <li key={item} className="flex items-center gap-2.5 text-sm text-[color:var(--lh-fg)]">
                  <Smartphone className="w-4 h-4 text-[#1677FF] flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ══ COMO COMEÇAR ══ */}
      <section className="lh-light lh-light-alt relative py-20 sm:py-28 px-5 sm:px-8 border-t border-[color:var(--lh-divider)]">
        <div className="max-w-5xl mx-auto">
          <SectionHeading eyebrow="Como começar" title="Do cadastro ao primeiro prazo controlado no mesmo dia" />
          <div className="relative grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-5">
            <div className="hidden md:block absolute top-6 left-[16%] right-[16%] h-px bg-gradient-to-r from-transparent via-[#1677FF]/40 to-transparent" aria-hidden />
            {STEPS.map((s, i) => (
              <Reveal key={s.title} delay={i * 100} className="relative text-center px-2">
                <span className="relative mx-auto w-12 h-12 rounded-full bg-[color:var(--lh-card)] lh-card border border-[#1677FF]/40 flex items-center justify-center font-serif text-lg font-semibold text-[#1677FF]">
                  <span className="sr-only">Passo </span>{i + 1}
                </span>
                <h3 className="mt-5 text-base font-semibold text-[color:var(--lh-fg)]">{s.title}</h3>
                <p className="mt-2 text-sm text-[color:var(--lh-muted)] leading-relaxed max-w-xs mx-auto">{s.description}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ SEGURANÇA ══ */}
      <section id="seguranca" className="relative py-20 sm:py-28 px-5 sm:px-8 border-t border-[color:var(--lh-divider)]">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-start">
          <Reveal className="lg:col-span-5 lg:sticky lg:top-28">
            <Eyebrow>Segurança e sigilo</Eyebrow>
            <h2 className="mt-3 font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-[color:var(--lh-fg)]">
              Sigilo profissional levado a sério
            </h2>
            <p className="mt-4 text-[color:var(--lh-muted)] leading-relaxed">
              Dados de clientes e processos exigem cuidado. O LegalHub foi construído com isolamento entre escritórios e controle de acesso desde a base.
            </p>
          </Reveal>
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {SECURITY.map((s, i) => (
              <Reveal key={s.title} delay={i * 70} className="rounded-2xl border border-[color:var(--lh-border)] bg-[color:var(--lh-card)] lh-card p-6">
                <s.icon className="w-5 h-5 text-[#1677FF]" />
                <h3 className="mt-4 text-sm font-semibold text-[color:var(--lh-fg)]">{s.title}</h3>
                <p className="mt-1.5 text-sm text-[color:var(--lh-muted)] leading-relaxed">{s.description}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ PLANOS ══ */}
      <section id="planos" className="lh-light relative py-20 sm:py-28 px-5 sm:px-8 border-t border-[color:var(--lh-divider)]">
        <div className="max-w-6xl mx-auto">
          <SectionHeading
            eyebrow="Planos"
            title="Um plano para cada tamanho de escritório"
            subtitle={`Comece com ${TRIAL_DAYS} dias grátis. Cobrança mensal, sem fidelidade, upgrade quando o escritório crescer.`}
          />

          {PROMO_ACTIVE && <Reveal delay={80} className="max-w-3xl mx-auto mb-8 rounded-2xl border border-[#1677FF]/25 bg-[#1677FF]/[0.07] p-5 sm:p-6 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 bg-[#0B5CFF]/15">
              <Sparkles className="w-5 h-5 text-[#1677FF]" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-[color:var(--lh-fg)]">
                Oferta de lançamento: assine até {PROMO_LAST_DAY} e pague R$ {PROMO_MONTHLY_PRICE},00/mês nos 3 primeiros meses, em qualquer plano
              </p>
              <p className="mt-1 text-xs text-[#1677FF]">Bônus: e-book completo do LegalHub direto dentro do sistema</p>
            </div>
          </Reveal>}

          <Reveal delay={120} className="max-w-xl mx-auto mb-12 rounded-2xl border border-[color:var(--lh-border)] bg-[color:var(--lh-card)] lh-card p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3 mb-3">
              <label htmlFor="process-slider" className="text-sm font-semibold text-[color:var(--lh-fg)]">
                Quantos processos ativos o escritório tem?
              </label>
              <span className="flex-shrink-0 text-sm font-bold text-[#1677FF] tabular-nums" aria-live="polite">
                {processCount}{processCount >= 2000 ? '+' : ''}
              </span>
            </div>
            <input
              id="process-slider"
              type="range"
              min={50}
              max={2000}
              step={50}
              value={processCount}
              onChange={e => setProcessCount(Number(e.target.value))}
              className="w-full cursor-pointer"
              style={{ accentColor: '#0B5CFF' }}
            />
            <p className="mt-3 text-xs text-[color:var(--lh-muted)] flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#1677FF] flex-shrink-0" />
              Plano recomendado: <span className="font-semibold text-[color:var(--lh-fg)]">{PLANS.find(p => p.id === recommendedPlanId)?.name}</span>
            </p>
          </Reveal>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
            {PLANS.map((plan, i) => {
              const recommended = plan.id === recommendedPlanId
              return (
                <Reveal
                  key={plan.id}
                  delay={i * 90}
                  className={cn(
                    'relative rounded-3xl p-7 sm:p-8 flex flex-col transition-all duration-300 border',
                    plan.highlight ? 'border-[#1677FF]/50 bg-[color:var(--lh-card-2)] lh-card' : 'border-[color:var(--lh-border)] bg-[color:var(--lh-card)] lh-card',
                    recommended && 'ring-2 ring-[#1677FF]/60 lg:-translate-y-2',
                  )}
                  style={plan.highlight ? { boxShadow: '0 24px 60px -16px rgba(11,92,255,0.25)' } : undefined}
                >
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {plan.highlight && (
                      <span className="px-3 py-1 rounded-full text-[11px] font-bold text-white bg-[#0B5CFF] whitespace-nowrap">Mais escolhido</span>
                    )}
                    {recommended && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold text-[#1677FF] bg-[color:var(--lh-card)] border border-[#1677FF]/50 whitespace-nowrap">
                        <CheckCircle2 className="w-3 h-3" /> Ideal pra você
                      </span>
                    )}
                  </div>

                  <h3 className="text-lg font-bold text-[color:var(--lh-fg)]">{plan.name}</h3>
                  <p className="mt-1.5 text-xs text-[color:var(--lh-muted)] leading-relaxed min-h-[2.5rem]">{plan.tagline}</p>

                  <div className="mt-5">
                    {PROMO_ACTIVE && plan.price > PROMO_MONTHLY_PRICE ? (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-[color:var(--lh-muted)] line-through">R$ {plan.price}/mês</span>
                          <span className="text-[10px] font-bold text-[color:var(--lh-ok)] bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5">
                            {Math.round((1 - PROMO_MONTHLY_PRICE / plan.price) * 100)}% OFF
                          </span>
                        </div>
                        <div className="flex items-baseline gap-1 mt-1">
                          <span className="text-sm text-[color:var(--lh-muted)]">R$</span>
                          <span className="font-serif text-4xl font-semibold tracking-tight text-[color:var(--lh-fg)]">{PROMO_MONTHLY_PRICE}</span>
                          <span className="text-sm text-[color:var(--lh-muted)]">/mês</span>
                        </div>
                        <p className="mt-1 text-[11px] text-[#1677FF] font-medium">nos 3 primeiros meses, depois R$ {plan.price}/mês</p>
                      </>
                    ) : (
                      <>
                        <div className="flex items-baseline gap-1">
                          <span className="text-sm text-[color:var(--lh-muted)]">R$</span>
                          <span className="font-serif text-4xl font-semibold tracking-tight text-[color:var(--lh-fg)]">{plan.price}</span>
                          <span className="text-sm text-[color:var(--lh-muted)]">/mês</span>
                        </div>
                        {PROMO_ACTIVE && <p className="mt-1 text-[11px] text-[#1677FF] font-medium">já é o valor promocional dos 3 primeiros meses</p>}
                      </>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[color:var(--lh-fg)] bg-[color:var(--lh-chip)] rounded-lg px-3 py-1.5">
                      <Briefcase className="w-3.5 h-3.5" /> {plan.processLimit}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[color:var(--lh-fg)] bg-[color:var(--lh-chip)] rounded-lg px-3 py-1.5">
                      <HardDrive className="w-3.5 h-3.5" /> {plan.storageLimit}
                    </span>
                  </div>

                  <ul className="mt-6 space-y-3 flex-1">
                    {plan.features.map(f => (
                      <li key={f} className="flex items-start gap-2.5 text-sm text-[color:var(--lh-muted)] leading-snug">
                        <CheckCircle2 className="w-4 h-4 text-[color:var(--lh-ok)] flex-shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => goToLogin('signup')}
                    className={cn(
                      'mt-8 w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-all active:scale-[0.98]',
                      plan.highlight || recommended ? 'text-white bg-[#0B5CFF] hover:brightness-110' : 'text-[color:var(--lh-fg)] bg-[color:var(--lh-chip)] hover:bg-[color:var(--lh-hover)]'
                    )}
                  >
                    Testar grátis e assinar o {plan.name} <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </Reveal>
              )
            })}
          </div>

          <Reveal delay={260} className="mt-10 text-center text-xs text-[color:var(--lh-muted)]">
            Todos os planos incluem atualizações contínuas e dados isolados por escritório. Sem cartão de crédito para começar.
          </Reveal>
        </div>
      </section>

      {/* ══ FAQ ══ */}
      <section id="faq" className="lh-light lh-light-alt relative py-20 sm:py-28 px-5 sm:px-8 border-t border-[color:var(--lh-divider)]">
        <div className="max-w-3xl mx-auto">
          <SectionHeading eyebrow="Dúvidas frequentes" title="Antes de começar, tire suas dúvidas" />
          <div className="space-y-3">
            {FAQS.map((item, i) => {
              const open = faqOpen === i
              return (
                <Reveal key={item.q} delay={Math.min(i, 4) * 50} className={cn('rounded-2xl border overflow-hidden transition-colors', open ? 'border-[#1677FF]/30 bg-[color:var(--lh-card)] lh-card' : 'border-[color:var(--lh-border)]')}>
                  <h3>
                    <button onClick={() => setFaqOpen(open ? null : i)} aria-expanded={open} aria-controls={`faq-${i}`}
                      className="w-full flex items-center justify-between gap-4 px-5 sm:px-6 py-4 text-left">
                      <span className="text-sm font-semibold text-[color:var(--lh-fg)]">{item.q}</span>
                      <ChevronRight className={cn('w-4 h-4 flex-shrink-0 transition-transform', open ? 'rotate-90 text-[#1677FF]' : 'text-[color:var(--lh-muted)]')} />
                    </button>
                  </h3>
                  <div id={`faq-${i}`} className="grid transition-all duration-300 ease-out" style={{ gridTemplateRows: open ? '1fr' : '0fr' }}>
                    <div className="overflow-hidden">
                      <p className="px-5 sm:px-6 pb-4 text-sm text-[color:var(--lh-muted)] leading-relaxed">{item.a}</p>
                    </div>
                  </div>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* ══ CTA FINAL ══ */}
      <section className="relative py-20 sm:py-28 px-5 sm:px-8">
        <Reveal className="relative max-w-5xl mx-auto rounded-[2rem] border border-[#1677FF]/25 overflow-hidden px-6 py-14 sm:px-14 sm:py-16 text-center"
          style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(11,92,255,0.35), rgba(2,7,17,0) 70%), rgba(255,255,255,0.02)' }}>
          <h2 className="font-serif text-3xl sm:text-[2.6rem] leading-tight font-semibold tracking-tight text-[color:var(--lh-fg)]" style={{ textWrap: 'balance' } as React.CSSProperties}>
            Organize o escritório ainda esta semana
          </h2>
          <p className="mt-4 text-[color:var(--lh-muted)] leading-relaxed max-w-xl mx-auto">
            {TRIAL_DAYS} dias grátis com todos os recursos do plano Pro. Sem cartão de crédito e sem fidelidade.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => goToLogin('signup')}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded-full text-sm font-semibold text-white bg-[#0B5CFF] transition-all active:scale-[0.98] hover:brightness-110"
              style={{ boxShadow: '0 10px 30px rgba(11,92,255,0.45)' }}
            >
              Criar minha conta grátis <ArrowRight className="w-4 h-4" />
            </button>
            <button onClick={() => goToLogin('login')} className="w-full sm:w-auto px-6 py-4 rounded-full text-sm font-semibold text-[color:var(--lh-fg)] border border-[color:var(--lh-border-strong)] hover:bg-[color:var(--lh-hover)]">
              Já tenho conta
            </button>
          </div>
        </Reveal>
      </section>

      {/* ══ FOOTER ══ */}
      <footer className="relative border-t border-[color:var(--lh-divider)] px-5 sm:px-8 pt-14 pb-24 sm:pb-12">
        <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
          <div className="lg:col-span-2 flex flex-col items-start gap-3">
            <BrandMark size={34} />
            <p className="text-xs text-[color:var(--lh-muted)] max-w-xs leading-relaxed">
              Sistema de gestão para escritórios de advocacia: processos, intimações, prazos, agenda, clientes e financeiro.
            </p>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[color:var(--lh-fg)] mb-4">Produto</p>
            <ul className="space-y-2.5">
              {NAV_LINKS.map(l => (
                <li key={l.href}><a href={l.href} className="text-xs text-[color:var(--lh-muted)] hover:text-white transition-colors">{l.label}</a></li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[color:var(--lh-fg)] mb-4">Fale conosco</p>
            <ul className="space-y-2.5">
              <li>
                <a href="mailto:contato@legalhub.com.br" className="flex items-center gap-2 text-xs text-[color:var(--lh-muted)] hover:text-white transition-colors">
                  <Mail className="w-3.5 h-3.5 flex-shrink-0 text-[#1677FF]" /> contato@legalhub.com.br
                </a>
              </li>
              <li className="flex items-center gap-2 text-xs text-[color:var(--lh-muted)]"><MapPin className="w-3.5 h-3.5 flex-shrink-0 text-[#1677FF]" /> João Pessoa - PB, Brasil</li>
              <li>
                <button onClick={() => goToLogin('login')} className="text-xs text-[color:var(--lh-muted)] hover:text-white transition-colors">Entrar no sistema</button>
              </li>
            </ul>
          </div>
        </div>

        <div className="max-w-6xl mx-auto mt-12 pt-6 border-t border-[color:var(--lh-divider)]">
          <p className="text-xs text-[color:var(--lh-muted)]">© {new Date().getFullYear()} LegalHub. Todos os direitos reservados.</p>
        </div>
      </footer>

      {/* ══ CTA FIXO (mobile) ══ */}
      <div
        className={cn('sm:hidden fixed bottom-0 inset-x-0 z-40 px-4 pb-4 pt-6 transition-transform duration-300', showStickyCta && !menuOpen ? 'translate-y-0' : 'translate-y-full')}
        style={{ background: 'linear-gradient(to top, rgba(2,7,17,0.98) 55%, rgba(2,7,17,0))' }}
      >
        <button
          onClick={() => goToLogin('signup')}
          className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-full text-sm font-semibold text-white bg-[#0B5CFF] active:scale-[0.98] transition-transform"
          style={{ boxShadow: '0 12px 32px rgba(11,92,255,0.45)' }}
        >
          Começar {TRIAL_DAYS} dias grátis <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
