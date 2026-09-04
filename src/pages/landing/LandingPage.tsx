import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  Users, Briefcase, CalendarDays, DollarSign, Bell, ShieldCheck,
  ArrowRight, Menu, X, CheckCircle2, Building2, Cloud, Network,
  Quote, ChevronRight, ChevronLeft, FileText, ListChecks, BarChart3,
  FolderOpen, Search, Play, CalendarCheck, Scale, Gavel, Mail, Phone,
  MapPin, Linkedin, Instagram, Facebook, HardDrive,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

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
        <span className="font-bold tracking-tight text-white" style={{ fontSize: size * 0.5 }}>LegalHub</span>
        <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#A7B0C0] mt-0.5">Gestão jurídica inteligente</span>
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

/** Rótulo pequeno em versalete azul, usado no topo de cada seção. */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#1677FF]">{children}</span>
}

const NAV_LINKS = [
  { href: '#funcionalidades', label: 'Funcionalidades' },
  { href: '#tecnologia', label: 'Soluções' },
  { href: '#planos', label: 'Planos' },
  { href: '#faq', label: 'Recursos' },
  { href: '#contato', label: 'Sobre' },
]

/** PLACEHOLDERS VISUAIS — substituir por logos/nomes de clientes reais assim que
 *  houver cases publicáveis. Nenhum nome abaixo corresponde a um cliente de verdade. */
const TRUST_LOGO_PLACEHOLDERS = [
  { name: 'Azevedo & Costa', subtitle: 'Advocacia Associados', icon: Scale },
  { name: 'Barros Martins', subtitle: 'Sociedade de Advogados', icon: Building2 },
  { name: 'Fonseca & Lima', subtitle: 'Advocacia', icon: Gavel },
  { name: 'Ribeiro & Almeida', subtitle: 'Advocacia', icon: Scale },
  { name: 'Monteiro', subtitle: 'Advocacia', icon: ShieldCheck },
  { name: 'Carvalho & Dantas', subtitle: 'Advocacia Associados', icon: Building2 },
]

const STATS = [
  { icon: Building2, value: '+500', label: 'Escritórios confiam' },
  { icon: ShieldCheck, value: '99,9%', label: 'Segurança garantida' },
  { icon: Cloud, value: '100%', label: 'Na nuvem e acessível' },
  { icon: Network, value: '+250 mil', label: 'Processos gerenciados' },
]

// ─── Funcionalidades — grid principal (8 cards) ────────────────────────────
const FEATURES = [
  { icon: FolderOpen, title: 'Gestão de Processos', description: 'Organize e acompanhe todos os processos em um só lugar. Tenha total controle das etapas e movimentações.' },
  { icon: ListChecks, title: 'Tarefas e Prazos', description: 'Não perca nenhum prazo com alertas inteligentes e gestão visual de tarefas.' },
  { icon: CalendarDays, title: 'Agenda Integrada', description: 'Audiências, compromissos e reuniões na sua agenda com sincronização completa.' },
  { icon: DollarSign, title: 'Financeiro Completo', description: 'Controle receitas, despesas, honorários e recebimentos com relatórios financeiros detalhados.' },
  { icon: Users, title: 'Gestão de Clientes', description: 'Tenha um histórico completo de cada cliente e relacionamento centralizado.' },
  { icon: FileText, title: 'Documentos', description: 'Armazene, categorize e acesse todos os documentos com segurança na nuvem.' },
  { icon: HardDrive, title: 'Escritório Digital', description: 'Um espaço próprio para organizar pastas por cliente ou por área, com controle de armazenamento do escritório.' },
  { icon: BarChart3, title: 'Relatórios Inteligentes', description: 'Dashboards e relatórios completos para análises e tomadas de decisão.' },
  { icon: ShieldCheck, title: 'Segurança Avançada', description: 'Seus dados protegidos com criptografia, backups diários e conformidade com a LGPD.' },
]

const TECH_CHECKLIST = [
  'Interface intuitiva e moderna',
  'Acesso de qualquer lugar, em qualquer dispositivo',
  'Atualizações constantes e sem complicações',
  'Suporte humano e especializado',
]

// Dados de exemplo do dashboard simulado (hero + seção "tecnologia")
const DASHBOARD_STAT_CARDS = [
  { label: 'Processos ativos', value: '1.248' },
  { label: 'Tarefas pendentes', value: '32' },
  { label: 'Prazos hoje', value: '8' },
  { label: 'Audiências hoje', value: '5' },
]
const DASHBOARD_DONUT = [
  { label: 'Em andamento', value: 640, color: '#0B5CFF' },
  { label: 'Aguardando', value: 290, color: '#1677FF' },
  { label: 'Arquivado', value: 50, color: '#5B6B85' },
  { label: 'Suspensos', value: 30, color: '#3A4A66' },
]
const DASHBOARD_DEADLINES = [
  { title: 'Contestação', meta: 'Processo nº 1234-56.2024.8.26.0100', days: '20 dias' },
  { title: 'Recurso de Apelação', meta: 'Processo nº 2345-67.2024.8.26.0100', days: '21 dias' },
  { title: 'Audiência Trabalhista', meta: 'Processo nº 3457-23.2024.5.15.0100', days: '22 dias' },
]

