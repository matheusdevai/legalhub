import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  Users, Briefcase, CalendarDays, DollarSign, Bell, Handshake,
  ShieldCheck, Layers, LineChart, ArrowRight, Menu, X, CheckCircle2,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { LogoWhite } from '@/components/ui/Logo'

const NAV_LINKS = [
  { href: '#recursos', label: 'Recursos' },
  { href: '#vantagens', label: 'Vantagens' },
  { href: '#contato', label: 'Contato' },
]

const FEATURES = [
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
    icon: CalendarDays,
    title: 'Agenda conectada',
    description: 'Tarefas com prazo aparecem automaticamente na agenda do escritório e sincronizam com o Google Calendar.',
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

function GridBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)',
          backgroundSize: '56px 56px',
        }}
      />
      <div
        className="absolute -top-40 left-1/4 w-[36rem] h-[36rem] rounded-full blur-3xl opacity-30"
        style={{ background: 'radial-gradient(circle, #6d28d9, transparent 70%)' }}
      />
      <div
        className="absolute top-1/3 -right-32 w-[30rem] h-[30rem] rounded-full blur-3xl opacity-30"
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

  if (!loading && session) return <Navigate to="/dashboard" replace />

  function goToLogin(mode: 'login' | 'signup' = 'login') {
    navigate('/login', { state: { mode } })
  }

  return (
    <div className="min-h-screen text-white" style={{ background: '#050b15' }}>

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
          <LogoWhite size={30} />

          <nav className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map(l => (
              <a key={l.href} href={l.href} className="text-sm text-slate-300 hover:text-white transition-colors">
                {l.label}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <button onClick={() => goToLogin('login')} className="text-sm font-medium text-slate-300 hover:text-white transition-colors px-3 py-2">
              Entrar
            </button>
            <button
              onClick={() => goToLogin('signup')}
              className="flex items-center gap-1.5 text-sm font-semibold text-white px-4 py-2.5 rounded-xl transition-all active:scale-[0.97]"
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
      <section className="relative pt-36 pb-24 sm:pt-44 sm:pb-32 px-5 sm:px-8 overflow-hidden">
        <GridBackdrop />
        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium text-violet-200 border border-violet-400/30 bg-violet-500/10 mb-7">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Gestão jurídica em um só lugar
          </div>

          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight leading-[1.1]">
            Tecnologia e inteligência para
            <br className="hidden sm:block" />
            transformar a gestão do{' '}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: 'linear-gradient(90deg,#818cf8,#60a5fa)' }}
            >
              seu escritório
            </span>
          </h1>

          <p className="mt-6 text-base sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Centralize clientes, processos, tarefas, agenda e financeiro do seu escritório de advocacia
            em uma única plataforma — com sincronização automática e dados sempre à mão para decidir com segurança.
          </p>

          <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => goToLogin('signup')}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-[0.98]"
              style={{ background: 'linear-gradient(135deg,#4338ca,#2563eb)', boxShadow: '0 8px 28px rgba(37,99,235,0.4)' }}
            >
              Começar agora <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => goToLogin('login')}
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl text-sm font-semibold text-slate-200 border border-white/15 hover:bg-white/5 transition-all"
            >
              Já tenho uma conta
            </button>
          </div>

          <p className="mt-5 text-xs text-slate-500">Não é necessário cartão de crédito para começar.</p>
        </div>

        {/* Mockup abstrato do produto */}
        <div className="relative max-w-5xl mx-auto mt-16 sm:mt-20">
          <div
            className="rounded-2xl border border-white/10 overflow-hidden"
            style={{ background: 'linear-gradient(180deg,#0b1424,#070d18)', boxShadow: '0 30px 90px -20px rgba(0,0,0,0.6)' }}
          >
            <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400/60" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/60" />
            </div>
            <div className="p-5 sm:p-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: 'Processos ativos', value: '128', accent: '#60a5fa' },
                { label: 'Tarefas concluídas no mês', value: '342', accent: '#34d399' },
                { label: 'Honorários a receber', value: 'R$ 84.2k', accent: '#c084fc' },
              ].map(card => (
                <div key={card.label} className="rounded-xl p-5 border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
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
      </section>

      {/* ══ RECURSOS ══ */}
      <section id="recursos" className="relative py-24 sm:py-28 px-5 sm:px-8 border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl mx-auto text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Tudo que o seu escritório precisa</h2>
            <p className="mt-4 text-slate-400 leading-relaxed">
              Um sistema pensado para o dia a dia jurídico — do primeiro contato do cliente até a conclusão do processo.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map(f => (
              <div
                key={f.title}
                className="rounded-2xl p-6 border border-white/10 transition-colors hover:border-white/20"
                style={{ background: 'rgba(255,255,255,0.02)' }}
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.25),rgba(37,99,235,0.25))' }}
                >
                  <f.icon className="w-5 h-5 text-indigo-300" />
                </div>
                <h3 className="text-base font-semibold text-white">{f.title}</h3>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ VANTAGENS ══ */}
      <section id="vantagens" className="relative py-24 sm:py-28 px-5 sm:px-8 border-t border-white/5">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{ background: 'radial-gradient(60% 50% at 50% 0%, rgba(99,102,241,0.12), transparent)' }}
        />
        <div className="relative max-w-6xl mx-auto">
          <div className="max-w-2xl mx-auto text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Por que escritórios escolhem o LegalHub</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {BENEFITS.map(b => (
              <div key={b.title} className="text-center sm:text-left">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5 mx-auto sm:mx-0"
                  style={{ background: 'linear-gradient(135deg,#4338ca,#2563eb)' }}
                >
                  <b.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-white">{b.title}</h3>
                <p className="mt-2.5 text-sm text-slate-400 leading-relaxed">{b.description}</p>
              </div>
            ))}
          </div>

          <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
            {['Multi-tenant e multiusuário', 'Controle de acesso por função', 'Relatórios de desempenho'].map(item => (
              <div key={item} className="flex items-center gap-2.5 text-sm text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ CTA FINAL ══ */}
      <section id="contato" className="relative py-24 sm:py-28 px-5 sm:px-8 border-t border-white/5">
        <div
          className="relative max-w-4xl mx-auto text-center rounded-3xl px-6 py-14 sm:px-16 sm:py-16 overflow-hidden border border-white/10"
          style={{ background: 'linear-gradient(135deg,#151235,#0b1424)' }}
        >
          <div
            className="pointer-events-none absolute -top-24 -right-24 w-72 h-72 rounded-full blur-3xl opacity-40"
            style={{ background: 'radial-gradient(circle, #6d28d9, transparent 70%)' }}
          />
          <h2 className="relative text-3xl sm:text-4xl font-bold tracking-tight">Pronto para organizar seu escritório?</h2>
          <p className="relative mt-4 text-slate-400 max-w-xl mx-auto leading-relaxed">
            Crie sua conta e comece a centralizar clientes, processos e tarefas hoje mesmo.
          </p>
          <div className="relative mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => goToLogin('signup')}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-[0.98]"
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
        </div>
      </section>

      {/* ══ FOOTER ══ */}
      <footer className="border-t border-white/5 px-5 sm:px-8 py-10">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <LogoWhite size={26} />
          <p className="text-xs text-slate-500">© 2026 LegalHub · Todos os direitos reservados</p>
        </div>
      </footer>
    </div>
  )
}
