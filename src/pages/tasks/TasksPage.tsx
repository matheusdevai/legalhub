import { usePageLoadingState } from '@/contexts/PageLoadingContext'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Plus, Search, Check, Trash2,
  CheckCircle2, User, ChevronDown, X as XIcon, Briefcase,
  ArrowLeft, ArrowRight, Target, LayoutGrid, List, RefreshCw, SlidersHorizontal, Download,
  AlarmClock, Gavel, FileText, Users, CircleDot,
  Flame, Zap, CalendarClock, Inbox, PartyPopper,
} from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Button, Modal, Input, Select, Textarea, Spinner } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { Task, Process, Client, Profile, Colaborador } from '@/types'
import { formatDate, PRIORITY_LABELS, TASK_STATUS_LABELS } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { openExportWindow } from '@/lib/exportUtils'
import { markTaskDone, notifyTaskAssignment, displayTaskDescription } from '@/lib/taskActions'
import { withErrorFeedback } from '@/lib/errorFeedback'
import { toast } from '@/components/ui/Toast'
import { confirmDialog } from '@/components/ui/ConfirmDialog'

type TaskForm = {
  title: string; description: string; process_id: string; client_id: string;
  assigned_name: string; assigned_to: string;
  due_date: string; due_time: string; deadline_date: string;
  priority: string; status: string; type: string;
  location: string;
  show_agenda: boolean; inform_end: boolean; all_day: boolean;
  tag_importante: boolean; tag_urgente: boolean; tag_futura: boolean;
  tag_recorrente: boolean; tag_privada: boolean; tag_retroativa: boolean;
  recurrence_interval: 'weekly' | 'monthly' | 'yearly'; recurrence_end_date: string;
}
const EMPTY_FORM: TaskForm = {
  title: '', description: '', process_id: '', client_id: '', assigned_name: '', assigned_to: '',
  due_date: '', due_time: '', deadline_date: '', priority: 'medium', status: 'pending', type: 'custom',
  location: '',
  show_agenda: false, inform_end: false, all_day: false,
  tag_importante: false, tag_urgente: false, tag_futura: false,
  tag_recorrente: false, tag_privada: false, tag_retroativa: false,
  recurrence_interval: 'monthly', recurrence_end_date: '',
}

type ProcessForm = {
  number: string; title: string; client_id: string; client_name: string; area: string;
  type: string; status: string; priority: string; assigned_lawyer: string; court: string;
  judge: string; counterparty: string; description: string; modalidade: string;
  data_protocolo: string; next_deadline: string; colaborador_id: string;
  grupo_acao: string; fase: string; etapa: string;
  numero_protocolo: string; processo_originario: string; pasta_caso: string;
  data_requerimento: string; valor_causa: string; valor_honorarios: string;
  percentual_honorarios: string; contingenciamento: string;
}
const PROCESS_EMPTY_FORM: ProcessForm = {
  number: '', title: '', client_id: '', client_name: '', area: '', type: '',
  status: 'active', priority: 'medium', assigned_lawyer: '',
  court: '', judge: '', counterparty: '', description: '', modalidade: '',
  data_protocolo: '', next_deadline: '', colaborador_id: '',
  grupo_acao: '', fase: 'NEGOCIAÇÃO', etapa: 'ANÁLISE DO CASO',
  numero_protocolo: '', processo_originario: '', pasta_caso: '',
  data_requerimento: '', valor_causa: '', valor_honorarios: '',
  percentual_honorarios: '', contingenciamento: '',
}
const GRUPOS_ACAO = ['Cível', 'Criminal', 'Trabalhista', 'Tributário', 'Administrativo', 'Família', 'Previdenciário', 'Empresarial', 'Imobiliário', 'Outro']
const TIPOS_ACAO: Record<string, string[]> = {
  'Cível': ['Alíquota zero', 'Contratos bancários', 'Indenização por danos morais', 'Revisão contratual', 'Cobrança', 'Outro'],
  'Criminal': ['Pena privativa de liberdade', 'Habeas corpus', 'Tráfico de drogas', 'Furto', 'Roubo', 'Outro'],
  'Trabalhista': ['Rescisão indireta', 'Horas extras', 'Assédio moral', 'FGTS', 'Outro'],
  'Tributário': ['Execução fiscal', 'Mandado de segurança', 'Restituição de tributos', 'Outro'],
  'Administrativo': ['Cargo - vereador', 'Licitação', 'Concurso público', 'Outro'],
  'Família': ['Divórcio', 'Guarda', 'Alimentos', 'Inventário', 'Outro'],
  'Previdenciário': [
    'Aposentadoria por Idade', 'Aposentadoria por Tempo de Contribuição', 'Aposentadoria por Invalidez',
    'Aposentadoria Especial', 'Aposentadoria da Pessoa com Deficiência', 'Auxílio-Doença', 'Auxílio-Acidente',
    'BPC/LOAS', 'Pensão por Morte', 'Auxílio-Reclusão', 'Salário-Maternidade', 'Revisão de Benefício', 'Outro',
  ],
  'Empresarial': ['Recuperação judicial', 'Dissolução societária', 'Outro'],
  'Imobiliário': ['Usucapião', 'Despejo', 'Compra e venda', 'Outro'],
  'Outro': ['Outro'],
}
const FASES = ['NEGOCIAÇÃO', 'CONHECIMENTO', 'RECURSAL', 'EXECUÇÃO', 'ENCERRADO']
const CONTINGENCIAMENTOS = ['Remoto', 'Possível', 'Provável', 'Quase certo']

