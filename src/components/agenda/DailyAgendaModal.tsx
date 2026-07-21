import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell, X, Calendar, CheckSquare, Scale, Clock,
  ArrowRight, CheckCircle2, Sparkles, Sun, Sunset, Moon,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

type AgendaItem = {
  id: string
  kind: 'event' | 'task' | 'deadline'
  title: string
  subtitle?: string
  time?: string
  link: string
}

const KIND_META = {
  event: {
    icon: Calendar,
    sectionTitle: 'Audiências e eventos',
    accent: 'bg-blue-500',
    iconBg: 'bg-blue-50 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
    cardBorder: 'hover:border-blue-200 dark:hover:border-blue-800',
    pillBg: 'bg-blue-500/20',
    pillText: 'text-blue-300',
    notifType: 'hearing',
    headerBg: 'bg-blue-500/15',
    headerIcon: 'text-blue-300',
  },
  task: {
    icon: CheckSquare,
    sectionTitle: 'Tarefas com prazo hoje ou atrasadas',
    accent: 'bg-emerald-500',
    iconBg: 'bg-emerald-50 dark:bg-emerald-900/30',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    cardBorder: 'hover:border-emerald-200 dark:hover:border-emerald-800',
    pillBg: 'bg-emerald-500/20',
    pillText: 'text-emerald-300',
    notifType: 'task',
    headerBg: 'bg-emerald-500/15',
    headerIcon: 'text-emerald-300',
  },
  deadline: {
    icon: Scale,
    sectionTitle: 'Prazos processuais',
    accent: 'bg-rose-500',
    iconBg: 'bg-rose-50 dark:bg-rose-900/30',
    iconColor: 'text-rose-600 dark:text-rose-400',
    cardBorder: 'hover:border-rose-200 dark:hover:border-rose-800',
    pillBg: 'bg-rose-500/20',
    pillText: 'text-rose-300',
    notifType: 'deadline',
    headerBg: 'bg-rose-500/15',
    headerIcon: 'text-rose-300',
  },
} as const

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return { text: 'Bom dia', Icon: Sun }
  if (h < 18) return { text: 'Boa tarde', Icon: Sunset }
  return { text: 'Boa noite', Icon: Moon }
}