// Depoimentos — placeholders prontos para receber avaliações reais de clientes.
const TESTIMONIALS = [
  {
    quote: 'O LegalHub mudou a forma como gerenciamos nosso escritório. Ganhamos tempo, reduzimos erros e temos tudo sob controle.',
    name: 'Dr. Renato Azevedo',
    role: 'Azevedo & Costa Advogados',
  },
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

const PROMO_MONTHLY_PRICE = 149

// ─── Planos ─────────────────────────────────────────────────────────────────
// Espelha o seed real de `plans` em
// supabase/migrations/20260902160000_stripe_billing_foundation.sql — mudar
// preço/limite aqui sem atualizar (ou vice-versa) deixa a Landing Page
// prometendo algo que o billing não aplica.
const PLANS = [
  {
    id: 'basico',
    name: 'Básico',
    tagline: 'Para quem está começando a organizar o escritório',
    price: 149,
    processLimit: 'Até 300 processos ativos',
    storageLimit: '5 GB de armazenamento',
    features: [
      'Até 3 usuários',
      'Até 150 clientes cadastrados',
      'Dashboard completo (visão geral, lista, quadro e desempenho)',
      'Clientes com busca automática de CPF/CNPJ',
      'Processos por fase e grupo de ação',
      'Tarefas com recorrência e cálculo de prazo',
      'Agenda sincronizada com o Google Calendar',
      'Financeiro (contas a pagar e a receber)',
      'Excelência (IA) — até 30 gerações/mês',
      'Suporte por e-mail',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'Para escritórios em crescimento, com equipe e clientes ativos',
    price: 349,
    processLimit: 'Até 1.500 processos ativos',
    storageLimit: '25 GB de armazenamento',
    highlight: true,
    features: [
      'Tudo do plano Básico',
      'Até 10 usuários',
      'Até 750 clientes cadastrados',
      'Excelência (IA) — até 200 gerações/mês',
      'Sincronização automática de publicações (OAB/CNJ, Escavador, Jusbrasil)',
      'Portal do Cliente exclusivo',
      'Relatórios de desempenho da equipe',
      'Colaboradores & Parceiros com comissão automática',
      'Suporte prioritário via chat',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Para escritórios com alto volume e times maiores',
    price: 799,
    processLimit: 'Processos ilimitados',
    storageLimit: '100 GB de armazenamento',
    features: [
      'Tudo do plano Pro',
      'Até 25 usuários — precisa de mais? Fale com nosso time',
      'Clientes ilimitados',
      'Excelência (IA) ilimitada (uso justo)',
      'Onboarding assistido para toda a equipe',
      'SLA de suporte dedicado',
    ],
  },
]

const FAQS = [
  {
    q: 'Preciso de cartão de crédito para começar?',
    a: 'Não. Você cria a conta e conhece o sistema sem precisar informar dados de pagamento.',
  },
  {
    q: 'Como funciona a promoção de lançamento?',
    a: `Ao assinar agora, você paga R$ ${PROMO_MONTHLY_PRICE},00/mês nos 3 primeiros meses, independentemente do plano escolhido. Depois desse período, passa a valer o valor normal do plano contratado. Como bônus, você também recebe o e-book completo do LegalHub direto dentro do sistema.`,
  },
  {
    q: 'Posso trocar de plano depois?',
    a: 'Sim. Você pode fazer upgrade ou downgrade de plano a qualquer momento, conforme o volume de processos do seu escritório crescer.',
  },
  {
    q: 'Existe fidelidade ou multa de cancelamento?',
    a: 'Não. A cobrança é mensal e recorrente, sem contrato de fidelidade — você pode cancelar quando quiser.',
  },
  {
    q: 'Meus dados ficam seguros e isolados dos de outros escritórios?',
    a: 'Sim. O isolamento por escritório é a base da arquitetura do sistema: cada tenant só acessa os próprios dados, com controle de acesso por função em cada papel do time.',
  },
  {
    q: 'O que acontece se eu ultrapassar o limite de processos do meu plano?',
    a: 'Você recebe um aviso dentro do sistema e pode migrar para o plano seguinte a qualquer momento, sem perder nenhum dado já cadastrado.',
  },
]

/** Conta de 0 até o valor assim que o número entra na viewport (ex: "+500", "99,9%"). */
function AnimatedStatValue({ value, className }: { value: string; className?: string }) {
  const match = value.match(/^(\+)?(\d+)(.*)$/)
  const ref = useRef<HTMLParagraphElement>(null)
  const [display, setDisplay] = useState(match ? `${match[1] ?? ''}0${match[3]}` : value)

  useEffect(() => {
    if (!match || !ref.current) return
    const prefix = match[1] ?? ''
    const target = parseInt(match[2], 10)
    const suffix = match[3]
    let done = false
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || done) return
      done = true
      const start = performance.now()
      const duration = 900
      function tick(now: number) {
        const progress = Math.min(1, (now - start) / duration)
        const eased = 1 - Math.pow(1 - progress, 3)
        setDisplay(`${prefix}${Math.round(eased * target)}${suffix}`)
        if (progress < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
      obs.disconnect()
    }, { threshold: 0.4 })
    obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])

  return <p ref={ref} className={cn('font-bold leading-none', className)}>{display}</p>
}

/** Donut CSS (conic-gradient) para o gráfico "Processos por situação". */
function DonutChart({ total }: { total: string }) {
  const sum = DASHBOARD_DONUT.reduce((s, d) => s + d.value, 0)
  let acc = 0
  const stops = DASHBOARD_DONUT.map(d => {
    const from = (acc / sum) * 360
    acc += d.value
    const to = (acc / sum) * 360
    return `${d.color} ${from}deg ${to}deg`
  }).join(', ')
  return (
    <div className="flex items-center gap-4">
      <div className="relative w-20 h-20 flex-shrink-0 rounded-full" style={{ background: `conic-gradient(${stops})` }}>
        <div className="absolute inset-[6px] rounded-full bg-[#06152D] flex flex-col items-center justify-center">
          <span className="text-sm font-bold text-white leading-none">{total}</span>
          <span className="text-[8px] text-[#A7B0C0] mt-0.5">Total</span>
        </div>
      </div>
      <div className="space-y-1">
        {DASHBOARD_DONUT.map(d => (
          <div key={d.label} className="flex items-center gap-1.5 text-[10px] text-[#A7B0C0]">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
            {d.label}
            <span className="text-white font-semibold">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Miniatura do dashboard real, usada dentro do laptop do hero e da seção "tecnologia". */
function DashboardScreen({ compact = false }: { compact?: boolean }) {
  return (
    <div className="w-full h-full bg-[#06152D] flex flex-col text-left">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 flex-shrink-0">
        <div className="w-4 h-4 rounded overflow-hidden bg-[#020711] flex-shrink-0">
          <img src="/logomarca.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '0% 50%' }} />
        </div>
        <span className="text-[10px] font-bold text-white">LegalHub</span>
        <div className="flex-1" />
        {!compact && <Search className="w-3 h-3 text-[#A7B0C0]" />}
        <Bell className="w-3 h-3 text-[#A7B0C0]" />
        {!compact && <div className="w-4 h-4 rounded-full bg-[#0B5CFF]" />}
      </div>
      <div className="flex-1 p-3 overflow-hidden">
        <p className="text-[10px] font-semibold text-white mb-2">Dashboard</p>
        <div className={cn('grid gap-1.5 mb-2', compact ? 'grid-cols-3' : 'grid-cols-4')}>
          {DASHBOARD_STAT_CARDS.slice(0, compact ? 3 : 4).map(c => (
            <div key={c.label} className="rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-1.5">
              <p className="text-[11px] font-bold text-white leading-none">{c.value}</p>
              <p className="text-[7px] text-[#A7B0C0] mt-1 leading-tight">{c.label}</p>
            </div>
          ))}
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.03] p-2 mb-1.5">
          <p className="text-[8px] font-semibold text-[#A7B0C0] mb-1.5">Processos por situação</p>
          <DonutChart total="1.248" />
        </div>
        {!compact && (
          <div className="rounded-md border border-white/10 bg-white/[0.03] p-2">
            <p className="text-[8px] font-semibold text-[#A7B0C0] mb-1.5">Prazos próximos</p>
            <div className="space-y-1">
              {DASHBOARD_DEADLINES.map(d => (
                <div key={d.title} className="flex items-center justify-between text-[8px]">
                  <span className="text-white font-medium truncate">{d.title}</span>
                  <span className="text-[#1677FF] flex-shrink-0 ml-1">{d.days}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function LandingPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [showStickyCta, setShowStickyCta] = useState(false)
  const [faqOpen, setFaqOpen] = useState<number | null>(0)
  const [processCount, setProcessCount] = useState(300)
  const [testimonialIndex, setTestimonialIndex] = useState(0)
  const [heroTilt, setHeroTilt] = useState({ x: 3, y: -6 })

  function handleHeroTiltMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width - 0.5
    const py = (e.clientY - rect.top) / rect.height - 0.5
    setHeroTilt({ x: py * -16 + 3, y: px * 16 - 6 })
  }
  function handleHeroTiltLeave() {
    setHeroTilt({ x: 3, y: -6 })
  }

  const recommendedPlanId = processCount <= 300 ? 'basico' : processCount <= 1500 ? 'pro' : 'enterprise'

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8)
      setShowStickyCta(window.scrollY > 700)
    }
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
    <div className="min-h-screen text-white relative" style={{ background: '#020711' }}>
      <style>{`
        @keyframes float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-24px) } }
        @keyframes shine { 0% { transform: translateX(-120%) skewX(-15deg) } 100% { transform: translateX(220%) skewX(-15deg) } }
        html { scroll-padding-top: 88px; }
        a:focus-visible, button:focus-visible, input:focus-visible {
          outline: 2px solid #1677FF; outline-offset: 2px; border-radius: 6px;
        }
      `}</style>

      {/* ══ NAVBAR ══ */}
      <header
        className="fixed top-0 inset-x-0 z-50 transition-colors duration-200"
        style={{
          background: scrolled ? 'rgba(2,7,17,0.85)' : 'transparent',
          backdropFilter: scrolled ? 'blur(12px)' : 'none',
          borderBottom: scrolled ? '1px solid rgba(255,255,255,0.08)' : '1px solid transparent',
        }}
      >
        <div className="max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <BrandMark size={40} />

          <nav className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map(l => (
              <a key={l.href} href={l.href} className="relative text-sm text-[#A7B0C0] hover:text-white transition-colors group">
                {l.label}
                <span className="absolute -bottom-1.5 left-0 w-0 h-px bg-[#1677FF] transition-all duration-300 group-hover:w-full" />
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <button onClick={() => goToLogin('login')} className="text-sm font-medium text-[#A7B0C0] hover:text-white transition-colors px-3 py-2">
              Entrar
            </button>
            <button
              onClick={() => goToLogin('signup')}
              className="relative overflow-hidden flex items-center gap-1.5 text-sm font-semibold text-white px-4 py-2.5 rounded-full transition-all active:scale-[0.97] hover:brightness-105 bg-[#0B5CFF]"
              style={{ boxShadow: '0 4px 18px rgba(11,92,255,0.4)' }}
            >
              <CalendarCheck className="w-3.5 h-3.5" /> Agendar demonstração
            </button>
          </div>

          <button className="md:hidden text-white" onClick={() => setMenuOpen(v => !v)}>
            {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {menuOpen && (
          <div className="md:hidden px-5 pb-5 pt-1 space-y-3 border-b border-white/10" style={{ background: '#020711' }}>
            {NAV_LINKS.map(l => (
              <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)} className="block text-sm text-[#A7B0C0] py-1.5">
                {l.label}
              </a>
            ))}
            <div className="flex flex-col gap-2 pt-2">
              <button onClick={() => goToLogin('login')} className="w-full text-center text-sm font-medium text-white border border-white/15 rounded-xl py-2.5">
                Entrar
              </button>
              <button onClick={() => goToLogin('signup')} className="w-full text-center text-sm font-semibold text-white rounded-full py-2.5 bg-[#0B5CFF]">
                Agendar demonstração
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ══ HERO ══ */}
      <section className="relative pt-32 pb-16 sm:pt-40 px-5 sm:px-8 overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.5]"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)',
            backgroundSize: '26px 26px',
            maskImage: 'radial-gradient(ellipse 70% 60% at 65% 5%, black, transparent)',
          }}
        />
        <div
          className="pointer-events-none absolute -top-24 right-0 w-[36rem] h-[36rem] rounded-full blur-3xl opacity-[0.20] animate-[float_9s_ease-in-out_infinite]"
          style={{ background: 'radial-gradient(circle, #0B5CFF, transparent 70%)' }}
        />
        <div
          className="pointer-events-none absolute top-1/3 -left-32 w-[26rem] h-[26rem] rounded-full blur-3xl opacity-[0.16] animate-[float_11s_ease-in-out_infinite_1.5s]"
          style={{ background: 'radial-gradient(circle, #1677FF, transparent 70%)' }}
        />

        <div className="relative max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-14 lg:gap-8 items-center pb-16">
          <div className="min-w-0 lg:col-span-6 text-center lg:text-left">
            <Reveal>
              <div className="inline-flex items-center gap-2 pl-2.5 pr-3.5 py-1.5 rounded-full border border-white/10 bg-white/[0.04] mb-5">
                <span className="relative flex h-2 w-2 flex-shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#1677FF] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#1677FF]" />
                </span>
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#A7B0C0]">Software jurídico completo</span>
              </div>
            </Reveal>

            <Reveal delay={80}>
              <h1 className="font-serif text-4xl sm:text-5xl lg:text-[3.4rem] font-semibold tracking-tight leading-[1.1] text-white" style={{ textWrap: 'balance' } as React.CSSProperties}>
                Gestão jurídica<br />
                <span className="text-[#1677FF]">inteligente e eficiente</span>
              </h1>
            </Reveal>

            <Reveal delay={160}>
              <p className="mt-6 text-base sm:text-lg text-[#A7B0C0] max-w-xl mx-auto lg:mx-0 leading-relaxed">
                O LegalHub centraliza processos, tarefas, prazos, clientes e financeiro em um único sistema.
                Mais produtividade, mais organização e melhores resultados para o seu escritório.
              </p>
            </Reveal>

            <Reveal delay={240}>
              <div className="mt-9 flex flex-col sm:flex-row items-center lg:justify-start justify-center gap-3">
                <button
                  onClick={() => goToLogin('signup')}
                  className="relative overflow-hidden group w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-3.5 rounded-full text-sm font-semibold text-white transition-all active:scale-[0.98] hover:-translate-y-0.5 bg-[#0B5CFF] hover:brightness-105"
                  style={{ boxShadow: '0 10px 30px rgba(11,92,255,0.4)' }}
                >
                  <span
                    className="absolute inset-0 opacity-0 group-hover:opacity-100"
                    style={{ background: 'linear-gradient(115deg,transparent,rgba(255,255,255,0.45),transparent)', animation: 'shine 1.1s ease' }}
                  />
                  <CalendarCheck className="relative w-4 h-4" />
                  <span className="relative">Agendar demonstração</span>
                </button>
                <a
                  href="#tecnologia"
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-3.5 rounded-full text-sm font-semibold text-white border border-white/20 hover:bg-white/5 transition-all"
                >
                  <Play className="w-3.5 h-3.5" /> Ver como funciona
                </a>
              </div>
            </Reveal>

            <Reveal delay={300}>
              <div className="mt-7 flex flex-wrap items-center justify-center lg:justify-start gap-x-5 gap-y-2">
                {['Intuitivo e fácil de usar', '100% seguro e na nuvem', 'Suporte especializado'].map(item => (
                  <span key={item} className="flex items-center gap-1.5 text-xs text-[#A7B0C0]">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#1677FF] flex-shrink-0" />
                    {item}
                  </span>
                ))}
              </div>
            </Reveal>
          </div>

          {/* Coluna do mockup — "laptop" com o dashboard real, em perspectiva 3D */}
          <Reveal delay={360} className="min-w-0 lg:col-span-6 relative">
            <div
              className="relative mx-auto w-full max-w-[560px]"
              style={{ perspective: '1600px' }}
              onMouseMove={handleHeroTiltMove}
              onMouseLeave={handleHeroTiltLeave}
            >
              <div className="relative transition-transform duration-200 ease-out" style={{ transform: `rotateY(${heroTilt.y}deg) rotateX(${heroTilt.x}deg)` }}>
                <div
                  className="pointer-events-none absolute -inset-10 -z-10 rounded-[2.5rem] blur-3xl opacity-50 animate-pulse-glow"
                  style={{ background: 'radial-gradient(ellipse at 30% 20%, #0B5CFF, transparent 60%)' }}
                />
                {/* Tela do laptop */}
                <div
                  className="rounded-t-xl overflow-hidden border-4 border-b-0"
                  style={{ borderColor: '#0f1522', background: '#06152D', boxShadow: '0 50px 120px -20px rgba(0,0,0,0.6), 0 0 80px -25px rgba(11,92,255,0.35)' }}
                >
                  <div className="flex items-center justify-center py-1" style={{ background: '#0f1522' }}>
                    <div className="w-1 h-1 rounded-full bg-white/25" />
                  </div>
                  <div className="aspect-[16/10.5]">
                    <DashboardScreen />
                  </div>
                </div>
                {/* Base do laptop */}
                <div className="relative h-4 rounded-b-xl" style={{ background: 'linear-gradient(180deg, #1a2030, #0c0f16)' }}>
                  <div className="absolute left-1/2 -translate-x-1/2 top-0 w-24 h-1.5 rounded-b-md bg-black/40" />
                </div>
                <div className="mx-auto h-2 w-[104%] -mt-px rounded-b-2xl" style={{ background: 'linear-gradient(180deg, #0c0f16, #05070b)', boxShadow: '0 12px 24px -6px rgba(0,0,0,0.5)' }} />
              </div>
            </div>
          </Reveal>
        </div>

        {/* Tiles de estatísticas */}
        <div className="relative max-w-6xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-4">
          {STATS.map((s, i) => (
            <Reveal
              key={s.label}
              delay={i * 80}
              className="rounded-2xl p-5 border border-white/10 hover:border-[#1677FF]/30 transition-colors"
              style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.015))' }}
            >
              <s.icon className="w-5 h-5 text-[#1677FF] mb-3" />
              <AnimatedStatValue value={s.value} className="text-white text-xl sm:text-2xl" />
              <p className="text-xs text-[#A7B0C0] mt-1">{s.label}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ══ CONFIANÇA — logos placeholder, ver TRUST_LOGO_PLACEHOLDERS acima ══ */}
      <section className="relative py-14 px-5 sm:px-8 border-t border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <Reveal className="text-center mb-8">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#1677FF]">Confiança de quem faz acontecer</p>
          </Reveal>
          <div className="flex flex-wrap items-center justify-center gap-4">
            {TRUST_LOGO_PLACEHOLDERS.map((t, i) => (
              <Reveal
                key={t.name}
                delay={i * 60}
                className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-white/10 bg-white/[0.03] opacity-70 hover:opacity-100 hover:border-[#1677FF]/20 transition-all duration-300"
              >
                <t.icon className="w-4 h-4 text-[#1677FF] flex-shrink-0" />
                <div className="text-left leading-tight">
                  <p className="text-xs font-bold text-white">{t.name.toUpperCase()}</p>
                  <p className="text-[9px] text-[#A7B0C0]">{t.subtitle}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ FUNCIONALIDADES ══ */}
      <section id="funcionalidades" className="relative py-24 sm:py-32 px-5 sm:px-8 border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-14">
            <Reveal className="max-w-xl">
              <Eyebrow>Tudo que seu escritório precisa</Eyebrow>
              <h2 className="mt-3 font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-white">
                Um sistema completo, pensado para <span className="text-[#1677FF]">advogados</span>
              </h2>
            </Reveal>
            <Reveal delay={100} className="max-w-sm">
              <p className="text-sm text-[#A7B0C0] leading-relaxed">
                O LegalHub reúne todas as ferramentas que o seu escritório precisa para trabalhar com mais eficiência, organização e controle.
              </p>
            </Reveal>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURES.map((f, i) => (
              <Reveal
                key={f.title}
                delay={i * 50}
                className="group relative rounded-2xl p-6 border border-white/10 bg-white/[0.02] hover:border-[#1677FF]/30 hover:-translate-y-1 transition-all duration-300 overflow-hidden"
              >
                <div className="pointer-events-none absolute -top-10 -right-10 w-28 h-28 rounded-full blur-2xl opacity-0 group-hover:opacity-20 transition-opacity" style={{ background: '#1677FF' }} />
                <div className="relative w-11 h-11 rounded-xl flex items-center justify-center mb-4 bg-[#0B5CFF]/15 group-hover:bg-[#0B5CFF] transition-colors">
                  <f.icon className="w-5 h-5 text-[#1677FF] group-hover:text-white transition-colors" />
                </div>
                <h3 className="relative text-base font-semibold text-white">{f.title}</h3>
                <p className="relative mt-2 text-sm text-[#A7B0C0] leading-relaxed">{f.description}</p>
              </Reveal>
            ))}
          </div>

          <Reveal delay={200} className="mt-10 text-center">
            <button
              onClick={() => goToLogin('signup')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-[#1677FF] border border-[#1677FF]/30 hover:bg-[#1677FF]/10 transition-colors"
            >
              Ver todas as funcionalidades <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </Reveal>
        </div>
      </section>

      {/* ══ TECNOLOGIA QUE TRANSFORMA ══ */}
      <section id="tecnologia" className="relative py-24 sm:py-32 px-5 sm:px-8 border-b border-white/[0.06] overflow-hidden">
        <div className="relative max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
          <Reveal>
            <Eyebrow>Tecnologia que transforma</Eyebrow>
            <h2 className="mt-3 font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-white">
              Mais <span className="text-[#1677FF]">produtividade</span>, menos burocracia
            </h2>
            <p className="mt-4 text-[#A7B0C0] leading-relaxed">
              Automatize tarefas repetitivas, centralize informações e tenha mais tempo para o que realmente importa: estratégia, clientes e resultados.
            </p>
            <ul className="mt-6 space-y-3">
              {TECH_CHECKLIST.map((item, i) => (
                <Reveal key={item} delay={i * 80}>
                  <li className="flex items-center gap-2.5 text-sm text-white">
                    <CheckCircle2 className="w-4 h-4 text-[#1677FF] flex-shrink-0" />
                    {item}
                  </li>
                </Reveal>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={150} className="relative">
            <div className="pointer-events-none absolute -inset-10 -z-10 rounded-[2.5rem] blur-3xl opacity-40" style={{ background: 'radial-gradient(ellipse at 60% 40%, #0B5CFF, transparent 65%)' }} />
            <div className="relative mx-auto max-w-md rounded-2xl overflow-hidden border border-white/10" style={{ boxShadow: '0 40px 100px -20px rgba(0,0,0,0.5)' }}>
              <div className="aspect-[16/11]"><DashboardScreen /></div>
            </div>
            <div
              className="hidden sm:block absolute -bottom-8 -right-6 w-36 rounded-[1.4rem] overflow-hidden border-4 border-[#0f1522]"
              style={{ boxShadow: '0 30px 70px -15px rgba(0,0,0,0.55)' }}
            >
              <div className="aspect-[9/18]"><DashboardScreen compact /></div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══ DEPOIMENTOS — carrossel ══ */}
      <section id="depoimentos" className="relative py-24 sm:py-32 px-5 sm:px-8 border-b border-white/[0.06]">
        <div className="max-w-2xl mx-auto">
          <Reveal className="text-center mb-14">
            <Eyebrow>Depoimentos</Eyebrow>
            <h2 className="mt-3 font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-white">Quem usa, recomenda</h2>
          </Reveal>

          <div className="relative">
            {(() => {
              const t = TESTIMONIALS[testimonialIndex]
              return (
                <Reveal key={testimonialIndex} className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 sm:p-10 flex flex-col items-center text-center">
                  <Quote className="w-7 h-7 text-[#1677FF] mb-4" />
                  <p className="text-base text-white leading-relaxed">{t.quote}</p>
                  <div className="flex items-center gap-3 mt-7 pt-6 border-t border-white/10">
                    <div className="w-10 h-10 rounded-full bg-[#0B5CFF] flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                      {t.name.charAt(0)}
                    </div>
                    <div className="min-w-0 text-left">
                      <p className="text-sm font-semibold text-white truncate">{t.name}</p>
                      <p className="text-xs text-[#A7B0C0] truncate">{t.role}</p>
                    </div>
                  </div>
                </Reveal>
              )
            })()}

            <div className="flex items-center justify-center gap-5 mt-7">
              <button
                onClick={() => setTestimonialIndex(i => (i - 1 + TESTIMONIALS.length) % TESTIMONIALS.length)}
                className="w-9 h-9 rounded-full border border-white/10 flex items-center justify-center text-[#A7B0C0] hover:text-white hover:border-white/25 transition-colors"
                aria-label="Depoimento anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-1.5">
                {TESTIMONIALS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setTestimonialIndex(i)}
                    aria-label={`Ver depoimento ${i + 1}`}
                    className={cn('h-1.5 rounded-full transition-all', i === testimonialIndex ? 'w-5 bg-[#1677FF]' : 'w-1.5 bg-white/20')}
                  />
                ))}
              </div>
              <button
                onClick={() => setTestimonialIndex(i => (i + 1) % TESTIMONIALS.length)}
                className="w-9 h-9 rounded-full border border-white/10 flex items-center justify-center text-[#A7B0C0] hover:text-white hover:border-white/25 transition-colors"
                aria-label="Próximo depoimento"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ══ PLANOS ══ */}
      <section id="planos" className="relative py-24 sm:py-32 px-5 sm:px-8 border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <Reveal className="max-w-2xl mx-auto text-center mb-10">
            <Eyebrow>Planos</Eyebrow>
            <h2 className="mt-3 font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-white">Um plano para cada tamanho de escritório</h2>
            <p className="mt-4 text-[#A7B0C0] leading-relaxed">
              Cobrança mensal recorrente, sem fidelidade. Faça upgrade quando o seu escritório crescer.
            </p>
          </Reveal>

          <Reveal delay={80} className="max-w-3xl mx-auto mb-8 rounded-2xl border border-[#1677FF]/20 bg-[#1677FF]/[0.06] p-5 sm:p-6 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 bg-[#0B5CFF]/15">
              <CalendarCheck className="w-5 h-5 text-[#1677FF]" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">
                Oferta de lançamento: assine hoje e pague R$ {PROMO_MONTHLY_PRICE},00/mês nos 3 primeiros meses, em qualquer plano
              </p>
              <p className="mt-1 text-xs text-[#1677FF]">Bônus: você recebe o e-book completo do LegalHub direto dentro do sistema</p>
            </div>
          </Reveal>

          <Reveal delay={120} className="max-w-xl mx-auto mb-14 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3 mb-3">
              <label htmlFor="process-slider" className="text-sm font-semibold text-white">
                Quantos processos ativos o seu escritório tem?
              </label>
              <span className="flex-shrink-0 text-sm font-bold text-[#1677FF]">
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
            <p className="mt-3 text-xs text-[#A7B0C0] flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#1677FF] flex-shrink-0" />
              Plano recomendado: <span className="font-semibold text-white">{PLANS.find(p => p.id === recommendedPlanId)?.name}</span>
            </p>
          </Reveal>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {PLANS.map((plan, i) => (
              <Reveal
                key={plan.id}
                delay={i * 90}
                className={cn(
                  'relative rounded-3xl p-7 sm:p-8 flex flex-col h-full transition-shadow border',
                  plan.highlight ? 'border-[#1677FF]/50 bg-white/[0.04] lg:-translate-y-3' : 'border-white/10 bg-white/[0.02]',
                  plan.id === recommendedPlanId && !plan.highlight && 'ring-2 ring-emerald-400/40'
                )}
                style={plan.highlight ? { boxShadow: '0 24px 60px -16px rgba(11,92,255,0.25)' } : undefined}
              >
                {plan.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold text-white bg-[#0B5CFF]">
                    Mais popular
                  </span>
                )}
                {plan.id === recommendedPlanId && (
                  <span className="absolute -top-3 right-5 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30">
                    <CheckCircle2 className="w-3 h-3" /> Ideal pra você
                  </span>
                )}

                <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                <p className="mt-1.5 text-xs text-[#A7B0C0] leading-relaxed min-h-[2.5rem]">{plan.tagline}</p>

                <div className="mt-5">
                  {plan.price > PROMO_MONTHLY_PRICE ? (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-[#A7B0C0] line-through">R$ {plan.price}/mês</span>
                        <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5">
                          {Math.round((1 - PROMO_MONTHLY_PRICE / plan.price) * 100)}% OFF
                        </span>
                      </div>
                      <div className="flex items-baseline gap-1 mt-1">
                        <span className="text-sm text-[#A7B0C0]">R$</span>
                        <span className="font-serif text-4xl font-semibold tracking-tight text-white">{PROMO_MONTHLY_PRICE}</span>
                        <span className="text-sm text-[#A7B0C0]">/mês</span>
                      </div>
                      <p className="mt-1 text-[11px] text-[#1677FF] font-medium">nos 3 primeiros meses — depois R$ {plan.price}/mês</p>
                    </>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-1">
                        <span className="text-sm text-[#A7B0C0]">R$</span>
                        <span className="font-serif text-4xl font-semibold tracking-tight text-white">{plan.price}</span>
                        <span className="text-sm text-[#A7B0C0]">/mês</span>
                      </div>
                      <p className="mt-1 text-[11px] text-[#1677FF] font-medium">já é o valor promocional dos 3 primeiros meses</p>
                    </>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-white/[0.06] rounded-lg px-3 py-1.5 w-fit">
                    <Briefcase className="w-3.5 h-3.5" />
                    {plan.processLimit}
                  </div>
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-white/[0.06] rounded-lg px-3 py-1.5 w-fit">
                    <HardDrive className="w-3.5 h-3.5" />
                    {plan.storageLimit}
                  </div>
                </div>

                <ul className="mt-6 space-y-3 flex-1">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-[#A7B0C0] leading-snug">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => goToLogin('signup')}
                  className={cn(
                    'mt-8 w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-all active:scale-[0.98]',
                    plan.highlight ? 'text-white bg-[#0B5CFF] hover:brightness-110' : 'text-white bg-white/[0.06] hover:bg-white/[0.1]'
                  )}
                >
                  Assinar {plan.name} <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </Reveal>
            ))}
          </div>

          <Reveal delay={260} className="mt-10 text-center text-xs text-[#A7B0C0]">
            Todos os planos incluem suporte, atualizações contínuas e dados isolados por escritório. Sem cartão de crédito para começar.
          </Reveal>
        </div>
      </section>

      {/* ══ FAQ ══ */}
      <section id="faq" className="relative py-24 sm:py-32 px-5 sm:px-8 border-b border-white/[0.06]">
        <div className="max-w-3xl mx-auto">
          <Reveal className="text-center mb-12">
            <Eyebrow>Dúvidas frequentes</Eyebrow>
            <h2 className="mt-3 font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-white">Antes de assinar, tire suas dúvidas</h2>
          </Reveal>

          <div className="space-y-3">
            {FAQS.map((item, i) => {
              const open = faqOpen === i
              return (
                <Reveal key={item.q} delay={i * 50} className={cn('rounded-2xl border overflow-hidden transition-colors', open ? 'border-[#1677FF]/30 bg-white/[0.03]' : 'border-white/10')}>
                  <button onClick={() => setFaqOpen(open ? null : i)} className="w-full flex items-center justify-between gap-4 px-5 sm:px-6 py-4 text-left">
                    <span className="text-sm font-semibold text-white">{item.q}</span>
                    <ChevronRight className={cn('w-4 h-4 flex-shrink-0 transition-transform', open ? 'rotate-90 text-[#1677FF]' : 'text-[#A7B0C0]')} />
                  </button>
                  <div className="grid transition-all duration-300 ease-out" style={{ gridTemplateRows: open ? '1fr' : '0fr' }}>
                    <div className="overflow-hidden">
                      <p className="px-5 sm:px-6 pb-4 text-sm text-[#A7B0C0] leading-relaxed">{item.a}</p>
                    </div>
                  </div>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* ══ CTA FINAL ══ */}
      <section id="contato" className="relative py-24 sm:py-32 px-5 sm:px-8 overflow-hidden">
        <div
          className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40rem] h-[40rem] rounded-full blur-3xl opacity-[0.08]"
          style={{ background: 'radial-gradient(circle, #0B5CFF, transparent 70%)' }}
        />
        <Reveal className="relative max-w-4xl mx-auto rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-12 sm:px-14 sm:py-14 flex flex-col sm:flex-row items-center gap-8">
          <div className="relative flex-shrink-0 w-20 h-20 flex items-center justify-center" style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)', background: 'linear-gradient(135deg, rgba(11,92,255,0.25), rgba(22,119,255,0.05))' }}>
            <CalendarCheck className="w-8 h-8 text-[#1677FF]" />
          </div>
          <div className="flex-1 text-center sm:text-left">
            <h2 className="font-serif text-2xl sm:text-3xl font-semibold tracking-tight text-white">Pronto para transformar a gestão do seu escritório?</h2>
            <p className="mt-3 text-[#A7B0C0] leading-relaxed">
              Agende uma demonstração gratuita e descubra como o LegalHub pode aumentar a produtividade e organização do seu escritório.
            </p>
          </div>
          <button
            onClick={() => goToLogin('signup')}
            className="flex-shrink-0 flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-sm font-semibold text-white bg-[#0B5CFF] transition-all active:scale-[0.98] hover:brightness-110"
            style={{ boxShadow: '0 10px 30px rgba(11,92,255,0.35)' }}
          >
            <CalendarCheck className="w-4 h-4" /> Agendar demonstração
          </button>
        </Reveal>
      </section>

      {/* ══ FOOTER ══ */}
      <footer className="relative border-t border-white/[0.06] px-5 sm:px-8 py-16">
        <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-10">
          <div className="lg:col-span-2 flex flex-col items-center sm:items-start gap-3 text-center sm:text-left">
            <BrandMark size={34} />
            <p className="text-xs text-[#A7B0C0] max-w-xs leading-relaxed">
              O sistema completo para escritórios de advocacia que buscam eficiência, organização e resultados.
            </p>
            <div className="flex items-center gap-3 mt-1">
              {[Linkedin, Instagram, Facebook].map((Icon, i) => (
                <a key={i} href="#" className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center text-[#A7B0C0] hover:text-white hover:border-white/25 transition-colors">
                  <Icon className="w-3.5 h-3.5" />
                </a>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-white mb-4">Produto</p>
            <ul className="space-y-2.5">
              {[['Funcionalidades', '#funcionalidades'], ['Planos', '#planos'], ['Recursos', '#faq'], ['Segurança', '#funcionalidades']].map(([label, href]) => (
                <li key={label}><a href={href} className="text-xs text-[#A7B0C0] hover:text-white transition-colors">{label}</a></li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-white mb-4">Empresa</p>
            <ul className="space-y-2.5">
              {['Sobre', 'Blog', 'Carreiras', 'Contato'].map(label => (
                <li key={label}><a href="#" className="text-xs text-[#A7B0C0] hover:text-white transition-colors">{label}</a></li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-white mb-4">Suporte</p>
            <ul className="space-y-2.5 mb-6">
              {['Central de Ajuda', 'Tutoriais', 'Status do Sistema', 'Fale Conosco'].map(label => (
                <li key={label}><a href="#" className="text-xs text-[#A7B0C0] hover:text-white transition-colors">{label}</a></li>
              ))}
            </ul>
            <p className="text-xs font-bold uppercase tracking-widest text-white mb-3">Fale conosco</p>
            <ul className="space-y-2">
              <li className="flex items-center gap-2 text-xs text-[#A7B0C0]"><Mail className="w-3.5 h-3.5 flex-shrink-0 text-[#1677FF]" /> contato@legalhub.com.br</li>
              <li className="flex items-center gap-2 text-xs text-[#A7B0C0]"><Phone className="w-3.5 h-3.5 flex-shrink-0 text-[#1677FF]" /> (83) 9 9999-9999</li>
              <li className="flex items-center gap-2 text-xs text-[#A7B0C0]"><MapPin className="w-3.5 h-3.5 flex-shrink-0 text-[#1677FF]" /> João Pessoa - PB, Brasil</li>
            </ul>
          </div>
        </div>

        <div className="max-w-6xl mx-auto mt-12 pt-6 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-[#A7B0C0]">© 2026 LegalHub. Todos os direitos reservados.</p>
          <div className="flex items-center gap-6">
            <a href="#" className="text-xs text-[#A7B0C0] hover:text-white transition-colors">Política de Privacidade</a>
            <a href="#" className="text-xs text-[#A7B0C0] hover:text-white transition-colors">Termos de Uso</a>
          </div>
        </div>
      </footer>

      {/* ══ CTA FIXO (mobile) ══ */}
      <div
        className={cn('sm:hidden fixed bottom-0 inset-x-0 z-40 px-4 pb-4 pt-3 transition-transform duration-300', showStickyCta ? 'translate-y-0' : 'translate-y-full')}
        style={{ background: 'linear-gradient(to top, rgba(2,7,17,0.98) 60%, rgba(2,7,17,0))' }}
      >
        <button
          onClick={() => goToLogin('signup')}
          className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl text-sm font-semibold text-white bg-[#0B5CFF] active:scale-[0.98] transition-transform"
          style={{ boxShadow: '0 12px 32px rgba(11,92,255,0.45)' }}
        >
          <CalendarCheck className="w-4 h-4" /> Agendar demonstração
        </button>
      </div>
    </div>
  )
}
