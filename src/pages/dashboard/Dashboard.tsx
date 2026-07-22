import { usePageLoadingState } from '@/contexts/PageLoadingContext'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckSquare, TrendingUp, Target, RefreshCw,
  Plus, Star, AlertCircle, ChevronLeft, ChevronRight,
  BarChart2, List, LayoutGrid, Activity, Settings,
  Circle, CheckCircle2, ChevronDown, Search, Filter,
  ArrowUpDown, Download, Bell, Calendar, Crosshair, SlidersHorizontal, Trash2,
  Briefcase, Users, DollarSign, Sparkles,
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Layout } from '@/components/layout/Layout'
import { AiCopilotoTab } from '@/components/ai/AiCopilotoTab'
import { Spinner, Modal, Button, Input, Select } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatDate, formatCurrency, PRIORITY_COLORS, PRIORITY_LABELS, TASK_STATUS_LABELS } from '@/lib/utils'
import { Task } from '@/types'
import { cn } from '@/lib/utils'
import { openExportWindow } from '@/lib/exportUtils'

type DashTab = 'visao' | 'lista' | 'quadro' | 'desempenho' | 'ia' | 'configuracoes'

const TABS: { id: DashTab; label: string; icon: React.ElementType }[] = [
  { id: 'visao',         label: 'Visão Geral',   icon: BarChart2 },
  { id: 'lista',         label: 'Lista',         icon: List },
  { id: 'quadro',        label: 'Quadro',        icon: LayoutGrid },
  { id: 'desempenho',    label: 'Desempenho',    icon: Activity },
  { id: 'ia',            label: 'Inteligência Artificial', icon: Sparkles },
  { id: 'configuracoes', label: 'Configurações', icon: Settings },
]

function MiniCalendar() {
  const navigate = useNavigate()
  const [current, setCurrent] = useState(new Date())
  const today = new Date()
  const year = current.getFullYear()
  const month = current.getMonth()
  const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days: (number | null)[] = Array(firstDay).fill(null)
  for (let i = 1; i <= daysInMonth; i++) days.push(i)

  return (
    <div className="bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-dark-700/50 shadow-card p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-slate-800 dark:text-white">
          {monthNames[month]} {year}
        </span>
        <div className="flex gap-1">
          <button onClick={() => setCurrent(new Date(year, month - 1, 1))}
            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-700 text-slate-400 hover:text-slate-700 transition-colors">
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setCurrent(new Date(year, month + 1, 1))}
            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-700 text-slate-400 hover:text-slate-700 transition-colors">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d => (
          <div key={d} className="text-center text-[10px] font-semibold text-slate-400 py-0.5">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((d, i) => {
          const isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear()
          return (
            <div key={i} className={`
              flex items-center justify-center text-[11px] h-6 w-6 rounded-full mx-auto cursor-default transition-colors
              ${!d ? '' : isToday
                ? 'bg-primary-600 text-white font-bold'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-dark-700'}
            `}>
              {d}
            </div>
          )
        })}
      </div>
      <button
        onClick={() => navigate('/agenda')}
        className="mt-3 text-xs text-primary-600 dark:text-primary-400 hover:underline w-full text-right"
      >
        Mostrar agenda completa →
      </button>
    </div>
  )
}

// ── Configurações sub-sections ───────────────────────────────────────────────

type ConfigSection = { id: string; label: string }

const CONFIG_NAV = [
  'Usuários', 'Inteligência Artificial', 'Termos monitorados', 'Financeiro',
  'Tarefas', 'Workflow', 'Grupos de ação', 'Tipos de ação', 'Etapas',
  'Metas', 'Origem de pessoas', 'Parceiros', 'Caixa de entrada',
  'Notificações', 'Integrações e API',
]

const INBOX_DEFAULTS: ConfigSection[] = [
  { id: 'prazo_fatal',   label: 'Prazo fatal' },
  { id: 'intimacoes',    label: 'Intimações' },
  { id: 'nao_lidas',     label: 'Não lidas' },
  { id: 'urgentes',      label: 'Urgentes' },
  { id: 'importantes',   label: 'Importantes' },
  { id: 'todas_demais',  label: 'Todas as demais' },
]