const PRIORITY_BORDER: Record<string, string> = {
  urgent: 'border-red-500',
  high: 'border-orange-400',
  medium: 'border-yellow-300 dark:border-yellow-500/40',
  low: 'border-transparent',
}
function daysOverdue(dueDate: string, today: string): number {
  const a = new Date(`${today}T00:00:00`).getTime()
  const b = new Date(`${dueDate.slice(0, 10)}T00:00:00`).getTime()
  return Math.max(1, Math.round((a - b) / 86400000))
}
const PRIORITY_BADGE: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  low: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}
const TYPE_META: Record<string, { label: string; icon: React.ElementType; chip: string }> = {
  deadline: { label: 'Prazo', icon: AlarmClock, chip: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' },
  hearing: { label: 'Audiência', icon: Gavel, chip: 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400' },
  document: { label: 'Documento', icon: FileText, chip: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' },
  meeting: { label: 'Reunião', icon: Users, chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' },
  custom: { label: 'Geral', icon: CircleDot, chip: 'bg-gray-100 text-gray-600 dark:bg-dark-700 dark:text-gray-300' },
}

// ─── Quadro (Kanban) — mesmo visual/rótulos do Quadro do Dashboard ──────────
const TYPE_EMOJI: Record<string, string> = {
  deadline: '⚖️', hearing: '🏛️', meeting: '🤝', document: '📄', custom: '✓',
}
const PRIORITY_STRIPE: Record<string, string> = {
  urgent: 'bg-red-500', high: 'bg-orange-400', medium: 'bg-sky-400', low: 'bg-slate-300 dark:bg-slate-600',
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
    const timePart = String(task.due_date).includes('T') ? String(task.due_date).split('T')[1]?.slice(0, 5) : null
    return { label: timePart ? `Hoje ${timePart}` : 'Hoje', isOverdue: false }
  }
  if (due < today) return { label: timeAgo(task.due_date), isOverdue: true }
  return { label: formatDate(task.due_date), isOverdue: false }
}

function TaskCard({ task, done, deletingTaskId, dragging, onOpen, onComplete, onDeleteRequest, onDeleteConfirm, onDeleteCancel, onDragStart, onDragEnd }: {
  task: Task; done?: boolean; deletingTaskId: string | null; dragging?: boolean
  onOpen: (t: Task) => void; onComplete: (t: Task) => void
  onDeleteRequest: (id: string) => void; onDeleteConfirm: (id: string) => void; onDeleteCancel: () => void
  onDragStart?: (e: React.DragEvent, id: string) => void; onDragEnd?: () => void
}) {
  const { label, isOverdue } = taskTime(task)
  const initials = (task.assigned_name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
  const icon = TYPE_EMOJI[task.type || 'custom'] || '✓'
  const barColor = PRIORITY_STRIPE[task.priority || 'medium'] || PRIORITY_STRIPE.medium
  return (
    <div
      draggable={!done}
      onDragStart={e => onDragStart?.(e, task.id)}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(task)}
      className={cn(
        'relative bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-600 p-3 shadow-sm hover:shadow-md transition-all group overflow-hidden cursor-pointer',
        !done && 'active:cursor-grabbing',
        dragging && 'opacity-40'
      )}
    >
      <div className={cn('absolute top-0 left-0 right-0 h-0.5', barColor)} />
      <div className="flex items-start justify-between gap-2 mt-0.5 mb-1.5">
        <div className="flex items-start gap-1.5 flex-1 min-w-0">
          <span className="text-xs flex-shrink-0 mt-0.5 leading-none">{icon}</span>
          <p className={cn('text-sm font-semibold text-gray-900 dark:text-white leading-snug line-clamp-2', done && 'line-through text-gray-400 dark:text-gray-500')}>{task.title}</p>
        </div>
        {!done && (
          <button
            onClick={e => { e.stopPropagation(); onComplete(task) }}
            title="Concluir tarefa"
            className="flex-shrink-0 w-5 h-5 mt-0.5 rounded-full border-2 border-gray-300 dark:border-dark-500 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all opacity-0 group-hover:opacity-100"
          />
        )}
        {done && <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />}
      </div>
      {task.description && (
        <p className="text-[11px] text-gray-400 dark:text-gray-500 ml-5 mb-1.5 line-clamp-1">{displayTaskDescription(task.description)}</p>
      )}
      <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-gray-100 dark:border-dark-700/50">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-full bg-gray-200 dark:bg-dark-600 flex items-center justify-center text-[9px] font-bold text-gray-500 dark:text-gray-400">
            {initials}
          </div>
          {task.priority && (
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-semibold', PRIORITY_BADGE[task.priority || 'medium'])}>
              {PRIORITY_LABELS[task.priority || 'medium']}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
          {label && (
            <span className={cn('text-[10px] font-medium', isOverdue && !done ? 'text-red-500' : 'text-gray-400 dark:text-gray-500')}>
              {label}
            </span>
          )}
          {!done && (
            deletingTaskId === task.id ? (
              <div className="flex items-center gap-1">
                <button onClick={onDeleteCancel} className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors">Não</button>
                <button onClick={() => onDeleteConfirm(task.id)} className="text-[10px] font-semibold text-white bg-red-500 hover:bg-red-600 px-1.5 py-0.5 rounded-lg transition-colors">Excluir</button>
              </div>
            ) : (
              <button
                onClick={() => onDeleteRequest(task.id)}
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

function TaskRow({ task, today, done, deletingTaskId, justCompleted, onOpen, onComplete, onDeleteRequest, onDeleteConfirm, onDeleteCancel }: {
  task: Task; today: string; done: boolean; deletingTaskId: string | null; justCompleted?: boolean
  onOpen: (t: Task) => void; onComplete: (t: Task) => void
  onDeleteRequest: (id: string) => void; onDeleteConfirm: (id: string) => void; onDeleteCancel: () => void
}) {
  const isOverdue = !done && task.due_date && task.due_date.slice(0, 10) < today
  const initials = task.assigned_name ? task.assigned_name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() : null
  const TypeIcon = TYPE_META[task.type || 'custom']?.icon || CircleDot
  return (
    <div
      className={cn(
        'group flex items-center gap-3 pl-2.5 pr-3 py-2.5 rounded-xl border-l-[3px] hover:bg-gray-50 dark:hover:bg-dark-700/40 transition-colors duration-300 cursor-pointer',
        isOverdue ? 'border-red-500 bg-red-50/40 dark:bg-red-900/10' : PRIORITY_BORDER[task.priority || 'medium'],
        justCompleted && 'bg-emerald-50/70 dark:bg-emerald-900/15'
      )}
      onClick={() => onOpen(task)}
    >
      <button
        onClick={e => { e.stopPropagation(); if (!done) onComplete(task) }}
        className={cn('w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-300',
          done ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300 dark:border-dark-500 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20')}
        title={done ? 'Concluída' : 'Marcar como concluída'}
      >
        {done && <Check className={cn('w-3 h-3 text-white', justCompleted && 'animate-check-pop')} />}
      </button>

      <div className={cn('w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0', TYPE_META[task.type || 'custom']?.chip)}>
        <TypeIcon className="w-3.5 h-3.5" />
      </div>

      <p className={cn('flex-1 min-w-0 text-sm font-medium text-gray-900 dark:text-white truncate transition-colors duration-300', done && 'line-through text-gray-400 dark:text-gray-500')}>
        {task.title}
      </p>

      {task.due_date && (
        isOverdue ? (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 rounded-full flex-shrink-0">
            <AlarmClock className="w-3 h-3" /> {daysOverdue(task.due_date, today)}d atrasada
          </span>
        ) : (
          <span className="text-xs font-medium text-gray-400 dark:text-gray-500 flex-shrink-0">
            {formatDate(task.due_date)}
          </span>
        )
      )}

      {initials ? (
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0" title={task.assigned_name || ''}>
          {initials}
        </div>
      ) : (
        <div className="w-6 h-6 rounded-full border border-dashed border-gray-300 dark:border-dark-600 flex-shrink-0" />
      )}

      <div className="flex-shrink-0" onClick={e => e.stopPropagation()}>
        {deletingTaskId === task.id ? (
          <div className="flex items-center gap-1">
            <button onClick={onDeleteCancel} className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors">Não</button>
            <button onClick={() => onDeleteConfirm(task.id)} className="text-[11px] font-semibold text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded-lg transition-colors">Excluir</button>
          </div>
        ) : (
          <button
            onClick={() => onDeleteRequest(task.id)}
            className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
            title="Excluir tarefa"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
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
  const [recurringTemplates, setRecurringTemplates] = useState<Task[]>([])
  const [recurringModalOpen, setRecurringModalOpen] = useState(false)
  const [processes, setProcesses] = useState<Process[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [systemUsers, setSystemUsers] = useState<Profile[]>([])
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [loading, setLoading] = usePageLoadingState()
  const [refreshing, setRefreshing] = useState(false)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [assignedFilter, setAssignedFilter] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)

  const [viewMode, setViewMode] = useState<'list' | 'foco' | 'quadro'>('quadro')
  const [focoTab, setFocoTab] = useState<'atrasadas' | 'fazendo' | 'agendadas' | 'sem_data' | 'concluidas'>('atrasadas')
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null)
  const [justCompletedId, setJustCompletedId] = useState<string | null>(null)
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<TaskForm>(EMPTY_FORM)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [completionModal, setCompletionModal] = useState<{ taskId: string; taskTitle: string; taskType: string; step: 'ask' | 'process' } | null>(null)
  const [completionForm, setCompletionForm] = useState<ProcessForm>({ ...PROCESS_EMPTY_FORM })

  const [pageSize, setPageSize] = useState(50)
  const [page, setPage] = useState(1)
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())

  const today = new Date().toISOString().slice(0, 10)
  const sevenDaysAhead = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)

  async function load(silent = false) {
    if (!silent) setLoading(true)
    const [{ data: t }, { data: p }, { data: c }, { data: usr }, { data: col }] = await Promise.all([
      supabase.from('tasks').select('*').is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('processes').select('id,number,title,modalidade,client_id').is('deleted_at', null).order('title'),
      supabase.from('clients').select('id,name,colaborador_id').is('deleted_at', null).order('name'),
      supabase.from('profiles').select('id,user_id,name,display_name,role').order('name'),
      supabase.from('colaboradores').select('*').eq('ativo', true).order('nome'),
    ])
    const allTasks = (t || []) as Task[]
    let taskList = allTasks.filter(task => !task.recurring)
    if (profile?.role === 'lawyer' || profile?.role === 'intern') {
      taskList = taskList.filter(task => task.assigned_to === profile.user_id)
    }
    setTasks(taskList)
    setRecurringTemplates(allTasks.filter(task => task.recurring))
    setProcesses((p || []) as Process[])
    setClients((c || []) as Client[])
    setSystemUsers((usr || []) as Profile[])
    setColaboradores((col || []) as Colaborador[])
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

  const teamWorkload = useMemo(() => {
    const withLoad = systemUsers
      .map(user => ({ user, count: workloadByUser[user.user_id] || 0 }))
      .filter(u => u.count > 0)
      .sort((a, b) => b.count - a.count)
    const max = Math.max(...withLoad.map(u => u.count), 1)
    return withLoad.map(u => ({ ...u, pct: Math.max(8, Math.round((u.count / max) * 100)) }))
  }, [systemUsers, workloadByUser])

  // ── Modo Foco: categorização mutuamente exclusiva ────────────────────────
  const matchesFilters = (t: Task) => {
    const q = search.toLowerCase()
    const matchSearch = !search || t.title.toLowerCase().includes(q) || t.assigned_name?.toLowerCase().includes(q)
    const matchPriority = !priorityFilter || (t.priority || 'medium') === priorityFilter
    const matchType = !typeFilter || (t.type || 'custom') === typeFilter
    const matchAssigned = !assignedFilter || t.assigned_to === assignedFilter
    return matchSearch && matchPriority && matchType && matchAssigned
  }

  const filteredActive = useMemo(() => tasks.filter(t =>
    t.status !== 'done' && t.status !== 'cancelled' && matchesFilters(t)
  ), [tasks, search, priorityFilter, typeFilter, assignedFilter])

  // Agenda de hoje — inclui concluídas de hoje, para o anel de progresso
  const todayAllTasks = useMemo(
    () => tasks.filter(t => t.due_date?.slice(0, 10) === today && t.status !== 'cancelled' && matchesFilters(t)),
    [tasks, search, priorityFilter, typeFilter, assignedFilter, today]
  )
  const todayOpenTasks = useMemo(() => todayAllTasks.filter(t => t.status !== 'done'), [todayAllTasks])
  const todayDoneTasks = useMemo(() => todayAllTasks.filter(t => t.status === 'done'), [todayAllTasks])
  const todayProgressPct = todayAllTasks.length > 0 ? Math.round((todayDoneTasks.length / todayAllTasks.length) * 100) : 0

  // Tudo que não é de hoje, sem sobreposição entre categorias
  const overdueTasks = useMemo(
    () => filteredActive.filter(t => t.due_date && t.due_date.slice(0, 10) < today),
    [filteredActive, today]
  )
  const fazendoTasks = useMemo(
    () => filteredActive.filter(t => t.status === 'in_progress' && t.due_date?.slice(0, 10) !== today && !(t.due_date && t.due_date.slice(0, 10) < today)),
    [filteredActive, today]
  )
  const proximosTasks = useMemo(
    () => filteredActive.filter(t => t.status !== 'in_progress' && t.due_date && t.due_date.slice(0, 10) > today),
    [filteredActive, today]
  )
  const semDataTasks = useMemo(
    () => filteredActive.filter(t => t.status !== 'in_progress' && !t.due_date),
    [filteredActive]
  )
  const completedTodayTasks = useMemo(
    () => tasks.filter(t => t.status === 'done' && t.completed_at?.slice(0, 10) === today),
    [tasks, today]
  )
  // Paleta apoiada em primary-* (marca do sistema); vermelho/verde ficam reservados
  // só para os estados semânticos reais (atrasado = alerta, concluído = sucesso).
  const focoTabs = [
    { key: 'atrasadas' as const, label: 'Atrasadas', icon: Flame, items: overdueTasks, color: 'text-red-600 dark:text-red-400', activeColor: 'bg-red-600' },
    { key: 'fazendo' as const, label: 'Fazendo', icon: Zap, items: fazendoTasks, color: 'text-primary-600 dark:text-primary-400', activeColor: 'bg-primary-600' },
    { key: 'agendadas' as const, label: 'Agendadas', icon: CalendarClock, items: proximosTasks, color: 'text-primary-500 dark:text-primary-400', activeColor: 'bg-primary-500' },
    { key: 'sem_data' as const, label: 'Sem data', icon: Inbox, items: semDataTasks, color: 'text-gray-500 dark:text-gray-400', activeColor: 'bg-gray-500' },
    { key: 'concluidas' as const, label: 'Concluídas hoje', icon: CheckCircle2, items: completedTodayTasks, color: 'text-emerald-600 dark:text-emerald-400', activeColor: 'bg-emerald-600', done: true },
  ]
  const activeFocoTab = focoTabs.find(t => t.key === focoTab) || focoTabs[0]

  // ── Quadro (Kanban) — mesmas colunas do Quadro do Dashboard ─────────────
  const quadroBase = useMemo(
    () => tasks.filter(t => (t.status === 'pending' || t.status === 'in_progress') && matchesFilters(t)),
    [tasks, search, priorityFilter, typeFilter, assignedFilter]
  )
  const quadroToday = useMemo(() => quadroBase.filter(t => t.due_date?.slice(0, 10) === today), [quadroBase, today])
  const quadroProximos = useMemo(
    () => quadroBase.filter(t => t.due_date && t.due_date.slice(0, 10) > today && t.due_date.slice(0, 10) <= sevenDaysAhead),
    [quadroBase, today, sevenDaysAhead]
  )
  const quadroFazendo = useMemo(() => quadroBase.filter(t => t.status === 'in_progress'), [quadroBase])
  const quadroConcluidas = useMemo(() => completedTodayTasks.filter(matchesFilters), [completedTodayTasks, search, priorityFilter, typeFilter, assignedFilter])
  const quadroColumns = [
    { key: 'todas', label: 'Todas as tarefas', color: 'text-orange-500', dotColor: 'bg-orange-400', items: quadroBase },
    { key: 'hoje', label: 'Hoje', color: 'text-blue-600 dark:text-blue-400', dotColor: 'bg-blue-500', items: quadroToday },
    { key: 'proximos', label: 'Próximos 7 dias', color: 'text-violet-600 dark:text-violet-400', dotColor: 'bg-violet-500', items: quadroProximos },
    { key: 'fazendo', label: 'Fazendo', color: 'text-amber-600 dark:text-amber-400', dotColor: 'bg-amber-500', items: quadroFazendo },
    { key: 'concluidas', label: 'Concluídas hoje', color: 'text-emerald-600 dark:text-emerald-400', dotColor: 'bg-emerald-500', items: quadroConcluidas, done: true },
  ]

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
      location: t.location || '', show_agenda: false, inform_end: false, all_day: !!t.all_day,
      tag_importante: t.priority === 'high', tag_urgente: t.priority === 'urgent',
      tag_futura: false, tag_recorrente: !!t.recurring, tag_privada: false, tag_retroativa: false,
      recurrence_interval: t.recurrence_interval || 'monthly', recurrence_end_date: t.recurrence_end_date || '',
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
    const { due_time, show_agenda, inform_end,
      tag_importante, tag_urgente, tag_futura, tag_recorrente, tag_privada, tag_retroativa,
      recurrence_interval, recurrence_end_date, client_id,
      ...rest } = form
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
      recurrence_end_date: tag_recorrente ? (recurrence_end_date || null) : null,
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
    if (error) { toast(`Erro ao salvar tarefa: ${error.message}`, 'error'); return }
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
    setJustCompletedId(taskId)
    setTimeout(() => setJustCompletedId(prev => prev === taskId ? null : prev), 700)
    if (task.recurring) load(true)
  }

  // ── Quadro — mover tarefa entre colunas por drag-and-drop ───────────────
  async function moveTaskToColumn(taskId: string, columnKey: string) {
    const task = tasks.find(t => t.id === taskId)
    if (!task || task.status === 'done') return
    if (columnKey === 'concluidas') { await markDone(taskId); return }

    let due_date = task.due_date
    let status = task.status
    if (columnKey === 'hoje') due_date = today
    else if (columnKey === 'proximos') due_date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
    else if (columnKey === 'fazendo') status = 'in_progress'
    else if (columnKey === 'todas') {
      due_date = null
      if (status === 'in_progress') status = 'pending'
    }
    if (due_date === task.due_date && status === task.status) return

    const { error } = await withErrorFeedback(
      supabase.from('tasks').update({ due_date, status }).eq('id', taskId),
      'Erro ao mover tarefa'
    )
    if (error) return
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, due_date, status } : t))
  }

  async function softDeleteTask(taskId: string) {
    await withErrorFeedback(supabase.from('tasks').update({ deleted_at: new Date().toISOString() }).eq('id', taskId), 'Erro ao excluir tarefa')
    setTasks(prev => prev.filter(t => t.id !== taskId))
    setDeletingTaskId(null)
  }

  async function stopRecurrence(templateId: string) {
    await withErrorFeedback(supabase.from('tasks').update({ recurring: false }).eq('id', templateId), 'Erro ao encerrar recorrência')
    setRecurringTemplates(prev => prev.filter(t => t.id !== templateId))
  }

  function requestComplete(t: Task) {
    const match = t.description?.match(/^client_id:([a-f0-9-]{36})/)
    const preClient = match ? clients.find(c => c.id === match[1]) : null
    const matchOption = (value: string | null | undefined, options: string[]) => {
      const v = value?.trim().toLowerCase()
      return (v && options.find(o => o.toLowerCase() === v)) || ''
    }
    const grupoAcao = matchOption((preClient as any)?.area_direito, GRUPOS_ACAO)
    const tipoAcao = grupoAcao ? matchOption((preClient as any)?.beneficio_previdenciario, TIPOS_ACAO[grupoAcao] || []) : ''
    setCompletionModal({ taskId: t.id, taskTitle: t.title, taskType: t.type || 'custom', step: 'ask' })
    setCompletionForm({
      ...PROCESS_EMPTY_FORM,
      client_id: preClient?.id || '',
      client_name: preClient?.name || '',
      colaborador_id: preClient?.colaborador_id || '',
      grupo_acao: grupoAcao,
      type: tipoAcao,
      data_protocolo: new Date().toISOString().slice(0, 10),
    })
  }

  async function completeWithoutProcess() {
    if (!completionModal) return
    await markDone(completionModal.taskId)
    setCompletionModal(null)
  }

  async function confirmCompletion() {
    if (!completionModal) return
    const selectedClient = clients.find(c => c.id === completionForm.client_id)
    const { error: taskErr } = await withErrorFeedback(supabase.from('tasks').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', completionModal.taskId), 'Erro ao concluir tarefa')
    if (taskErr) return
    const payload: any = {
      ...completionForm,
      title: completionForm.title.trim() || completionForm.type || selectedClient?.name || completionModal.taskTitle,
      area: completionForm.area || completionForm.grupo_acao || '',
      client_name: selectedClient?.name || completionForm.client_name || '',
      colaborador_id: completionForm.colaborador_id || null,
      data_protocolo: completionForm.data_protocolo || completionForm.data_requerimento || null,
      data_requerimento: completionForm.data_requerimento || null,
      next_deadline: completionForm.next_deadline || null,
      modalidade: completionForm.modalidade || null,
    }
    if (!payload.client_id) delete payload.client_id
    const { error } = await supabase.from('processes').insert(payload)
    if (error) { toast(`Erro ao criar processo: ${error.message}`, 'error'); return }
    setCompletionModal(null)
    load(true)
  }

  const TYPE_LABEL: Record<string, string> = { custom: 'Tarefa', deadline: 'Prazo', hearing: 'Audiência', meeting: 'Reunião', document: 'Documento' }
  const taskProcessInfo = (t: Task) => processes.find(p => p.id === t.process_id)
  const taskClientName = (t: Task) => {
    const proc = taskProcessInfo(t)
    if (proc?.client_name) return proc.client_name
    return clients.find(c => c.id === t.client_id)?.name || ''
  }
  function buildTasksCsv(list: Task[]): string {
    return [
      'Título,Tipo,Prioridade,Status,Responsável,Processo,Cliente,Vencimento',
      ...list.map(t =>
        `"${t.title}","${TYPE_LABEL[t.type || 'custom'] ?? t.type ?? '—'}","${PRIORITY_LABELS[t.priority || 'medium']}","${TASK_STATUS_LABELS[t.status || 'pending']}","${t.assigned_name || '—'}","${taskProcessInfo(t)?.number || '—'}","${taskClientName(t) || '—'}","${t.due_date ? formatDate(t.due_date) : '—'}"`
      ),
    ].join('\n')
  }

  function quickDownloadCsv(list: Task[]) {
    const blob = new Blob([buildTasksCsv(list)], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tarefas-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportTasks(list: Task[], titleSuffix = '') {
    const todayStr = new Date().toISOString().split('T')[0]
    const PRIORITY_BADGE: Record<string, string> = { low: 'gray', medium: 'blue', high: 'orange', urgent: 'red' }
    const STATUS_BADGE: Record<string, string> = { pending: 'amber', in_progress: 'blue', done: 'green', cancelled: 'gray' }
    const pendentes = list.filter(t => t.status === 'pending').length
    const vencidas = list.filter(t => t.due_date && String(t.due_date).slice(0, 10) < todayStr && t.status !== 'done' && t.status !== 'cancelled').length
    const concluidas = list.filter(t => t.status === 'done').length
    const processInfo = taskProcessInfo
    const clientName = taskClientName
    const csvContent = buildTasksCsv(list)
    openExportWindow({
      title: `Relatório de Tarefas${titleSuffix}`,
      filename: 'tarefas',
      stats: [
        { value: list.length, label: 'Total de tarefas', accent: '#2563eb' },
        { value: pendentes, label: 'Pendentes', accent: '#d97706' },
        { value: vencidas, label: 'Vencidas', accent: '#dc2626' },
        { value: concluidas, label: 'Concluídas', accent: '#16a34a' },
      ],
      columns: ['Título', 'Tipo', 'Prioridade', 'Status', 'Responsável', 'Processo', 'Cliente', 'Vencimento'],
      rows: list.map(t => {
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
  const exportAll = () => exportTasks(filtered)

  // ── Ações em massa (visão Lista) ────────────────────────────────────────
  async function bulkComplete() {
    const targets = tasks.filter(t => selectedRows.has(t.id) && t.status !== 'done')
    await Promise.all(targets.map(t => markTaskDone(t)))
    setSelectedRows(new Set())
    load(true)
  }

  async function bulkDelete() {
    const count = selectedRows.size
    const ok = await confirmDialog(
      `Excluir ${count} tarefa${count !== 1 ? 's' : ''} selecionada${count !== 1 ? 's' : ''}? Essa ação não pode ser desfeita.`,
      { title: 'Excluir tarefas', confirmLabel: 'Excluir', danger: true }
    )
    if (!ok) return
    const ids = Array.from(selectedRows)
    const { error } = await withErrorFeedback(
      supabase.from('tasks').update({ deleted_at: new Date().toISOString() }).in('id', ids),
      'Erro ao excluir tarefas'
    )
    if (error) return
    setTasks(prev => prev.filter(t => !selectedRows.has(t.id)))
    setSelectedRows(new Set())
  }

  function bulkExport() {
    exportTasks(tasks.filter(t => selectedRows.has(t.id)), ' (seleção)')
  }

  return (
    <Layout
      title="Atividades"
      actions={
        <div className="flex items-center gap-2">
          {recurringTemplates.length > 0 && (
            <Button variant="outline" onClick={() => setRecurringModalOpen(true)}>
              <RefreshCw className="w-4 h-4" /> Recorrentes ({recurringTemplates.length})
            </Button>
          )}
          <Button onClick={() => openNew()}><Plus className="w-4 h-4" /> Nova tarefa</Button>
        </div>
      }
    >
      {!loading && (
        <div className="space-y-4">

          {/* ── Stats pills + Carga da equipe ── */}
          <div className="flex items-stretch gap-4 flex-wrap">
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

            {profile?.role !== 'lawyer' && profile?.role !== 'intern' && teamWorkload.length > 0 && (
              <div className="flex-1 min-w-[280px] bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 px-5 py-3">
                <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Carga da equipe</p>
                <div className="flex items-center gap-5 overflow-x-auto pb-0.5">
                  {teamWorkload.map(({ user, count, pct }) => {
                    const initials = (user.name || user.display_name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
                    return (
                      <div key={user.user_id} className="flex-shrink-0 w-32">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0">
                            {initials}
                          </div>
                          <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{(user.name || user.display_name || '').split(' ')[0]}</p>
                          <span className="ml-auto text-xs font-bold text-gray-500 dark:text-gray-400 flex-shrink-0">{count}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 dark:bg-dark-700 rounded-full overflow-hidden">
                          <div className="h-full bg-primary-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
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
              <div className="relative">
                <button
                  onClick={() => setExportMenuOpen(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-dark-600 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" /> Exportar <ChevronDown className="w-3 h-3" />
                </button>
                {exportMenuOpen && (
                  <div className="absolute z-10 top-full left-0 mt-1 w-56 bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-lg shadow-modal py-1">
                    <button
                      onClick={() => { setExportMenuOpen(false); exportAll() }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700 flex items-center gap-2"
                    >
                      <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      Relatório completo (PDF/Planilha)
                    </button>
                    <button
                      onClick={() => { setExportMenuOpen(false); quickDownloadCsv(filtered) }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700 flex items-center gap-2"
                    >
                      <Download className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      Baixar CSV rápido
                    </button>
                  </div>
                )}
              </div>

              {/* View toggle */}
              <div className="ml-auto flex items-center rounded-lg border border-gray-200 dark:border-dark-600 overflow-hidden">
                <button
                  onClick={() => setViewMode('foco')}
                  className={cn('flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors', viewMode === 'foco' ? 'bg-primary-600 text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-dark-700')}
                  title="Modo Foco"
                >
                  <Target className="w-4 h-4" /> Foco
                </button>
                <button
                  onClick={() => setViewMode('quadro')}
                  className={cn('flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-l border-gray-200 dark:border-dark-600 transition-colors', viewMode === 'quadro' ? 'bg-primary-600 text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-dark-700')}
                  title="Quadro"
                >
                  <LayoutGrid className="w-4 h-4" /> Quadro
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={cn('flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-l border-gray-200 dark:border-dark-600 transition-colors', viewMode === 'list' ? 'bg-primary-600 text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-dark-700')}
                  title="Lista"
                >
                  <List className="w-4 h-4" /> Lista
                </button>
              </div>
            </div>

            {/* Filter panel */}
            {filterOpen && (
              <div className="px-4 pb-3 pt-3 border-t border-gray-100 dark:border-dark-700 flex items-center gap-3 flex-wrap">
                <Select
                  value={priorityFilter}
                  onChange={e => { setPriorityFilter(e.target.value); setPage(1) }}
                  className="!w-auto !py-1.5"
                >
                  <option value="">Todas as prioridades</option>
                  <option value="urgent">Urgente</option>
                  <option value="high">Alta</option>
                  <option value="medium">Média</option>
                  <option value="low">Baixa</option>
                </Select>
                <Select
                  value={typeFilter}
                  onChange={e => { setTypeFilter(e.target.value); setPage(1) }}
                  className="!w-auto !py-1.5"
                >
                  <option value="">Todos os tipos</option>
                  <option value="deadline">Prazo</option>
                  <option value="hearing">Audiência</option>
                  <option value="document">Documento</option>
                  <option value="meeting">Reunião</option>
                  <option value="custom">Geral</option>
                </Select>
                {viewMode === 'list' && (
                  <Select
                    value={statusFilter}
                    onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
                    className="!w-auto !py-1.5"
                  >
                    <option value="">Todos os status</option>
                    <option value="pending">Pendente</option>
                    <option value="in_progress">Em andamento</option>
                    <option value="done">Concluída</option>
                    <option value="cancelled">Cancelada</option>
                  </Select>
                )}
                <Select
                  value={assignedFilter}
                  onChange={e => { setAssignedFilter(e.target.value); setPage(1) }}
                  className="!w-auto !py-1.5"
                >
                  <option value="">Todos os responsáveis</option>
                  {systemUsers.map(u => (
                    <option key={u.user_id} value={u.user_id}>
                      {u.name || u.display_name} ({workloadByUser[u.user_id] || 0} aberta{(workloadByUser[u.user_id] || 0) !== 1 ? 's' : ''})
                    </option>
                  ))}
                </Select>
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

          {/* ── Modo Foco ── */}
          {viewMode === 'foco' && (
            <div className="space-y-4">

              {/* Hero — Hoje */}
              <div className="bg-white dark:bg-dark-800 rounded-2xl border border-gray-200 dark:border-dark-700 overflow-hidden">
                <div className="relative overflow-hidden bg-gradient-to-br from-primary-700 via-primary-600 to-primary-500 text-white px-5 sm:px-6 py-5">
                  <div className="absolute -right-10 -top-10 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
                  <div className="relative flex items-center gap-5 flex-wrap sm:flex-nowrap">
                    <div className="relative w-16 h-16 flex-shrink-0">
                      <svg viewBox="0 0 64 64" className="w-16 h-16 -rotate-90">
                        <circle cx="32" cy="32" r="27" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="7" />
                        <circle
                          cx="32" cy="32" r="27" fill="none" stroke="white" strokeWidth="7" strokeLinecap="round"
                          strokeDasharray={2 * Math.PI * 27}
                          strokeDashoffset={2 * Math.PI * 27 * (1 - todayProgressPct / 100)}
                          className="transition-all duration-500"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center text-sm font-bold">{todayProgressPct}%</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] uppercase tracking-wider text-white/70 font-semibold">
                        {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                      </p>
                      <h2 className="text-xl font-bold leading-tight">Hoje</h2>
                      <p className="text-sm text-white/80">
                        {todayAllTasks.length === 0 ? 'Nada agendado para hoje' : `${todayDoneTasks.length} de ${todayAllTasks.length} concluídas`}
                      </p>
                    </div>
                    <button
                      onClick={() => openNew()}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-white/15 hover:bg-white/25 text-white text-sm font-semibold rounded-lg transition-colors flex-shrink-0"
                    >
                      <Plus className="w-4 h-4" /> Nova tarefa
                    </button>
                  </div>
                </div>

                <div className="p-2 sm:p-3">
                  {todayAllTasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                      <PartyPopper className="w-8 h-8 text-gray-300 dark:text-gray-600" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">Nenhuma tarefa agendada para hoje</p>
                      <p className="text-xs text-gray-400 dark:text-gray-600">Aproveite para adiantar as próximas ou revisar atrasadas</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-50 dark:divide-dark-700/50">
                      {[...todayOpenTasks, ...todayDoneTasks].map(task => (
                        <TaskRow
                          key={task.id} task={task} today={today} done={task.status === 'done'}
                          deletingTaskId={deletingTaskId} justCompleted={justCompletedId === task.id}
                          onOpen={openEdit} onComplete={requestComplete}
                          onDeleteRequest={setDeletingTaskId} onDeleteConfirm={softDeleteTask} onDeleteCancel={() => setDeletingTaskId(null)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Abas secundárias — sem sobreposição com "Hoje" */}
              <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 overflow-hidden">
                <div className="flex items-center gap-1 px-2 pt-2 overflow-x-auto">
                  {focoTabs.map(tab => {
                    const TabIcon = tab.icon
                    const active = focoTab === tab.key
                    return (
                      <button
                        key={tab.key}
                        onClick={() => setFocoTab(tab.key)}
                        className={cn('flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors whitespace-nowrap',
                          active ? cn('border-current', tab.color) : 'border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300')}
                      >
                        <TabIcon className="w-3.5 h-3.5" />
                        {tab.label}
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-bold', active ? cn(tab.activeColor, 'text-white') : 'bg-gray-100 dark:bg-dark-700 text-gray-500 dark:text-gray-400')}>
                          {tab.items.length}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <div className="p-2 sm:p-3 border-t border-gray-100 dark:border-dark-700">
                  {activeFocoTab.items.length === 0 ? (
                    <div className="flex items-center justify-center py-10 text-sm text-gray-400 dark:text-gray-600 italic">
                      Nenhuma tarefa aqui
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-50 dark:divide-dark-700/50 max-h-[420px] overflow-y-auto">
                      {activeFocoTab.items.map(task => (
                        <TaskRow
                          key={task.id} task={task} today={today} done={!!activeFocoTab.done}
                          deletingTaskId={deletingTaskId} justCompleted={justCompletedId === task.id}
                          onOpen={openEdit} onComplete={requestComplete}
                          onDeleteRequest={setDeletingTaskId} onDeleteConfirm={softDeleteTask} onDeleteCancel={() => setDeletingTaskId(null)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Quadro (Kanban) — mesmo visual do Quadro do Dashboard, com drag-and-drop ── */}
          {viewMode === 'quadro' && (
            <div className="flex gap-4 overflow-x-auto pb-4 -mx-1 px-1">
              {quadroColumns.map(col => (
                <div
                  key={col.key}
                  className="flex-shrink-0 w-72"
                  onDragOver={e => { e.preventDefault(); setDragOverCol(col.key) }}
                  onDragLeave={() => setDragOverCol(prev => (prev === col.key ? null : prev))}
                  onDrop={e => {
                    e.preventDefault()
                    const id = e.dataTransfer.getData('text/plain')
                    setDragOverCol(null)
                    setDraggingTaskId(null)
                    if (id) moveTaskToColumn(id, col.key)
                  }}
                >
                  {/* Column header */}
                  <div className="flex items-center gap-2 mb-3 px-1">
                    <div className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', col.dotColor)} />
                    <span className={cn('text-sm font-bold flex-1 truncate', col.color)}>{col.label}</span>
                    <span className="min-w-[22px] h-5 rounded-full bg-gray-100 dark:bg-dark-700 flex items-center justify-center text-xs font-bold text-gray-500 dark:text-gray-400 px-1.5">
                      {col.items.length}
                    </span>
                  </div>

                  {/* Cards — scrollable, alvo do drop */}
                  <div className={cn(
                    'space-y-2 max-h-[580px] overflow-y-auto pr-0.5 pb-1 rounded-xl transition-colors',
                    dragOverCol === col.key && 'ring-2 ring-primary-300 dark:ring-primary-700 bg-primary-50/40 dark:bg-primary-900/10'
                  )}>
                    {col.items.map(task => (
                      <TaskCard
                        key={task.id} task={task} done={!!col.done}
                        deletingTaskId={deletingTaskId} dragging={draggingTaskId === task.id}
                        onOpen={openEdit} onComplete={requestComplete}
                        onDeleteRequest={setDeletingTaskId} onDeleteConfirm={softDeleteTask} onDeleteCancel={() => setDeletingTaskId(null)}
                        onDragStart={(e, id) => { e.dataTransfer.setData('text/plain', id); setDraggingTaskId(id) }}
                        onDragEnd={() => setDraggingTaskId(null)}
                      />
                    ))}
                    {col.items.length === 0 && (
                      <div className="border-2 border-dashed border-gray-200 dark:border-dark-600 rounded-xl p-5 flex flex-col items-center justify-center gap-1.5">
                        <CheckCircle2 className="w-5 h-5 text-gray-300 dark:text-dark-600" />
                        <p className="text-xs text-gray-400 text-center">Nenhuma tarefa</p>
                      </div>
                    )}
                  </div>

                  {/* Adicionar tarefa */}
                  {col.key !== 'concluidas' && (
                    <button
                      onClick={() => openNew()}
                      className="mt-2 w-full flex items-center gap-1.5 px-3 py-2 text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-white dark:hover:bg-dark-800 rounded-xl transition-colors border border-dashed border-gray-200 dark:border-dark-600"
                    >
                      <Plus className="w-3.5 h-3.5" /> Adicionar tarefa
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── List view ── */}
          {viewMode === 'list' && (
            <div className="space-y-3">
              {selectedRows.size > 0 && (
                <div className="flex items-center justify-between gap-3 bg-primary-50 dark:bg-primary-900/10 border border-primary-100 dark:border-primary-800/30 rounded-xl px-4 py-2.5">
                  <p className="text-sm font-semibold text-primary-700 dark:text-primary-400">
                    {selectedRows.size} tarefa{selectedRows.size !== 1 ? 's' : ''} selecionada{selectedRows.size !== 1 ? 's' : ''}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <button onClick={bulkComplete} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 rounded-lg transition-colors">
                      <Check className="w-3.5 h-3.5" /> Concluir
                    </button>
                    <button onClick={bulkExport} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 bg-white dark:bg-dark-700 border border-gray-200 dark:border-dark-600 hover:bg-gray-50 dark:hover:bg-dark-600 rounded-lg transition-colors">
                      <Download className="w-3.5 h-3.5" /> Exportar
                    </button>
                    <button onClick={bulkDelete} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors">
                      <Trash2 className="w-3.5 h-3.5" /> Excluir
                    </button>
                    <button onClick={() => setSelectedRows(new Set())} className="px-2.5 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                      Limpar
                    </button>
                  </div>
                </div>
              )}
            <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-dark-700 bg-gray-50 dark:bg-dark-800/50">
                      <th className="w-8 px-3 py-3">
                        <input
                          type="checkbox"
                          className="w-3.5 h-3.5 rounded border-gray-300 accent-primary-600"
                          checked={paginatedTasks.length > 0 && paginatedTasks.every(t => selectedRows.has(t.id))}
                          ref={el => { if (el) el.indeterminate = paginatedTasks.some(t => selectedRows.has(t.id)) && !paginatedTasks.every(t => selectedRows.has(t.id)) }}
                          onChange={() => setSelectedRows(s => {
                            const allSelected = paginatedTasks.every(t => selectedRows.has(t.id))
                            const n = new Set(s)
                            paginatedTasks.forEach(t => allSelected ? n.delete(t.id) : n.add(t.id))
                            return n
                          })}
                        />
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
                          className={cn(
                            'group border-l-[3px] hover:bg-gray-50 dark:hover:bg-dark-700/30 transition-colors duration-300 cursor-pointer',
                            isLate ? 'border-red-500 bg-red-50/30 dark:bg-red-900/10' : PRIORITY_BORDER[t.priority || 'medium'],
                            isSelected && 'bg-blue-50/50 dark:bg-blue-900/10',
                            justCompletedId === t.id && 'bg-emerald-50/70 dark:bg-emerald-900/15'
                          )}
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
                              className={cn('w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all duration-300', t.status === 'done' ? 'border-green-500 bg-green-500' : 'border-gray-300 dark:border-dark-500 hover:border-primary-500')}
                            >
                              {t.status === 'done' && <Check className={cn('w-2.5 h-2.5 text-white', justCompletedId === t.id && 'animate-check-pop')} />}
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
                            <span className={cn('inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium', TYPE_META[t.type || 'custom']?.chip)}>
                              {(() => { const TypeIcon = TYPE_META[t.type || 'custom']?.icon; return TypeIcon ? <TypeIcon className="w-3 h-3" /> : null })()}
                              {TYPE_META[t.type || 'custom']?.label}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', PRIORITY_BADGE[t.priority || 'medium'])}>
                              {PRIORITY_LABELS[t.priority || 'medium']}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            {t.due_date ? (
                              <div className={cn('text-sm font-medium', isLate ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300')}>
                                {formatDate(t.due_date)}
                                {isLate && (
                                  <span className="block text-[10px] font-semibold text-red-500 dark:text-red-400">
                                    {daysOverdue(t.due_date, today)}d atrasada
                                  </span>
                                )}
                              </div>
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
              { key: 'tag_privada', label: 'Privada' },
              { key: 'tag_retroativa', label: 'Retroativa' },
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
          </div>

          {form.tag_recorrente && (
            <div className="grid grid-cols-2 gap-3 p-3 bg-primary-50/50 dark:bg-primary-900/10 rounded-xl border border-primary-100 dark:border-primary-900/30">
              <Select label="Repetir a cada" value={form.recurrence_interval} onChange={e => setForm({ ...form, recurrence_interval: e.target.value as TaskForm['recurrence_interval'] })}>
                <option value="weekly">Semana</option>
                <option value="monthly">Mês</option>
                <option value="yearly">Ano</option>
              </Select>
              <Input label="Repetir até (opcional)" type="date" value={form.recurrence_end_date} onChange={e => setForm({ ...form, recurrence_end_date: e.target.value })} />
              <p className="col-span-2 text-[11px] text-gray-400 dark:text-gray-500">
                Uma nova tarefa idêntica será criada automaticamente na data de vencimento, a partir da próxima geração diária (roda às 6h).
              </p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100 dark:border-dark-700">
          <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
          <Button onClick={save} loading={saving}>{editId ? 'Salvar' : 'Criar nova tarefa'}</Button>
        </div>
      </Modal>

      {/* ── Completion Modal — step ask ── */}
      {completionModal && completionModal.step === 'ask' && (
        <Modal open onClose={() => setCompletionModal(null)} title="" size="md">
          <div className="-mx-6 -mt-6">
            <div className="relative overflow-hidden rounded-t-2xl bg-gradient-to-br from-emerald-600 via-green-600 to-emerald-500 text-white px-6 py-5">
              <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
              <div className="absolute right-4 top-4 opacity-20"><CheckCircle2 className="w-20 h-20" /></div>
              <div className="relative">
                <p className="text-xs text-white/80 font-medium mb-1 uppercase tracking-wider">Concluir Atividade</p>
                <h3 className="text-lg font-bold leading-tight pr-20 line-clamp-2">{completionModal.taskTitle}</h3>
              </div>
            </div>
            <div className="px-6 py-8 flex flex-col items-center text-center gap-5">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-3xl">⚖️</div>
              <div>
                <p className="text-base font-bold text-gray-900 dark:text-white mb-1">Esta atividade resultou em um processo protocolado?</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Se sim, você pode registrar os dados do processo agora.</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 w-full pt-2">
                <button
                  onClick={completeWithoutProcess}
                  className="flex-1 py-3 px-4 rounded-xl border-2 border-gray-200 dark:border-dark-600 text-gray-700 dark:text-gray-300 font-semibold text-sm hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors"
                >
                  Não, apenas concluir
                </button>
                <button
                  onClick={() => setCompletionModal(prev => prev ? { ...prev, step: 'process' } : null)}
                  className="flex-1 py-3 px-4 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Sim, cadastrar processo
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Completion Modal — step process (full-height panel) ── */}
      {completionModal && completionModal.step === 'process' && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-end bg-black/40 backdrop-blur-sm">
          <div className="w-full sm:w-[440px] h-full sm:h-screen bg-white dark:bg-dark-800 flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="relative overflow-hidden flex-shrink-0 bg-gradient-to-br from-emerald-600 via-green-600 to-emerald-500 text-white px-5 py-4">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-xl" />
              <div className="absolute right-3 top-3 opacity-20"><CheckCircle2 className="w-16 h-16" /></div>
              <div className="relative flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white/80 font-medium mb-0.5 uppercase tracking-wider">Novo processo</p>
                  <h3 className="text-base font-bold leading-snug pr-6 line-clamp-2">{completionModal.taskTitle}</h3>
                </div>
                <button
                  onClick={() => setCompletionModal(null)}
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors flex-shrink-0 mt-0.5"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Scrollable form + footer rendered below */}

            {/* Step: process form — full form identical to ProcessesPage */}
            {completionModal.step === 'process' && (
              <>
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

                  {/* Partes envolvidas */}
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Adicionar partes envolvidas *</label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-gray-200 dark:bg-dark-600 flex items-center justify-center flex-shrink-0">
                        <svg className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                      </div>
                      <select
                        value={completionForm.client_id}
                        onChange={e => {
                          const selected = clients.find(c => c.id === e.target.value)
                          setCompletionForm({ ...completionForm, client_id: e.target.value, client_name: selected?.name || '', colaborador_id: selected?.colaborador_id || completionForm.colaborador_id || '', area: (selected as any)?.area_direito || completionForm.area })
                        }}
                        className="w-full pl-10 pr-9 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 appearance-none"
                      >
                        <option value="">Nome do contato</option>
                        {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                  </div>

                  {/* Responsável */}
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Responsável</label>
                    <div className="relative">
                      <select
                        value={completionForm.colaborador_id}
                        onChange={e => setCompletionForm({ ...completionForm, colaborador_id: e.target.value })}
                        className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 font-medium focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 appearance-none"
                      >
                        <option value="">Sem responsável</option>
                        {colaboradores.map(col => <option key={col.id} value={col.id}>{col.nome.toUpperCase()}</option>)}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                  </div>

                  {/* Parte contrária */}
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Parte contrária</label>
                    <input
                      value={completionForm.counterparty}
                      onChange={e => setCompletionForm({ ...completionForm, counterparty: e.target.value })}
                      placeholder="Nome da parte contrária"
                      className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400"
                    />
                  </div>

                  {/* Anotações gerais */}
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Anotações gerais</label>
                    <textarea
                      value={completionForm.description}
                      onChange={e => setCompletionForm({ ...completionForm, description: e.target.value })}
                      placeholder="Anotações, tags, fatos e fundamentos"
                      rows={3}
                      className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 resize-none"
                    />
                  </div>

                  {/* Grupo de ação */}
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Grupo de ação *</label>
                    <div className="relative">
                      <select
                        value={completionForm.grupo_acao}
                        onChange={e => setCompletionForm({ ...completionForm, grupo_acao: e.target.value, type: '' })}
                        className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 appearance-none"
                      >
                        <option value="">Selecione o grupo de ação</option>
                        {GRUPOS_ACAO.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                  </div>

                  {/* Tipo de ação */}
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Tipo de ação *</label>
                    <div className="relative">
                      <select
                        value={completionForm.type}
                        onChange={e => setCompletionForm({ ...completionForm, type: e.target.value })}
                        className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 appearance-none"
                      >
                        <option value="">Selecione o tipo de ação</option>
                        {(TIPOS_ACAO[completionForm.grupo_acao] || []).map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                  </div>

                  {/* Fase */}
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Fase *</label>
                    <div className="relative">
                      <select
                        value={completionForm.fase}
                        onChange={e => setCompletionForm({ ...completionForm, fase: e.target.value })}
                        className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 font-medium focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 appearance-none"
                      >
                        {FASES.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                  </div>

                  {/* Etapa */}
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Etapa *</label>
                    <div className="relative">
                      <input
                        value={completionForm.etapa}
                        onChange={e => setCompletionForm({ ...completionForm, etapa: e.target.value })}
                        className="w-full px-4 pr-9 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 font-medium focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400"
                      />
                      {completionForm.etapa && (
                        <button onClick={() => setCompletionForm({ ...completionForm, etapa: '' })} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                          <XIcon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Número do processo CNJ */}
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Número do processo (CNJ)</label>
                    <input
                      value={completionForm.number}
                      onChange={e => setCompletionForm({ ...completionForm, number: e.target.value })}
                      placeholder="9999999-99.9999.9.99.9999"
                      className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 font-mono"
                    />
                  </div>

                  {/* Número do protocolo */}
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Número do protocolo/requerimento</label>
                    <input
                      value={completionForm.numero_protocolo}
                      onChange={e => setCompletionForm({ ...completionForm, numero_protocolo: e.target.value })}
                      placeholder="123456789-0"
                      className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400"
                    />
                  </div>

                  {/* Processo originário */}
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Processo originário</label>
                    <input
                      value={completionForm.processo_originario}
                      onChange={e => setCompletionForm({ ...completionForm, processo_originario: e.target.value })}
                      placeholder="9999999-99.9999.9.99.9999"
                      className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 font-mono"
                    />
                  </div>

                  {/* Pasta/Caso */}
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Pasta/Caso</label>
                    <input
                      value={completionForm.pasta_caso}
                      onChange={e => setCompletionForm({ ...completionForm, pasta_caso: e.target.value })}
                      placeholder="Identificação da pasta"
                      className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400"
                    />
                  </div>

                  {/* Data do requerimento */}
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Data do requerimento</label>
                    <div className="relative">
                      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      <input
                        type="date"
                        value={completionForm.data_requerimento}
                        onChange={e => setCompletionForm({ ...completionForm, data_requerimento: e.target.value })}
                        className="w-full pl-10 pr-4 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400"
                      />
                    </div>
                  </div>

                  {/* Valor da causa */}
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Valor da causa</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                      <input
                        value={completionForm.valor_causa}
                        onChange={e => setCompletionForm({ ...completionForm, valor_causa: e.target.value })}
                        placeholder="999.999,99"
                        className="w-full pl-8 pr-4 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400"
                      />
                    </div>
                  </div>

                  {/* Valor dos honorários */}
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Valor dos honorários</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                      <input
                        value={completionForm.valor_honorarios}
                        onChange={e => setCompletionForm({ ...completionForm, valor_honorarios: e.target.value })}
                        placeholder="999.999,99"
                        className="w-full pl-8 pr-4 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400"
                      />
                    </div>
                  </div>

                  {/* Percentual de honorários */}
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Percentual de honorários (%)</label>
                    <input
                      value={completionForm.percentual_honorarios}
                      onChange={e => setCompletionForm({ ...completionForm, percentual_honorarios: e.target.value })}
                      placeholder="99%"
                      className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400"
                    />
                  </div>

                  {/* Contingenciamento */}
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Contingenciamento</label>
                    <div className="relative">
                      <select
                        value={completionForm.contingenciamento}
                        onChange={e => setCompletionForm({ ...completionForm, contingenciamento: e.target.value })}
                        className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 appearance-none"
                      >
                        <option value="">Selecione o contingenciamento</option>
                        {CONTINGENCIAMENTOS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                  </div>

                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-gray-100 dark:border-dark-700 flex-shrink-0 flex items-center gap-3">
                  <Button variant="ghost" onClick={() => setCompletionModal(prev => prev ? { ...prev, step: 'ask' } : null)}>
                    ← Voltar
                  </Button>
                  <button
                    onClick={confirmCompletion}
                    className="flex-1 flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 rounded-xl text-sm transition-all active:scale-[0.98]"
                  >
                    <Check className="w-4 h-4" /> Criar processo e concluir atividade
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <Modal open={recurringModalOpen} onClose={() => setRecurringModalOpen(false)} title="Tarefas recorrentes ativas" size="md">
        <div className="space-y-2">
          {recurringTemplates.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Nenhuma recorrência ativa.</p>
          ) : recurringTemplates.map(t => (
            <div key={t.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-100 dark:border-dark-700">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{t.title}</p>
                <p className="text-xs text-gray-400">
                  A cada {t.recurrence_interval === 'weekly' ? 'semana' : t.recurrence_interval === 'yearly' ? 'ano' : 'mês'} · próxima em {formatDate(t.due_date)}
                  {t.recurrence_end_date && ` · até ${formatDate(t.recurrence_end_date)}`}
                </p>
              </div>
              <button onClick={() => stopRecurrence(t.id)}
                className="flex-shrink-0 text-xs font-medium text-red-500 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                Parar
              </button>
            </div>
          ))}
        </div>
      </Modal>
    </Layout>
  )
}

