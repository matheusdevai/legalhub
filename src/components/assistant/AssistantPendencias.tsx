import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ClipboardList, FileText, Scale, Wallet, ArrowRight } from 'lucide-react'
import { Card, Spinner, EmptyState } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cn, formatDate, formatCurrency, PRIORITY_LABELS, PRIORITY_COLORS, FINANCIAL_STATUS_LABELS, FINANCIAL_STATUS_COLORS, TASK_STATUS_LABELS } from '@/lib/utils'
import {
  buildPendencies, PENDENCY_CATEGORY_LABELS, PENDENCY_CATEGORY_ORDER,
  type PendencyCategory, type PendencyItem, type PendencyTaskInput, type PendencyFinancialInput,
} from '@/lib/assistantPendencias'

// Central de Pendências (milestone 6, seção 8 da spec). Só visualização
// agregada sobre `tasks`/`financials` já existentes — sem tabela nova, sem
// CRUD novo. Criar/editar continua nas telas originais (Tarefas, Financeiro),
// pra onde cada item aqui linka via `linkLabel`/`link`.

const CATEGORY_ICON: Record<PendencyCategory, React.ElementType> = {
  documental: FileText,
  processual: Scale,
  financeira: Wallet,
  geral: ClipboardList,
}

const CATEGORY_RING: Record<PendencyCategory, string> = {
  documental: 'border-blue-200 dark:border-blue-800/40',
  processual: 'border-violet-200 dark:border-violet-800/40',
  financeira: 'border-emerald-200 dark:border-emerald-800/40',
  geral: 'border-amber-200 dark:border-amber-800/40',
}

const CATEGORY_BADGE: Record<PendencyCategory, string> = {
  documental: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300',
  processual: 'bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-300',
  financeira: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300',
  geral: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300',
}

function PendencyRow({ item, onOpen }: { item: PendencyItem; onOpen: (link: string) => void }) {
  const statusLabel = item.category === 'financeira'
    ? FINANCIAL_STATUS_LABELS[item.status] || item.status
    : TASK_STATUS_LABELS[item.status] || item.status
  const statusColor = item.category === 'financeira' ? FINANCIAL_STATUS_COLORS[item.status] : undefined

  return (
    <li className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-dark-700 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{item.title}</p>
          <div className="flex items-center gap-2 flex-wrap text-xs text-slate-400">
            {item.subtitle && <span className="truncate">{item.subtitle}</span>}
            {item.dueDate && <span>Prazo: {formatDate(item.dueDate)}</span>}
            {item.amount != null && <span>{formatCurrency(item.amount)}</span>}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {item.priority && (
              <span className={cn('text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded', PRIORITY_COLORS[item.priority] || '')}>
                {PRIORITY_LABELS[item.priority] || item.priority}
              </span>
            )}
            <span className={cn('text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded', statusColor || 'bg-slate-100 text-slate-500 dark:bg-dark-600 dark:text-slate-300')}>
              {statusLabel}
            </span>
          </div>
        </div>
        <button
          onClick={() => onOpen(item.link)}
          className="flex items-center gap-1 text-xs font-semibold text-primary-600 hover:underline flex-shrink-0 whitespace-nowrap mt-0.5"
        >
          {item.linkLabel} <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </li>
  )
}

function PendencyCategoryCard({ category, items, onOpen }: { category: PendencyCategory; items: PendencyItem[]; onOpen: (link: string) => void }) {
  const Icon = CATEGORY_ICON[category]
  return (
    <Card className={cn('p-0 overflow-hidden border', CATEGORY_RING[category])}>
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 dark:border-dark-600">
        <span className={cn('inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full', CATEGORY_BADGE[category])}>
          <Icon className="w-3.5 h-3.5" /> {PENDENCY_CATEGORY_LABELS[category]}
        </span>
        <span className="text-xs text-slate-400">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500 px-4 py-4">Nada por aqui.</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-dark-600">
          {items.map(item => <PendencyRow key={item.id} item={item} onOpen={onOpen} />)}
        </ul>
      )}
    </Card>
  )
}

export function AssistantPendencias() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [tasks, setTasks] = useState<PendencyTaskInput[]>([])
  const [financials, setFinancials] = useState<PendencyFinancialInput[]>([])
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
      { data: taskData, error: taskErr },
      { data: financialData, error: financialErr },
    ] = await Promise.all([
      supabase.from('tasks')
        .select('id, title, due_date, priority, status, type, process_id, assigned_name, assigned_to')
        .eq('tenant_id', profile!.tenant_id!)
        .is('deleted_at', null)
        .neq('status', 'done')
        .neq('status', 'cancelled'),
      // Mesma query de FinancialsPage.tsx para `financials`: nenhum filtro
      // manual por papel — RLS isola só por tenant, e a tela hoje mostra o
      // financeiro do tenant inteiro pra qualquer role autenticado que
      // chegue lá (lawyer/intern incluídos). Replicado aqui de propósito.
      supabase.from('financials')
        .select('id, description, due_date, status, amount, client_name, process_number')
        .eq('tenant_id', profile!.tenant_id!)
        .is('deleted_at', null)
        .in('status', ['pending', 'overdue']),
    ])
    if (taskErr || financialErr) {
      setError('Não foi possível carregar a Central de Pendências. Tente novamente.')
      setLoading(false)
      return
    }
    let taskList = (taskData || []) as PendencyTaskInput[]
    // Mesma restrição de TasksPage.tsx/aba Visão Geral do Assistente:
    // advogado/estagiário só vê as próprias tarefas.
    if (profile?.role === 'lawyer' || profile?.role === 'intern') {
      taskList = taskList.filter(task => task.assigned_to === profile.user_id)
    }
    setTasks(taskList)
    setFinancials((financialData || []) as PendencyFinancialInput[])
    setLoading(false)
  }

  const grouped = useMemo(() => buildPendencies(tasks, financials), [tasks, financials])
  const total = PENDENCY_CATEGORY_ORDER.reduce((sum, cat) => sum + grouped[cat].length, 0)

  function openLink(link: string) {
    navigate(link)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="w-6 h-6" />
      </div>
    )
  }

  if (error) {
    return (
      <Card className="p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
        <button onClick={load} className="text-sm font-semibold text-primary-600 hover:underline flex-shrink-0">
          Tentar novamente
        </button>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          Visão agregada de tarefas e financeiro em aberto, por categoria. Criar ou editar continua em Tarefas e Financeiro.
        </p>
        <span className="text-xs text-slate-400 whitespace-nowrap">{total} pendência{total === 1 ? '' : 's'}</span>
      </div>
      {total === 0 ? (
        <Card className="p-4">
          <EmptyState icon={ClipboardList} title="Nenhuma pendência no momento" description="Tudo em dia por aqui." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {PENDENCY_CATEGORY_ORDER.map(category => (
            <PendencyCategoryCard key={category} category={category} items={grouped[category]} onOpen={openLink} />
          ))}
        </div>
      )}
    </div>
  )
}
