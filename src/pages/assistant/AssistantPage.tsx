import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bot, AlertTriangle, Clock, ClipboardList, MessageCircle, CalendarClock,
  AlertOctagon, FileWarning, Scale, ChevronRight, LayoutDashboard, History,
} from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Card, Spinner, EmptyState } from '@/components/ui'
import { AssistantChat } from '@/components/assistant/AssistantChat'
import { AssistantHistory } from '@/components/assistant/AssistantHistory'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import {
  buildAssistantOverview, buildAssistantAlerts, greetingForHour,
  type AssistantOverview, type AlertCategory, type AlertItem,
  type EngineProcess, type EngineTask, type EngineEvent,
} from '@/lib/assistantEngine'

// Dashboard + Central de Alertas (milestone 1) + Chat interno (milestone 2
// leitura + milestone 3 escrita) do LegalHub Assistente. O chat (via Edge
// Function ai-assistant-chat) consulta livremente, mas só grava algo em
// `tasks` (criar tarefa/lembrete) depois de o usuário confirmar
// explicitamente o card de ação proposta — nunca sozinho.
// TODO (próximas fatias, não implementar aqui): análise de documentos,
// geração de minutas, WhatsApp, níveis de automação configuráveis (hoje tudo
// exige confirmação manual, sem exceção) — ver especificação completa.

