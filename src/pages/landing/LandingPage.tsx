import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  Users, Briefcase, CalendarDays, DollarSign, Bell, Handshake,
  ShieldCheck, Layers, LineChart, ArrowRight, Menu, X, CheckCircle2,
  Sparkles, UserPlus, Settings2, Rocket, Building2, Lock, Zap,
  AlertTriangle, Clock, FolderOpen, Wallet, TrendingDown, CalendarClock,
  Quote, Star, Bot, FileText, ChevronRight, ChevronDown, ChevronLeft, Gift, BookOpen,
  ShieldAlert, KeyRound, FileCheck2, Server, BadgeCheck, Crown,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

/** Logomarca oficial (a mesma do Login e do Sidebar) — ícone recortado num chip
 *  escuro, já que /logomarca.png é branca e foi feita para fundo escuro. */
function BrandMark({ size = 32, light = false }: { size?: number; light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="rounded-xl overflow-hidden flex-shrink-0 bg-sidebar-900" style={{ width: size, height: size }}>
        <img src="/logomarca.png" alt="LegalHub"
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '0% 50%' }} />
      </div>
      <span className={cn('font-bold text-lg tracking-tight', light ? 'text-white' : 'text-slate-900')}>LegalHub</span>
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

/** Rótulo pequeno em versalete, usado no topo de cada seção. Dourado sobre claro ou sobre escuro. */
function Eyebrow({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <span className={cn('text-xs font-bold uppercase tracking-[0.14em]', dark ? 'text-gold-300' : 'text-gold-700')}>
      {children}
    </span>
  )
}

const NAV_LINKS = [
  { href: '#dores', label: 'Por que o LegalHub' },
  { href: '#recursos', label: 'Funcionalidades' },
  { href: '#como-funciona', label: 'Como funciona' },
  { href: '#planos', label: 'Planos' },
  { href: '#faq', label: 'Dúvidas' },
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

// Nós do diagrama hub-and-spoke (versão desktop da seção Recursos)
const HUB_NODES = [
  { icon: Layers, label: 'Dashboard' },
  { icon: Users, label: 'Clientes' },
  { icon: Briefcase, label: 'Processos' },
  { icon: CalendarDays, label: 'Agenda' },
  { icon: DollarSign, label: 'Financeiro' },
  { icon: Bell, label: 'Publicações' },
  { icon: Building2, label: 'Portal do Cliente' },
  { icon: Bot, label: 'Copiloto de IA' },
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

// ─── Demo interativa por módulo ────────────────────────────────────────────
const MODULE_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: Layers },
  { id: 'clientes', label: 'Clientes', icon: Users },
  { id: 'processos', label: 'Processos', icon: Briefcase },
  { id: 'financeiro', label: 'Financeiro', icon: DollarSign },
  { id: 'agenda', label: 'Agenda', icon: CalendarDays },
] as const
type ModuleId = typeof MODULE_TABS[number]['id']

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

const PROMO_MONTHLY_PRICE = 176

// ─── Planos ─────────────────────────────────────────────────────────────────
const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'Para quem está começando a organizar o escritório',
    price: 176,
    processLimit: 'Até 600 processos ativos',
    features: [
      'Dashboard completo (visão geral, lista, quadro e desempenho)',
      'Clientes com busca automática de CPF/CNPJ',
      'Processos por fase e grupo de ação',
      'Tarefas com recorrência e cálculo de prazo',
      'Agenda sincronizada com o Google Calendar',
      'Financeiro (contas a pagar e a receber)',
      'Suporte por e-mail',
    ],
  },
  {
    id: 'professional',
    name: 'Professional',
    tagline: 'Para escritórios em crescimento, com equipe e clientes ativos',
    price: 352,
    processLimit: 'Até 1.200 processos ativos',
    highlight: true,
    features: [
      'Tudo do plano Starter',
      'Publicações & Intimações automáticas (CNJ, PJe, Escavador, Jusbrasil)',
      'Portal do Cliente exclusivo',
      'Relatórios de desempenho da equipe',
      'Colaboradores & Parceiros com comissão automática',
      'Suporte prioritário',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Para escritórios com alto volume e times maiores',
    price: 700,
    processLimit: 'Processos ilimitados',
    features: [
      'Tudo do plano Professional',
      'Copiloto de Inteligência Artificial',
      'Onboarding assistido para toda a equipe',
      'Suporte dedicado',
    ],
  },
]

