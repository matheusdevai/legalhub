import { usePageLoadingState } from '@/contexts/PageLoadingContext'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Plus, Search, Check, Trash2,
  CheckCircle2, User, ChevronDown, X as XIcon, Briefcase,
  ArrowLeft, ArrowRight, LayoutGrid, List, RefreshCw, SlidersHorizontal, Download,
} from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Button, Modal, Input, Select, Textarea, Spinner } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { Task, Process, Client, Profile } from '@/types'
import { formatDate, PRIORITY_LABELS, TASK_STATUS_LABELS } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { openExportWindow } from '@/lib/exportUtils'
import { markTaskDone, notifyTaskAssignment, RECURRENCE_LABELS } from '@/lib/taskActions'

type TaskForm = {
  title: string; description: string; process_id: string; client_id: string;
  assigned_name: string; assigned_to: string;
  due_date: string; due_time: string; deadline_date: string;
  priority: string; status: string; type: string;
  location: string; all_day: boolean;
  tag_importante: boolean; tag_urgente: boolean;
  tag_recorrente: boolean; recurrence_interval: string;
}
const EMPTY_FORM: TaskForm = {
  title: '', description: '', process_id: '', client_id: '', assigned_name: '', assigned_to: '',
  due_date: '', due_time: '', deadline_date: '', priority: 'medium', status: 'pending', type: 'custom',
  location: '', all_day: false,
  tag_importante: false, tag_urgente: false,
  tag_recorrente: false, recurrence_interval: 'monthly',
}