const CATEGORY_META: Record<AlertCategory, { label: string; emoji: string; ring: string; badge: string }> = {
  urgente:     { label: 'Urgente',     emoji: '🔴', ring: 'border-red-200 dark:border-red-800/40',       badge: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300' },
  importante:  { label: 'Importante',  emoji: '🟠', ring: 'border-orange-200 dark:border-orange-800/40', badge: 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300' },
  atencao:     { label: 'Atenção',     emoji: '🟡', ring: 'border-amber-200 dark:border-amber-800/40',   badge: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300' },
  informativo: { label: 'Informativo', emoji: '🟢', ring: 'border-emerald-200 dark:border-emerald-800/40', badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300' },
}

const OVERVIEW_COLORS: Record<string, { wrap: string; icon: string }> = {
  red:    { wrap: 'bg-red-50 dark:bg-red-900/15 border-red-100 dark:border-red-800/20',       icon: 'text-red-600 dark:text-red-400' },
  orange: { wrap: 'bg-orange-50 dark:bg-orange-900/15 border-orange-100 dark:border-orange-800/20', icon: 'text-orange-600 dark:text-orange-400' },
  amber:  { wrap: 'bg-amber-50 dark:bg-amber-900/15 border-amber-100 dark:border-amber-800/20',   icon: 'text-amber-600 dark:text-amber-400' },
  blue:   { wrap: 'bg-blue-50 dark:bg-blue-900/15 border-blue-100 dark:border-blue-800/20',       icon: 'text-blue-600 dark:text-blue-400' },
  rose:   { wrap: 'bg-rose-50 dark:bg-rose-900/15 border-rose-100 dark:border-rose-800/20',       icon: 'text-rose-600 dark:text-rose-400' },
  violet: { wrap: 'bg-violet-50 dark:bg-violet-900/15 border-violet-100 dark:border-violet-800/20', icon: 'text-violet-600 dark:text-violet-400' },
  slate:  { wrap: 'bg-slate-100 dark:bg-dark-700 border-slate-200 dark:border-dark-600',          icon: 'text-slate-400 dark:text-slate-500' },
}

function OverviewCard({ label, value, icon: Icon, color, onClick, comingSoon }: {
  label: string
  value: number
  icon: React.ElementType
  color: keyof typeof OVERVIEW_COLORS
  onClick?: () => void
  comingSoon?: string
}) {
  const c = OVERVIEW_COLORS[color]
  const disabled = !!comingSoon
  return (
    <Card
      className={cn(
        'p-5 transition-all duration-200',
        disabled ? 'opacity-70 cursor-default' : 'hover:shadow-card-hover hover:-translate-y-px cursor-pointer',
      )}
      onClick={disabled ? undefined : onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider truncate">{label}</p>
          {disabled ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 leading-snug">{comingSoon}</p>
          ) : (
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1.5 leading-none">{value}</p>
          )}
        </div>
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border', c.wrap)}>
          <Icon className={cn('w-5 h-5', c.icon)} />
        </div>
      </div>
      {disabled && (
        <span className="inline-block mt-3 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-600 dark:text-amber-400 leading-none">
          Em breve
        </span>
      )}
    </Card>
  )
}

function AlertColumn({ category, items, onOpen }: { category: AlertCategory; items: AlertItem[]; onOpen: (link: string) => void }) {
  const meta = CATEGORY_META[category]
  return (
    <Card className={cn('p-4 border', meta.ring)}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className={cn('text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full', meta.badge)}>
          {meta.emoji} {meta.label}
        </span>
        <span className="text-xs text-slate-400">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500 py-3">Nada por aqui.</p>
      ) : (
        <ul className="space-y-1">
          {items.map(item => (
            <li key={item.id}>
              <button
                onClick={() => onOpen(item.link)}
                className="w-full flex items-center justify-between gap-2 text-left px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-dark-700 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{item.title}</p>
                  {item.subtitle && <p className="text-xs text-slate-400 truncate">{item.subtitle}</p>}
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

type PageTab = 'visao' | 'historico'

const PAGE_TABS: Array<{ id: PageTab; label: string; icon: React.ElementType }> = [
  { id: 'visao', label: 'Visão Geral', icon: LayoutDashboard },
  { id: 'historico', label: 'Histórico', icon: History },
]

export function AssistantPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<PageTab>('visao')
  const [processes, setProcesses] = useState<EngineProcess[]>([])
  const [tasks, setTasks] = useState<EngineTask[]>([])
  const [events, setEvents] = useState<EngineEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!profile?.tenant_id) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.tenant_id])

  async function load() {
    setLoading(true)
    setError('')
    const [
      { data: procData, error: procErr },
      { data: taskData, error: taskErr },
      { data: eventData, error: eventErr },
    ] = await Promise.all([
      supabase.from('processes')
        .select('id, number, title, client_name, next_deadline, priority, status')
        .eq('tenant_id', profile!.tenant_id!)
        .is('deleted_at', null),
      supabase.from('tasks')
        .select('id, title, due_date, priority, status, assigned_name, assigned_to')
        .eq('tenant_id', profile!.tenant_id!)
        .is('deleted_at', null)
        .neq('status', 'done')
        .neq('status', 'cancelled'),
      supabase.from('calendar_events')
        .select('id, title, type, date, time, client_name, location, status')
        .eq('tenant_id', profile!.tenant_id!)
        .is('deleted_at', null),
    ])
    if (procErr || taskErr || eventErr) {
      setError('Não foi possível carregar os dados do assistente. Tente novamente.')
      setLoading(false)
      return
    }
    let taskList = (taskData || []) as EngineTask[]
    // Mesma restrição de TasksPage.tsx: advogado/estagiário só vê as próprias
    // tarefas, nunca as dos colegas — o assistente não pode revelar mais do
    // que qualquer outra tela do sistema já revela pra esse papel.
    if (profile?.role === 'lawyer' || profile?.role === 'intern') {
      taskList = taskList.filter(task => task.assigned_to === profile.user_id)
    }
    setProcesses((procData || []) as EngineProcess[])
    setTasks(taskList)
    setEvents((eventData || []) as EngineEvent[])
    setLoading(false)
  }

  const todayISO = new Date().toISOString().slice(0, 10)

  const overview: AssistantOverview = useMemo(
    () => buildAssistantOverview(processes, tasks, events, todayISO),
    [processes, tasks, events, todayISO],
  )
  const alerts = useMemo(() => buildAssistantAlerts(overview, todayISO), [overview, todayISO])
  const totalAlerts = alerts.urgente.length + alerts.importante.length + alerts.atencao.length + alerts.informativo.length

  const firstName = (profile?.name || profile?.display_name || '').split(' ')[0] || ''
  const greetName = profile?.oab_number ? `Dr(a). ${firstName}` : firstName
  const greeting = greetingForHour(new Date().getHours())

  return (
    <Layout title="Assistente IA">
      <div className="space-y-6 animate-fade-in">
        <Card className="p-6 bg-gradient-to-r from-primary-700 via-primary-600 to-sky-500 border-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <Bot className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">{greeting}{greetName ? `, ${greetName}` : ''}.</h1>
              <p className="text-sm text-white/75">Veja o que precisa da sua atenção.</p>
            </div>
          </div>
        </Card>

        <div className="flex items-center gap-1 border-b border-slate-100 dark:border-dark-600">
          {PAGE_TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors',
                tab === t.id
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300',
              )}
            >
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>

        {tab === 'historico' ? (
          <AssistantHistory />
        ) : (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          {error && (
            <Card className="p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
              </div>
              <button onClick={load} className="text-sm font-semibold text-primary-600 hover:underline flex-shrink-0">
                Tentar novamente
              </button>
            </Card>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Spinner className="w-6 h-6" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <OverviewCard label="Prazos críticos" value={overview.criticalDeadlines.length} icon={AlertTriangle} color="red" onClick={() => navigate('/processos')} />
                <OverviewCard label="Prazos próximos" value={overview.upcomingDeadlines.length} icon={Clock} color="orange" onClick={() => navigate('/processos')} />
                <OverviewCard label="Pendências" value={overview.pendingTasks.length} icon={ClipboardList} color="amber" onClick={() => navigate('/tarefas')} />
                <OverviewCard
                  label="Clientes aguardando resposta"
                  value={0}
                  icon={MessageCircle}
                  color="slate"
                  comingSoon="Disponível quando a Caixa de Entrada for implementada"
                />
                <OverviewCard label="Compromissos de hoje" value={overview.todayEvents.length} icon={CalendarClock} color="blue" onClick={() => navigate('/agenda')} />
                <OverviewCard label="Tarefas atrasadas" value={overview.overdueTasks.length} icon={AlertOctagon} color="rose" onClick={() => navigate('/tarefas')} />
                <OverviewCard
                  label="Documentos pendentes"
                  value={0}
                  icon={FileWarning}
                  color="slate"
                  comingSoon="Disponível quando o controle de documentos pendentes por cliente/processo for implementado"
                />
                <OverviewCard label="Processos que exigem atenção" value={overview.attentionProcesses.length} icon={Scale} color="violet" onClick={() => navigate('/processos')} />
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">Central de Alertas</h2>
                  <span className="text-xs text-slate-400">{totalAlerts} item{totalAlerts === 1 ? '' : 's'}</span>
                </div>
                {totalAlerts === 0 ? (
                  <Card className="p-4">
                    <EmptyState icon={Bot} title="Nenhum alerta no momento" description="Tudo em dia por aqui." />
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {(Object.keys(CATEGORY_META) as AlertCategory[]).map(cat => (
                      <AlertColumn key={cat} category={cat} items={alerts[cat]} onOpen={link => navigate(link)} />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="lg:sticky lg:top-6">
          <AssistantChat />
        </div>
      </div>
        )}
      </div>
    </Layout>
  )
}