function DashConfiguracoes() {
  const [activeNav, setActiveNav] = useState('Caixa de entrada')
  const [inboxEnabled, setInboxEnabled] = useState(true)
  const [sections, setSections] = useState<ConfigSection[]>(INBOX_DEFAULTS)
  const [saved, setSaved] = useState(false)

  function moveUp(i: number) {
    if (i === 0) return
    setSections(prev => { const a = [...prev]; [a[i-1], a[i]] = [a[i], a[i-1]]; return a })
  }
  function moveDown(i: number) {
    setSections(prev => { if (i === prev.length - 1) return prev; const a = [...prev]; [a[i], a[i+1]] = [a[i+1], a[i]]; return a })
  }
  function handleSave() { setSaved(true); setTimeout(() => setSaved(false), 2000) }

  return (
    <div className="flex gap-0 bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-dark-700/50 shadow-card overflow-hidden min-h-[520px]">
      {/* Left nav */}
      <div className="w-56 flex-shrink-0 border-r border-slate-100 dark:border-dark-700/50 py-4">
        <p className="px-5 text-base font-bold text-slate-800 dark:text-white mb-3">Configurações</p>
        {CONFIG_NAV.map(item => (
          <button
            key={item}
            onClick={() => setActiveNav(item)}
            className={cn(
              'w-full text-left px-5 py-2 text-sm transition-colors',
              activeNav === item
                ? 'bg-slate-100 dark:bg-dark-700 text-slate-900 dark:text-white font-semibold'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-dark-700/50 hover:text-slate-800 dark:hover:text-slate-200'
            )}
          >
            {item}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div className="flex-1 p-8">
        {activeNav === 'Caixa de entrada' && (
          <div className="max-w-lg">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-1">Caixa de entrada</h2>
            <p className="text-sm text-slate-400 dark:text-slate-500 mb-6">
              Altere a seção da caixa de entrada de acordo com suas necessidades.
            </p>

            {/* Toggle */}
            <div className="flex items-center gap-3 mb-5">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Seções da caixa de entrada</span>
              <button
                onClick={() => setInboxEnabled(v => !v)}
                className={cn('relative w-11 h-6 rounded-full transition-colors flex-shrink-0', inboxEnabled ? 'bg-primary-600' : 'bg-slate-300 dark:bg-dark-500')}
              >
                <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform', inboxEnabled && 'translate-x-5')} />
              </button>
            </div>

            {/* Reorderable sections */}
            {inboxEnabled && (
              <div className="space-y-2 mb-6">
                {sections.map((sec, i) => (
                  <div key={sec.id} className="flex items-center justify-between bg-slate-50 dark:bg-dark-700/50 border border-slate-100 dark:border-dark-600 rounded-xl px-4 py-3">
                    <span className="text-sm text-slate-700 dark:text-slate-200 font-medium">
                      {i + 1}. {sec.label}
                    </span>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => moveUp(i)}
                        disabled={i === 0}
                        className={cn('text-xs font-medium transition-colors', i === 0 ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed' : 'text-primary-600 dark:text-primary-400 hover:underline')}
                      >Mover para cima</button>
                      <button
                        onClick={() => moveDown(i)}
                        disabled={i === sections.length - 1}
                        className={cn('text-xs font-medium transition-colors', i === sections.length - 1 ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed' : 'text-primary-600 dark:text-primary-400 hover:underline')}
                      >Mover para baixo</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={handleSave}
              className="px-8 py-3 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-full transition-colors shadow-sm"
            >
              {saved ? 'Salvo!' : 'Salvar alterações'}
            </button>
          </div>
        )}

        {activeNav !== 'Caixa de entrada' && (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <Settings className="w-10 h-10 text-slate-200 dark:text-slate-700 mb-3" />
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{activeNav}</p>
            <p className="text-xs text-slate-400 mt-1">Esta seção está sendo desenvolvida.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function timeAgo(dateStr?: string | null): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1) return 'Agora'
  if (mins < 60) return `${mins} minutos atrás`
  if (hours < 24) return `${hours} hora${hours > 1 ? 's' : ''} atrás`
  if (days === 1) return 'Ontem'
  return `${days} dias atrás`
}

function taskTime(task: Task): { label: string; isOverdue: boolean } {
  const today = new Date().toISOString().split('T')[0]
  const due = task.due_date ? String(task.due_date).split('T')[0] : null
  if (!due) return { label: timeAgo(task.created_at), isOverdue: false }
  if (due === today) {
    const timePart = String(task.due_date).includes('T') ? String(task.due_date).split('T')[1]?.slice(0,5) : null
    return { label: timePart ? `Hoje ${timePart}` : 'Hoje', isOverdue: false }
  }
  if (due < today) return { label: timeAgo(task.due_date), isOverdue: true }
  return { label: formatDate(task.due_date), isOverdue: false }
}

export function Dashboard() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<DashTab>('visao')
  const [loading, setLoading] = usePageLoadingState()
  const [tasks, setTasks] = useState<Task[]>([])
  const [listaTasks, setListaTasks] = useState<Task[]>([])
  const [listaSearch, setListaSearch] = useState('')
  const [listaSelected, setListaSelected] = useState<Set<string>>(new Set())
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const [listaFilterOpen, setListaFilterOpen] = useState(false)
  const [listaSortOpen, setListaSortOpen] = useState(false)
  const [listaFilterPriority, setListaFilterPriority] = useState('')
  const [listaFilterStatus, setListaFilterStatus] = useState('')
  const [listaFilterType, setListaFilterType] = useState('')
  const [listaSortBy, setListaSortBy] = useState<'created_at' | 'due_date' | 'priority' | 'title'>('created_at')
  const [listaSortDir, setListaSortDir] = useState<'asc' | 'desc'>('desc')
  const [listaRefreshing, setListaRefreshing] = useState(false)
  const [quadroSearch, setQuadroSearch] = useState('')
  const [quadroFilterPriority, setQuadroFilterPriority] = useState('')
  const [quadroFilterType, setQuadroFilterType] = useState('')
  const [quadroFilterOpen, setQuadroFilterOpen] = useState(false)
  const [quadroRefreshing, setQuadroRefreshing] = useState(false)
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null)
  const [quadroTasks, setQuadroTasks] = useState<Task[]>([])
  const [quadroCompletedToday, setQuadroCompletedToday] = useState<Task[]>([])
  const [stats, setStats] = useState({
    completedToday: 0, completedMonth: 0,
    pending: 0, overdue: 0,
    completedPrevMonth: 0,
  })

  async function loadListaTasks() {
    setListaRefreshing(true)
    const { data } = await supabase.from('tasks').select('*')
      .in('status', ['pending', 'in_progress'])
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200)
    setListaTasks(data || [])
    setListaRefreshing(false)
  }

  function exportListaTasks(tasks: Task[], _userName: string) {
    const todayStr = new Date().toISOString().split('T')[0]
    const PRIORITY_BADGE: Record<string, string> = { low: 'gray', medium: 'blue', high: 'orange', urgent: 'red' }
    const STATUS_BADGE: Record<string, string> = { pending: 'amber', in_progress: 'blue', done: 'green', cancelled: 'gray' }
    const TYPE_LABEL: Record<string, string> = { custom: 'Tarefa', deadline: 'Prazo', hearing: 'Audiência', meeting: 'Reunião', document: 'Documento' }
    const highPriority = tasks.filter(t => t.priority === 'high' || t.priority === 'urgent').length
    const vencidas = tasks.filter(t => t.due_date && String(t.due_date).slice(0, 10) < todayStr).length
    const csvContent = [
      'Título,Tipo,Prioridade,Status,Responsável,Vencimento',
      ...tasks.map(t =>
        `"${t.title}","${TYPE_LABEL[t.type || 'custom'] ?? '—'}","${PRIORITY_LABELS[t.priority || 'medium']}","${TASK_STATUS_LABELS[t.status || 'pending']}","${t.assigned_name || '—'}","${t.due_date ? formatDate(t.due_date) : '—'}"`
      ),
    ].join('\n')
    openExportWindow({
      title: 'Relatório de Tarefas',
      subtitle: 'Painel — tarefas em aberto',
      filename: 'tarefas-dashboard',
      stats: [
        { value: tasks.length, label: 'Total de tarefas', accent: '#2563eb' },
        { value: highPriority, label: 'Alta prioridade', accent: '#c2410c' },
        { value: vencidas, label: 'Vencidas', accent: '#dc2626' },
        { value: tasks.length - vencidas, label: 'No prazo', accent: '#16a34a' },
      ],
      columns: ['Título', 'Tipo', 'Prioridade', 'Status', 'Responsável', 'Vencimento'],
      rows: tasks.map(t => {
        const isOverdue = !!t.due_date && String(t.due_date).slice(0, 10) < todayStr
        return [
          { text: t.title, bold: true },
          { text: TYPE_LABEL[t.type || 'custom'] ?? '—' },
          { text: PRIORITY_LABELS[t.priority || 'medium'], badge: PRIORITY_BADGE[t.priority || 'medium'] ?? 'blue' },
          { text: TASK_STATUS_LABELS[t.status || 'pending'], badge: STATUS_BADGE[t.status || 'pending'] ?? 'gray' },
          { text: t.assigned_name || '—' },
          { text: t.due_date ? formatDate(t.due_date) : '—', danger: isOverdue },
        ]
      }),
      csvContent,
    })
  }

  async function loadQuadroTasks() {
    setQuadroRefreshing(true)
    const todayStr = new Date().toISOString().split('T')[0]
    const [{ data: pending }, { data: completed }] = await Promise.all([
      supabase.from('tasks').select('*').in('status', ['pending', 'in_progress'])
        .is('deleted_at', null).order('created_at', { ascending: false }).limit(200),
      supabase.from('tasks').select('*').eq('status', 'done')
        .gte('updated_at', todayStr).is('deleted_at', null)
        .order('updated_at', { ascending: false }).limit(50),
    ])
    setQuadroTasks(pending || [])
    setQuadroCompletedToday(completed || [])
    setQuadroRefreshing(false)
  }

  async function markDoneFromQuadro(taskId: string) {
    const done = quadroTasks.find(t => t.id === taskId)
    await supabase.from('tasks').update({ status: 'done', updated_at: new Date().toISOString() }).eq('id', taskId)
    setQuadroTasks(prev => prev.filter(t => t.id !== taskId))
    if (done) setQuadroCompletedToday(prev => [{ ...done } as Task, ...prev])
    setStats(prev => ({ ...prev, pending: prev.pending - 1, completedMonth: prev.completedMonth + 1, completedToday: prev.completedToday + 1 }))
  }

  useEffect(() => {
    if (tab === 'lista') loadListaTasks()
    if (tab === 'quadro') loadQuadroTasks()
  }, [tab])

  async function loadDashboardData() {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
    const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0).toISOString()
    const todayStr = now.toISOString().split('T')[0]
    const last6MonthsStart = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString()

    const [
      { count: completedToday },
      { count: completedMonth },
      { count: completedPrevMonth },
      { count: pending },
      { count: overdue },
      { data: taskList },
      { data: last6MonthsCompleted },
      { data: completedWithPriority },
      { count: processesActive },
      { count: clientsActive },
      { data: receivables },
    ] = await Promise.all([
      supabase.from('tasks').select('*', { count: 'exact', head: true })
        .eq('status', 'done').gte('updated_at', todayStr).is('deleted_at', null),
      supabase.from('tasks').select('*', { count: 'exact', head: true })
        .eq('status', 'done').gte('updated_at', startOfMonth).is('deleted_at', null),
      supabase.from('tasks').select('*', { count: 'exact', head: true })
        .eq('status', 'done').gte('updated_at', startOfPrevMonth).lte('updated_at', endOfPrevMonth).is('deleted_at', null),
      supabase.from('tasks').select('*', { count: 'exact', head: true })
        .in('status', ['pending', 'in_progress']).is('deleted_at', null),
      supabase.from('tasks').select('*', { count: 'exact', head: true })
        .in('status', ['pending', 'in_progress']).lt('due_date', todayStr).is('deleted_at', null),
      supabase.from('tasks').select('*').in('status', ['pending', 'in_progress'])
        .is('deleted_at', null).order('due_date', { ascending: true }).limit(20),
      supabase.from('tasks').select('updated_at').eq('status', 'done')
        .gte('updated_at', last6MonthsStart).is('deleted_at', null),
      supabase.from('tasks').select('priority').eq('status', 'done')
        .gte('updated_at', startOfMonth).is('deleted_at', null),
      supabase.from('processes').select('*', { count: 'exact', head: true })
        .eq('status', 'active').is('deleted_at', null),
      supabase.from('clients').select('*', { count: 'exact', head: true })
        .eq('status', 'active').is('deleted_at', null),
      supabase.from('financials').select('amount')
        .eq('type', 'receivable').eq('status', 'pending').is('deleted_at', null),
    ])

    setStats({
      completedToday: completedToday || 0,
      completedMonth: completedMonth || 0,
      completedPrevMonth: completedPrevMonth || 0,
      pending: pending || 0,
      overdue: overdue || 0,
    })
    setTasks(taskList || [])

    // Daily scores (last 7 days) and calendar day map from last 6 months
    const dayMap: Record<string, number> = {}
    last6MonthsCompleted?.forEach(t => {
      const d = String(t.updated_at).split('T')[0]
      dayMap[d] = (dayMap[d] || 0) + 1
    })
    setCalendarDayMap(dayMap)

    const DAY_NAMES = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
    const dailyData: { date: string; dayLabel: string; count: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000)
      const key = d.toISOString().split('T')[0]
      dailyData.push({ date: key, dayLabel: i === 0 ? 'Hoje' : DAY_NAMES[d.getDay()], count: dayMap[key] || 0 })
    }
    setDailyScores(dailyData)

    // Monthly scores (last 6 months)
    const monthMap: Record<string, number> = {}
    last6MonthsCompleted?.forEach(t => {
      const key = String(t.updated_at).slice(0, 7)
      monthMap[key] = (monthMap[key] || 0) + 1
    })
    const SHORT_MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
    const monthlyData: { month: string; label: string; count: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      monthlyData.push({ month: key, label: SHORT_MONTHS[d.getMonth()], count: monthMap[key] || 0 })
    }
    setMonthlyScores(monthlyData)

    // Weighted points: urgent=4, high=3, medium=2, low=1
    const PRIORITY_WEIGHTS: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 }
    let pts = 0
    completedWithPriority?.forEach(t => { pts += PRIORITY_WEIGHTS[t.priority || 'medium'] || 2 })
    setPointsThisMonth(pts)

    // Cross-screen stats
    const totalReceivable = receivables?.reduce((sum, f) => sum + (Number(f.amount) || 0), 0) || 0
    setCrossStats({
      processesActive: processesActive || 0,
      clientsActive: clientsActive || 0,
      financialReceivable: totalReceivable,
    })
  }

  useEffect(() => {
    async function load() {
      await loadDashboardData()
      setLoading(false)
    }
    load()
  }, [])

  const firstName = (profile?.name || profile?.display_name || 'Usuário').split(' ')[0]
  const fullName = profile?.name || profile?.display_name || 'Usuário'
  const initials = fullName.split(' ').map((n: string) => n[0]).slice(0,2).join('').toUpperCase()

  const pctChange = stats.completedPrevMonth > 0
    ? Math.round(((stats.completedMonth - stats.completedPrevMonth) / stats.completedPrevMonth) * 100)
    : stats.completedMonth > 0 ? 100 : 0

  // Taskscore: last 7 days completed tasks (simplified to show month stats as bar)
  const maxBar = Math.max(stats.completedMonth, 1)

  const [taskscoreMode, setTaskscoreMode] = useState<'mensal' | 'diario'>('mensal')
  const [desempenhoCalMonth, setDesempenhoCalMonth] = useState(new Date())
  const [dailyScores, setDailyScores] = useState<{ date: string; dayLabel: string; count: number }[]>([])
  const [monthlyScores, setMonthlyScores] = useState<{ month: string; label: string; count: number }[]>([])
  const [calendarDayMap, setCalendarDayMap] = useState<Record<string, number>>({})
  const [crossStats, setCrossStats] = useState({ processesActive: 0, clientsActive: 0, financialReceivable: 0 })
  const [pointsThisMonth, setPointsThisMonth] = useState(0)
  const [taskscoreLoading, setTaskscoreLoading] = useState(false)

  // ── Task list modal (pending / overdue) ───────────────────────────────────
  const [taskListModalOpen, setTaskListModalOpen] = useState(false)
  const [taskListModalType, setTaskListModalType] = useState<'pending' | 'overdue'>('pending')

  function openTaskListModal(type: 'pending' | 'overdue') {
    setTaskListModalType(type)
    setTaskListModalOpen(true)
  }

  // ── Quick task creation modal ──────────────────────────────────────────────
  type QuickTaskForm = { title: string; description: string; due_date: string; priority: string; type: string }
  const EMPTY_QUICK_TASK: QuickTaskForm = { title: '', description: '', due_date: '', priority: 'medium', type: 'custom' }
  const [quickTaskOpen, setQuickTaskOpen] = useState(false)
  const [quickTaskForm, setQuickTaskForm] = useState<QuickTaskForm>(EMPTY_QUICK_TASK)
  const [quickTaskSaving, setQuickTaskSaving] = useState(false)

  async function saveQuickTask() {
    if (!quickTaskForm.title.trim()) return
    setQuickTaskSaving(true)
    await supabase.from('tasks').insert({
      title: quickTaskForm.title.trim(),
      description: quickTaskForm.description || null,
      due_date: quickTaskForm.due_date || null,
      priority: quickTaskForm.priority,
      type: quickTaskForm.type,
      status: 'pending',
      assigned_to: profile?.user_id || null,
      assigned_name: profile?.name || profile?.display_name || null,
    })
    setQuickTaskSaving(false)
    setQuickTaskOpen(false)
    setQuickTaskForm(EMPTY_QUICK_TASK)
    // reload tasks list
    const { data } = await supabase.from('tasks').select('*')
      .in('status', ['pending', 'in_progress'])
      .is('deleted_at', null).order('due_date', { ascending: true }).limit(20)
    setTasks(data || [])
    setStats(prev => ({ ...prev, pending: prev.pending + 1 }))
  }

  async function markDone(taskId: string) {
    await supabase.from('tasks').update({ status: 'done', updated_at: new Date().toISOString() }).eq('id', taskId)
    setTasks(prev => prev.filter(t => t.id !== taskId))
    setStats(prev => ({ ...prev, pending: prev.pending - 1, completedMonth: prev.completedMonth + 1 }))
  }

  async function markDoneFromLista(taskId: string) {
    await supabase.from('tasks').update({ status: 'done', updated_at: new Date().toISOString() }).eq('id', taskId)
    setListaTasks(prev => prev.filter(t => t.id !== taskId))
  }

  async function deleteTask(taskId: string) {
    await supabase.from('tasks').update({ deleted_at: new Date().toISOString() }).eq('id', taskId)
    setListaTasks(prev => prev.filter(t => t.id !== taskId))
    setQuadroTasks(prev => prev.filter(t => t.id !== taskId))
    setTasks(prev => prev.filter(t => t.id !== taskId))
    setDeletingTaskId(null)
    setStats(prev => ({ ...prev, pending: Math.max(0, prev.pending - 1) }))
  }

  async function refreshTaskscore() {
    setTaskscoreLoading(true)
    await loadDashboardData()
    setTaskscoreLoading(false)
  }

  function toggleSection(key: string) {
    setCollapsedSections(prev => {
      const s = new Set(prev)
      s.has(key) ? s.delete(key) : s.add(key)
      return s
    })
  }

  function toggleSelect(id: string) {
    setListaSelected(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  if (loading) return null

  return (
    <Layout title="Meu Painel">
      <div className="space-y-4 animate-fade-in">

        {/* ── Tabs ── */}
        <div className="flex items-center gap-1 bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-dark-700/50 shadow-card px-2 py-1.5">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition-all ${
                tab === id
                  ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-dark-700 hover:text-slate-800'
              }`}>
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {tab === 'visao' && (
          <>
            {/* ── Stats row ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Tarefas concluídas */}
              <div className="bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-dark-700/50 shadow-card p-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Tarefas concluídas</p>
                <div className="flex items-end gap-2 mb-1">
                  <span className="text-3xl font-bold text-slate-900 dark:text-white">{stats.completedMonth}</span>
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full mb-1 ${
                    pctChange >= 0 ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' : 'text-red-500 bg-red-50 dark:bg-red-900/20'
                  }`}>
                    {pctChange >= 0 ? '↑' : '↓'} {Math.abs(pctChange)}%
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">vs mês anterior: {stats.completedPrevMonth}</p>
              </div>

              {/* Pontos acumulados (= tarefas concluídas hoje como "pontos") */}
              <div className="bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-dark-700/50 shadow-card p-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Concluídas hoje</p>
                <div className="flex items-end gap-2 mb-1">
                  <span className="text-3xl font-bold text-slate-900 dark:text-white">{stats.completedToday}</span>
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-full mb-1 text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20">
                    ↑ 100%
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">vs mês anterior: 0</p>
              </div>

              {/* Tarefas pendentes */}
              <div className="bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-dark-700/50 shadow-card p-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Tarefas pendentes</p>
                <span className="text-3xl font-bold text-slate-900 dark:text-white">{stats.pending}</span>
                <button
                  onClick={() => openTaskListModal('pending')}
                  className="block text-[11px] text-primary-600 dark:text-primary-400 hover:underline mt-2"
                >
                  Mostrar tarefas
                </button>
              </div>

              {/* Vencidas */}
              <div className="bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-dark-700/50 shadow-card p-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Vencidas</p>
                <span className={`text-3xl font-bold ${stats.overdue > 0 ? 'text-red-500' : 'text-slate-900 dark:text-white'}`}>
                  {stats.overdue > 0 ? stats.overdue : '–'}
                </span>
                <button
                  onClick={() => stats.overdue > 0 ? openTaskListModal('overdue') : navigate('/configuracoes')}
                  className="block text-[11px] text-primary-600 dark:text-primary-400 hover:underline mt-2"
                >
                  {stats.overdue > 0 ? 'Ver vencidas' : 'Configurar meta'}
                </button>
              </div>
            </div>

            {/* ── Middle row ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

              {/* Taskscore (2 cols) */}
              <div className="lg:col-span-2 bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-dark-700/50 shadow-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-sm font-bold text-slate-800 dark:text-white">Taskscore</h2>
                    <p className="text-[11px] text-slate-400 mt-0.5">Últimos 7 dias</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 text-[10px] text-slate-400">
                      <span className="w-2 h-2 rounded-full bg-primary-500 inline-block" />Tarefas concluídas
                    </span>
                    <button
                      onClick={refreshTaskscore}
                      className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-700 text-slate-400 transition-colors"
                      title="Atualizar"
                    >
                      <RefreshCw className={cn('w-3.5 h-3.5', taskscoreLoading && 'animate-spin')} />
                    </button>
                  </div>
                </div>

                {/* Bar chart — last 7 days */}
                <ResponsiveContainer width="100%" height={100}>
                  <BarChart data={dailyScores} barSize={18} margin={{ top: 2, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="dayLabel" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} width={20} />
                    <Tooltip
                      formatter={(value: number) => [`${value} tarefa${value !== 1 ? 's' : ''}`, 'Concluídas']}
                      contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                    />
                    <Bar dataKey="count" fill="#0f172a" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>

                {/* Cross-screen mini stats */}
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-dark-700/50 grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <p className="text-lg font-bold text-slate-800 dark:text-white">{crossStats.processesActive}</p>
                    <p className="text-[10px] text-slate-400">Processos ativos</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-slate-800 dark:text-white">{crossStats.clientsActive}</p>
                    <p className="text-[10px] text-slate-400">Clientes ativos</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-emerald-600">{formatCurrency(crossStats.financialReceivable)}</p>
                    <p className="text-[10px] text-slate-400">A receber</p>
                  </div>
                </div>
              </div>

              {/* Atividades concluídas */}
              <div className="bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-dark-700/50 shadow-card p-5">
                <h2 className="text-sm font-bold text-slate-800 dark:text-white mb-4">Atividades concluídas</h2>
                {stats.completedMonth === 0 ? (
                  <div className="flex flex-col items-center justify-center h-28 text-center">
                    <CheckCircle2 className="w-8 h-8 text-slate-200 dark:text-slate-700 mb-2" />
                    <p className="text-xs text-slate-400">Você ainda não concluiu nenhuma atividade este mês</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
                      <span className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">Este mês</span>
                      <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{stats.completedMonth}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-dark-700/50 rounded-xl">
                      <span className="text-sm text-slate-600 dark:text-slate-400">Mês anterior</span>
                      <span className="text-lg font-bold text-slate-700 dark:text-slate-300">{stats.completedPrevMonth}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Bottom row ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

              {/* Compromissos / task list (2 cols) */}
              <div className="lg:col-span-2 bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-dark-700/50 shadow-card overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-dark-700/50">
                  <h2 className="text-sm font-bold text-slate-800 dark:text-white">Compromissos</h2>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setQuickTaskForm(EMPTY_QUICK_TASK); setQuickTaskOpen(true) }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold rounded-xl shadow-button transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" /> Nova tarefa
                    </button>
                    <button className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-700 text-slate-400 transition-colors" title="Atualizar">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {tasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-14 text-center">
                    <CheckSquare className="w-8 h-8 text-slate-200 dark:text-slate-700 mb-2" />
                    <p className="text-sm font-medium text-slate-500">Nenhuma atividade pendente</p>
                    <p className="text-xs text-slate-400 mt-1">Bom trabalho! Está tudo em dia.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-50 dark:divide-dark-700/30">
                    {tasks.slice(0, 8).map(task => {
                      const isOverdue = task.due_date && task.due_date < new Date().toISOString().split('T')[0]
                      return (
                        <div key={task.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-dark-700/40 transition-colors group">
                          <button onClick={() => markDone(task.id)}
                            className="flex-shrink-0 text-slate-300 hover:text-emerald-500 dark:text-dark-600 dark:hover:text-emerald-400 transition-colors">
                            <Circle className="w-4 h-4" />
                          </button>

                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <Star className="w-3 h-3 text-slate-200 dark:text-dark-600 group-hover:text-amber-400 transition-colors cursor-pointer" />
                            {task.priority === 'urgent' || task.priority === 'high'
                              ? <AlertCircle className="w-3 h-3 text-red-400" />
                              : <span className="w-3 h-3" />}
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-800 dark:text-slate-200 truncate">{task.title}</p>
                            {task.description && (
                              <p className="text-[11px] text-slate-400 truncate">{task.description}</p>
                            )}
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${PRIORITY_COLORS[task.priority || 'medium']}`}>
                              {PRIORITY_LABELS[task.priority || 'medium']}
                            </span>
                            {task.due_date && (
                              <span className={`text-[10px] font-medium ${isOverdue ? 'text-red-500' : 'text-slate-400'}`}>
                                {formatDate(task.due_date)}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Calendar */}
              <MiniCalendar />
            </div>
          </>
        )}

        {tab === 'lista' && (() => {
          const q = listaSearch.toLowerCase()
          const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }
          const filtered = listaTasks
            .filter(t => {
              if (q && !t.title.toLowerCase().includes(q) && !(t.assigned_name || '').toLowerCase().includes(q) && !(t.description || '').toLowerCase().includes(q)) return false
              if (listaFilterPriority && t.priority !== listaFilterPriority) return false
              if (listaFilterStatus && t.status !== listaFilterStatus) return false
              if (listaFilterType && t.type !== listaFilterType) return false
              return true
            })
            .sort((a, b) => {
              const dir = listaSortDir === 'asc' ? 1 : -1
              if (listaSortBy === 'title') return dir * (a.title || '').localeCompare(b.title || '', 'pt-BR')
              if (listaSortBy === 'due_date') {
                const da = a.due_date ? String(a.due_date) : '9999'
                const db = b.due_date ? String(b.due_date) : '9999'
                return dir * da.localeCompare(db)
              }
              if (listaSortBy === 'priority') return dir * ((priorityOrder[a.priority || 'medium'] ?? 2) - (priorityOrder[b.priority || 'medium'] ?? 2))
              return dir * (a.created_at || '').localeCompare(b.created_at || '')
            })

          const cutoff = new Date(Date.now() - 7 * 86400000).toISOString()
          const naoLidas = filtered.filter(t => (t.created_at || '') >= cutoff)
          const demais = filtered.filter(t => (t.created_at || '') < cutoff)
          const activeFiltersCount = [listaFilterPriority, listaFilterStatus, listaFilterType].filter(Boolean).length
          const sortLabels: Record<string, string> = { created_at: 'Data de criação', due_date: 'Prazo', priority: 'Prioridade', title: 'Título' }
          const selectClass = "text-xs border border-gray-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-gray-700 dark:text-gray-300 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400"

          function TaskRow({ task }: { task: Task }) {
            const { label, isOverdue } = taskTime(task)
            const avatarInitials = (task.assigned_name || '?').split(' ').map((n: string) => n[0]).slice(0,2).join('').toUpperCase()
            return (
              <div className="flex items-center gap-0 border-b border-gray-100 dark:border-dark-700/50 hover:bg-gray-50 dark:hover:bg-dark-700/30 transition-colors group">
                <div className="w-10 flex justify-center flex-shrink-0">
                  <input type="checkbox" checked={listaSelected.has(task.id)}
                    onChange={() => toggleSelect(task.id)}
                    className="w-3.5 h-3.5 rounded accent-primary-600 cursor-pointer" />
                </div>
                <div className="w-7 flex justify-center flex-shrink-0">
                  <Star className="w-3.5 h-3.5 text-gray-300 dark:text-dark-600 group-hover:text-amber-400 transition-colors cursor-pointer" />
                </div>
                <div className="w-7 flex justify-center flex-shrink-0">
                  {task.priority === 'urgent' || task.priority === 'high'
                    ? <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                    : <span className="w-3.5 h-3.5" />}
                </div>
                <div className="w-7 flex justify-center flex-shrink-0">
                  <button onClick={() => markDoneFromLista(task.id)} title="Marcar como concluída">
                    <Circle className="w-3.5 h-3.5 text-green-400 hover:text-green-600 transition-colors" />
                  </button>
                </div>
                <div className="flex-1 min-w-0 py-3 pr-3">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{task.title}</p>
                  {task.description && <p className="text-[11px] text-gray-400 truncate">{task.description}</p>}
                </div>
                <div className="w-28 flex-shrink-0 pr-3">
                  <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-semibold', PRIORITY_COLORS[task.priority || 'medium'])}>
                    {PRIORITY_LABELS[task.priority || 'medium']}
                  </span>
                </div>
                <div className="w-36 flex-shrink-0 pr-3">
                  <p className="text-xs text-gray-600 dark:text-gray-300 truncate">{task.assigned_name || '—'}</p>
                </div>
                <div className="w-32 flex-shrink-0 pr-3 text-right">
                  <span className={cn('text-xs font-medium', isOverdue ? 'text-red-500' : 'text-gray-400 dark:text-gray-500')}>
                    {label}
                  </span>
                </div>
                <div className="w-12 flex justify-center flex-shrink-0 py-2">
                  <div className="w-7 h-7 rounded-full bg-gray-300 dark:bg-dark-600 flex items-center justify-center text-[10px] font-bold text-gray-600 dark:text-gray-300">
                    {avatarInitials}
                  </div>
                </div>
                <div className="w-24 flex-shrink-0 flex items-center justify-end pr-3">
                  {deletingTaskId === task.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setDeletingTaskId(null)}
                        className="text-[10px] text-gray-400 hover:text-gray-600 px-1.5 py-1 rounded transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="text-[10px] font-semibold text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded-lg transition-colors"
                      >
                        Excluir
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeletingTaskId(task.id)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                      title="Excluir tarefa"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )
          }

          function Section({ title, items, sectionKey }: { title: string; items: Task[]; sectionKey: string }) {
            const collapsed = collapsedSections.has(sectionKey)
            return (
              <div>
                <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-dark-700/40 border-b border-gray-100 dark:border-dark-700/50">
                  <button
                    onClick={() => toggleSection(sectionKey)}
                    className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:text-primary-600 transition-colors"
                  >
                    <ChevronDown className={cn('w-4 h-4 transition-transform', collapsed && '-rotate-90')} />
                    {title}
                    <span className="text-xs text-gray-400 font-normal">({items.length})</span>
                  </button>
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    Mostrando
                    <select className="ml-1 text-xs border border-gray-200 dark:border-dark-600 rounded bg-white dark:bg-dark-800 text-gray-700 dark:text-gray-300 px-1 py-0.5">
                      <option>100</option>
                      <option>50</option>
                      <option>25</option>
                    </select>
                  </div>
                </div>
                {!collapsed && items.map(t => <TaskRow key={t.id} task={t} />)}
              </div>
            )
          }

          return (
            <div className="bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-dark-700/50 shadow-card overflow-hidden">
              {/* Toolbar */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-dark-700/50 flex-wrap">
                <button
                  onClick={() => navigate('/tarefas', { state: { openNew: true } })}
                  className="flex items-center gap-1.5 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Nova tarefa
                </button>
                <button
                  onClick={loadListaTasks}
                  disabled={listaRefreshing}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg transition-colors disabled:opacity-60"
                >
                  <RefreshCw className={cn('w-3.5 h-3.5', listaRefreshing && 'animate-spin')} />
                  {listaRefreshing ? 'Atualizando...' : 'Atualizar'}
                </button>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input
                    value={listaSearch}
                    onChange={e => setListaSearch(e.target.value)}
                    placeholder="Buscar tarefa..."
                    className="pl-8 pr-3 py-2 text-xs border border-gray-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 w-44"
                  />
                </div>
                <button
                  onClick={() => { setListaFilterOpen(v => !v); setListaSortOpen(false) }}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors',
                    listaFilterOpen || activeFiltersCount > 0
                      ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-700'
                  )}
                >
                  <Filter className="w-3.5 h-3.5" />
                  Filtrar
                  {activeFiltersCount > 0 && (
                    <span className="w-4 h-4 bg-primary-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {activeFiltersCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => { setListaSortOpen(v => !v); setListaFilterOpen(false) }}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors',
                    listaSortOpen || listaSortBy !== 'created_at' || listaSortDir !== 'desc'
                      ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-700'
                  )}
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  Ordenar
                  {(listaSortBy !== 'created_at' || listaSortDir !== 'desc') && (
                    <span className="text-[10px] font-semibold">{sortLabels[listaSortBy]} {listaSortDir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
                <button
                  onClick={() => exportListaTasks(filtered, fullName)}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg transition-colors"
                >
                  <Download className="w-3.5 h-3.5" /> Exportar
                </button>
                <div className="flex-1" />
                <div className="flex items-center gap-0.5 border-l border-gray-100 dark:border-dark-700 pl-2">
                  {[Bell, Calendar, Crosshair, SlidersHorizontal, Settings].map((Icon, i) => (
                    <button key={i} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-700 hover:text-gray-600 transition-colors">
                      <Icon className="w-4 h-4" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Filter panel */}
              {listaFilterOpen && (
                <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 dark:bg-dark-700/40 border-b border-gray-100 dark:border-dark-700/50 flex-wrap">
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Filtrar por:</span>
                  <select value={listaFilterPriority} onChange={e => setListaFilterPriority(e.target.value)} className={selectClass}>
                    <option value="">Todas as prioridades</option>
                    <option value="urgent">Urgente</option>
                    <option value="high">Alta</option>
                    <option value="medium">Média</option>
                    <option value="low">Baixa</option>
                  </select>
                  <select value={listaFilterStatus} onChange={e => setListaFilterStatus(e.target.value)} className={selectClass}>
                    <option value="">Todos os status</option>
                    <option value="pending">Pendente</option>
                    <option value="in_progress">Em andamento</option>
                  </select>
                  <select value={listaFilterType} onChange={e => setListaFilterType(e.target.value)} className={selectClass}>
                    <option value="">Todos os tipos</option>
                    <option value="custom">Tarefa</option>
                    <option value="deadline">Prazo</option>
                    <option value="hearing">Audiência</option>
                    <option value="meeting">Reunião</option>
                    <option value="document">Documento</option>
                  </select>
                  {activeFiltersCount > 0 && (
                    <button
                      onClick={() => { setListaFilterPriority(''); setListaFilterStatus(''); setListaFilterType('') }}
                      className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      Limpar filtros
                    </button>
                  )}
                </div>
              )}

              {/* Sort panel */}
              {listaSortOpen && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 dark:bg-dark-700/40 border-b border-gray-100 dark:border-dark-700/50 flex-wrap">
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 mr-1">Ordenar por:</span>
                  {(['created_at', 'due_date', 'priority', 'title'] as const).map(field => (
                    <button
                      key={field}
                      onClick={() => {
                        if (listaSortBy === field) setListaSortDir(d => d === 'asc' ? 'desc' : 'asc')
                        else { setListaSortBy(field); setListaSortDir('desc') }
                      }}
                      className={cn(
                        'flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                        listaSortBy === field
                          ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 border-primary-200 dark:border-primary-800'
                          : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-700 border-transparent hover:border-gray-200 dark:hover:border-dark-600'
                      )}
                    >
                      {sortLabels[field]}
                      {listaSortBy === field && <span className="ml-0.5">{listaSortDir === 'asc' ? '↑' : '↓'}</span>}
                    </button>
                  ))}
                  {(listaSortBy !== 'created_at' || listaSortDir !== 'desc') && (
                    <button
                      onClick={() => { setListaSortBy('created_at'); setListaSortDir('desc') }}
                      className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      Resetar
                    </button>
                  )}
                </div>
              )}

              {/* Title */}
              <div className="px-4 py-3 border-b border-gray-100 dark:border-dark-700/50 flex items-center justify-between">
                <h2 className="text-base font-bold text-gray-900 dark:text-white">Compromissos</h2>
                {filtered.length !== listaTasks.length && (
                  <span className="text-xs text-gray-400">{filtered.length} de {listaTasks.length} tarefas</span>
                )}
              </div>

              {/* Sections */}
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <CheckSquare className="w-8 h-8 text-gray-200 dark:text-dark-700 mb-2" />
                  <p className="text-sm text-gray-400">
                    {listaTasks.length === 0 ? 'Nenhuma tarefa pendente' : 'Nenhuma tarefa para os filtros selecionados'}
                  </p>
                  {(activeFiltersCount > 0 || listaSearch) && (
                    <button
                      onClick={() => { setListaFilterPriority(''); setListaFilterStatus(''); setListaFilterType(''); setListaSearch('') }}
                      className="mt-2 text-xs text-primary-600 dark:text-primary-400 hover:underline"
                    >
                      Limpar filtros
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <Section title="Não lidas" items={naoLidas} sectionKey="nao-lidas" />
                  <Section title="Todas as demais" items={demais} sectionKey="demais" />
                </>
              )}
            </div>
          )
        })()}

        {tab === 'quadro' && (() => {
          const todayStr = new Date().toISOString().split('T')[0]
          const nextWeekStr = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]

          const qSearch = quadroSearch.toLowerCase()
          const filteredBase = quadroTasks.filter(t => {
            if (qSearch && !t.title.toLowerCase().includes(qSearch) && !(t.assigned_name || '').toLowerCase().includes(qSearch) && !(t.description || '').toLowerCase().includes(qSearch)) return false
            if (quadroFilterPriority && t.priority !== quadroFilterPriority) return false
            if (quadroFilterType && t.type !== quadroFilterType) return false
            return true
          })
          const filteredCompleted = quadroCompletedToday.filter(t => {
            if (qSearch && !t.title.toLowerCase().includes(qSearch) && !(t.assigned_name || '').toLowerCase().includes(qSearch)) return false
            if (quadroFilterPriority && t.priority !== quadroFilterPriority) return false
            if (quadroFilterType && t.type !== quadroFilterType) return false
            return true
          })

          const todayTasks = filteredBase.filter(t => String(t.due_date || '').split('T')[0] === todayStr)
          const proximosTasks = filteredBase.filter(t => {
            const d = String(t.due_date || '').split('T')[0]
            return d && d > todayStr && d <= nextWeekStr
          })
          const fazendoTasks = filteredBase.filter(t => t.status === 'in_progress')
          const overdueCount = filteredBase.filter(t => t.due_date && String(t.due_date).split('T')[0] < todayStr).length
          const quadroActiveFilters = [quadroFilterPriority, quadroFilterType].filter(Boolean).length

          const columns = [
            { key: 'todas', label: 'Todas as tarefas', color: 'text-orange-500', dotColor: 'bg-orange-400', items: filteredBase },
            { key: 'hoje', label: 'Hoje', color: 'text-blue-600 dark:text-blue-400', dotColor: 'bg-blue-500', items: todayTasks },
            { key: 'proximos', label: 'Próximos 7 dias', color: 'text-violet-600 dark:text-violet-400', dotColor: 'bg-violet-500', items: proximosTasks },
            { key: 'fazendo', label: 'Fazendo', color: 'text-amber-600 dark:text-amber-400', dotColor: 'bg-amber-500', items: fazendoTasks },
            { key: 'concluidas', label: 'Concluídas hoje', color: 'text-emerald-600 dark:text-emerald-400', dotColor: 'bg-emerald-500', items: filteredCompleted },
          ]

          const priorityBarColor: Record<string, string> = {
            urgent: 'bg-red-500', high: 'bg-orange-400', medium: 'bg-sky-400', low: 'bg-slate-300 dark:bg-slate-600',
          }
          const typeIcon: Record<string, string> = {
            deadline: '⚖️', hearing: '🏛️', meeting: '🤝', document: '📄', custom: '✓',
          }

          function TaskCard({ task, done }: { task: Task; done?: boolean }) {
            const { label, isOverdue } = taskTime(task)
            const cardInitials = (task.assigned_name || '?').split(' ').map((n: string) => n[0]).slice(0,2).join('').toUpperCase()
            const icon = typeIcon[task.type || 'custom'] || '✓'
            const barColor = priorityBarColor[task.priority || 'medium'] || 'bg-sky-400'
            return (
              <div className="relative bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-600 p-3 shadow-sm hover:shadow-md transition-all group overflow-hidden">
                {/* Priority stripe */}
                <div className={cn('absolute top-0 left-0 right-0 h-0.5', barColor)} />
                <div className="flex items-start justify-between gap-2 mt-0.5 mb-1.5">
                  <div className="flex items-start gap-1.5 flex-1 min-w-0">
                    <span className="text-xs flex-shrink-0 mt-0.5 leading-none">{icon}</span>
                    <p className={cn('text-sm font-semibold text-gray-900 dark:text-white leading-snug line-clamp-2', done && 'line-through text-gray-400 dark:text-gray-500')}>{task.title}</p>
                  </div>
                  {!done && (
                    <button
                      onClick={() => markDoneFromQuadro(task.id)}
                      title="Concluir tarefa"
                      className="flex-shrink-0 w-5 h-5 mt-0.5 rounded-full border-2 border-gray-300 dark:border-dark-500 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all opacity-0 group-hover:opacity-100"
                    />
                  )}
                  {done && <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />}
                </div>
                {task.description && (
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 ml-5 mb-1.5 line-clamp-1">{task.description}</p>
                )}
                <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-gray-100 dark:border-dark-700/50">
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-full bg-gray-200 dark:bg-dark-600 flex items-center justify-center text-[9px] font-bold text-gray-500 dark:text-gray-400">
                      {cardInitials}
                    </div>
                    {task.priority && (
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-semibold', PRIORITY_COLORS[task.priority || 'medium'])}>
                        {PRIORITY_LABELS[task.priority || 'medium']}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {label && (
                      <span className={cn('text-[10px] font-medium', isOverdue && !done ? 'text-red-500' : 'text-gray-400 dark:text-gray-500')}>
                        {label}
                      </span>
                    )}
                    {!done && (
                      deletingTaskId === task.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setDeletingTaskId(null)}
                            className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            Não
                          </button>
                          <button
                            onClick={() => deleteTask(task.id)}
                            className="text-[10px] font-semibold text-white bg-red-500 hover:bg-red-600 px-1.5 py-0.5 rounded-lg transition-colors"
                          >
                            Excluir
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeletingTaskId(task.id)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-300 hover:text-red-500 dark:hover:text-red-400 transition-all"
                          title="Excluir tarefa"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            )
          }

          return (
            <div className="space-y-3">
              {/* Stats strip */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-2 bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-xl px-3.5 py-2 shadow-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{filteredCompleted.length} Concluída{filteredCompleted.length !== 1 ? 's' : ''} hoje</span>
                </div>
                <div className="flex items-center gap-2 bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-xl px-3.5 py-2 shadow-sm">
                  <Circle className="w-4 h-4 text-orange-400" />
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{filteredBase.length} Pendente{filteredBase.length !== 1 ? 's' : ''}</span>
                </div>
                {overdueCount > 0 && (
                  <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-3.5 py-2 shadow-sm">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <span className="text-sm font-semibold text-red-600 dark:text-red-400">{overdueCount} Vencida{overdueCount !== 1 ? 's' : ''}</span>
                  </div>
                )}
                <div className="flex-1" />
                <button
                  onClick={loadQuadroTasks}
                  disabled={quadroRefreshing}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-white dark:hover:bg-dark-800 rounded-lg transition-colors border border-gray-200 dark:border-dark-700 shadow-sm disabled:opacity-60"
                >
                  <RefreshCw className={cn('w-3.5 h-3.5', quadroRefreshing && 'animate-spin')} />
                  {quadroRefreshing ? 'Atualizando...' : 'Atualizar'}
                </button>
                <button
                  onClick={() => navigate('/tarefas', { state: { openNew: true } })}
                  className="flex items-center gap-1.5 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition-colors shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" /> Nova tarefa
                </button>
              </div>

              {/* Toolbar */}
              <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 px-3 py-2 flex items-center gap-2 flex-wrap shadow-sm">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input
                    value={quadroSearch}
                    onChange={e => setQuadroSearch(e.target.value)}
                    placeholder="Buscar tarefa..."
                    className="pl-8 pr-7 py-1.5 text-xs border border-gray-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 w-52"
                  />
                  {quadroSearch && (
                    <button onClick={() => setQuadroSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs font-bold">✕</button>
                  )}
                </div>
                <button
                  onClick={() => setQuadroFilterOpen(v => !v)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                    quadroFilterOpen || quadroActiveFilters > 0
                      ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-700'
                  )}
                >
                  <Filter className="w-3.5 h-3.5" />
                  Filtrar
                  {quadroActiveFilters > 0 && (
                    <span className="w-4 h-4 bg-primary-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{quadroActiveFilters}</span>
                  )}
                </button>
                {(quadroSearch || quadroActiveFilters > 0) && (
                  <span className="text-xs text-gray-400 font-medium">{filteredBase.length} resultado{filteredBase.length !== 1 ? 's' : ''}</span>
                )}
                <div className="w-px h-4 bg-gray-200 dark:bg-dark-600 mx-1" />
                {[Bell, Crosshair, SlidersHorizontal, Settings].map((Icon, i) => (
                  <button key={i} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-700 hover:text-gray-600 transition-colors">
                    <Icon className="w-4 h-4" />
                  </button>
                ))}
              </div>

              {/* Filter panel */}
              {quadroFilterOpen && (
                <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 px-4 py-2.5 flex items-center gap-3 shadow-sm flex-wrap">
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Filtrar por:</span>
                  <select
                    value={quadroFilterPriority}
                    onChange={e => setQuadroFilterPriority(e.target.value)}
                    className="text-xs border border-gray-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-gray-700 dark:text-gray-300 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  >
                    <option value="">Todas as prioridades</option>
                    <option value="urgent">Urgente</option>
                    <option value="high">Alta</option>
                    <option value="medium">Média</option>
                    <option value="low">Baixa</option>
                  </select>
                  <select
                    value={quadroFilterType}
                    onChange={e => setQuadroFilterType(e.target.value)}
                    className="text-xs border border-gray-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-gray-700 dark:text-gray-300 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  >
                    <option value="">Todos os tipos</option>
                    <option value="custom">Tarefa</option>
                    <option value="deadline">Prazo</option>
                    <option value="hearing">Audiência</option>
                    <option value="meeting">Reunião</option>
                    <option value="document">Documento</option>
                  </select>
                  {quadroActiveFilters > 0 && (
                    <button
                      onClick={() => { setQuadroFilterPriority(''); setQuadroFilterType('') }}
                      className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      Limpar filtros
                    </button>
                  )}
                </div>
              )}

              {/* Kanban columns */}
              <div className="flex gap-4 overflow-x-auto pb-4 -mx-1 px-1">
                {columns.map(col => (
                  <div key={col.key} className="flex-shrink-0 w-72">
                    {/* Column header */}
                    <div className="flex items-center gap-2 mb-3 px-1">
                      <div className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', col.dotColor)} />
                      <span className={cn('text-sm font-bold flex-1 truncate', col.color)}>{col.label}</span>
                      <span className="min-w-[22px] h-5 rounded-full bg-gray-100 dark:bg-dark-700 flex items-center justify-center text-xs font-bold text-gray-500 dark:text-gray-400 px-1.5">
                        {col.items.length}
                      </span>
                    </div>

                    {/* Cards — scrollable */}
                    <div className="space-y-2 max-h-[580px] overflow-y-auto pr-0.5 pb-1">
                      {col.items.map(task => (
                        <TaskCard key={task.id} task={task} done={col.key === 'concluidas'} />
                      ))}
                      {col.items.length === 0 && (
                        <div className="border-2 border-dashed border-gray-200 dark:border-dark-600 rounded-xl p-5 flex flex-col items-center justify-center gap-1.5">
                          <CheckSquare className="w-5 h-5 text-gray-300 dark:text-dark-600" />
                          <p className="text-xs text-gray-400 text-center">
                            {(quadroSearch || quadroActiveFilters > 0) ? 'Sem resultados' : 'Nenhuma tarefa'}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Add task */}
                    {col.key !== 'concluidas' && (
                      <button
                        onClick={() => navigate('/tarefas', { state: { openNew: true } })}
                        className="mt-2 w-full flex items-center gap-1.5 px-3 py-2 text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-white dark:hover:bg-dark-800 rounded-xl transition-colors border border-dashed border-gray-200 dark:border-dark-600"
                      >
                        <Plus className="w-3.5 h-3.5" /> Adicionar tarefa
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {tab === 'desempenho' && (() => {
          const calYear = desempenhoCalMonth.getFullYear()
          const calMonth = desempenhoCalMonth.getMonth()
          const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
          const today = new Date()
          const firstDay = new Date(calYear, calMonth, 1).getDay()
          const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
          const calDays: (number | null)[] = Array(firstDay).fill(null)
          for (let i = 1; i <= daysInMonth; i++) calDays.push(i)

          const scoreBarWidth = stats.completedMonth > 0
            ? Math.max((stats.completedMonth / Math.max(maxBar, 10)) * 100, 5)
            : 0

          return (
            <div className="flex gap-4">
              {/* Left: stats + charts */}
              <div className="flex-1 min-w-0 space-y-4">
                {/* 4 stat cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Tarefas concluídas */}
                  <div className="bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-dark-700/50 shadow-card p-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs text-slate-400 font-medium">Tarefas concluídas</p>
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                    <div className="flex items-end gap-2 mb-1">
                      <span className="text-3xl font-bold text-slate-900 dark:text-white">{stats.completedMonth}</span>
                      <span className={cn('text-xs font-bold px-1.5 py-0.5 rounded-full mb-1', pctChange >= 0 ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' : 'text-red-500 bg-red-50')}>
                        ↗ {Math.abs(pctChange)}%
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">vs mês anterior: {stats.completedPrevMonth}</p>
                  </div>
                  {/* Pontos acumulados */}
                  <div className="bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-dark-700/50 shadow-card p-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs text-slate-400 font-medium">Pontos acumulados</p>
                      <Target className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" />
                    </div>
                    <div className="flex items-end gap-2 mb-1">
                      <span className="text-3xl font-bold text-slate-900 dark:text-white">{pointsThisMonth}</span>
                      {pointsThisMonth > 0 && (
                        <span className="text-xs font-bold px-1.5 py-0.5 rounded-full mb-1 text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20">↗</span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400">Urgente=4 · Alta=3 · Média=2 · Baixa=1 pt</p>
                  </div>
                  {/* Tarefas pendentes */}
                  <div className="bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-dark-700/50 shadow-card p-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs text-slate-400 font-medium">Tarefas pendentes</p>
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                    <span className="text-3xl font-bold text-slate-900 dark:text-white">{stats.pending}</span>
                    <button
                      onClick={() => openTaskListModal('pending')}
                      className="block text-[11px] text-primary-600 dark:text-primary-400 hover:underline mt-2"
                    >
                      Mostrar tarefas
                    </button>
                  </div>
                  {/* Alcance da meta — 20 tarefas/mês como meta padrão */}
                  {(() => {
                    const META = 20
                    const pct = Math.min(Math.round((stats.completedMonth / META) * 100), 100)
                    return (
                      <div className="bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-dark-700/50 shadow-card p-4">
                        <p className="text-xs text-slate-400 font-medium mb-1">Alcance da meta</p>
                        <span className={cn('text-3xl font-bold', pct >= 100 ? 'text-emerald-600' : 'text-slate-900 dark:text-white')}>{pct}%</span>
                        <div className="mt-2 h-1.5 bg-slate-100 dark:bg-dark-700 rounded-full overflow-hidden">
                          <div
                            className={cn('h-full rounded-full transition-all duration-700', pct >= 100 ? 'bg-emerald-500' : 'bg-primary-500')}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">{stats.completedMonth} de {META} tarefas</p>
                      </div>
                    )
                  })()}
                </div>

                {/* Taskscore + Atividades */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* Taskscore */}
                  <div className="lg:col-span-2 bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-dark-700/50 shadow-card p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h2 className="text-sm font-bold text-slate-800 dark:text-white">Taskscore</h2>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {taskscoreMode === 'mensal' ? 'Últimos 6 meses' : 'Últimos 7 dias'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* mensal/diário toggle */}
                        <div className="flex items-center border border-slate-200 dark:border-dark-600 rounded-lg overflow-hidden">
                          <button
                            onClick={() => setTaskscoreMode('mensal')}
                            className={cn('px-2.5 py-1 text-xs font-medium transition-colors', taskscoreMode === 'mensal' ? 'bg-slate-100 dark:bg-dark-700 text-slate-800 dark:text-white' : 'text-slate-400 hover:text-slate-600')}
                          >mensal</button>
                          <button
                            onClick={() => setTaskscoreMode('diario')}
                            className={cn('px-2.5 py-1 text-xs font-medium transition-colors', taskscoreMode === 'diario' ? 'bg-slate-100 dark:bg-dark-700 text-slate-800 dark:text-white' : 'text-slate-400 hover:text-slate-600')}
                          >diário</button>
                        </div>
                        <button
                          onClick={refreshTaskscore}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-700 text-slate-400 transition-colors"
                          title="Atualizar dados"
                        >
                          <RefreshCw className={cn('w-3.5 h-3.5', taskscoreLoading && 'animate-spin')} />
                        </button>
                      </div>
                    </div>

                    {/* Bar chart — recharts */}
                    <ResponsiveContainer width="100%" height={160}>
                      {taskscoreMode === 'mensal' ? (
                        <BarChart data={monthlyScores} barSize={28} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} width={22} />
                          <Tooltip
                            formatter={(value: number) => [`${value} tarefa${value !== 1 ? 's' : ''}`, 'Concluídas']}
                            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                          />
                          <Bar dataKey="count" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      ) : (
                        <BarChart data={dailyScores} barSize={28} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <XAxis dataKey="dayLabel" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} width={22} />
                          <Tooltip
                            formatter={(value: number) => [`${value} tarefa${value !== 1 ? 's' : ''}`, 'Concluídas']}
                            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                          />
                          <Bar dataKey="count" fill="#0f172a" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      )}
                    </ResponsiveContainer>

                    {/* Summary row */}
                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-dark-700/50 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span><span className="font-bold text-slate-800 dark:text-white">{stats.completedMonth}</span> tarefas concluídas este mês</span>
                      <span><span className="font-bold text-teal-600">{pointsThisMonth}</span> pts acumulados</span>
                    </div>
                  </div>

                  {/* Atividades concluídas */}
                  <div className="bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-dark-700/50 shadow-card p-5">
                    <h2 className="text-sm font-bold text-slate-800 dark:text-white mb-4">Atividades concluídas</h2>
                    {stats.completedMonth === 0 ? (
                      <div className="flex flex-col items-center justify-center h-24 text-center">
                        <p className="text-xs text-slate-400 leading-relaxed">
                          Você ainda não concluiu nenhuma tarefa este mês
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
                          <span className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">Este mês</span>
                          <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{stats.completedMonth}</span>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-dark-700/50 rounded-xl">
                          <span className="text-sm text-slate-600 dark:text-slate-400">Mês anterior</span>
                          <span className="text-lg font-bold text-slate-700 dark:text-slate-300">{stats.completedPrevMonth}</span>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-dark-700/50 rounded-xl">
                          <span className="text-sm text-slate-600 dark:text-slate-400">Pontos acumulados</span>
                          <span className="text-lg font-bold text-teal-600">{pointsThisMonth}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Cross-screen stats — dados de outras telas */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-dark-700/50 shadow-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                        <Briefcase className="w-3.5 h-3.5 text-blue-500" />
                      </div>
                      <p className="text-xs text-slate-400 font-medium">Processos ativos</p>
                    </div>
                    <span className="text-2xl font-bold text-slate-900 dark:text-white">{crossStats.processesActive}</span>
                    <button onClick={() => navigate('/processos')} className="block text-[11px] text-primary-600 dark:text-primary-400 hover:underline mt-1">Ver processos →</button>
                  </div>
                  <div className="bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-dark-700/50 shadow-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-lg bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center">
                        <Users className="w-3.5 h-3.5 text-violet-500" />
                      </div>
                      <p className="text-xs text-slate-400 font-medium">Clientes ativos</p>
                    </div>
                    <span className="text-2xl font-bold text-slate-900 dark:text-white">{crossStats.clientsActive}</span>
                    <button onClick={() => navigate('/clientes')} className="block text-[11px] text-primary-600 dark:text-primary-400 hover:underline mt-1">Ver clientes →</button>
                  </div>
                  <div className="bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-dark-700/50 shadow-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
                        <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                      </div>
                      <p className="text-xs text-slate-400 font-medium">Honorários a receber</p>
                    </div>
                    <span className="text-base font-bold text-emerald-600">{formatCurrency(crossStats.financialReceivable)}</span>
                    <button onClick={() => navigate('/financeiro')} className="block text-[11px] text-primary-600 dark:text-primary-400 hover:underline mt-1">Ver financeiro →</button>
                  </div>
                </div>
              </div>

              {/* Right: Full calendar */}
              <div className="w-72 flex-shrink-0 bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-dark-700/50 shadow-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-base font-bold text-slate-800 dark:text-white">
                    {monthNames[calMonth]} {calYear}
                  </span>
                  <div className="flex gap-1">
                    <button onClick={() => setDesempenhoCalMonth(new Date(calYear, calMonth - 1, 1))}
                      className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-700 text-slate-400 hover:text-slate-700 transition-colors">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button onClick={() => setDesempenhoCalMonth(new Date(calYear, calMonth + 1, 1))}
                      className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-700 text-slate-400 hover:text-slate-700 transition-colors">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {/* Day headers */}
                <div className="grid grid-cols-7 mb-1">
                  {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d => (
                    <div key={d} className="text-center text-[10px] font-semibold text-slate-400 py-1">{d}</div>
                  ))}
                </div>
                {/* Days grid */}
                <div className="grid grid-cols-7">
                  {calDays.map((d, i) => {
                    const isToday = d === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear()
                    const isPrevMonth = d === null
                    const calDateStr = d !== null ? `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` : ''
                    const dayCount = calDateStr ? (calendarDayMap[calDateStr] || 0) : 0
                    const badge = dayCount > 0 ? dayCount : null
                    return (
                      <div key={i} className="flex items-center justify-center py-0.5">
                        <div className={cn(
                          'relative flex items-center justify-center text-[11px] h-7 w-7 rounded-full cursor-default transition-colors',
                          isPrevMonth ? 'text-slate-300 dark:text-slate-600' :
                          isToday ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold' :
                          'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-dark-700'
                        )}>
                          {d !== null ? d : (
                            // show prev/next month days dimmed
                            (() => {
                              if (i < firstDay) {
                                const prevMonthDays = new Date(calYear, calMonth, 0).getDate()
                                return prevMonthDays - firstDay + i + 1
                              }
                              return i - firstDay - daysInMonth + 1
                            })()
                          )}
                          {badge && (
                            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[8px] font-bold flex items-center justify-center">
                              {badge}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <button
                  onClick={() => navigate('/agenda')}
                  className="mt-4 text-xs text-primary-600 dark:text-primary-400 hover:underline w-full text-right flex items-center justify-end gap-1"
                >
                  Mostrar agenda completa <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          )
        })()}

        {tab === 'ia' && <AiCopilotoTab />}

        {tab === 'configuracoes' && <DashConfiguracoes />}

      </div>

      {/* ── Task list modal (pending / overdue) ── */}
      {(() => {
        const todayStr = new Date().toISOString().split('T')[0]
        const modalTasks = taskListModalType === 'overdue'
          ? tasks.filter(t => t.due_date && String(t.due_date).split('T')[0] < todayStr)
          : tasks
        const title = taskListModalType === 'overdue' ? 'Tarefas vencidas' : 'Tarefas pendentes'
        return (
          <Modal open={taskListModalOpen} onClose={() => setTaskListModalOpen(false)} title={title} size="lg">
            {modalTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckSquare className="w-10 h-10 text-slate-200 dark:text-slate-700 mb-3" />
                <p className="text-sm font-medium text-slate-500">
                  {taskListModalType === 'overdue' ? 'Nenhuma tarefa vencida. Parabéns!' : 'Nenhuma tarefa pendente.'}
                </p>
              </div>
            ) : (
              <div className="space-y-0 -mx-6 -mb-6">
                <p className="px-6 pb-3 text-xs text-slate-400">{modalTasks.length} tarefa{modalTasks.length !== 1 ? 's' : ''}</p>
                <div className="divide-y divide-slate-100 dark:divide-dark-700/50 max-h-[420px] overflow-y-auto">
                  {modalTasks.map(task => {
                    const isOverdue = task.due_date && String(task.due_date).split('T')[0] < todayStr
                    return (
                      <div key={task.id} className="flex items-center gap-3 px-6 py-3 hover:bg-slate-50 dark:hover:bg-dark-700/40 transition-colors">
                        <button
                          onClick={() => {
                            markDone(task.id)
                            setTaskListModalOpen(false)
                          }}
                          className="flex-shrink-0 text-slate-300 hover:text-emerald-500 dark:text-dark-600 dark:hover:text-emerald-400 transition-colors"
                          title="Marcar como concluída"
                        >
                          <Circle className="w-4 h-4" />
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{task.title}</p>
                          {task.description && (
                            <p className="text-[11px] text-slate-400 truncate">{task.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${PRIORITY_COLORS[task.priority || 'medium']}`}>
                            {PRIORITY_LABELS[task.priority || 'medium']}
                          </span>
                          {task.due_date && (
                            <span className={`text-[10px] font-medium ${isOverdue ? 'text-red-500' : 'text-slate-400'}`}>
                              {formatDate(task.due_date)}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="px-6 py-4 border-t border-slate-100 dark:border-dark-700/50 flex justify-between items-center">
                  <button
                    onClick={() => { setTaskListModalOpen(false); navigate('/tarefas') }}
                    className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    Ver todas as tarefas →
                  </button>
                  <Button variant="ghost" size="sm" onClick={() => setTaskListModalOpen(false)}>Fechar</Button>
                </div>
              </div>
            )}
          </Modal>
        )
      })()}

      {/* ── Quick task creation modal ── */}
      <Modal open={quickTaskOpen} onClose={() => setQuickTaskOpen(false)} title="Nova tarefa" size="md">
        <div className="space-y-4">
          <Input
            label="Título *"
            value={quickTaskForm.title}
            onChange={e => setQuickTaskForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Ex: Protocolar recurso..."
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Prioridade"
              value={quickTaskForm.priority}
              onChange={e => setQuickTaskForm(f => ({ ...f, priority: e.target.value }))}
            >
              <option value="low">Baixa</option>
              <option value="medium">Média</option>
              <option value="high">Alta</option>
              <option value="urgent">Urgente</option>
            </Select>
            <Select
              label="Tipo"
              value={quickTaskForm.type}
              onChange={e => setQuickTaskForm(f => ({ ...f, type: e.target.value }))}
            >
              <option value="custom">Tarefa</option>
              <option value="deadline">Prazo</option>
              <option value="hearing">Audiência</option>
              <option value="meeting">Reunião</option>
              <option value="document">Documento</option>
            </Select>
          </div>
          <Input
            label="Data de entrega"
            type="date"
            value={quickTaskForm.due_date}
            onChange={e => setQuickTaskForm(f => ({ ...f, due_date: e.target.value }))}
          />
          <Input
            label="Descrição"
            value={quickTaskForm.description}
            onChange={e => setQuickTaskForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Detalhes da tarefa (opcional)"
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setQuickTaskOpen(false)}>Cancelar</Button>
            <Button
              variant="primary"
              onClick={saveQuickTask}
              loading={quickTaskSaving}
              disabled={!quickTaskForm.title.trim()}
            >
              Criar tarefa
            </Button>
          </div>
        </div>
      </Modal>

    </Layout>
  )
}