const PRIORITY_BAR: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-400',
  low: 'bg-gray-300 dark:bg-dark-600',
}
const PRIORITY_BADGE: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  low: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}
const TYPE_META: Record<string, { label: string; icon: string; chip: string }> = {
  deadline: { label: 'Prazo', icon: '⏰', chip: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' },
  hearing: { label: 'Audiência', icon: '⚖️', chip: 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400' },
  document: { label: 'Documento', icon: '📄', chip: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' },
  meeting: { label: 'Reunião', icon: '🤝', chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' },
  custom: { label: 'Geral', icon: '📌', chip: 'bg-gray-100 text-gray-600 dark:bg-dark-700 dark:text-gray-300' },
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mt-2 mb-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-primary-600 dark:text-primary-400 whitespace-nowrap">{children}</span>
      <div className="flex-1 h-px bg-gradient-to-r from-primary-200 dark:from-primary-800 to-transparent" />
    </div>
  )
}

export function TasksPage() {
  const { profile } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const [tasks, setTasks] = useState<Task[]>([])
  const [processes, setProcesses] = useState<Process[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [systemUsers, setSystemUsers] = useState<Profile[]>([])
  const [loading, setLoading] = usePageLoadingState()
  const [refreshing, setRefreshing] = useState(false)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [assignedFilter, setAssignedFilter] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)

  const [viewMode, setViewMode] = useState<'list' | 'quadro'>('quadro')
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<TaskForm>(EMPTY_FORM)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [pageSize, setPageSize] = useState(50)
  const [page, setPage] = useState(1)
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())

  const today = new Date().toISOString().slice(0, 10)
  const sevenDaysAhead = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)

  async function load(silent = false) {
    if (!silent) setLoading(true)
    const [{ data: t }, { data: p }, { data: c }, { data: usr }] = await Promise.all([
      supabase.from('tasks').select('*').is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('processes').select('id,number,title,modalidade,client_id').is('deleted_at', null).order('title'),
      supabase.from('clients').select('id,name,colaborador_id').is('deleted_at', null).order('name'),
      supabase.from('profiles').select('id,user_id,name,display_name,role').order('name'),
    ])
    let taskList = t || []
    if (profile?.role === 'lawyer' || profile?.role === 'intern') {
      taskList = taskList.filter(task => task.assigned_to === profile.user_id)
    }
    setTasks(taskList)
    setProcesses((p || []) as Process[])
    setClients((c || []) as Client[])
    setSystemUsers((usr || []) as Profile[])
    setLoading(false)
  }

  async function refresh() {
    setRefreshing(true)
    await load(true)
    setRefreshing(false)
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    if ((location.state as any)?.openNew) { openNew(); window.history.replaceState({}, '') }
  }, [location.state])

  // ── Workload por responsável (tarefas abertas) ───────────────────────────
  const workloadByUser = useMemo(() => {
    const map: Record<string, number> = {}
    tasks.forEach(t => {
      if (!t.assigned_to) return
      if (t.status === 'done' || t.status === 'cancelled') return
      map[t.assigned_to] = (map[t.assigned_to] || 0) + 1
    })
    return map
  }, [tasks])

  // ── Quadro computed columns ──────────────────────────────────────────────
  const filteredActive = useMemo(() => tasks.filter(t => {
    const active = t.status !== 'done' && t.status !== 'cancelled'
    const q = search.toLowerCase()
    const matchSearch = !search || t.title.toLowerCase().includes(q) || t.assigned_name?.toLowerCase().includes(q)
    const matchPriority = !priorityFilter || (t.priority || 'medium') === priorityFilter
    const matchType = !typeFilter || (t.type || 'custom') === typeFilter
    const matchAssigned = !assignedFilter || t.assigned_to === assignedFilter
    return active && matchSearch && matchPriority && matchType && matchAssigned
  }), [tasks, search, priorityFilter, typeFilter, assignedFilter])

  const todayTasks = useMemo(
    () => filteredActive.filter(t => t.due_date?.slice(0, 10) === today),
    [filteredActive, today]
  )
  const proximosTasks = useMemo(
    () => filteredActive.filter(t => { const d = t.due_date?.slice(0, 10); return d && d > today && d <= sevenDaysAhead }),
    [filteredActive, today, sevenDaysAhead]
  )
  const fazendoTasks = useMemo(
    () => filteredActive.filter(t => t.status === 'in_progress'),
    [filteredActive]
  )
  const completedTodayTasks = useMemo(
    () => tasks.filter(t => t.status === 'done' && t.completed_at?.slice(0, 10) === today),
    [tasks, today]
  )

  // ── List view computed ───────────────────────────────────────────────────
  const filtered = useMemo(() => tasks.filter(t => {
    const q = search.toLowerCase()
    const matchSearch = !search || t.title.toLowerCase().includes(q) || t.assigned_name?.toLowerCase().includes(q)
    const matchStatus = !statusFilter || (t.status || 'pending') === statusFilter
    const matchPriority = !priorityFilter || (t.priority || 'medium') === priorityFilter
    const matchType = !typeFilter || (t.type || 'custom') === typeFilter
    const matchAssigned = !assignedFilter || t.assigned_to === assignedFilter
    return matchSearch && matchStatus && matchPriority && matchType && matchAssigned
  }), [tasks, search, statusFilter, priorityFilter, typeFilter, assignedFilter])

  const paginatedTasks = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize])
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))

  // ── Stats ────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    pending: tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled').length,
    overdue: tasks.filter(t => t.due_date && t.due_date.slice(0, 10) < today && t.status !== 'done' && t.status !== 'cancelled').length,
    doneToday: tasks.filter(t => t.status === 'done' && t.completed_at?.slice(0, 10) === today).length,
  }), [tasks, today])

  const filterCount = [priorityFilter, typeFilter, statusFilter, assignedFilter].filter(Boolean).length

  // ── Actions ──────────────────────────────────────────────────────────────
  function openNew() {
    setEditId(null)
    setForm({ ...EMPTY_FORM })
    setModalOpen(true)
  }

  function openEdit(t: Task) {
    setEditId(t.id)
    setForm({
      title: t.title, description: t.description || '', process_id: t.process_id || '', client_id: t.client_id || '',
      assigned_name: t.assigned_name || '', assigned_to: t.assigned_to || '',
      due_date: t.due_date?.slice(0, 10) || '', due_time: '', deadline_date: t.deadline_date?.slice(0, 10) || '',
      priority: (t.priority as any) || 'medium', status: (t.status as any) || 'pending',
      type: (t.type as any) || 'custom',
      location: t.location || '', all_day: !!t.all_day,
      tag_importante: t.priority === 'high', tag_urgente: t.priority === 'urgent',
      tag_recorrente: !!t.recurring, recurrence_interval: t.recurrence_interval || 'monthly',
    })
    setModalOpen(true)
  }

  async function save() {
    if (!form.title.trim()) return
    setSaving(true)
    const derivedPriority = form.tag_urgente ? 'urgent' : form.tag_importante ? 'high' : form.priority
    const dueDateFull = form.due_date
      ? (form.due_time ? `${form.due_date}T${form.due_time}:00` : form.due_date)
      : null
    const derivedClientId = form.process_id
      ? (processes.find(p => p.id === form.process_id)?.client_id || form.client_id || null)
      : (form.client_id || null)
    const { due_time, tag_importante, tag_urgente, tag_recorrente, recurrence_interval, client_id, ...rest } = form
    const payload = {
      ...rest, priority: derivedPriority,
      process_id: form.process_id || null,
      client_id: derivedClientId,
      assigned_to: form.assigned_to || null,
      assigned_name: form.assigned_name || null,
      due_date: dueDateFull,
      deadline_date: form.deadline_date || null,
      recurring: tag_recorrente,
      recurrence_interval: tag_recorrente ? recurrence_interval : null,
    }
    const previousAssignedTo = editId ? tasks.find(t => t.id === editId)?.assigned_to || null : null
    let error: any = null
    if (editId) {
      const res = await supabase.from('tasks').update(payload).eq('id', editId)
      error = res.error
    } else {
      const res = await supabase.from('tasks').insert(payload)
      error = res.error
    }
    setSaving(false)
    if (error) { alert(`Erro ao salvar tarefa: ${error.message}`); return }
    if (payload.assigned_to && payload.assigned_to !== previousAssignedTo) {
      await notifyTaskAssignment(payload.assigned_to, form.title)
    }
    setModalOpen(false)
    load(true)
  }

  async function markDone(taskId: string) {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    const { completed_at } = await markTaskDone(task)
    setTasks(prev => prev.map(t => t.id === taskId
      ? { ...t, status: 'done' as Task['status'], completed_at }
      : t
    ))
    if (task.recurring) load(true)
  }

  async function softDeleteTask(taskId: string) {
    await supabase.from('tasks').update({ deleted_at: new Date().toISOString() }).eq('id', taskId)
    setTasks(prev => prev.filter(t => t.id !== taskId))
    setDeletingTaskId(null)
  }

  function exportAll() {
    const todayStr = new Date().toISOString().split('T')[0]
    const PRIORITY_BADGE: Record<string, string> = { low: 'gray', medium: 'blue', high: 'orange', urgent: 'red' }
    const STATUS_BADGE: Record<string, string> = { pending: 'amber', in_progress: 'blue', done: 'green', cancelled: 'gray' }
    const TYPE_LABEL: Record<string, string> = { custom: 'Tarefa', deadline: 'Prazo', hearing: 'Audiência', meeting: 'Reunião', document: 'Documento' }
    const pendentes = filtered.filter(t => t.status === 'pending').length
    const vencidas = filtered.filter(t => t.due_date && String(t.due_date).slice(0, 10) < todayStr && t.status !== 'done' && t.status !== 'cancelled').length
    const concluidas = filtered.filter(t => t.status === 'done').length
    const processInfo = (t: Task) => processes.find(p => p.id === t.process_id)
    const clientName = (t: Task) => {
      const proc = processInfo(t)
      if (proc?.client_name) return proc.client_name
      return clients.find(c => c.id === t.client_id)?.name || ''
    }
    const csvContent = [
      'Título,Tipo,Prioridade,Status,Responsável,Processo,Cliente,Vencimento',
      ...filtered.map(t =>
        `"${t.title}","${TYPE_LABEL[t.type || 'custom'] ?? t.type ?? '—'}","${PRIORITY_LABELS[t.priority || 'medium']}","${TASK_STATUS_LABELS[t.status || 'pending']}","${t.assigned_name || '—'}","${processInfo(t)?.number || '—'}","${clientName(t) || '—'}","${t.due_date ? formatDate(t.due_date) : '—'}"`
      ),
    ].join('\n')
    openExportWindow({
      title: 'Relatório de Tarefas',
      filename: 'tarefas',
      stats: [
        { value: filtered.length, label: 'Total de tarefas', accent: '#2563eb' },
        { value: pendentes, label: 'Pendentes', accent: '#d97706' },
        { value: vencidas, label: 'Vencidas', accent: '#dc2626' },
        { value: concluidas, label: 'Concluídas', accent: '#16a34a' },
      ],
      columns: ['Título', 'Tipo', 'Prioridade', 'Status', 'Responsável', 'Processo', 'Cliente', 'Vencimento'],
      rows: filtered.map(t => {
        const isOverdue = !!t.due_date && String(t.due_date).slice(0, 10) < todayStr && t.status !== 'done' && t.status !== 'cancelled'
        const proc = processInfo(t)
        return [
          { text: t.title, bold: true },
          { text: TYPE_LABEL[t.type || 'custom'] ?? t.type ?? '—' },
          { text: PRIORITY_LABELS[t.priority || 'medium'], badge: PRIORITY_BADGE[t.priority || 'medium'] ?? 'blue' },
          { text: TASK_STATUS_LABELS[t.status || 'pending'], badge: STATUS_BADGE[t.status || 'pending'] ?? 'gray' },
          { text: t.assigned_name || '—' },
          { text: proc?.number || '—', sub: proc?.title },
          { text: clientName(t) || '—' },
          { text: t.due_date ? formatDate(t.due_date) : '—', danger: isOverdue },
        ]
      }),
      csvContent,
    })
  }

  // ── Quadro columns definition ────────────────────────────────────────────
  const quadroColumns = [
    { key: 'todas', label: 'Todas as tarefas', color: 'text-orange-500', dotColor: 'bg-orange-400', borderColor: 'border-orange-200 dark:border-orange-800/30', bgColor: 'bg-orange-50 dark:bg-orange-900/10', items: filteredActive, done: false },
    { key: 'hoje', label: 'Hoje', color: 'text-blue-600 dark:text-blue-400', dotColor: 'bg-blue-500', borderColor: 'border-blue-200 dark:border-blue-800/30', bgColor: 'bg-blue-50 dark:bg-blue-900/10', items: todayTasks, done: false },
    { key: 'proximos', label: 'Próximos 7 dias', color: 'text-violet-600 dark:text-violet-400', dotColor: 'bg-violet-500', borderColor: 'border-violet-200 dark:border-violet-800/30', bgColor: 'bg-violet-50 dark:bg-violet-900/10', items: proximosTasks, done: false },
    { key: 'fazendo', label: 'Fazendo', color: 'text-amber-600 dark:text-amber-400', dotColor: 'bg-amber-500', borderColor: 'border-amber-200 dark:border-amber-800/30', bgColor: 'bg-amber-50 dark:bg-amber-900/10', items: fazendoTasks, done: false },
    { key: 'concluidas', label: 'Concluídas hoje', color: 'text-emerald-600 dark:text-emerald-400', dotColor: 'bg-emerald-500', borderColor: 'border-emerald-200 dark:border-emerald-800/30', bgColor: 'bg-emerald-50 dark:bg-emerald-900/10', items: completedTodayTasks, done: true },
  ]

  return (
    <Layout
      title="Atividades"
      actions={
        <Button onClick={() => openNew()}><Plus className="w-4 h-4" /> Nova tarefa</Button>
      }
    >
      {!loading && (
        <div className="space-y-4">

          {/* ── Stats pills ── */}
          <div className="flex items-center gap-4 bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 px-5 py-3 w-fit">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900 dark:text-white leading-none">{stats.pending}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Pendentes</p>
            </div>
            <div className="w-px h-8 bg-gray-200 dark:bg-dark-600" />
            <div className="text-center">
              <p className="text-2xl font-bold text-red-500 leading-none">{stats.overdue}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Vencidas</p>
            </div>
            <div className="w-px h-8 bg-gray-200 dark:bg-dark-600" />
            <div className="text-center">
              <p className="text-2xl font-bold text-emerald-500 leading-none">{stats.doneToday}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Concluídas hoje</p>
            </div>
          </div>

          {/* ── Toolbar ── */}
          <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700">
            <div className="flex items-center gap-2 px-4 py-3 flex-wrap">

              {/* Refresh */}
              <button
                onClick={refresh}
                disabled={refreshing}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
                Atualizar
              </button>

              {/* Search */}
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                  placeholder="Buscar tarefas..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1) }}
                />
              </div>

              {/* Filter */}
              <button
                onClick={() => setFilterOpen(v => !v)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg transition-colors',
                  filterOpen || filterCount > 0
                    ? 'bg-primary-50 text-primary-600 dark:bg-primary-900/20 dark:text-primary-400'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700'
                )}
              >
                <SlidersHorizontal className="w-4 h-4" />
                Filtrar
                {filterCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-primary-600 text-white text-[9px] font-bold flex items-center justify-center">{filterCount}</span>
                )}
              </button>

              {/* Export */}
              <button onClick={exportAll} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-dark-600 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
                <Download className="w-3.5 h-3.5" /> Exportar
              </button>

              {/* View toggle */}
              <div className="ml-auto flex items-center rounded-lg border border-gray-200 dark:border-dark-600 overflow-hidden">
                <button
                  onClick={() => setViewMode('list')}
                  className={cn('p-2 transition-colors', viewMode === 'list' ? 'bg-primary-600 text-white' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-dark-700')}
                  title="Lista"
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('quadro')}
                  className={cn('p-2 transition-colors', viewMode === 'quadro' ? 'bg-primary-600 text-white' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-dark-700')}
                  title="Quadro"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Filter panel */}
            {filterOpen && (
              <div className="px-4 pb-3 pt-3 border-t border-gray-100 dark:border-dark-700 flex items-center gap-3 flex-wrap">
                <select
                  value={priorityFilter}
                  onChange={e => { setPriorityFilter(e.target.value); setPage(1) }}
                  className="text-sm border border-gray-200 dark:border-dark-600 rounded-lg px-3 py-1.5 bg-white dark:bg-dark-800 text-gray-700 dark:text-gray-300 focus:outline-none"
                >
                  <option value="">Todas as prioridades</option>
                  <option value="urgent">Urgente</option>
                  <option value="high">Alta</option>
                  <option value="medium">Média</option>
                  <option value="low">Baixa</option>
                </select>
                <select
                  value={typeFilter}
                  onChange={e => { setTypeFilter(e.target.value); setPage(1) }}
                  className="text-sm border border-gray-200 dark:border-dark-600 rounded-lg px-3 py-1.5 bg-white dark:bg-dark-800 text-gray-700 dark:text-gray-300 focus:outline-none"
                >
                  <option value="">Todos os tipos</option>
                  <option value="deadline">Prazo</option>
                  <option value="hearing">Audiência</option>
                  <option value="document">Documento</option>
                  <option value="meeting">Reunião</option>
                  <option value="custom">Geral</option>
                </select>
                {viewMode === 'list' && (
                  <select
                    value={statusFilter}
                    onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
                    className="text-sm border border-gray-200 dark:border-dark-600 rounded-lg px-3 py-1.5 bg-white dark:bg-dark-800 text-gray-700 dark:text-gray-300 focus:outline-none"
                  >
                    <option value="">Todos os status</option>
                    <option value="pending">Pendente</option>
                    <option value="in_progress">Em andamento</option>
                    <option value="done">Concluída</option>
                    <option value="cancelled">Cancelada</option>
                  </select>
                )}
                <select
                  value={assignedFilter}
                  onChange={e => { setAssignedFilter(e.target.value); setPage(1) }}
                  className="text-sm border border-gray-200 dark:border-dark-600 rounded-lg px-3 py-1.5 bg-white dark:bg-dark-800 text-gray-700 dark:text-gray-300 focus:outline-none"
                >
                  <option value="">Todos os responsáveis</option>
                  {systemUsers.map(u => (
                    <option key={u.user_id} value={u.user_id}>
                      {u.name || u.display_name} ({workloadByUser[u.user_id] || 0} aberta{(workloadByUser[u.user_id] || 0) !== 1 ? 's' : ''})
                    </option>
                  ))}
                </select>
                {filterCount > 0 && (
                  <button
                    onClick={() => { setPriorityFilter(''); setTypeFilter(''); setStatusFilter(''); setAssignedFilter('') }}
                    className="text-sm text-red-500 hover:text-red-600 transition-colors"
                  >
                    Limpar filtros
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Quadro view ── */}
          {viewMode === 'quadro' && (
            <div className="overflow-x-auto pb-2">
              <div className="flex gap-3 min-w-max">
                {quadroColumns.map(col => (
                  <div key={col.key} className="w-64 flex flex-col flex-shrink-0">
                    {/* Column header */}
                    <div className={cn('flex items-center justify-between px-3 py-2.5 rounded-t-xl border', col.bgColor, col.borderColor)}>
                      <div className="flex items-center gap-2">
                        <div className={cn('w-2 h-2 rounded-full flex-shrink-0', col.dotColor)} />
                        <span className={cn('text-xs font-bold', col.color)}>{col.label}</span>
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-white/70 dark:bg-dark-800/70', col.color)}>{col.items.length}</span>
                      </div>
                      <button
                        onClick={() => openNew()}
                        className={cn('p-1 rounded-lg hover:bg-white/60 dark:hover:bg-dark-800/60 transition-colors', col.color)}
                        title="Nova tarefa"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Cards */}
                    <div className={cn('rounded-b-xl border border-t-0 p-2 space-y-2 min-h-[120px] max-h-[calc(100vh-320px)] overflow-y-auto bg-gray-50 dark:bg-dark-900/40', col.borderColor)}>
                      {col.items.length === 0 ? (
                        <div className="flex items-center justify-center h-16 text-xs text-gray-400 dark:text-gray-600 italic">
                          Nenhuma tarefa
                        </div>
                      ) : col.items.map(task => {
                        const isOverdue = !col.done && task.due_date && task.due_date.slice(0, 10) < today
                        const initials = task.assigned_name
                          ? task.assigned_name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
                          : null
                        return (
                          <div
                            key={task.id}
                            className="group bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 shadow-sm hover:shadow-md transition-all overflow-hidden cursor-pointer"
                            onClick={() => openEdit(task)}
                          >
                            {/* Priority bar */}
                            <div className={cn('h-1', PRIORITY_BAR[task.priority || 'medium'])} />

                            <div className="p-3">
                              {/* Type icon + title + mark done circle */}
                              <div className="flex items-start gap-2 mb-2">
                                <span className="text-sm flex-shrink-0 mt-0.5">{TYPE_META[task.type || 'custom']?.icon}</span>
                                <p className={cn('text-sm font-medium text-gray-900 dark:text-white line-clamp-2 leading-snug flex-1', col.done && 'line-through text-gray-400 dark:text-gray-500')}>
                                  {task.title}
                                </p>
                                {!col.done && (
                                  <button
                                    onClick={e => { e.stopPropagation(); markDone(task.id) }}
                                    className="w-5 h-5 rounded-full border-2 border-gray-300 dark:border-dark-500 flex-shrink-0 opacity-0 group-hover:opacity-100 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all"
                                    title="Marcar como concluída"
                                  />
                                )}
                              </div>

                              {task.process_id && (
                                <button
                                  onClick={e => { e.stopPropagation(); navigate('/processos', { state: { openProcessId: task.process_id } }) }}
                                  className="flex items-center gap-1 mb-2 text-[10px] text-primary-600 dark:text-primary-400 hover:underline"
                                >
                                  <Briefcase className="w-3 h-3 flex-shrink-0" />
                                  <span className="truncate max-w-[180px]">{processes.find(p => p.id === task.process_id)?.number || 'Processo'}</span>
                                </button>
                              )}

                              {/* Footer */}
                              <div className="flex items-center justify-between" onClick={e => e.stopPropagation()}>
                                {initials ? (
                                  <div className="flex items-center gap-1.5">
                                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0">
                                      {initials}
                                    </div>
                                    <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-[60px]">
                                      {task.assigned_name?.split(' ')[0]}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="w-5 h-5 rounded-full border border-dashed border-gray-300 dark:border-dark-600 flex-shrink-0" />
                                )}

                                <div className="flex items-center gap-1.5">
                                  {task.due_date && (
                                    <span className={cn('text-[10px] font-medium', isOverdue ? 'text-red-500' : 'text-gray-400 dark:text-gray-500')}>
                                      {formatDate(task.due_date)}
                                    </span>
                                  )}
                                  {!col.done && (
                                    deletingTaskId === task.id ? (
                                      <div className="flex items-center gap-1">
                                        <button onClick={() => setDeletingTaskId(null)} className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors">Não</button>
                                        <button onClick={() => softDeleteTask(task.id)} className="text-[10px] font-semibold text-white bg-red-500 hover:bg-red-600 px-1.5 py-0.5 rounded-lg transition-colors">Excluir</button>
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
                          </div>
                        )
                      })}

                      {/* Add task */}
                      <button
                        onClick={() => openNew()}
                        className="w-full flex items-center gap-1.5 px-3 py-2 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white/60 dark:hover:bg-dark-800/60 rounded-lg transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        Adicionar tarefa
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── List view ── */}
          {viewMode === 'list' && (
            <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-dark-700 bg-gray-50 dark:bg-dark-800/50">
                      <th className="w-8 px-3 py-3">
                        <input type="checkbox" className="w-3.5 h-3.5 rounded border-gray-300 accent-primary-600" onChange={() => {}} />
                      </th>
                      <th className="w-8 px-2 py-3"></th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Tarefa</th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Processo</th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Tipo</th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Prioridade</th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Vencimento</th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Responsável</th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</th>
                      <th className="px-3 py-3 w-20"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-dark-700">
                    {paginatedTasks.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-12 text-center text-gray-400 dark:text-gray-500 text-sm">
                          Nenhuma tarefa encontrada
                        </td>
                      </tr>
                    ) : paginatedTasks.map(t => {
                      const isLate = t.due_date && t.due_date.slice(0, 10) < today && t.status !== 'done'
                      const isSelected = selectedRows.has(t.id)
                      const initials = t.assigned_name?.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() || ''
                      return (
                        <tr
                          key={t.id}
                          className={cn('group hover:bg-gray-50 dark:hover:bg-dark-700/30 transition-colors cursor-pointer', isSelected && 'bg-blue-50/50 dark:bg-blue-900/10')}
                          onClick={() => openEdit(t)}
                        >
                          <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => setSelectedRows(s => { const n = new Set(s); n.has(t.id) ? n.delete(t.id) : n.add(t.id); return n })}
                              className="w-3.5 h-3.5 rounded border-gray-300 accent-primary-600"
                            />
                          </td>
                          <td className="px-2 py-3" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => t.status !== 'done' && markDone(t.id)}
                              className={cn('w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all', t.status === 'done' ? 'border-green-500 bg-green-500' : 'border-gray-300 dark:border-dark-500 hover:border-primary-500')}
                            >
                              {t.status === 'done' && <Check className="w-2.5 h-2.5 text-white" />}
                            </button>
                          </td>
                          <td className="px-3 py-3 max-w-xs">
                            <span className={cn('font-semibold text-gray-900 dark:text-white', t.status === 'done' && 'line-through text-gray-400 dark:text-gray-500')}>
                              {t.title}
                            </span>
                          </td>
                          <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                            {t.process_id ? (
                              <button
                                onClick={() => navigate('/processos', { state: { openProcessId: t.process_id } })}
                                className="flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 hover:underline"
                              >
                                <Briefcase className="w-3 h-3 flex-shrink-0" />
                                {processes.find(p => p.id === t.process_id)?.number || 'Processo'}
                              </button>
                            ) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                          </td>
                          <td className="px-3 py-3">
                            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', TYPE_META[t.type || 'custom']?.chip)}>
                              {TYPE_META[t.type || 'custom']?.icon} {TYPE_META[t.type || 'custom']?.label}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', PRIORITY_BADGE[t.priority || 'medium'])}>
                              {PRIORITY_LABELS[t.priority || 'medium']}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            {t.due_date ? (
                              <span className={cn('text-sm font-medium', isLate ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300')}>
                                {formatDate(t.due_date)}
                              </span>
                            ) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                          </td>
                          <td className="px-3 py-3">
                            {t.assigned_name ? (
                              <div className="flex items-center gap-1.5">
                                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-[10px] font-bold">
                                  {initials}
                                </div>
                                <span className="text-xs text-gray-600 dark:text-gray-400 truncate max-w-[80px]">{t.assigned_name.split(' ')[0]}</span>
                              </div>
                            ) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                          </td>
                          <td className="px-3 py-3">
                            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
                              t.status === 'done' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                              t.status === 'in_progress' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                              t.status === 'cancelled' ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' :
                              'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                            )}>
                              {TASK_STATUS_LABELS[t.status || 'pending']}
                            </span>
                          </td>
                          <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                            {deletingTaskId === t.id ? (
                              <div className="flex items-center gap-1">
                                <button onClick={() => setDeletingTaskId(null)} className="text-[10px] text-gray-400 hover:text-gray-600 px-1 py-1 rounded transition-colors">Não</button>
                                <button onClick={() => softDeleteTask(t.id)} className="text-[10px] font-semibold text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded-lg transition-colors">Excluir</button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setDeletingTaskId(t.id)}
                                className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                                title="Excluir tarefa"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-dark-700 text-sm text-gray-500 dark:text-gray-400">
                <div className="flex items-center gap-2">
                  <span>Registros por página</span>
                  <select
                    value={pageSize}
                    onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
                    className="border border-gray-200 dark:border-dark-600 rounded px-2 py-1 text-sm bg-white dark:bg-dark-800 text-gray-700 dark:text-gray-300"
                  >
                    {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <span>{filtered.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} de {filtered.length}</span>
                  <button onClick={() => setPage(1)} disabled={page === 1} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-dark-700 disabled:opacity-30">«</button>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-dark-700 disabled:opacity-30">
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-dark-700 disabled:opacity-30">
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-dark-700 disabled:opacity-30">»</button>
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ── Form Modal ── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Editar Tarefa' : 'Criar nova tarefa'} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Processo ou caso</label>
              <Select value={form.process_id} onChange={e => setForm({ ...form, process_id: e.target.value })}>
                <option value="">Nome do cliente ou número do processo</option>
                {processes.map(p => <option key={p.id} value={p.id}>{p.number} — {p.title}</option>)}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cliente</label>
              <Select
                value={form.client_id}
                onChange={e => setForm({ ...form, client_id: e.target.value })}
                disabled={!!form.process_id}
              >
                <option value="">{form.process_id ? 'Definido pelo processo' : 'Vincular a um cliente (opcional)'}</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Responsável <span className="text-red-500">*</span></label>
            <Select
              value={form.assigned_to}
              onChange={e => {
                const user = systemUsers.find(u => u.user_id === e.target.value)
                setForm({ ...form, assigned_to: e.target.value, assigned_name: user ? (user.name || user.display_name || '') : '' })
              }}
            >
              <option value="">Quem vai trabalhar nesta tarefa?</option>
              {systemUsers.map(u => (
                <option key={u.user_id} value={u.user_id}>
                  {u.name || u.display_name} — {u.role === 'admin' ? 'Administrador' : u.role === 'lawyer' ? 'Advogado' : u.role === 'intern' ? 'Estagiário' : u.role === 'financial' ? 'Financeiro' : u.role}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tarefa <span className="text-red-500">*</span></label>
            <div className="flex gap-2">
              <div className="flex-1">
                <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="O que essa pessoa irá fazer?" />
              </div>
              <Select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="w-44 flex-shrink-0">
                <option value="custom">Geral</option>
                <option value="deadline">Prazo</option>
                <option value="hearing">Audiência</option>
                <option value="document">Documento</option>
                <option value="meeting">Reunião</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Data</label>
              <Input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Hora</label>
              <Input type="time" value={form.due_time} onChange={e => setForm({ ...form, due_time: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Prazo fatal</label>
              <Input type="date" value={form.deadline_date} onChange={e => setForm({ ...form, deadline_date: e.target.value })} />
            </div>
          </div>

          <div className="flex items-center gap-5">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.all_day}
                onChange={e => setForm({ ...form, all_day: e.target.checked })}
                className="w-3.5 h-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-xs text-gray-600 dark:text-gray-400">Dia inteiro</span>
            </label>
          </div>

          <div className="hidden">
            <Select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              <option value="pending">Pendente</option>
              <option value="in_progress">Em andamento</option>
              <option value="done">Concluída</option>
              <option value="cancelled">Cancelada</option>
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Local</label>
            <Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Local do evento" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descrição</label>
            <Textarea label="" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Adicione um comentário..." />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {[
              { key: 'tag_importante', label: 'Importante' },
              { key: 'tag_urgente', label: 'Urgente' },
              { key: 'tag_recorrente', label: 'Recorrente' },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={(form as any)[key]}
                  onChange={e => setForm({ ...form, [key]: e.target.checked })}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-xs text-gray-600 dark:text-gray-400">{label}</span>
              </label>
            ))}
            {form.tag_recorrente && (
              <Select
                value={form.recurrence_interval}
                onChange={e => setForm({ ...form, recurrence_interval: e.target.value })}
                className="w-48"
              >
                {Object.entries(RECURRENCE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            )}
          </div>
          {form.tag_recorrente && (
            <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">
              Ao concluir esta tarefa, uma próxima ocorrência será criada automaticamente na data seguinte.
            </p>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100 dark:border-dark-700">
          <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
          <Button onClick={save} loading={saving}>{editId ? 'Salvar' : 'Criar nova tarefa'}</Button>
        </div>
      </Modal>
    </Layout>
  )
}