export function DailyAgendaModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<AgendaItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!open || !profile?.tenant_id) return
    loadAndNotify()
  }, [open, profile?.tenant_id])

  async function loadAndNotify() {
    setLoading(true)
    const today = new Date().toISOString().slice(0, 10)

    const [{ data: events }, { data: tasks }, { data: processes }] = await Promise.all([
      supabase
        .from('calendar_events')
        .select('id,title,type,time,client_name,location')
        .eq('tenant_id', profile!.tenant_id!)
        .eq('date', today)
        .neq('status', 'cancelled')
        .is('deleted_at', null)
        .order('time'),
      supabase
        .from('tasks')
        .select('id,title,assigned_name,due_date')
        .eq('tenant_id', profile!.tenant_id!)
        .lte('due_date', today)
        .neq('status', 'done')
        .neq('status', 'cancelled')
        .is('deleted_at', null),
      supabase
        .from('processes')
        .select('id,number,title,client_name')
        .eq('tenant_id', profile!.tenant_id!)
        .eq('next_deadline', today)
        .eq('status', 'active')
        .is('deleted_at', null),
    ])

    const agenda: AgendaItem[] = [
      ...(events || []).map(e => ({
        id: e.id,
        kind: 'event' as const,
        title: e.title,
        subtitle: [e.client_name, e.location].filter(Boolean).join(' · ') || undefined,
        time: e.time ? e.time.slice(0, 5) : undefined,
        link: '/agenda',
      })),
      ...(tasks || []).map(t => ({
        id: t.id,
        kind: 'task' as const,
        title: t.title,
        subtitle: [t.assigned_name, t.due_date && t.due_date < today ? 'Atrasada' : null].filter(Boolean).join(' · ') || undefined,
        link: '/tarefas',
      })),
      ...(processes || []).map(p => ({
        id: p.id,
        kind: 'deadline' as const,
        title: p.title || `Processo ${p.number}`,
        subtitle: p.client_name || undefined,
        link: '/processos',
      })),
    ]

    setItems(agenda)
    setLoading(false)
    await createDailyNotifications(agenda)
  }

  async function createDailyNotifications(agenda: AgendaItem[]) {
    if (!profile?.user_id || agenda.length === 0) return
    const today = new Date().toISOString().slice(0, 10)
    const key = `lawfy_daily_notif_${today}_${profile.user_id}`
    if (localStorage.getItem(key)) return
    await supabase.from('notifications').insert(
      agenda.map(item => ({
        user_id: profile.user_id,
        type: KIND_META[item.kind].notifType,
        title: item.title,
        message: item.subtitle || null,
        read: false,
        link: item.link,
      }))
    )
    localStorage.setItem(key, '1')
  }

  function goTo(link: string) { onClose(); navigate(link) }

  if (!open) return null

  const { text: greetingText, Icon: GreetingIcon } = getGreeting()
  const firstName = (profile?.name || profile?.display_name || 'você').split(' ')[0]
  const todayLabel = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const eventItems    = items.filter(i => i.kind === 'event')
  const taskItems     = items.filter(i => i.kind === 'task')
  const deadlineItems = items.filter(i => i.kind === 'deadline')

  const sections = [
    { kind: 'event'    as const, list: eventItems },
    { kind: 'task'     as const, list: taskItems },
    { kind: 'deadline' as const, list: deadlineItems },
  ].filter(s => s.list.length > 0)

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }}>
      <div
        className="relative bg-white dark:bg-[#0d1b2e] rounded-3xl shadow-2xl w-full max-w-[440px] max-h-[88vh] flex flex-col overflow-hidden"
        style={{ boxShadow: '0 32px 80px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.06)' }}
      >

        {/* ── HEADER ───────────────────────────────────────────────────── */}
        <div className="relative overflow-hidden flex-shrink-0"
          style={{ background: 'linear-gradient(145deg, #060c18 0%, #0a1628 55%, #0f1e36 100%)' }}>

          {/* Decorative glows */}
          <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full opacity-20"
            style={{ background: 'radial-gradient(circle, #06b6d4 0%, transparent 70%)' }} />
          <div className="absolute top-8 -left-6 w-32 h-32 rounded-full opacity-10"
            style={{ background: 'radial-gradient(circle, #94a3b8 0%, transparent 70%)' }} />
          <div className="absolute bottom-0 right-1/3 w-40 h-24 opacity-10"
            style={{ background: 'radial-gradient(ellipse, #06b6d4 0%, transparent 70%)' }} />

          {/* Grid pattern overlay */}
          <div className="absolute inset-0 opacity-[0.04]"
            style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

          {/* Close button */}
          <button onClick={onClose}
            className="absolute top-4 right-4 z-20 p-2 rounded-xl text-white/40 hover:text-white/90 hover:bg-white/10 transition-all">
            <X className="w-4 h-4" />
          </button>

          {/* Content */}
          <div className="relative z-10 px-6 pt-7 pb-6">

            {/* Top badge */}
            <div className="flex items-center gap-2 mb-5">
              <div className="flex items-center gap-1.5 bg-white/10 border border-white/10 backdrop-blur-sm px-3 py-1.5 rounded-full">
                <Bell className="w-3 h-3 text-primary-300" />
                <span className="text-white/70 text-[11px] font-bold uppercase tracking-widest">Agenda do dia</span>
              </div>
            </div>

            {/* Greeting */}
            <div className="flex items-end gap-3 mb-1">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <GreetingIcon className="w-4 h-4 text-amber-300" />
                  <span className="text-white/50 text-sm">{greetingText},</span>
                </div>
                <h2 className="text-white text-3xl font-black tracking-tight leading-none"
                  style={{ textShadow: '0 2px 20px rgba(59,130,246,0.4)' }}>
                  {firstName}
                </h2>
              </div>
            </div>
            <p className="text-white/40 text-xs capitalize mt-1 mb-5">{todayLabel}</p>

            {/* Stat pills */}
            {!loading && (
              <div className="flex items-center gap-2 flex-wrap">
                {items.length === 0 ? (
                  <div className="flex items-center gap-2 bg-emerald-500/20 border border-emerald-500/20 px-3 py-1.5 rounded-full">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="text-emerald-300 text-xs font-semibold">Agenda livre hoje</span>
                  </div>
                ) : (
                  <>
                    {eventItems.length > 0 && (
                      <div className="flex items-center gap-1.5 bg-blue-500/20 border border-blue-500/20 px-3 py-1.5 rounded-full">
                        <Calendar className="w-3 h-3 text-blue-300" />
                        <span className="text-blue-200 text-xs font-bold">{eventItems.length} evento{eventItems.length !== 1 ? 's' : ''}</span>
                      </div>
                    )}
                    {taskItems.length > 0 && (
                      <div className="flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-500/20 px-3 py-1.5 rounded-full">
                        <CheckSquare className="w-3 h-3 text-emerald-300" />
                        <span className="text-emerald-200 text-xs font-bold">{taskItems.length} tarefa{taskItems.length !== 1 ? 's' : ''}</span>
                      </div>
                    )}
                    {deadlineItems.length > 0 && (
                      <div className="flex items-center gap-1.5 bg-rose-500/20 border border-rose-500/20 px-3 py-1.5 rounded-full">
                        <Scale className="w-3 h-3 text-rose-300" />
                        <span className="text-rose-200 text-xs font-bold">{deadlineItems.length} prazo{deadlineItems.length !== 1 ? 's' : ''}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── BODY ─────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[#080f1a]"
          style={{ scrollbarWidth: 'thin', scrollbarColor: '#334155 transparent' }}>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-8 h-8 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
              <p className="text-xs text-gray-400 dark:text-gray-600">Carregando sua agenda…</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 px-8 text-center gap-4">
              <div className="relative">
                <div className="w-20 h-20 rounded-3xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                </div>
                <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-amber-400 flex items-center justify-center">
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
              </div>
              <div>
                <p className="font-bold text-gray-800 dark:text-gray-200 text-base">Agenda completamente livre!</p>
                <p className="text-sm text-gray-400 dark:text-gray-600 mt-1 leading-relaxed">
                  Nenhuma audiência, tarefa ou prazo<br />programado para hoje. Aproveite!
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-5">
              {sections.map(section => {
                const meta = KIND_META[section.kind]
                return (
                  <div key={section.kind}>
                    {/* Section header */}
                    <div className="flex items-center gap-2.5 mb-2.5 px-1">
                      <div className={cn('p-1.5 rounded-lg', meta.iconBg)}>
                        <meta.icon className={cn('w-3.5 h-3.5', meta.iconColor)} />
                      </div>
                      <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 flex-1">
                        {meta.sectionTitle}
                      </p>
                      <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-full', meta.iconBg, meta.iconColor)}>
                        {section.list.length}
                      </span>
                    </div>

                    {/* Cards */}
                    <div className="space-y-2">
                      {section.list.map(item => (
                        <button
                          key={item.id}
                          onClick={() => goTo(item.link)}
                          className={cn(
                            'group w-full flex items-center gap-3 p-4 rounded-2xl bg-white dark:bg-[#0d1b2e]',
                            'border border-gray-100 dark:border-white/5',
                            'hover:shadow-lg dark:hover:shadow-black/30',
                            'transition-all duration-200 text-left',
                            meta.cardBorder
                          )}
                          style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
                        >
                          {/* Left accent */}
                          <div className={cn('w-1 h-10 rounded-full flex-shrink-0', meta.accent)} />

                          {/* Icon */}
                          <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', meta.iconBg)}>
                            <meta.icon className={cn('w-4 h-4', meta.iconColor)} />
                          </div>

                          {/* Text */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate leading-snug">
                              {item.title}
                            </p>
                            {item.subtitle && (
                              <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
                                {item.subtitle}
                              </p>
                            )}
                          </div>

                          {/* Time or arrow */}
                          {item.time ? (
                            <div className="flex-shrink-0 text-right">
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3 text-gray-300" />
                                <span className="text-sm font-bold text-gray-700 dark:text-gray-300 font-mono tabular-nums">
                                  {item.time}
                                </span>
                              </div>
                              <p className="text-[10px] text-gray-400 mt-0.5">hoje</p>
                            </div>
                          ) : (
                            <ArrowRight className="w-4 h-4 text-gray-200 dark:text-gray-700 group-hover:text-primary-400 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── FOOTER ───────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 px-4 py-4 bg-white dark:bg-[#0d1b2e] border-t border-gray-100 dark:border-white/5 flex gap-3">
          <button
            onClick={() => goTo('/agenda')}
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-sm font-semibold text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/8 hover:bg-gray-100 dark:hover:bg-white/10 transition-all"
          >
            <Calendar className="w-4 h-4" />
            Ver agenda
          </button>
          <button
            onClick={onClose}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold text-white transition-all"
            style={{
              background: 'linear-gradient(135deg, #0a1628 0%, #0f172a 50%, #1e293b 100%)',
              boxShadow: '0 4px 20px rgba(15,23,42,0.4), inset 0 1px 0 rgba(255,255,255,0.10)',
            }}
          >
            Começar o dia
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  )
}