const SECURITY_BADGES = [
  { icon: Server, label: 'Dados isolados por escritório', description: 'Cada tenant opera em ambiente separado — nenhum escritório enxerga dados de outro.' },
  { icon: KeyRound, label: 'Controle de acesso por função', description: 'Administrador, advogado, estagiário, financeiro e cliente do Portal — cada um vê só o que deve.' },
  { icon: Lock, label: 'Conexão criptografada (SSL/TLS)', description: 'Toda comunicação entre o seu navegador e o sistema é criptografada.' },
  { icon: FileCheck2, label: 'Exclusão reversível dos dados', description: 'Nada é apagado de forma definitiva por engano — o padrão do sistema é soft delete.' },
  { icon: ShieldAlert, label: 'Pensado para a LGPD', description: 'Registro de consentimento por cliente e controle de quem acessa cada dado.' },
  { icon: BadgeCheck, label: 'Sem fidelidade', description: 'Assinatura mensal recorrente — cancele quando quiser, sem multa.' },
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

/** Conta de 0 até o valor assim que o número entra na viewport (ex: "10+", "100%"). */
function AnimatedStatValue({ value, className }: { value: string; className?: string }) {
  const match = value.match(/^(\d+)(.*)$/)
  const ref = useRef<HTMLParagraphElement>(null)
  const [display, setDisplay] = useState(match ? `0${match[2]}` : value)

  useEffect(() => {
    if (!match || !ref.current) return
    const target = parseInt(match[1], 10)
    const suffix = match[2]
    let done = false
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || done) return
      done = true
      const start = performance.now()
      const duration = 900
      function tick(now: number) {
        const progress = Math.min(1, (now - start) / duration)
        const eased = 1 - Math.pow(1 - progress, 3)
        setDisplay(`${Math.round(eased * target)}${suffix}`)
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

/** Mockup interativo de cada módulo, exibido na seção "Veja por dentro". */
function ModulePreview({ id }: { id: ModuleId }) {
  if (id === 'dashboard') {
    return (
      <div key={id} className="animate-fade-in grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Processos ativos', value: '128', accent: 'bg-dark-900' },
          { label: 'Tarefas concluídas no mês', value: '342', accent: 'bg-emerald-500' },
          { label: 'Honorários a receber', value: 'R$ 84.2k', accent: 'bg-gold-500' },
        ].map(card => (
          <div key={card.label} className="rounded-xl p-5 border border-slate-200 bg-slate-50">
            <p className="text-2xl font-bold text-slate-900">{card.value}</p>
            <p className="text-xs text-slate-500 mt-1">{card.label}</p>
            <div className={cn('h-1 w-8 rounded-full mt-3', card.accent)} />
          </div>
        ))}
        <div className="sm:col-span-3 rounded-xl border border-slate-200 p-5 bg-white">
          <p className="text-sm font-semibold text-slate-700 mb-4">Desempenho da semana</p>
          <div className="flex items-end gap-2.5 h-24">
            {[40, 65, 50, 80, 60, 95, 70].map((h, i) => (
              <div key={i} className="flex-1 rounded-t-md bg-dark-900/85" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (id === 'clientes') {
    return (
      <div key={id} className="animate-fade-in space-y-2.5">
        {[
          { name: 'Ana Ribeiro', type: 'Pessoa física', status: 'Ativo' },
          { name: 'Construtora Nova Era', type: 'Pessoa jurídica', status: 'Ativo' },
          { name: 'Carlos Menezes', type: 'Pessoa física', status: 'Prospect' },
          { name: 'Grupo Alvorada Ltda', type: 'Pessoa jurídica', status: 'Ativo' },
        ].map(c => (
          <div key={c.name} className="flex items-center gap-3 rounded-xl border border-slate-100 px-4 py-3">
            <div className="w-9 h-9 rounded-full bg-gold-100 flex items-center justify-center text-xs font-bold text-gold-700 flex-shrink-0">
              {c.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{c.name}</p>
              <p className="text-[11px] text-slate-400">{c.type}</p>
            </div>
            <span className={cn(
              'text-[11px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0',
              c.status === 'Ativo' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
            )}>
              {c.status}
            </span>
          </div>
        ))}
      </div>
    )
  }

  if (id === 'processos') {
    return (
      <div key={id} className="animate-fade-in space-y-2.5">
        {[
          { number: '0001234-56.2025.8.26.0100', phase: 'Negociação', color: 'bg-gold-50 text-gold-700' },
          { number: '0007788-11.2024.5.02.0030', phase: 'Recursal', color: 'bg-violet-50 text-violet-600' },
          { number: '0002211-90.2023.8.26.0002', phase: 'Execução', color: 'bg-amber-50 text-amber-600' },
          { number: '0009900-44.2022.8.26.0053', phase: 'Encerrado', color: 'bg-emerald-50 text-emerald-600' },
        ].map(p => (
          <div key={p.number} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-4 py-3">
            <p className="text-xs font-mono text-slate-600 truncate">{p.number}</p>
            <span className={cn('text-[11px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0', p.color)}>{p.phase}</span>
          </div>
        ))}
      </div>
    )
  }

  if (id === 'financeiro') {
    return (
      <div key={id} className="animate-fade-in grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="rounded-xl border border-slate-200 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 mb-3">Contas a receber</p>
          {[['Honorários — Ana Ribeiro', 'R$ 3.200'], ['Honorários — Grupo Alvorada', 'R$ 8.900']].map(([l, v]) => (
            <div key={l} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
              <span className="text-xs text-slate-600">{l}</span>
              <span className="text-xs font-semibold text-emerald-600">{v}</span>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-slate-200 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-500 mb-3">Contas a pagar</p>
          {[['Comissão — Parceiro Silva', 'R$ 1.100'], ['Despesas do escritório', 'R$ 2.450']].map(([l, v]) => (
            <div key={l} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
              <span className="text-xs text-slate-600">{l}</span>
              <span className="text-xs font-semibold text-red-500">{v}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div key={id} className="animate-fade-in">
      <div className="grid grid-cols-7 gap-1.5 mb-4">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
          <p key={i} className="text-center text-[10px] font-semibold text-slate-400">{d}</p>
        ))}
        {Array.from({ length: 30 }).map((_, i) => {
          const day = i + 1
          const highlight = [8, 14, 21, 27].includes(day)
          return (
            <div key={i} className={cn(
              'aspect-square rounded-md flex items-center justify-center text-[11px]',
              highlight ? 'bg-dark-900 text-white font-semibold' : 'bg-slate-50 text-slate-500'
            )}>
              {day}
            </div>
          )
        })}
      </div>
      <div className="rounded-xl border border-slate-200 p-4 flex items-center gap-3">
        <CalendarDays className="w-4 h-4 text-gold-600 flex-shrink-0" />
        <p className="text-xs text-slate-600">Audiência do processo 0007788-11 sincronizada com o Google Calendar de Dra. Ana.</p>
      </div>
    </div>
  )
}

/** Diagrama hub-and-spoke: logo central com os módulos orbitando ao redor (só desktop). */
function FeatureHub() {
  const radius = 230
  return (
    <div className="relative mx-auto hidden lg:block" style={{ width: 560, height: 560 }}>
      {/* Anel orbital */}
      <div className="absolute inset-0 rounded-full border border-dashed border-white/10" />
      <div className="absolute inset-16 rounded-full border border-white/5" />

      {/* Centro */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center">
        <div
          className="w-28 h-28 rounded-full flex items-center justify-center"
          style={{
            background: 'radial-gradient(circle, rgba(211,160,87,0.25), rgba(211,160,87,0.02) 70%)',
          }}
        >
          <div className="w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center bg-dark-900 border border-gold-400/30" style={{ boxShadow: '0 0 40px rgba(211,160,87,0.35)' }}>
            <img src="/logomarca.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '0% 50%' }} />
          </div>
        </div>
      </div>

      {/* Nós orbitando */}
      {HUB_NODES.map((node, i) => {
        const angle = (360 / HUB_NODES.length) * i - 90
        return (
          <div
            key={node.label}
            className="absolute top-1/2 left-1/2"
            style={{ transform: `rotate(${angle}deg) translate(${radius}px) rotate(${-angle}deg)` }}
          >
            <Reveal delay={i * 60} className="-translate-x-1/2 -translate-y-1/2 flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-sm whitespace-nowrap hover:bg-white/[0.08] hover:border-gold-400/30 transition-colors">
              <node.icon className="w-4 h-4 text-gold-400 flex-shrink-0" />
              <span className="text-sm font-medium text-white">{node.label}</span>
            </Reveal>
          </div>
        )
      })}
    </div>
  )
}

/** Fundo com pontos sutis + manchas de luz navy/dourada, para seções claras. */
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
        className="absolute -top-32 left-1/4 w-[34rem] h-[34rem] rounded-full blur-3xl opacity-[0.15] animate-[float_9s_ease-in-out_infinite]"
        style={{ background: 'radial-gradient(circle, #0f1e36, transparent 70%)' }}
      />
      <div
        className="absolute top-1/3 -right-32 w-[28rem] h-[28rem] rounded-full blur-3xl opacity-[0.16] animate-[float_11s_ease-in-out_infinite_1.5s]"
        style={{ background: 'radial-gradient(circle, #d3a057, transparent 70%)' }}
      />
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
  const [activeModule, setActiveModule] = useState<ModuleId>('dashboard')
  const [processCount, setProcessCount] = useState(600)
  const [testimonialIndex, setTestimonialIndex] = useState(0)

  const recommendedPlanId = processCount <= 600 ? 'starter' : processCount <= 1200 ? 'professional' : 'enterprise'
  const activeTab = MODULE_TABS.find(t => t.id === activeModule)!

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
          background: scrolled ? 'rgba(255,255,255,0.92)' : 'transparent',
          backdropFilter: scrolled ? 'blur(12px)' : 'none',
          borderBottom: scrolled ? '1px solid #e2e8f0' : '1px solid transparent',
        }}
      >
        <div className="max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <BrandMark size={32} light={!scrolled} />

          <nav className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map(l => (
              <a
                key={l.href}
                href={l.href}
                className={cn(
                  'relative text-sm transition-colors group',
                  scrolled ? 'text-slate-600 hover:text-slate-900' : 'text-slate-300 hover:text-white'
                )}
              >
                {l.label}
                <span className="absolute -bottom-1.5 left-0 w-0 h-px bg-gold-400 transition-all duration-300 group-hover:w-full" />
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <button
              onClick={() => goToLogin('login')}
              className={cn(
                'text-sm font-medium transition-colors px-3 py-2',
                scrolled ? 'text-slate-600 hover:text-slate-900' : 'text-slate-300 hover:text-white'
              )}
            >
              Entrar
            </button>
            <button
              onClick={() => goToLogin('signup')}
              className="relative overflow-hidden flex items-center gap-1.5 text-sm font-semibold text-dark-900 px-4 py-2.5 rounded-full transition-all active:scale-[0.97] hover:brightness-105 bg-gold-500"
              style={{ boxShadow: '0 4px 18px rgba(211,160,87,0.35)' }}
            >
              Começar agora <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <button className={cn('md:hidden', scrolled ? 'text-slate-700' : 'text-white')} onClick={() => setMenuOpen(v => !v)}>
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
                className="w-full text-center text-sm font-semibold text-dark-900 rounded-full py-2.5 bg-gold-500"
              >
                Começar agora
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ══ HERO ══ */}
      <section className="relative pt-32 pb-20 sm:pt-40 px-5 sm:px-8 overflow-hidden" style={{ background: 'linear-gradient(180deg, #0a1628 0%, #0d1f3c 55%, #0a1628 100%)' }}>
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
          style={{ background: 'radial-gradient(circle, #3b82f6, transparent 70%)' }}
        />
        <div
          className="pointer-events-none absolute top-1/3 -left-32 w-[26rem] h-[26rem] rounded-full blur-3xl opacity-[0.16] animate-[float_11s_ease-in-out_infinite_1.5s]"
          style={{ background: 'radial-gradient(circle, #d3a057, transparent 70%)' }}
        />

        <div className="relative max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-14 lg:gap-8 items-center pb-20">

          {/* Coluna de texto */}
          <div className="min-w-0 lg:col-span-6 text-center lg:text-left">
            <Reveal>
              <p className="text-base sm:text-lg text-slate-300 font-light mb-1.5">Gestão jurídica completa.</p>
            </Reveal>

            <Reveal delay={80}>
              <h1 className="font-serif text-4xl sm:text-5xl lg:text-[3.4rem] font-semibold tracking-tight leading-[1.1] text-white" style={{ textWrap: 'balance' } as React.CSSProperties}>
                Para escritórios que{' '}
                <span className="italic text-gold-400">não podem perder prazo</span>.
              </h1>
            </Reveal>

            <Reveal delay={160}>
              <p className="mt-6 text-base sm:text-lg text-slate-300 max-w-xl mx-auto lg:mx-0 leading-relaxed">
                Centralize clientes, processos, tarefas, agenda e financeiro do seu escritório de advocacia
                em uma única plataforma — com sincronização automática ao CNJ e ao Google Agenda.
              </p>
            </Reveal>

            <Reveal delay={240}>
              <div className="mt-9 flex flex-col sm:flex-row items-center lg:justify-start justify-center gap-3">
                <button
                  onClick={() => goToLogin('signup')}
                  className="relative overflow-hidden group w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-3.5 rounded-full text-sm font-semibold text-dark-900 transition-all active:scale-[0.98] hover:-translate-y-0.5 bg-gold-500 hover:brightness-105"
                  style={{ boxShadow: '0 10px 30px rgba(211,160,87,0.35)' }}
                >
                  <span
                    className="absolute inset-0 opacity-0 group-hover:opacity-100"
                    style={{ background: 'linear-gradient(115deg,transparent,rgba(255,255,255,0.45),transparent)', animation: 'shine 1.1s ease' }}
                  />
                  <span className="relative">Teste grátis por 7 dias</span>
                  <ArrowRight className="relative w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </button>
                <button
                  onClick={() => goToLogin('login')}
                  className="w-full sm:w-auto px-7 py-3.5 rounded-full text-sm font-semibold text-white border border-white/20 hover:bg-white/5 transition-all"
                >
                  Já tenho uma conta
                </button>
              </div>
            </Reveal>

            <Reveal delay={300}>
              <div className="mt-7 flex flex-wrap items-center justify-center lg:justify-start gap-x-5 gap-y-2">
                {['Sem cartão de crédito', 'Cancele quando quiser', 'Dados isolados por escritório'].map(item => (
                  <span key={item} className="flex items-center gap-1.5 text-xs text-slate-400">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    {item}
                  </span>
                ))}
              </div>
            </Reveal>
          </div>

          {/* Coluna do mockup — painel flutuante em perspectiva */}
          <Reveal delay={360} className="min-w-0 lg:col-span-6 relative" style={{ perspective: '1600px' }}>
            <div className="relative mx-auto w-full max-w-[520px]" style={{ transform: 'rotateY(-6deg) rotateX(3deg)' }}>
              <div
                className="pointer-events-none absolute -inset-8 -z-10 rounded-[2.5rem] blur-2xl opacity-50"
                style={{ background: 'radial-gradient(ellipse at 30% 20%, #3b82f6, transparent 60%)' }}
              />
              <div
                className="rounded-2xl overflow-hidden bg-dark-900 border border-white/10"
                style={{ boxShadow: '0 50px 120px -20px rgba(0,0,0,0.55), 0 0 80px -25px rgba(211,160,87,0.3)' }}
              >
                <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/10 bg-dark-800">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
                  <span className="w-2.5 h-2.5 rounded-full bg-gold-400/70" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/70" />
                  <div className="ml-4 flex-1 max-w-xs h-6 rounded-md bg-white/5 border border-white/10" />
                </div>
                <div className="flex">
                  {/* Mini sidebar, igual à sidebar real do sistema */}
                  <div className="hidden sm:flex flex-col items-center gap-3 py-6 px-3 border-r border-white/10">
                    {[Users, Briefcase, CalendarDays, DollarSign].map((Icon, i) => (
                      <div key={i} className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center',
                        i === 0 ? 'bg-gold-500' : 'bg-white/5'
                      )}>
                        <Icon className={cn('w-4 h-4', i === 0 ? 'text-dark-900' : 'text-slate-300')} />
                      </div>
                    ))}
                  </div>

                  <div className="flex-1 p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    {[
                      { label: 'Processos ativos', value: '128', accent: 'bg-gold-500' },
                      { label: 'Tarefas concluídas no mês', value: '342', accent: 'bg-emerald-400' },
                      { label: 'Honorários a receber', value: 'R$ 84.2k', accent: 'bg-white' },
                    ].map(card => (
                      <div key={card.label} className="rounded-xl p-4 border border-white/10 bg-white/[0.04] transition-transform hover:-translate-y-0.5">
                        <p className="text-xl font-bold text-white">{card.value}</p>
                        <p className="text-[11px] text-slate-400 mt-1">{card.label}</p>
                        <div className={cn('h-1 w-8 rounded-full mt-2.5', card.accent)} />
                      </div>
                    ))}
                    <div className="sm:col-span-3 rounded-xl border border-white/10 p-4 bg-white/[0.03]">
                      <div className="flex items-center justify-between mb-3.5">
                        <p className="text-sm font-semibold text-slate-200">Quadro de atividades</p>
                        <span className="text-[11px] text-slate-500">Sincronizado com a agenda</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        {['Hoje', 'Próximos 7 dias', 'Fazendo', 'Concluídas'].map((col, i) => (
                          <div key={col} className="rounded-lg border border-white/10 p-2.5 bg-white/[0.03]">
                            <p className="text-[10px] font-semibold text-slate-400 mb-2">{col}</p>
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
            </div>

            {/* Cards flutuantes de destaque */}
            <div
              className="hidden lg:flex absolute -left-4 top-6 items-center gap-2.5 px-4 py-3 rounded-xl border border-slate-200 bg-white"
              style={{ boxShadow: '0 12px 32px rgba(0,0,0,0.25)', animation: 'floatCard 6s ease-in-out infinite', ['--rot' as any]: '-3deg' }}
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
              className="hidden lg:flex absolute -right-2 -bottom-6 items-center gap-2.5 px-4 py-3 rounded-xl border border-slate-200 bg-white"
              style={{ boxShadow: '0 12px 32px rgba(0,0,0,0.25)', animation: 'floatCard 7s ease-in-out infinite 1s', ['--rot' as any]: '2deg' }}
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gold-50">
                <Bell className="w-4 h-4 text-gold-600" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-800">Nova intimação CNJ</p>
                <p className="text-[10px] text-slate-400">Sincronizada automaticamente</p>
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
              className="rounded-2xl p-5 border border-white/10 hover:border-gold-400/30 transition-colors"
              style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.015))' }}
            >
              <s.icon className="w-5 h-5 text-gold-400 mb-3" />
              <AnimatedStatValue value={s.value} className="text-white text-xl sm:text-2xl" />
              <p className="text-xs text-slate-400 mt-1">{s.label}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ══ DORES DO CLIENTE — lista editorial numerada ══ */}
      <section id="dores" className="relative py-24 sm:py-32 px-5 sm:px-8 border-b border-slate-100">
        <div className="max-w-5xl mx-auto">
          <Reveal className="max-w-2xl mb-16">
            <Eyebrow>Por que o LegalHub</Eyebrow>
            <h2 className="mt-3 font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900">
              Os problemas que consomem o seu dia — resolvidos
            </h2>
            <p className="mt-4 text-slate-500 leading-relaxed">
              Se algum destes cenários é familiar, é exatamente aí que o LegalHub entra.
            </p>
          </Reveal>

          <div className="rounded-3xl border border-slate-200 divide-y divide-slate-200 overflow-hidden">
            {PAIN_POINTS.map((p, i) => (
              <Reveal key={p.problem} delay={i * 60}>
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 items-start px-6 sm:px-10 py-8 sm:py-9 hover:bg-slate-50/70 transition-colors">
                  <div className="lg:col-span-1 flex lg:block items-center gap-3">
                    <span className="font-serif text-3xl sm:text-4xl font-semibold text-slate-200">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                  </div>
                  <div className="lg:col-span-5">
                    <div className="flex items-center gap-2 mb-2">
                      <p.icon className="w-4 h-4 text-gold-600 flex-shrink-0" />
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">O problema</p>
                    </div>
                    <p className="text-base text-slate-800 leading-relaxed">{p.problem}</p>
                  </div>
                  <div className="hidden lg:flex lg:col-span-1 items-center justify-center pt-1.5">
                    <ArrowRight className="w-4 h-4 text-slate-300" />
                  </div>
                  <div className="lg:col-span-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gold-700 mb-2">Com o LegalHub</p>
                    <p className="text-base text-slate-600 leading-relaxed">{p.solution}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ DEMO INTERATIVA — réplica do shell real do sistema ══ */}
      <section id="demo" className="relative py-24 sm:py-32 px-5 sm:px-8 border-b border-slate-100 bg-slate-50/60 overflow-hidden">
        <div className="relative max-w-5xl mx-auto">
          <Reveal className="max-w-2xl mx-auto text-center mb-12">
            <Eyebrow>Veja por dentro</Eyebrow>
            <h2 className="mt-3 font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900">Um sistema, todos os módulos do escritório</h2>
            <p className="mt-4 text-slate-500 leading-relaxed">
              Clique em cada módulo e veja como a informação se organiza dentro do LegalHub.
            </p>
          </Reveal>

          <Reveal delay={100} className="rounded-3xl border border-slate-200 bg-white overflow-hidden flex flex-col md:flex-row" style={{ boxShadow: '0 30px 80px -24px rgba(15,23,42,0.16)' }}>
            {/* Navegação de módulos — horizontal no mobile, sidebar vertical no desktop */}
            <div className="flex md:flex-col overflow-x-auto md:overflow-visible gap-1.5 md:gap-1 p-3 md:p-4 md:w-56 flex-shrink-0 bg-dark-900">
              <p className="hidden md:block px-3 pb-2 text-[10px] font-bold uppercase tracking-widest text-white/35">Módulos</p>
              {MODULE_TABS.map(tab => {
                const active = activeModule === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveModule(tab.id)}
                    className={cn(
                      'flex-shrink-0 md:flex-shrink flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap',
                      active ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                    )}
                    style={active ? { boxShadow: 'inset 2px 0 0 0 #d3a057' } : undefined}
                  >
                    <tab.icon className={cn('w-4 h-4 flex-shrink-0', active ? 'text-gold-400' : 'text-slate-500')} />
                    {tab.label}
                  </button>
                )
              })}
            </div>

            {/* Painel do módulo ativo */}
            <div className="flex-1 p-6 sm:p-10 min-h-[340px]">
              <div className="flex items-center gap-2 mb-6">
                <activeTab.icon className="w-4 h-4 text-gold-600" />
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{activeTab.label}</p>
              </div>
              <ModulePreview id={activeModule} />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══ RECURSOS — hub-and-spoke + bento ══ */}
      <section id="recursos" className="relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #0a1628 0%, #0d1f3c 100%)' }}>
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.4]"
          style={{
            backgroundImage: 'radial-gradient(#1e293b 1px, transparent 1px)',
            backgroundSize: '26px 26px',
            maskImage: 'radial-gradient(ellipse 60% 60% at 50% 40%, black, transparent)',
          }}
        />
        <div className="relative max-w-6xl mx-auto px-5 sm:px-8 pt-24 sm:pt-32 pb-8">
          <Reveal className="max-w-2xl mx-auto text-center mb-8">
            <Eyebrow dark>Funcionalidades</Eyebrow>
            <h2 className="mt-3 font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-white">Um ecossistema, todo o escritório conectado</h2>
            <p className="mt-4 text-slate-400 leading-relaxed">
              Cada módulo conversa com os outros — nenhuma informação fica presa em um canto do sistema.
            </p>
          </Reveal>

          <FeatureHub />

          {/* Versão em grade para telas menores */}
          <div className="lg:hidden grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto">
            {HUB_NODES.map(node => (
              <div key={node.label} className="flex flex-col items-center gap-2 text-center rounded-xl border border-white/10 bg-white/[0.03] px-3 py-4">
                <node.icon className="w-4 h-4 text-gold-400" />
                <span className="text-xs font-medium text-white">{node.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative py-24 sm:py-32 px-5 sm:px-8 border-b border-slate-100">
        <div className="max-w-6xl mx-auto">
          <Reveal className="max-w-2xl mx-auto text-center mb-16">
            <Eyebrow>Em detalhes</Eyebrow>
            <h2 className="mt-3 font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900">Tudo que o seu escritório precisa</h2>
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
                  'group relative rounded-2xl p-7 overflow-hidden transition-all duration-300',
                  f.flagship
                    ? 'sm:col-span-2 bg-dark-900 hover:-translate-y-1'
                    : 'border border-slate-200 hover:border-gold-200 hover:-translate-y-1 bg-white'
                )}
                style={f.flagship ? { boxShadow: '0 20px 50px -20px rgba(10,22,40,0.5)' } : undefined}
              >
                {f.flagship && (
                  <div
                    className="pointer-events-none absolute -top-16 -right-16 w-56 h-56 rounded-full blur-3xl opacity-[0.18]"
                    style={{ background: 'radial-gradient(circle, #d3a057, transparent 70%)' }}
                  />
                )}
                <div
                  className={cn(
                    'relative w-11 h-11 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110',
                    f.flagship ? 'bg-gold-500' : 'bg-dark-900'
                  )}
                >
                  <f.icon className={cn('w-5 h-5', f.flagship ? 'text-dark-900' : 'text-white')} />
                </div>
                <h3 className={cn('relative text-base sm:text-lg font-semibold', f.flagship ? 'text-white' : 'text-slate-900')}>{f.title}</h3>
                <p className={cn('relative mt-2 text-sm leading-relaxed max-w-md', f.flagship ? 'text-slate-300' : 'text-slate-500')}>{f.description}</p>
              </Reveal>
            ))}
          </div>

          <Reveal delay={200} className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">E também</p>
            <div className="flex flex-wrap gap-3">
              {MORE_FEATURES.map(m => (
                <div key={m.label} className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-600">
                  <m.icon className="w-4 h-4 text-gold-600 flex-shrink-0" />
                  {m.label}
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══ COMO FUNCIONA ══ */}
      <section id="como-funciona" className="relative py-24 sm:py-32 px-5 sm:px-8 border-b border-slate-100 bg-slate-50/60">
        <div className="max-w-5xl mx-auto">
          <Reveal className="max-w-2xl mx-auto text-center mb-16">
            <Eyebrow>Como funciona</Eyebrow>
            <h2 className="mt-3 font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900">Do cadastro ao dia a dia, em três passos</h2>
          </Reveal>

          <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-10">
            <div className="hidden sm:block absolute top-7 left-[16.5%] right-[16.5%] h-px bg-slate-200" />
            {STEPS.map((s, i) => (
              <Reveal key={s.title} delay={i * 120} className="relative text-center">
                <div className="relative z-10 w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-5 bg-dark-900" style={{ boxShadow: '0 10px 24px -8px rgba(10,22,40,0.4)' }}>
                  <s.icon className="w-6 h-6 text-white" />
                  <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center text-dark-900 bg-gold-500">
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

      {/* ══ DEPOIMENTOS — carrossel ══ */}
      <section id="depoimentos" className="relative py-24 sm:py-32 px-5 sm:px-8 border-b border-slate-100 bg-slate-50/60">
        <div className="max-w-2xl mx-auto">
          <Reveal className="text-center mb-16">
            <Eyebrow>Depoimentos</Eyebrow>
            <h2 className="mt-3 font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900">Quem usa, recomenda</h2>
          </Reveal>

          <div className="relative">
            {(() => {
              const t = TESTIMONIALS[testimonialIndex]
              return (
                <Reveal key={testimonialIndex} className="rounded-3xl border border-slate-200 bg-white p-8 sm:p-10 flex flex-col items-center text-center">
                  <Quote className="w-7 h-7 text-gold-300 mb-4" />
                  <div className="flex items-center gap-0.5 mb-4">
                    {Array.from({ length: 5 }).map((_, j) => <Star key={j} className="w-4 h-4 fill-amber-400 text-amber-400" />)}
                  </div>
                  <p className="text-base text-slate-600 leading-relaxed">{t.quote}</p>
                  <div className="flex items-center gap-3 mt-7 pt-6 border-t border-slate-100">
                    <div className="w-10 h-10 rounded-full bg-dark-900 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                      {t.name.charAt(0)}
                    </div>
                    <div className="min-w-0 text-left">
                      <p className="text-sm font-semibold text-slate-900 truncate">{t.name}</p>
                      <p className="text-xs text-slate-400 truncate">{t.role}</p>
                    </div>
                  </div>
                </Reveal>
              )
            })()}

            <div className="flex items-center justify-center gap-5 mt-7">
              <button
                onClick={() => setTestimonialIndex(i => (i - 1 + TESTIMONIALS.length) % TESTIMONIALS.length)}
                className="w-9 h-9 rounded-full border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:text-dark-900 hover:border-slate-300 transition-colors"
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
                    className={cn('h-1.5 rounded-full transition-all', i === testimonialIndex ? 'w-5 bg-gold-500' : 'w-1.5 bg-slate-300')}
                  />
                ))}
              </div>
              <button
                onClick={() => setTestimonialIndex(i => (i + 1) % TESTIMONIALS.length)}
                className="w-9 h-9 rounded-full border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:text-dark-900 hover:border-slate-300 transition-colors"
                aria-label="Próximo depoimento"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ══ VANTAGENS ══ */}
      <section id="vantagens" className="relative py-24 sm:py-32 px-5 sm:px-8 border-b border-slate-100 bg-slate-50/60">
        <div className="relative max-w-6xl mx-auto">
          <Reveal className="max-w-2xl mx-auto text-center mb-16">
            <Eyebrow>Vantagens</Eyebrow>
            <h2 className="mt-3 font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900">Por que escritórios escolhem o LegalHub</h2>
          </Reveal>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {[
              { icon: Layers, title: 'Tudo integrado', description: 'Clientes, processos, tarefas, agenda e financeiro conversam entre si — sem planilhas soltas ou retrabalho.' },
              { icon: ShieldCheck, title: 'Segurança de dados', description: 'Cada escritório opera isolado, com controle de acesso por função: administrador, advogado, estagiário ou financeiro.' },
              { icon: LineChart, title: 'Decisões com dados', description: 'Relatórios de desempenho e produtividade para você enxergar o escritório com clareza, não achismo.' },
            ].map((b, i) => (
              <Reveal key={b.title} delay={i * 100} className="text-center sm:text-left">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5 mx-auto sm:mx-0 bg-dark-900">
                  <b.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">{b.title}</h3>
                <p className="mt-2.5 text-sm text-slate-500 leading-relaxed">{b.description}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ SEGURANÇA / CONFIANÇA ══ */}
      <section id="seguranca" className="relative py-24 sm:py-32 px-5 sm:px-8 border-b border-slate-100 bg-slate-950 overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.4]"
          style={{
            backgroundImage: 'radial-gradient(#1e293b 1px, transparent 1px)',
            backgroundSize: '26px 26px',
            maskImage: 'radial-gradient(ellipse 60% 60% at 50% 30%, black, transparent)',
          }}
        />
        <div
          className="pointer-events-none absolute top-0 left-1/3 w-[30rem] h-[30rem] rounded-full blur-3xl opacity-[0.14]"
          style={{ background: 'radial-gradient(circle, #d3a057, transparent 70%)' }}
        />
        <div className="relative max-w-6xl mx-auto">
          <Reveal className="max-w-2xl mx-auto text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold text-gold-300 border border-gold-500/30 bg-gold-500/10 mb-5">
              <ShieldCheck className="w-3.5 h-3.5 text-gold-400" />
              Segurança em primeiro lugar
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-white">
              Assinar significa confiar seus dados a alguém — é isso que levamos a sério
            </h2>
            <p className="mt-4 text-slate-400 leading-relaxed">
              Sem letra miúda: veja exatamente o que protege as informações do seu escritório e dos seus clientes.
            </p>
          </Reveal>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {SECURITY_BADGES.map((s, i) => (
              <Reveal key={s.label} delay={i * 70} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 hover:bg-white/[0.05] transition-colors">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gold-500/15 mb-4">
                  <s.icon className="w-5 h-5 text-gold-400" />
                </div>
                <h3 className="text-sm font-semibold text-white">{s.label}</h3>
                <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">{s.description}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ PLANOS ══ */}
      <section id="planos" className="relative py-24 sm:py-32 px-5 sm:px-8 border-b border-slate-100 bg-slate-50/60">
        <div className="max-w-6xl mx-auto">
          <Reveal className="max-w-2xl mx-auto text-center mb-10">
            <Eyebrow>Planos</Eyebrow>
            <h2 className="mt-3 font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900">Um plano para cada tamanho de escritório</h2>
            <p className="mt-4 text-slate-500 leading-relaxed">
              Cobrança mensal recorrente, sem fidelidade. Faça upgrade quando o seu escritório crescer.
            </p>
          </Reveal>

          <Reveal delay={80} className="max-w-3xl mx-auto mb-8 rounded-2xl border border-gold-200 bg-gradient-to-r from-gold-50 to-white p-5 sm:p-6 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 bg-gold-100">
              <Gift className="w-5 h-5 text-gold-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900">
                Oferta de lançamento: assine hoje e pague R$ {PROMO_MONTHLY_PRICE},00/mês nos 3 primeiros meses, em qualquer plano
              </p>
              <p className="mt-1 text-xs text-gold-700 flex items-center gap-1.5 justify-center sm:justify-start">
                <BookOpen className="w-3.5 h-3.5 flex-shrink-0" />
                Bônus: você recebe o e-book completo do LegalHub direto dentro do sistema
              </p>
            </div>
          </Reveal>

          <Reveal delay={120} className="max-w-xl mx-auto mb-14 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3 mb-3">
              <label htmlFor="process-slider" className="text-sm font-semibold text-slate-700">
                Quantos processos ativos o seu escritório tem?
              </label>
              <span className="flex-shrink-0 text-sm font-bold text-gold-700">
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
              style={{ accentColor: '#c08b3e' }}
            />
            <p className="mt-3 text-xs text-slate-500 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
              Plano recomendado: <span className="font-semibold text-slate-700">{PLANS.find(p => p.id === recommendedPlanId)?.name}</span>
            </p>
          </Reveal>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {PLANS.map((plan, i) => (
              <Reveal
                key={plan.id}
                delay={i * 90}
                className={cn(
                  'relative rounded-3xl p-7 sm:p-8 flex flex-col h-full transition-shadow',
                  plan.highlight
                    ? 'border-2 border-dark-900 bg-white lg:-translate-y-3'
                    : 'border border-slate-200 bg-white',
                  plan.id === recommendedPlanId && !plan.highlight && 'ring-2 ring-emerald-400/60'
                )}
                style={plan.highlight ? { boxShadow: '0 24px 60px -16px rgba(10,22,40,0.32)' } : { boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
              >
                {plan.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold text-white bg-dark-900">
                    <Crown className="w-3 h-3 text-gold-400" /> Mais popular
                  </span>
                )}
                {plan.id === recommendedPlanId && (
                  <span className="absolute -top-3 right-5 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3" /> Ideal pra você
                  </span>
                )}

                <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
                <p className="mt-1.5 text-xs text-slate-500 leading-relaxed min-h-[2.5rem]">{plan.tagline}</p>

                <div className="mt-5">
                  {plan.price > PROMO_MONTHLY_PRICE ? (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-400 line-through">R$ {plan.price}/mês</span>
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                          {Math.round((1 - PROMO_MONTHLY_PRICE / plan.price) * 100)}% OFF
                        </span>
                      </div>
                      <div className="flex items-baseline gap-1 mt-1">
                        <span className="text-sm text-slate-400">R$</span>
                        <span className="font-serif text-4xl font-semibold tracking-tight text-slate-900">{PROMO_MONTHLY_PRICE}</span>
                        <span className="text-sm text-slate-400">/mês</span>
                      </div>
                      <p className="mt-1 text-[11px] text-gold-700 font-medium">
                        nos 3 primeiros meses — depois R$ {plan.price}/mês
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-1">
                        <span className="text-sm text-slate-400">R$</span>
                        <span className="font-serif text-4xl font-semibold tracking-tight text-slate-900">{plan.price}</span>
                        <span className="text-sm text-slate-400">/mês</span>
                      </div>
                      <p className="mt-1 text-[11px] text-gold-700 font-medium">
                        já é o valor promocional dos 3 primeiros meses
                      </p>
                    </>
                  )}
                </div>

                <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-dark-900 bg-dark-900/5 rounded-lg px-3 py-1.5 w-fit">
                  <Briefcase className="w-3.5 h-3.5" />
                  {plan.processLimit}
                </div>

                <ul className="mt-6 space-y-3 flex-1">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-slate-600 leading-snug">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => goToLogin('signup')}
                  className={cn(
                    'mt-8 w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-all active:scale-[0.98]',
                    plan.highlight
                      ? 'text-white bg-dark-900 hover:brightness-110'
                      : 'text-dark-900 bg-dark-900/5 hover:bg-dark-900/10'
                  )}
                >
                  Assinar {plan.name} <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </Reveal>
            ))}
          </div>

          <Reveal delay={260} className="mt-10 text-center text-xs text-slate-400">
            Todos os planos incluem suporte, atualizações contínuas e dados isolados por escritório. Sem cartão de crédito para começar.
          </Reveal>
        </div>
      </section>

      {/* ══ FAQ ══ */}
      <section id="faq" className="relative py-24 sm:py-32 px-5 sm:px-8 border-b border-slate-100">
        <div className="max-w-3xl mx-auto">
          <Reveal className="text-center mb-12">
            <Eyebrow>Dúvidas frequentes</Eyebrow>
            <h2 className="mt-3 font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900">Antes de assinar, tire suas dúvidas</h2>
          </Reveal>

          <div className="space-y-3">
            {FAQS.map((item, i) => {
              const open = faqOpen === i
              return (
                <Reveal key={item.q} delay={i * 50} className={cn('rounded-2xl border bg-white overflow-hidden transition-colors', open ? 'border-gold-200' : 'border-slate-200')}>
                  <button
                    onClick={() => setFaqOpen(open ? null : i)}
                    className="w-full flex items-center justify-between gap-4 px-5 sm:px-6 py-4 text-left"
                  >
                    <span className="text-sm font-semibold text-slate-900">{item.q}</span>
                    <ChevronDown className={cn('w-4 h-4 flex-shrink-0 transition-transform', open ? 'rotate-180 text-gold-600' : 'text-slate-400')} />
                  </button>
                  <div
                    className="grid transition-all duration-300 ease-out"
                    style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
                  >
                    <div className="overflow-hidden">
                      <p className="px-5 sm:px-6 pb-4 text-sm text-slate-500 leading-relaxed">{item.a}</p>
                    </div>
                  </div>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* ══ CTA FINAL ══ */}
      <section id="contato" className="relative py-24 sm:py-32 px-5 sm:px-8">
        <Reveal className="relative max-w-4xl mx-auto text-center rounded-3xl px-6 py-16 sm:px-16 sm:py-20 overflow-hidden border border-dark-900/20">
          <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #0a1628, #162540)' }} />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage: 'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />
          <div
            className="pointer-events-none absolute -top-24 -right-24 w-72 h-72 rounded-full blur-3xl opacity-30 animate-[float_8s_ease-in-out_infinite]"
            style={{ background: 'radial-gradient(circle, #d3a057, transparent 70%)' }}
          />
          <div
            className="pointer-events-none absolute -bottom-24 -left-24 w-72 h-72 rounded-full blur-3xl opacity-20 animate-[float_10s_ease-in-out_infinite_1s]"
            style={{ background: 'radial-gradient(circle, #283d5e, transparent 70%)' }}
          />
          <div className="relative inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold text-white border border-white/25 bg-white/10 mb-6">
            <Gift className="w-3.5 h-3.5 text-gold-400" />
            R$ {PROMO_MONTHLY_PRICE},00/mês nos 3 primeiros meses + e-book de bônus
          </div>
          <h2 className="relative font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-white">Pronto para organizar seu escritório?</h2>
          <p className="relative mt-4 text-slate-300 max-w-xl mx-auto leading-relaxed">
            Crie sua conta e comece a centralizar clientes, processos e tarefas hoje mesmo — sem cartão de crédito e sem fidelidade.
          </p>
          <div className="relative mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => goToLogin('signup')}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-sm font-semibold text-dark-900 bg-white transition-all active:scale-[0.98] hover:-translate-y-0.5"
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

      {/* ══ CTA FIXO (mobile) ══ */}
      <div
        className={cn(
          'sm:hidden fixed bottom-0 inset-x-0 z-40 px-4 pb-4 pt-3 transition-transform duration-300',
          showStickyCta ? 'translate-y-0' : 'translate-y-full'
        )}
        style={{ background: 'linear-gradient(to top, rgba(255,255,255,0.98) 60%, rgba(255,255,255,0))' }}
      >
        <button
          onClick={() => goToLogin('signup')}
          className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl text-sm font-semibold text-white bg-dark-900 active:scale-[0.98] transition-transform"
          style={{ boxShadow: '0 12px 32px rgba(10,22,40,0.4)' }}
        >
          Começar agora <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
