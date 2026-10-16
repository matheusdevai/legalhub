import { usePageLoadingState } from '@/contexts/PageLoadingContext'
import { useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Plus, Search, TrendingUp, Trash2,
  Wallet, Plane, Coffee, Car, Bed, Receipt, Scale,
  Edit3, CheckCircle2, Clock, Users, UserCheck,
  ChevronLeft, ChevronRight, RefreshCw, ArrowUpDown, Download,
  ChevronDown, Minus,
  MessageCircle, Sparkles, Landmark, X, SlidersHorizontal,
  Paperclip, CheckSquare, Square,
  LineChart as LineChartIcon, Repeat,
} from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Button, Card, Badge, Modal, Input, Select, Textarea, EmptyState } from '@/components/ui'
import { FinancialDrawer, type FinancialDrawerForm, DRAWER_EMPTY_FORM, computeInstallmentAmounts } from '@/components/financials/FinancialDrawer'
import { ReconcileExpensesModal } from '@/components/financials/ReconcileExpensesModal'
import { FinancialSheet, type SheetPatch, type QuickAddInput } from '@/components/financials/FinancialSheet'
import {
  monthSheetFinancials, buildSheetRows, statusForPaidDate, occurrenceInsertPayload, parseMoneyInput,
  templateUpdateAfterMaterialize, type SheetRow,
} from '@/lib/financialSheet'
import { adjustmentPlan } from '@/lib/recurringMatrix'
import { RecurringTab } from './RecurringTab'
import { CashFlowTab } from './CashFlowTab'
import { cashFlowYears, type CashFlow, type CashFlowMode } from '@/lib/cashFlow'
import { supabase } from '@/lib/supabase'
import { Financial, Client, Process, UserExpense, Colaborador, FinancialAccount, ExpenseBudget } from '@/types'
import { useAuth } from '@/contexts/AuthContext'
import { formatDate, formatCurrency, sanitizeFileName, toLocalISODate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { openExportWindow } from '@/lib/exportUtils'
import { dateParts, groupExpensesByMonth, buildExpenseMonthColumns } from '@/lib/expenseUtils'
import { withErrorFeedback } from '@/lib/errorFeedback'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
const RevenueExpenseLineChart = lazy(() => import('./FinancialsCharts').then(m => ({ default: m.RevenueExpenseLineChart })))
const ChartFallback = () => <div className="h-full min-h-[160px] animate-pulse bg-slate-100 dark:bg-dark-700 rounded-xl" />

// ─── Types ────────────────────────────────────────────────────────────────────
type ExpenseCategory = 'process' | 'travel' | 'food' | 'transport' | 'accommodation' | 'other'
type ExpenseForm = {
  category: ExpenseCategory; description: string; amount: string
  expense_date: string; process_id: string; trip_destination: string
  reimbursable: boolean; reimbursed: boolean; notes: string; receipt_url: string
}
const EMPTY_EXPENSE: ExpenseForm = {
  category: 'process', description: '', amount: '',
  expense_date: toLocalISODate(),
  process_id: '', trip_destination: '', reimbursable: true, reimbursed: false, notes: '', receipt_url: '',
}

const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

const CATEGORY_META: Record<ExpenseCategory, { label: string; icon: any; badge: string; bar: string }> = {
  process:       { label: 'Processual',  icon: Scale,   badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300', bar: 'bg-purple-500' },
  travel:        { label: 'Viagem',      icon: Plane,   badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',       bar: 'bg-blue-500' },
  food:          { label: 'Alimentação', icon: Coffee,  badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300', bar: 'bg-orange-500' },
  transport:     { label: 'Transporte',  icon: Car,     badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',    bar: 'bg-green-500' },
  accommodation: { label: 'Hospedagem',  icon: Bed,     badge: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',       bar: 'bg-pink-500' },
  other:         { label: 'Outros',      icon: Receipt, badge: 'bg-gray-100 text-gray-700 dark:bg-dark-700 dark:text-gray-300',           bar: 'bg-gray-500' },
}

function waLink(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 10) return null
  return `https://wa.me/${digits.length <= 11 ? '55' + digits : digits}`
}

/** due_date/paid_date são strings 'YYYY-MM-DD' (sem hora) — `new Date(str)` as
 *  interpreta como UTC meia-noite, que em fusos negativos (ex. Brasil, UTC-3)
 *  vira o dia anterior ao ler de volta com getMonth()/getFullYear() (locais),
 *  fazendo o lançamento "vazar" pro mês errado quando due_date cai no dia 1º.
 *  created_at já vem como timestamp completo (com hora/offset) e não sofre
 *  desse problema — só as datas "puras" (10 caracteres) precisam do T00:00:00. */
function parseFinancialDate(f: Pick<Financial, 'due_date' | 'paid_date' | 'created_at'>): Date {
  const raw = f.due_date || f.paid_date || f.created_at || ''
  return raw.length === 10 ? new Date(`${raw}T00:00:00`) : new Date(raw)
}

const CATEGORY_LABELS: Record<string, string> = {
  fees: 'Honorários', costs: 'Custas', salary: 'Salário', rent: 'Aluguel',
  subscription: 'Assinatura', tax: 'Impostos', comissao: 'Comissão', other: 'Outros',
}

type SecondaryTab = 'recorrentes' | 'comissoes' | 'expenses' | 'fluxo'

// ─── Main Component ───────────────────────────────────────────────────────────
export function FinancialsPage() {
  const { profile } = useAuth()
  const currentUserId = profile?.user_id
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'
  const navigate = useNavigate()

  // Minhas Despesas — admins podem ver as despesas de outros colegas, um por vez
  const [viewedUserId, setViewedUserId] = useState<string | undefined>(undefined)
  const [teamMembers, setTeamMembers] = useState<{ user_id: string; name: string | null; display_name: string | null }[]>([])
  useEffect(() => {
    if (!isAdmin || !profile?.tenant_id) return
    supabase.from('profiles').select('user_id, name, display_name')
      .eq('tenant_id', profile.tenant_id).neq('role', 'client').order('name')
      .then(({ data }) => setTeamMembers(data || []))
  }, [isAdmin, profile?.tenant_id])
  const effectiveUserId = viewedUserId ?? currentUserId
  const viewingOwnExpenses = effectiveUserId === currentUserId

  const [financials, setFinancials] = useState<Financial[]>([])
  const [recurringTemplates, setRecurringTemplates] = useState<Financial[]>([])
  // Aba Recorrentes
  const [recurringYear, setRecurringYear] = useState(new Date().getFullYear())
  const [adjustTarget, setAdjustTarget] = useState<Financial | null>(null)
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustFrom, setAdjustFrom] = useState('')
  const [savingAdjust, setSavingAdjust] = useState(false)
  const [clients, setClients] = useState<Client[]>([])
  const [processes, setProcesses] = useState<Process[]>([])
  const [expenses, setExpenses] = useState<UserExpense[]>([])
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [accounts, setAccounts] = useState<FinancialAccount[]>([])
  const [loading, setLoading] = usePageLoadingState()

  // Lançamentos table state
  const now = new Date()
  const [lancMonth, setLancMonth] = useState(now.getMonth())
  const [lancYear, setLancYear] = useState(now.getFullYear())
  const [lancSearch, setLancSearch] = useState('')
  const [lancContaFilter, setLancContaFilter] = useState('')
  const [lancDateFilter, setLancDateFilter] = useState<'due' | 'paid'>('due')
  const [lancTypeFilter, setLancTypeFilter] = useState('')
  const [lancStatusFilter, setLancStatusFilter] = useState('')
  const [lancCategoryFilter, setLancCategoryFilter] = useState('')
  const [onlyOverdue, setOnlyOverdue] = useState(false)
  const [lancSortField, setLancSortField] = useState<'due_date' | 'amount' | 'client_name'>('due_date')
  // Planilha: ordem cronológica por padrão (o saldo acumulado é calculado nessa ordem)
  const [lancSortDir, setLancSortDir] = useState<'asc' | 'desc'>('asc')
  const [lancFilterOpen, setLancFilterOpen] = useState(false)
  const [lancSortOpen, setLancSortOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkWorking, setBulkWorking] = useState(false)

  // Escopo de período pedido antes de qualquer exportação da tela (ano inteiro vs. mês específico)
  const [exportScopeOpen, setExportScopeOpen] = useState<null | 'lancamentos' | 'expenses'>(null)
  const [exportScopeMode, setExportScopeMode] = useState<'year' | 'month'>('month')
  const [exportScopeYear, setExportScopeYear] = useState(now.getFullYear())
  const [exportScopeMonth, setExportScopeMonth] = useState(now.getMonth())

  // Secondary tabs
  const [secondaryTab, setSecondaryTab] = useState<SecondaryTab | null>(null)
  const [comissaoSearch, setComissaoSearch] = useState('')
  const [comissaoPage, setComissaoPage] = useState(0)
  const COMISSAO_PAGE_SIZE = 15
  const [expSearch, setExpSearch] = useState('')
  const [expCategory, setExpCategory] = useState('')
  const [expYear, setExpYear] = useState(now.getFullYear())
  const [cashFlowYear, setCashFlowYear] = useState(now.getFullYear())
  const [cashFlowMode, setCashFlowMode] = useState<CashFlowMode>('forecast')

  // Contas bancárias accordion
  const [contasOpen, setContasOpen] = useState<Record<string, boolean>>({})
  const [newAccountOpen, setNewAccountOpen] = useState(false)
  const [newAccountName, setNewAccountName] = useState('')
  const [savingAccount, setSavingAccount] = useState(false)

  // Drawer (lançamento)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerInitial, setDrawerInitial] = useState<Partial<FinancialDrawerForm>>(DRAWER_EMPTY_FORM)
  const [reconcileTarget, setReconcileTarget] = useState<{ id: string; name: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

  const [expenseModalOpen, setExpenseModalOpen] = useState(false)
  const [expenseForm, setExpenseForm] = useState<ExpenseForm>(EMPTY_EXPENSE)
  const [savingExpense, setSavingExpense] = useState(false)
  const [uploadingReceipt, setUploadingReceipt] = useState(false)
  const [receiptError, setReceiptError] = useState('')
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<Set<string>>(new Set())
  const [bulkReimbursing, setBulkReimbursing] = useState(false)
  const [expenseBudgets, setExpenseBudgets] = useState<ExpenseBudget[]>([])
  const [budgetModalOpen, setBudgetModalOpen] = useState(false)
  const [budgetForm, setBudgetForm] = useState<Record<ExpenseCategory, string>>({
    process: '', travel: '', food: '', transport: '', accommodation: '', other: '',
  })
  const [savingBudgets, setSavingBudgets] = useState(false)
  const [editExpenseId, setEditExpenseId] = useState<string | null>(null)

  // ── Load ────────────────────────────────────────────────────────────────────
  async function load() {
    setLoading(true)
    const promises: any[] = [
      supabase.from('financials').select('*').is('deleted_at', null).order('due_date', { ascending: false }),
      supabase.from('clients').select('id,name,phone,colaborador_id,colaborador_pago,colaborador_pago_data,colaborador_pago_valor,total_billed').is('deleted_at', null).order('name'),
      supabase.from('processes').select('id,number,title,client_id').is('deleted_at', null).order('number'),
      supabase.from('colaboradores').select('*').eq('ativo', true).order('nome'),
      supabase.from('financial_accounts').select('*').order('created_at'),
    ]
    if (effectiveUserId) {
      promises.push(supabase.from('user_expenses').select('*').eq('user_id', effectiveUserId).is('deleted_at', null).order('expense_date', { ascending: false }))
      promises.push(supabase.from('expense_budgets').select('*').eq('user_id', effectiveUserId))
    }
    const results = await Promise.all(promises)
    // O "template" recorrente (recurring = true) continua na lista principal — seu
    // due_date é sempre a próxima cobrança/recebimento real (avançado automaticamente
    // pelo cron diário), então até ele virar uma ocorrência concreta ele PRECISA
    // aparecer no mês em que está previsto; do contrário, ao cadastrar uma despesa
    // recorrente ela simplesmente sumia da tela até o cron gerar a 1ª ocorrência.
    const allFinancials: Financial[] = results[0].data || []
    let financialsData: Financial[] = allFinancials
    setRecurringTemplates(allFinancials.filter(f => f.recurring))
    setClients(results[1].data || [])
    setProcesses(results[2].data || [])
    setColaboradores(results[3].data || [])
    setAccounts(results[4].data || [])
    if (results[5]) setExpenses(results[5].data || [])
    if (results[6]) setExpenseBudgets(results[6].data || [])

    // Sincroniza status "vencido" — pendentes com vencimento no passado deixam de depender de cálculo manual
    // Templates recorrentes ficam de fora: o status deles não é de nenhum lançamento real
    const todayStr = toLocalISODate()
    const toMarkOverdue = financialsData.filter(f => !f.recurring && f.status === 'pending' && f.due_date && f.due_date < todayStr).map(f => f.id)
    if (toMarkOverdue.length > 0) {
      await supabase.from('financials').update({ status: 'overdue' }).in('id', toMarkOverdue)
      financialsData = financialsData.map(f => toMarkOverdue.includes(f.id) ? { ...f, status: 'overdue' as const } : f)
    }
    setFinancials(financialsData)
    setLoading(false)
  }

  useEffect(() => { load() }, [currentUserId, effectiveUserId])

  const lancFilterRef = useRef<HTMLDivElement>(null)
  const lancSortRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (lancFilterRef.current && !lancFilterRef.current.contains(e.target as Node)) setLancFilterOpen(false)
      if (lancSortRef.current && !lancSortRef.current.contains(e.target as Node)) setLancSortOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const location = useLocation()
  useEffect(() => {
    if ((location.state as any)?.openNew) { openNew(); window.history.replaceState({}, '') }
    if ((location.state as any)?.prefillSearch) { setLancSearch((location.state as any).prefillSearch); window.history.replaceState({}, '') }
  }, [location.state])

  // ── Computed values ─────────────────────────────────────────────────────────
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()

  // Month lançamentos (filtered by selected month/year)
  // Por vencimento (padrão), o mês inclui as ocorrências previstas das recorrências
  // (ver lib/financialSheet.ts); os templates em si nunca aparecem como linha.
  const lancMonthFinancials = useMemo(() => {
    if (onlyOverdue) return financials.filter(f => !f.recurring && f.status === 'overdue')
    if (lancDateFilter === 'due') return monthSheetFinancials(financials, lancYear, lancMonth)
    return financials.filter(f => {
      if (f.recurring) return false
      const dateStr = f.paid_date || f.due_date
      if (!dateStr) return false
      const d = new Date(`${dateStr}T00:00:00`)
      return d.getMonth() === lancMonth && d.getFullYear() === lancYear
    })
  }, [financials, lancMonth, lancYear, lancDateFilter, onlyOverdue])

  // Filtros de busca/conta/tipo/status/categoria + ordenação — independentes do
  // recorte de mês/ano, reaproveitados tanto pela tabela (sempre 1 mês) quanto
  // pela exportação (que pode pedir o ano inteiro).
  function applyLancSecondaryFilters(list: Financial[]): Financial[] {
    const q = lancSearch.toLowerCase()
    const result = list.filter(f => {
      const matchSearch = !lancSearch ||
        f.description.toLowerCase().includes(q) ||
        f.client_name?.toLowerCase().includes(q) ||
        (CATEGORY_LABELS[f.category || ''] || '').toLowerCase().includes(q)
      const matchConta = !lancContaFilter || f.account_id === lancContaFilter
      const matchType = !lancTypeFilter || f.type === lancTypeFilter
      const matchStatus = !lancStatusFilter || f.status === lancStatusFilter
      const matchCategory = !lancCategoryFilter || f.category === lancCategoryFilter
      return matchSearch && matchConta && matchType && matchStatus && matchCategory
    })
    return [...result].sort((a, b) => {
      let va: string | number = '', vb: string | number = ''
      if (lancSortField === 'amount') { va = Number(a.amount); vb = Number(b.amount) }
      else if (lancSortField === 'client_name') { va = (a.client_name || '').toLowerCase(); vb = (b.client_name || '').toLowerCase() }
      else { va = a.due_date || ''; vb = b.due_date || '' }
      if (va < vb) return lancSortDir === 'asc' ? -1 : 1
      if (va > vb) return lancSortDir === 'asc' ? 1 : -1
      return 0
    })
  }

  const lancFiltered = useMemo(
    () => applyLancSecondaryFilters(lancMonthFinancials),
    [lancMonthFinancials, lancSearch, lancContaFilter, lancTypeFilter, lancStatusFilter, lancCategoryFilter, lancSortField, lancSortDir]
  )

  const sheetRows = useMemo(() => buildSheetRows(lancFiltered), [lancFiltered])

  // Gastos (payable) ainda não descontados de honorários, somados por cliente
  const pendingExpensesByClient = useMemo(() => {
    const map: Record<string, number> = {}
    for (const f of financials) {
      if (f.type === 'payable' && !f.reconciled && f.status !== 'cancelled' && f.client_id) {
        map[f.client_id] = (map[f.client_id] || 0) + Number(f.amount)
      }
    }
    return map
  }, [financials])

  // Total stats (all time)
  const totalReceivablePaid = financials.filter(f => f.type === 'receivable' && f.status === 'paid').reduce((s, f) => s + Number(f.amount), 0)
  const totalPayablePaid = financials.filter(f => f.type === 'payable' && f.status === 'paid').reduce((s, f) => s + Number(f.amount), 0)
  const saldo = totalReceivablePaid - totalPayablePaid

  // Current month stats
  // Mesmo recorte da planilha (reais + ocorrências previstas das recorrências)
  const monthFinancials = monthSheetFinancials(financials, currentYear, currentMonth)
  const receitaMensalPrevista = monthFinancials.filter(f => f.type === 'receivable').reduce((s, f) => s + Number(f.amount), 0)
  const despesaMensalPrevista = monthFinancials.filter(f => f.type === 'payable').reduce((s, f) => s + Number(f.amount), 0)
  const receitaMensalRealizada = monthFinancials.filter(f => f.type === 'receivable' && f.status === 'paid').reduce((s, f) => s + Number(f.amount), 0)
  const despesaMensalRealizada = monthFinancials.filter(f => f.type === 'payable' && f.status === 'paid').reduce((s, f) => s + Number(f.amount), 0)

  const pagamentosAtrasados = financials.filter(f => {
    const today = toLocalISODate(now)
    return !f.recurring && f.type === 'receivable' && (f.status === 'overdue' || (f.status === 'pending' && f.due_date && f.due_date < today))
  }).reduce((s, f) => s + Number(f.amount), 0)
  const pagamentosAtrasadosCount = financials.filter(f => {
    const today = toLocalISODate(now)
    return !f.recurring && f.type === 'receivable' && (f.status === 'overdue' || (f.status === 'pending' && f.due_date && f.due_date < today))
  }).length

  // Previous month for comparison
  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1
  const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear
  const prevMonthReceitas = financials.filter(f => {
    const d = parseFinancialDate(f)
    return f.type === 'receivable' && d.getMonth() === prevMonth && d.getFullYear() === prevYear
  }).reduce((s, f) => s + Number(f.amount), 0)
  const prevMonthDespesas = financials.filter(f => {
    const d = parseFinancialDate(f)
    return f.type === 'payable' && d.getMonth() === prevMonth && d.getFullYear() === prevYear
  }).reduce((s, f) => s + Number(f.amount), 0)
  const prevMonthSaldoRealizado = financials.filter(f => {
    const d = parseFinancialDate(f)
    return f.status === 'paid' && d.getMonth() === prevMonth && d.getFullYear() === prevYear
  }).reduce((s, f) => s + (f.type === 'receivable' ? Number(f.amount) : -Number(f.amount)), 0)
  const saldoMensalRealizado = receitaMensalRealizada - despesaMensalRealizada
  const pctSaldo = prevMonthSaldoRealizado !== 0
    ? Math.round(((saldoMensalRealizado - prevMonthSaldoRealizado) / Math.abs(prevMonthSaldoRealizado)) * 100)
    : (saldoMensalRealizado !== 0 ? 100 : 0)

  // Chart data — last 6 months
  const chartData = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(currentYear, currentMonth - 5 + i, 1)
      const m = d.getMonth()
      const y = d.getFullYear()
      const items = monthSheetFinancials(financials, y, m)
      return {
        month: MONTHS_SHORT[m],
        receita: items.filter(f => f.type === 'receivable').reduce((s, f) => s + Number(f.amount), 0),
        despesa: items.filter(f => f.type === 'payable').reduce((s, f) => s + Number(f.amount), 0),
      }
    })
  }, [financials, currentMonth, currentYear])

  // Anos com lançamento + atual + próximo (seletor de ano da exportação)
  const years = useMemo(() => cashFlowYears(financials, currentYear), [financials, currentYear])

  // Expense computed
  const filteredExpenses = useMemo(() => expenses.filter(e => {
    const q = expSearch.toLowerCase()
    return (!expCategory || e.category === expCategory) &&
      (!expSearch || e.description.toLowerCase().includes(q) || e.process_number?.toLowerCase().includes(q))
  }), [expenses, expSearch, expCategory])

  // Planilha-kanban — uma coluna por mês do ano selecionado (sempre as 12,
  // mesmo vazias). Uma despesa nova cai automaticamente na coluna do mês em
  // que foi registrada, porque as colunas são recalculadas a partir de `expenses`.
  const expenseMonthColumns = useMemo(() => buildExpenseMonthColumns(filteredExpenses, expYear), [filteredExpenses, expYear])
  const expYears = useMemo(() => {
    const ys = Array.from(new Set(expenses.map(e => dateParts(e.expense_date)?.year).filter((y): y is number => !!y)))
    if (!ys.includes(expYear)) ys.push(expYear)
    return ys.sort((a, b) => b - a)
  }, [expenses, expYear])

  const monthExpTotal = expenses.filter(e => {
    const d = dateParts(e.expense_date)
    return d && d.month === currentMonth && d.year === currentYear
  }).reduce((s, e) => s + Number(e.amount), 0)
  const pendingReimb = expenses.filter(e => e.reimbursable && !e.reimbursed).reduce((s, e) => s + Number(e.amount), 0)
  const alreadyReimb = expenses.filter(e => e.reimbursed).reduce((s, e) => s + Number(e.amount), 0)

  // Metas de orçamento — gasto do mês corrente por categoria, comparado ao
  // teto opcional definido em expense_budgets.
  const spentThisMonthByCategory = useMemo(() => {
    const map: Record<string, number> = {}
    for (const e of expenses) {
      const d = dateParts(e.expense_date)
      if (!d || d.month !== currentMonth || d.year !== currentYear) continue
      map[e.category] = (map[e.category] || 0) + Number(e.amount)
    }
    return map
  }, [expenses, currentMonth, currentYear])
  const budgetsWithSpend = expenseBudgets
    .map(b => ({ ...b, spent: spentThisMonthByCategory[b.category] || 0 }))
    .filter(b => b.monthly_limit > 0)

  function openBudgetModal() {
    const next: Record<ExpenseCategory, string> = { process: '', travel: '', food: '', transport: '', accommodation: '', other: '' }
    for (const b of expenseBudgets) next[b.category] = String(b.monthly_limit)
    setBudgetForm(next)
    setBudgetModalOpen(true)
  }
  async function saveBudgets() {
    if (!currentUserId || !profile?.tenant_id) return
    setSavingBudgets(true)
    const categories = Object.keys(budgetForm) as ExpenseCategory[]
    const toUpsert = categories
      .filter(cat => budgetForm[cat].trim() !== '' && !Number.isNaN(parseFloat(budgetForm[cat])))
      .map(cat => ({
        tenant_id: profile.tenant_id, user_id: currentUserId, category: cat,
        monthly_limit: parseFloat(budgetForm[cat]),
      }))
    const toDelete = categories.filter(cat => budgetForm[cat].trim() === '')
    if (toUpsert.length > 0) {
      await withErrorFeedback(supabase.from('expense_budgets').upsert(toUpsert, { onConflict: 'user_id,category' }), 'Erro ao salvar metas')
    }
    if (toDelete.length > 0) {
      await withErrorFeedback(supabase.from('expense_budgets').delete().eq('user_id', currentUserId).in('category', toDelete), 'Erro ao salvar metas')
    }
    setSavingBudgets(false)
    setBudgetModalOpen(false)
    load()
  }

  // Commissions
  const clientsWithCol = clients.filter(c => c.colaborador_id)
  const paidCols = clientsWithCol.filter(c => c.colaborador_pago)
  const pendingCols = clientsWithCol.filter(c => !c.colaborador_pago)
  const totalPagoCol = paidCols.reduce((s, c) => s + ((c as any).colaborador_pago_valor ?? 0), 0)
  const filteredComissoes = paidCols.filter(c => {
    const col = colaboradores.find(x => x.id === c.colaborador_id)
    const q = comissaoSearch.toLowerCase()
    return !comissaoSearch || (c.name as string).toLowerCase().includes(q) || col?.nome.toLowerCase().includes(q)
  })
  const comissoesTotalPages = Math.max(1, Math.ceil(filteredComissoes.length / COMISSAO_PAGE_SIZE))
  const pageComissoes = filteredComissoes.slice(comissaoPage * COMISSAO_PAGE_SIZE, (comissaoPage + 1) * COMISSAO_PAGE_SIZE)

  // ── Actions ─────────────────────────────────────────────────────────────────
  function openNew(type?: 'receivable' | 'payable') {
    setEditId(null)
    setDrawerInitial({ ...DRAWER_EMPTY_FORM, type: type || 'receivable' })
    setDrawerOpen(true)
  }
  function openEdit(f: Financial) {
    setEditId(f.id)
    setDrawerInitial({
      type: f.type, category: f.category || 'fees', description: f.description,
      amount: String(f.amount), client_id: f.client_id || '', client_name: f.client_name || '',
      process_id: f.process_id || '', process_number: f.process_number || '',
      due_date: f.due_date || '', paid_date: f.paid_date || '',
      status: (f.status as 'pending' | 'paid' | 'overdue' | 'cancelled') || 'pending',
      notes: f.notes || '', account_id: f.account_id || '',
      // Sem isso, editar um template recorrente pelo drawer e salvar desligava a recorrência
      recurring: !!f.recurring,
      recurrence_interval: f.recurrence_interval || 'monthly',
      recurrence_end_date: f.recurrence_end_date || '',
    })
    setDrawerOpen(true)
  }
  async function save(form: FinancialDrawerForm) {
    setSaving(true)
    const selectedClient = clients.find(c => c.id === form.client_id)
    const selectedProcess = processes.find(p => p.id === form.process_id)
    const clientName = selectedClient?.name || form.client_name
    const processNumber = selectedProcess?.number || form.process_number
    const clientId = form.client_id || null
    const processId = form.process_id || null

    if (!editId && form.installmentPlan.enabled) {
      const totalAmount = parseFloat(form.amount) || 0
      const downPayment = parseFloat(form.installmentPlan.downPayment) || 0
      const count = parseInt(form.installmentPlan.installmentsCount, 10) || 0
      const amounts = computeInstallmentAmounts(totalAmount, downPayment, count)
      const groupId = crypto.randomUUID()
      const rows: Record<string, unknown>[] = []

      if (downPayment > 0) {
        rows.push({
          type: form.type, category: form.category,
          description: `${form.description} — Entrada`,
          amount: downPayment,
          client_id: clientId, client_name: clientName,
          process_id: processId, process_number: processNumber,
          due_date: form.installmentPlan.firstDueDate || null,
          paid_date: form.installmentPlan.downPaymentPaid ? (form.installmentPlan.firstDueDate || null) : null,
          status: form.installmentPlan.downPaymentPaid ? 'paid' : 'pending',
          notes: form.notes || null,
          installment_group_id: groupId, installment_number: 0, installment_total: count,
          reconciled: false,
        })
      }

      const firstDue = new Date(`${form.installmentPlan.firstDueDate}T00:00:00`)
      amounts.forEach((installmentAmount, i) => {
        const dueDate = new Date(firstDue.getFullYear(), firstDue.getMonth() + i, firstDue.getDate())
        rows.push({
          type: form.type, category: form.category,
          description: `${form.description} — Parcela ${i + 1}/${count}`,
          amount: installmentAmount,
          client_id: clientId, client_name: clientName,
          process_id: processId, process_number: processNumber,
          due_date: toLocalISODate(dueDate),
          paid_date: null,
          status: 'pending',
          notes: form.notes || null,
          installment_group_id: groupId, installment_number: i + 1, installment_total: count,
          reconciled: false,
        })
      })

      await withErrorFeedback(supabase.from('financials').insert(rows), 'Erro ao salvar parcelamento')
      setSaving(false)
      setDrawerOpen(false)
      load()
      return
    }

    const payload = {
      type: form.type, category: form.category, description: form.description,
      amount: parseFloat(form.amount) || 0,
      client_name: clientName, process_number: processNumber,
      client_id: clientId, process_id: processId,
      account_id: form.account_id || null,
      due_date: form.due_date || null, paid_date: form.paid_date || null,
      status: form.status, notes: form.notes || null,
      recurring: form.recurring,
      recurrence_interval: form.recurring ? form.recurrence_interval : null,
      recurrence_end_date: form.recurring ? (form.recurrence_end_date || null) : null,
    }
    if (editId) {
      await withErrorFeedback(supabase.from('financials').update(payload).eq('id', editId), 'Erro ao salvar lançamento')
    } else {
      await withErrorFeedback(supabase.from('financials').insert({ ...payload, reconciled: false }), 'Erro ao salvar lançamento')
    }
    setSaving(false)
    setDrawerOpen(false)
    load()
  }
  async function deleteFinancial(id: string) {
    if (!(await confirmDialog('Deseja excluir este lançamento?'))) return
    await withErrorFeedback(supabase.from('financials').update({ deleted_at: new Date().toISOString() }).eq('id', id), 'Erro ao excluir lançamento')
    load()
  }
  // ─── Planilha: edição na célula, pagar, incluir ──────────────────────────────
  /** Grava uma ocorrência prevista (com `patch` aplicado) e avança o template se for a próxima dele. */
  async function materializeOccurrence(row: SheetRow, patch: Partial<Financial>) {
    const template = financials.find(f => f.id === row.templateId)
    const date = row.financial.due_date
    if (!template || !date) return
    const { data, error } = await withErrorFeedback(
      supabase.from('financials').insert(occurrenceInsertPayload(template, date, patch)).select().single(),
      'Erro ao salvar lançamento'
    )
    if (error || !data) return
    const upd = templateUpdateAfterMaterialize(template, date)
    if (upd) await withErrorFeedback(supabase.from('financials').update(upd).eq('id', template.id), 'Erro ao atualizar recorrência')
    setFinancials(prev => {
      const next = upd?.deleted_at
        ? prev.filter(f => f.id !== template.id)
        : prev.map(f => f.id === template.id && upd ? { ...f, ...upd } : f)
      return [...next, data as Financial]
    })
    if (upd?.deleted_at) setRecurringTemplates(prev => prev.filter(f => f.id !== template.id))
    else if (upd) setRecurringTemplates(prev => prev.map(f => f.id === template.id ? { ...f, ...upd } : f))
  }

  async function updateFinancialRow(id: string, patch: Partial<Financial>, errorPrefix: string) {
    setFinancials(prev => prev.map(x => x.id === id ? { ...x, ...patch } : x))
    await withErrorFeedback(supabase.from('financials').update(patch).eq('id', id), errorPrefix)
  }

  async function patchSheetRow(row: SheetRow, patch: SheetPatch) {
    const f = row.financial
    const today = toLocalISODate()
    const full: Partial<Financial> = { ...patch }
    if ('paid_date' in patch) {
      full.status = statusForPaidDate(patch.paid_date ?? null, f.due_date, today)
    } else if (patch.due_date && f.status !== 'paid' && f.status !== 'cancelled') {
      full.status = statusForPaidDate(null, patch.due_date, today)
    }
    if (row.projected) return materializeOccurrence(row, full)
    await updateFinancialRow(f.id, full, 'Erro ao salvar lançamento')
  }

  async function toggleSheetRowPaid(row: SheetRow) {
    const f = row.financial
    const today = toLocalISODate()
    const payload: Partial<Financial> = f.status !== 'paid'
      ? { status: 'paid', paid_date: today }
      : { status: statusForPaidDate(null, f.due_date, today), paid_date: null }
    if (row.projected) return materializeOccurrence(row, payload)
    await updateFinancialRow(f.id, payload, 'Erro ao atualizar pagamento')
  }

  async function quickAddFinancial(input: QuickAddInput): Promise<boolean> {
    const { data, error } = await withErrorFeedback(
      supabase.from('financials').insert({
        ...input,
        status: statusForPaidDate(null, input.due_date, toLocalISODate()),
        paid_date: null,
        reconciled: false,
      }).select().single(),
      'Erro ao salvar lançamento'
    )
    if (error || !data) return false
    setFinancials(prev => [...prev, data as Financial])
    return true
  }

  async function deleteSheetRow(row: SheetRow) {
    if (!row.projected) return deleteFinancial(row.financial.id)
    // Ocorrência prevista: "pular este mês" = gravá-la como cancelada (a recorrência segue nos próximos meses)
    if (!(await confirmDialog('Pular esta ocorrência? A recorrência continua nos meses seguintes.'))) return
    await materializeOccurrence(row, { status: 'cancelled' })
  }

  function editSheetRow(row: SheetRow) {
    if (!row.projected) return openEdit(row.financial)
    const template = financials.find(f => f.id === row.templateId)
    if (template) openEdit(template)
  }

  // ─── Aba Recorrentes ──────────────────────────────────────────────────────────
  function toggleOccurrencePaid(occurrence: Financial) {
    return toggleSheetRowPaid(buildSheetRows([occurrence])[0])
  }
  function openMonthInSheet(year: number, month: number) {
    setOnlyOverdue(false)
    setLancDateFilter('due')
    setLancYear(year)
    setLancMonth(month)
    setSecondaryTab(null)
  }
  function openNewRecurring() {
    setEditId(null)
    setDrawerInitial({ ...DRAWER_EMPTY_FORM, type: 'payable', category: 'rent', recurring: true, recurrence_interval: 'monthly' })
    setDrawerOpen(true)
  }
  async function confirmStopRecurrence(template: Financial) {
    if (!(await confirmDialog(`Encerrar a recorrência "${template.description}"? Os lançamentos já gravados continuam; os próximos meses deixam de ser previstos.`))) return
    await stopRecurrence(template.id)
  }
  function openAdjust(template: Financial) {
    setAdjustTarget(template)
    setAdjustAmount(String(template.amount).replace('.', ','))
    setAdjustFrom((template.due_date || toLocalISODate()).slice(0, 7))
  }
  async function saveAdjust() {
    const t = adjustTarget
    const amount = parseMoneyInput(adjustAmount)
    if (!t || !adjustFrom || amount == null) return
    setSavingAdjust(true)
    const plan = adjustmentPlan(t, financials, adjustFrom)
    if (plan.materializeDates.length > 0) {
      await withErrorFeedback(supabase.from('financials').insert(plan.materializeDates.map(d => occurrenceInsertPayload(t, d))), 'Erro ao reajustar recorrência')
    }
    if (plan.updateIds.length > 0) {
      await withErrorFeedback(supabase.from('financials').update({ amount }).in('id', plan.updateIds), 'Erro ao reajustar recorrência')
    }
    await withErrorFeedback(supabase.from('financials').update({ amount }).eq('id', t.id), 'Erro ao reajustar recorrência')
    setSavingAdjust(false)
    setAdjustTarget(null)
    load()
  }

  // ─── Aba Fluxo de Caixa ───────────────────────────────────────────────────────
  function openCashFlowCell(month: number, category: string, type: Financial['type']) {
    setOnlyOverdue(false)
    setLancDateFilter(cashFlowMode === 'actual' ? 'paid' : 'due')
    setLancTypeFilter(type)
    setLancCategoryFilter(category)
    setLancStatusFilter(cashFlowMode === 'actual' ? 'paid' : '')
    setLancYear(cashFlowYear)
    setLancMonth(month)
    setSecondaryTab(null)
  }
  function exportCashFlow(cf: CashFlow) {
    const modeLabel = cashFlowMode === 'forecast' ? 'Previsto' : 'Realizado'
    const label = (c: string) => CATEGORY_LABELS[c] || c || 'Sem categoria'
    const money = (v: number) => formatCurrency(v)
    const line = (name: string, values: number[], total: number) => [name, ...values.map(money), money(total)]
    const table: string[][] = [
      ['ENTRADAS', ...Array(13).fill('')],
      ...cf.income.map(r => line(label(r.category), r.values, r.total)),
      line('Total entradas', cf.incomeTotals, cf.totalIncome),
      ['SAÍDAS', ...Array(13).fill('')],
      ...cf.expense.map(r => line(label(r.category), r.values, r.total)),
      line('Total saídas', cf.expenseTotals, cf.totalExpense),
      line('Resultado', cf.results, cf.totalResult),
      ['Saldo acumulado', ...cf.balances.map(money), ''],
    ]
    const columns = ['Categoria', ...MONTHS_SHORT, 'Total']
    const csvContent = [columns, ...table].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    openExportWindow({
      title: `Fluxo de Caixa ${cashFlowYear} — ${modeLabel}`,
      subtitle: `${modeLabel} · saldo inicial ${formatCurrency(cf.opening)}`,
      filename: `fluxo-de-caixa-${cashFlowYear}-${cashFlowMode === 'forecast' ? 'previsto' : 'realizado'}`,
      stats: [
        { value: formatCurrency(cf.totalIncome), label: 'Entradas', accent: '#16a34a' },
        { value: formatCurrency(cf.totalExpense), label: 'Saídas', accent: '#dc2626' },
        { value: formatCurrency(cf.totalResult), label: 'Resultado', accent: '#2563eb' },
        { value: formatCurrency(cf.balances[11]), label: 'Saldo em dez', accent: '#7c3aed' },
      ],
      columns,
      rows: table.map(r => r.map((text, i) => ({ text, bold: i === 0 || r[0].startsWith('Total') || r[0] === 'Resultado', right: i > 0 }))),
      csvContent,
    })
  }

  async function stopRecurrence(templateId: string) {
    // Se já gerou ocorrências, o template não é mais "o lançamento" de ninguém — só
    // desligar o recurring deixaria ele como um lançamento solto na próxima data.
    const hasOccurrences = financials.some(f => f.generated_from_id === templateId)
    const patch = hasOccurrences ? { recurring: false, deleted_at: new Date().toISOString() } : { recurring: false }
    await withErrorFeedback(supabase.from('financials').update(patch).eq('id', templateId), 'Erro ao encerrar recorrência')
    setRecurringTemplates(prev => prev.filter(f => f.id !== templateId))
    setFinancials(prev => hasOccurrences ? prev.filter(f => f.id !== templateId) : prev.map(f => f.id === templateId ? { ...f, recurring: false } : f))
  }

  function openNewExpense(prefillDate?: string) {
    setEditExpenseId(null)
    setReceiptError('')
    setExpenseForm({ ...EMPTY_EXPENSE, expense_date: prefillDate || toLocalISODate() })
    setExpenseModalOpen(true)
  }
  function openEditExpense(e: UserExpense) {
    setEditExpenseId(e.id)
    setReceiptError('')
    setExpenseForm({
      category: e.category, description: e.description, amount: String(e.amount),
      expense_date: e.expense_date, process_id: e.process_id || '',
      trip_destination: e.trip_destination || '', reimbursable: !!e.reimbursable,
      reimbursed: !!e.reimbursed, notes: e.notes || '', receipt_url: e.receipt_url || '',
    })
    setExpenseModalOpen(true)
  }
  async function uploadReceipt(file: File) {
    if (!profile?.tenant_id) return
    setUploadingReceipt(true)
    setReceiptError('')
    try {
      const path = `${profile.tenant_id}/receipts/${Date.now()}_${sanitizeFileName(file.name)}`
      const { error: uploadErr } = await supabase.storage.from('documents').upload(path, file)
      if (uploadErr) throw uploadErr
      const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(path)
      setExpenseForm(f => ({ ...f, receipt_url: publicUrl }))
    } catch (err: any) {
      setReceiptError(err.message || 'Erro ao enviar comprovante')
    } finally {
      setUploadingReceipt(false)
    }
  }
  async function saveExpense() {
    if (!expenseForm.description.trim() || !expenseForm.amount || !currentUserId) return
    setSavingExpense(true)
    const selectedProcess = processes.find(p => p.id === expenseForm.process_id)
    const payload: any = {
      user_id: currentUserId, category: expenseForm.category, description: expenseForm.description,
      amount: parseFloat(expenseForm.amount), expense_date: expenseForm.expense_date,
      process_id: expenseForm.process_id || null, process_number: selectedProcess?.number || null,
      trip_destination: expenseForm.category === 'travel' ? (expenseForm.trip_destination || null) : null,
      reimbursable: expenseForm.reimbursable,
      reimbursed: expenseForm.reimbursable ? expenseForm.reimbursed : false,
      notes: expenseForm.notes || null,
      receipt_url: expenseForm.receipt_url || null,
    }
    if (editExpenseId) await withErrorFeedback(supabase.from('user_expenses').update(payload).eq('id', editExpenseId), 'Erro ao salvar despesa')
    else await withErrorFeedback(supabase.from('user_expenses').insert(payload), 'Erro ao salvar despesa')
    setSavingExpense(false)
    setExpenseModalOpen(false)
    load()
  }
  async function deleteExpense(id: string) {
    if (!(await confirmDialog('Deseja excluir esta despesa?'))) return
    await withErrorFeedback(supabase.from('user_expenses').update({ deleted_at: new Date().toISOString() }).eq('id', id), 'Erro ao excluir despesa')
    load()
  }

  function toggleSelectExpense(id: string) {
    setSelectedExpenseIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  async function bulkMarkReimbursed() {
    if (selectedExpenseIds.size === 0) return
    setBulkReimbursing(true)
    await withErrorFeedback(supabase.from('user_expenses').update({ reimbursed: true }).in('id', Array.from(selectedExpenseIds)), 'Erro ao marcar como reembolsado')
    setBulkReimbursing(false)
    setSelectedExpenseIds(new Set())
    load()
  }

  function navMonth(dir: -1 | 1) {
    setOnlyOverdue(false)
    const d = new Date(lancYear, lancMonth + dir, 1)
    setLancMonth(d.getMonth())
    setLancYear(d.getFullYear())
  }

  // ─── Seleção em massa (lançamentos) ──────────────────────────────────────────
  function toggleSelectLanc(id: string) {
    setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }
  function toggleSelectAllLanc() {
    const ids = sheetRows.filter(r => !r.projected).map(r => r.financial.id)
    setSelectedIds(prev => {
      const allSelected = ids.length > 0 && ids.every(id => prev.has(id))
      const next = new Set(prev)
      if (allSelected) ids.forEach(id => next.delete(id))
      else ids.forEach(id => next.add(id))
      return next
    })
  }
  async function bulkMarkPaid() {
    setBulkWorking(true)
    await withErrorFeedback(supabase.from('financials').update({ status: 'paid', paid_date: toLocalISODate() }).in('id', Array.from(selectedIds)), 'Erro ao marcar como pago')
    setBulkWorking(false)
    setSelectedIds(new Set())
    load()
  }
  async function bulkDeleteLanc() {
    if (!(await confirmDialog(`Excluir ${selectedIds.size} lançamento(s) selecionado(s)?`))) return
    setBulkWorking(true)
    await withErrorFeedback(supabase.from('financials').update({ deleted_at: new Date().toISOString() }).in('id', Array.from(selectedIds)), 'Erro ao excluir lançamentos')
    setBulkWorking(false)
    setSelectedIds(new Set())
    load()
  }

  // ─── Contas bancárias ─────────────────────────────────────────────────────────
  function accountBalance(accountId: string) {
    const items = financials.filter(f => f.account_id === accountId && f.status === 'paid')
    const receitas = items.filter(f => f.type === 'receivable').reduce((s, f) => s + Number(f.amount), 0)
    const despesas = items.filter(f => f.type === 'payable').reduce((s, f) => s + Number(f.amount), 0)
    return { receitas, despesas, saldo: receitas - despesas }
  }
  async function saveNewAccount() {
    if (!newAccountName.trim()) return
    setSavingAccount(true)
    await withErrorFeedback(supabase.from('financial_accounts').insert({ name: newAccountName.trim() }), 'Erro ao criar conta')
    setSavingAccount(false)
    setNewAccountName('')
    setNewAccountOpen(false)
    load()
  }

  /** mode 'month' exporta só `month`/`year`; mode 'year' exporta os 12 meses de `year`. */
  function exportLancamentos(mode: 'year' | 'month', year: number, month: number) {
    // Mesmo recorte da planilha: por vencimento inclui as ocorrências previstas das recorrências
    const dateFiltered = lancDateFilter === 'due'
      ? (mode === 'year'
        ? Array.from({ length: 12 }, (_, m) => monthSheetFinancials(financials, year, m)).flat()
        : monthSheetFinancials(financials, year, month))
      : financials.filter(f => {
        if (f.recurring) return false
        const dateStr = f.paid_date || f.due_date
        if (!dateStr) return false
        const d = new Date(`${dateStr}T00:00:00`)
        if (mode === 'year') return d.getFullYear() === year
        return d.getMonth() === month && d.getFullYear() === year
      })
    const scoped = applyLancSecondaryFilters(onlyOverdue ? dateFiltered.filter(f => f.status === 'overdue') : dateFiltered)

    const receitas = scoped.filter(f => f.type === 'receivable').reduce((s, f) => s + Number(f.amount), 0)
    const despesas = scoped.filter(f => f.type === 'payable').reduce((s, f) => s + Number(f.amount), 0)
    const pagos = scoped.filter(f => f.status === 'paid').length
    const STATUS_BADGE: Record<string, string> = { paid: 'green', pending: 'amber', overdue: 'red', cancelled: 'gray' }
    const STATUS_LABEL: Record<string, string> = { paid: 'Pago', pending: 'Pendente', overdue: 'Vencido', cancelled: 'Cancelado' }
    const periodLabel = mode === 'year' ? `Ano de ${year}` : `${MONTHS_PT[month]} de ${year}`
    const csvContent = [
      'Vencimento,Pagamento,Lançamento,Categoria,Tipo,Valor,Status',
      ...scoped.map(f =>
        `"${formatDate(f.due_date)}","${formatDate(f.paid_date)}","${f.description}","${CATEGORY_LABELS[f.category || ''] || f.category || '—'}","${f.type === 'receivable' ? 'Receita' : 'Despesa'}","${f.type === 'receivable' ? '' : '-'}${formatCurrency(f.amount)}","${STATUS_LABEL[f.status || 'pending'] ?? ''}"`
      ),
    ].join('\n')
    openExportWindow({
      title: `Lançamentos — ${periodLabel}`,
      subtitle: periodLabel,
      filename: mode === 'year' ? `lancamentos-${year}` : `lancamentos-${MONTHS_PT[month].toLowerCase()}-${year}`,
      stats: [
        { value: scoped.length, label: 'Lançamentos', accent: '#2563eb' },
        { value: formatCurrency(receitas), label: 'Receitas', accent: '#16a34a' },
        { value: formatCurrency(despesas), label: 'Despesas', accent: '#dc2626' },
        { value: pagos, label: 'Pagos', accent: '#7c3aed' },
      ],
      columns: ['Vencimento', 'Pagamento', 'Lançamento', 'Categoria', 'Tipo', 'Valor', 'Status'],
      rows: scoped.map(f => [
        { text: formatDate(f.due_date) },
        { text: formatDate(f.paid_date) },
        { text: f.description, bold: true },
        { text: CATEGORY_LABELS[f.category || ''] || f.category || '—' },
        { text: f.type === 'receivable' ? 'Receita' : 'Despesa', badge: f.type === 'receivable' ? 'green' : 'red' },
        { text: `${f.type === 'receivable' ? '' : '−'}${formatCurrency(f.amount)}`, right: true, danger: f.type === 'payable' },
        { text: STATUS_LABEL[f.status || 'pending'] ?? f.status ?? '—', badge: STATUS_BADGE[f.status || 'pending'] ?? 'gray' },
      ]),
      csvContent,
    })
  }

  /** mode 'month' exporta só `month`/`year`; mode 'year' exporta os 12 meses de `year`. */
  function exportExpenses(mode: 'year' | 'month', year: number, month: number) {
    const scopedExpenses = filteredExpenses.filter(e => {
      const parts = dateParts(e.expense_date)
      if (!parts) return false
      if (mode === 'year') return parts.year === year
      return parts.year === year && parts.month === month
    })
    const grouped = groupExpensesByMonth(scopedExpenses)
    const total = grouped.reduce((s, g) => s + g.total, 0)
    const totalCount = grouped.reduce((s, g) => s + g.items.length, 0)
    const scopedPendingReimb = scopedExpenses.filter(e => e.reimbursable && !e.reimbursed).reduce((s, e) => s + Number(e.amount), 0)
    const scopedAlreadyReimb = scopedExpenses.filter(e => e.reimbursed).reduce((s, e) => s + Number(e.amount), 0)
    const periodLabel = mode === 'year' ? `Ano de ${year}` : `${MONTHS_PT[month]} de ${year}`
    const csvContent = [
      'Mês,Dia,Descrição,Categoria,Valor,Reembolsável,Reembolsado',
      ...grouped.flatMap(g => g.items.map(e => {
        const day = dateParts(e.expense_date)?.day ?? ''
        return `"${MONTHS_PT[g.month]}/${g.year}","${day}","${e.description}","${CATEGORY_META[e.category].label}","-${formatCurrency(e.amount)}","${e.reimbursable ? 'Sim' : 'Não'}","${e.reimbursed ? 'Sim' : 'Não'}"`
      })),
    ].join('\n')
    openExportWindow({
      title: 'Minhas Despesas',
      subtitle: (expCategory ? `Categoria: ${CATEGORY_META[expCategory as ExpenseCategory].label} — ` : '') + periodLabel,
      filename: mode === 'year' ? `minhas-despesas-${year}` : `minhas-despesas-${MONTHS_PT[month].toLowerCase()}-${year}`,
      stats: [
        { value: totalCount, label: 'Despesas', accent: '#2563eb' },
        { value: formatCurrency(total), label: 'Total gasto', accent: '#dc2626' },
        { value: formatCurrency(scopedPendingReimb), label: 'A reembolsar', accent: '#f97316' },
        { value: formatCurrency(scopedAlreadyReimb), label: 'Reembolsado', accent: '#16a34a' },
      ],
      columns: ['Dia', 'Descrição', 'Categoria', 'Valor', 'Reembolso'],
      rows: [],
      groups: grouped.map(g => ({
        label: `${MONTHS_PT[g.month]} de ${g.year}`,
        rows: g.items.map(e => {
          const day = dateParts(e.expense_date)?.day
          return [
            { text: day != null ? String(day).padStart(2, '0') : '—' },
            { text: e.description, bold: true },
            { text: CATEGORY_META[e.category].label },
            { text: `-${formatCurrency(e.amount)}`, right: true, danger: true },
            { text: e.reimbursable ? (e.reimbursed ? 'Reembolsado' : 'A reembolsar') : '—', badge: e.reimbursable ? (e.reimbursed ? 'green' : 'amber') : 'gray' },
          ]
        }),
      })),
      csvContent,
    })
  }

  /** Abre o seletor de período; a exportação de fato só roda quando o usuário confirma. */
  function requestExport(kind: 'lancamentos' | 'expenses') {
    if (kind === 'lancamentos') {
      setExportScopeMode('month')
      setExportScopeYear(lancYear)
      setExportScopeMonth(lancMonth)
    } else {
      setExportScopeMode('year')
      setExportScopeYear(expYear)
      setExportScopeMonth(now.getMonth())
    }
    setExportScopeOpen(kind)
  }

  function confirmExportScope() {
    if (exportScopeOpen === 'lancamentos') exportLancamentos(exportScopeMode, exportScopeYear, exportScopeMonth)
    else if (exportScopeOpen === 'expenses') exportExpenses(exportScopeMode, exportScopeYear, exportScopeMonth)
    setExportScopeOpen(null)
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  if (loading) return null

  const pctReceita = prevMonthReceitas > 0 ? Math.round(((receitaMensalPrevista - prevMonthReceitas) / prevMonthReceitas) * 100) : 0
  const pctDespesa = prevMonthDespesas > 0 ? Math.round(((despesaMensalPrevista - prevMonthDespesas) / prevMonthDespesas) * 100) : 0

  return (
    <Layout title="Financeiro">
      <div className="space-y-4 animate-fade-in">

        {/* ── Abas ── */}
        <div className="flex gap-1 border-b border-slate-200 dark:border-dark-700 overflow-x-auto">
          {([
            { id: null, label: 'Visão Geral', icon: LineChartIcon },
            { id: 'recorrentes', label: `Recorrentes${recurringTemplates.length > 0 ? ` (${recurringTemplates.length})` : ''}`, icon: Repeat },
            { id: 'comissoes', label: 'Comissões', icon: Users },
            { id: 'expenses', label: 'Minhas Despesas', icon: Wallet },
            { id: 'fluxo', label: 'Fluxo de Caixa', icon: TrendingUp },
          ] as { id: SecondaryTab | null; label: string; icon: any }[]).map(t => {
            const Icon = t.icon
            const active = secondaryTab === t.id
            return (
              <button
                key={t.label}
                onClick={() => setSecondaryTab(t.id)}
                className={cn(
                  'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap',
                  active
                    ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                )}
              >
                <Icon className="w-4 h-4" /> {t.label}
              </button>
            )
          })}
        </div>

        {secondaryTab === null && (
        <>
        {/* ── 4 Top stat cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Saldo */}
          <Card className="p-4 border-l-4 border-primary-500">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Saldo</p>
            <div className="flex items-end gap-2 mt-1.5">
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{formatCurrency(saldo)}</p>
              {pctSaldo !== 0 && (
                <span className={cn('text-[11px] font-bold px-1.5 py-0.5 rounded-full mb-1',
                  pctSaldo >= 0 ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' : 'text-red-500 bg-red-50 dark:bg-red-900/20'
                )}>
                  {pctSaldo >= 0 ? '↑' : '↓'} {Math.abs(pctSaldo)}%
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">saldo realizado do mês vs anterior: {formatCurrency(prevMonthSaldoRealizado)}</p>
          </Card>

          {/* Receita mensal prevista */}
          <Card className="p-4 border-l-4 border-green-500">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Receita mensal prevista</p>
            <div className="flex items-end gap-2 mt-1.5">
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{formatCurrency(receitaMensalPrevista)}</p>
              {pctReceita !== 0 && (
                <span className={cn('text-[11px] font-bold px-1.5 py-0.5 rounded-full mb-1',
                  pctReceita >= 0 ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' : 'text-red-500 bg-red-50 dark:bg-red-900/20'
                )}>
                  {pctReceita >= 0 ? '↑' : '↓'} {Math.abs(pctReceita)}%
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">vs realizado: {formatCurrency(receitaMensalRealizada)}</p>
          </Card>

          {/* Despesa mensal prevista */}
          <Card className="p-4 border-l-4 border-red-500">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Despesa mensal prevista</p>
            <div className="flex items-end gap-2 mt-1.5">
              <p className={cn('text-2xl font-bold', despesaMensalPrevista > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white')}>
                {despesaMensalPrevista > 0 ? `-${formatCurrency(despesaMensalPrevista)}` : formatCurrency(0)}
              </p>
              {pctDespesa !== 0 && (
                <span className={cn('text-[11px] font-bold px-1.5 py-0.5 rounded-full mb-1',
                  pctDespesa <= 0 ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' : 'text-red-500 bg-red-50 dark:bg-red-900/20'
                )}>
                  {pctDespesa <= 0 ? '↓' : '↑'} {Math.abs(pctDespesa)}%
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">vs realizado: -{formatCurrency(despesaMensalRealizada)}</p>
          </Card>

          {/* Pagamentos atrasados */}
          <Card className="p-4 border-l-4 border-orange-500">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pagamentos atrasados</p>
            <p className={cn('text-2xl font-bold mt-1.5', pagamentosAtrasados > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white')}>
              {pagamentosAtrasados > 0 ? `-${formatCurrency(pagamentosAtrasados)}` : formatCurrency(0)}
            </p>
            <button
              onClick={() => {
                setOnlyOverdue(true)
                document.getElementById('lancamentos-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              className="text-[11px] text-primary-600 dark:text-primary-400 hover:underline mt-1"
            >
              Mostrar lançamentos {pagamentosAtrasadosCount > 0 ? `(${pagamentosAtrasadosCount})` : ''}
            </button>
          </Card>
        </div>

        {/* ── Middle: Chart + Side panel ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Chart */}
          <Card className="lg:col-span-2 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-slate-800 dark:text-white">Receitas x Despesas</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">com base no vencimento</p>
              </div>
              <button onClick={load} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-700 text-slate-400 transition-colors">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-4 mb-3 text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-primary-500 inline-block" />Receita</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-400 inline-block" />Despesa</span>
            </div>
            <Suspense fallback={<ChartFallback />}>
              <RevenueExpenseLineChart data={chartData} />
            </Suspense>
            {/* Month labels row */}
            <div className="flex justify-between text-[10px] text-slate-400 mt-1 px-1">
              {chartData.map(d => <span key={d.month}>{d.month}</span>)}
            </div>
          </Card>

          {/* Side panel */}
          <Card className="p-4 flex flex-col gap-4">
            {/* Contas bancárias */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Contas bancárias</p>
                <button onClick={() => setNewAccountOpen(v => !v)} className="text-primary-600 dark:text-primary-400 hover:text-primary-700 transition-colors" title="Nova conta">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              {newAccountOpen && (
                <div className="flex gap-1.5 mb-2">
                  <input
                    value={newAccountName} onChange={e => setNewAccountName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveNewAccount() }}
                    placeholder="Nome da conta" autoFocus
                    className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  />
                  <button onClick={saveNewAccount} disabled={savingAccount || !newAccountName.trim()} className="px-2.5 py-1.5 text-xs font-semibold bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg transition-colors">
                    {savingAccount ? '...' : 'Criar'}
                  </button>
                </div>
              )}
              {accounts.length === 0 ? (
                <p className="text-xs text-slate-400 dark:text-slate-500 py-2">Nenhuma conta cadastrada. Crie uma para organizar seus lançamentos por conta.</p>
              ) : (
                <div className="space-y-1">
                  {accounts.map(conta => {
                    const bal = accountBalance(conta.id)
                    return (
                      <div key={conta.id} className="rounded-xl border border-slate-100 dark:border-dark-700 overflow-hidden">
                        <button
                          onClick={() => setContasOpen(o => ({ ...o, [conta.id]: !o[conta.id] }))}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-dark-700/50 transition-colors"
                        >
                          <div className="w-7 h-7 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 flex-shrink-0">
                            <Landmark className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex-1 text-left min-w-0">
                            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{conta.name}</p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">{formatCurrency(bal.saldo)}</p>
                          </div>
                          <ChevronDown className={cn('w-3.5 h-3.5 text-slate-400 transition-transform flex-shrink-0', contasOpen[conta.id] && 'rotate-180')} />
                        </button>
                        {contasOpen[conta.id] && (
                          <div className="px-4 pb-3 pt-1 bg-slate-50 dark:bg-dark-800/50 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-dark-700">
                            <div className="flex justify-between py-1"><span>Receitas pagas</span><span className="text-emerald-600 font-medium">{formatCurrency(bal.receitas)}</span></div>
                            <div className="flex justify-between py-1"><span>Despesas pagas</span><span className="text-red-500 font-medium">{formatCurrency(bal.despesas)}</span></div>
                            <div className="flex justify-between py-1 font-semibold border-t border-slate-200 dark:border-dark-600 mt-1 pt-2"><span>Saldo</span><span className="text-slate-700 dark:text-slate-200">{formatCurrency(bal.saldo)}</span></div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* ── Lançamentos section ── */}
        <Card id="lancamentos-section" className="overflow-hidden scroll-mt-4">
          {/* Header */}
          <div className="px-5 py-3 border-b border-slate-100 dark:border-dark-700/50 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 dark:text-white">Lançamentos</h2>
            {/* Botão "Perguntar ao Copiloto" desativado temporariamente a pedido do usuário
                (2026-09-16), junto com o Assistente IA. Para reativar, descomentar o button
                abaixo.
            <button
              onClick={() => navigate('/dashboard', {
                state: { openTab: 'ia', prefillQuestion: 'Como está a saúde financeira do escritório este mês? Aponte riscos e o que precisa de atenção.' },
              })}
              className="flex items-center gap-1.5 text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
            >
              <Sparkles className="w-3.5 h-3.5" /> Perguntar ao Copiloto
            </button> */}
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 dark:border-dark-700/50 flex-wrap bg-slate-50/50 dark:bg-dark-800/30">
            {/* Conta filter */}
            <select
              value={lancContaFilter}
              onChange={e => setLancContaFilter(e.target.value)}
              className="text-xs border border-slate-200 dark:border-dark-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-dark-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
            >
              <option value="">Filtrar por conta</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>

            {/* Date type filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-400 whitespace-nowrap hidden sm:inline">Mês por</span>
              <select
                value={lancDateFilter}
                onChange={e => setLancDateFilter(e.target.value as 'due' | 'paid')}
                disabled={onlyOverdue}
                className="text-xs border border-slate-200 dark:border-dark-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-dark-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:opacity-50"
              >
                <option value="due">Data de vencimento</option>
                <option value="paid">Data de pagamento</option>
              </select>
            </div>

            {onlyOverdue ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg">
                Somente atrasados
                <button onClick={() => setOnlyOverdue(false)} className="hover:text-red-800 dark:hover:text-red-300"><X className="w-3 h-3" /></button>
              </div>
            ) : (
              /* Month navigation */
              <div className="flex items-center gap-1">
                <button onClick={() => navMonth(-1)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-700 text-slate-500 transition-colors">
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 min-w-[90px] text-center">
                  {MONTHS_PT[lancMonth].slice(0, 3)} {lancYear}
                </span>
                <button onClick={() => navMonth(1)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-700 text-slate-500 transition-colors">
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="flex-1" />

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                value={lancSearch}
                onChange={e => setLancSearch(e.target.value)}
                placeholder="Buscar..."
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary-100 w-36"
              />
            </div>

            {/* Filtrar */}
            <div className="relative" ref={lancFilterRef}>
              <button
                onClick={() => { setLancFilterOpen(v => !v); setLancSortOpen(false) }}
                className={cn('flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border rounded-lg transition-colors',
                  lancFilterOpen || lancTypeFilter || lancStatusFilter || lancCategoryFilter
                    ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 border-primary-300 dark:border-primary-700'
                    : 'text-slate-600 dark:text-slate-300 border-slate-200 dark:border-dark-600 hover:bg-slate-100 dark:hover:bg-dark-700')}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" /> Filtrar
                {[lancTypeFilter, lancStatusFilter, lancCategoryFilter].filter(Boolean).length > 0 && (
                  <span className="ml-0.5 w-4 h-4 rounded-full bg-primary-600 text-white text-[10px] font-bold flex items-center justify-center">
                    {[lancTypeFilter, lancStatusFilter, lancCategoryFilter].filter(Boolean).length}
                  </span>
                )}
              </button>
              {lancFilterOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-64 bg-white dark:bg-dark-800 border border-slate-200 dark:border-dark-600 rounded-xl shadow-modal z-50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">Filtros</p>
                    {(lancTypeFilter || lancStatusFilter || lancCategoryFilter) && (
                      <button onClick={() => { setLancTypeFilter(''); setLancStatusFilter(''); setLancCategoryFilter('') }} className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium">Limpar</button>
                    )}
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Tipo</label>
                    <div className="flex gap-1.5">
                      {[{ v: '', l: 'Todos' }, { v: 'receivable', l: 'Receita' }, { v: 'payable', l: 'Despesa' }].map(o => (
                        <button key={o.v} onClick={() => setLancTypeFilter(o.v)} className={cn('px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors',
                          lancTypeFilter === o.v ? 'bg-primary-600 text-white border-primary-600' : 'border-slate-200 dark:border-dark-600 text-slate-600 dark:text-slate-300')}>{o.l}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Status</label>
                    <select value={lancStatusFilter} onChange={e => setLancStatusFilter(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-700 text-slate-700 dark:text-slate-200">
                      <option value="">Todos</option>
                      <option value="pending">Pendente</option>
                      <option value="paid">Pago</option>
                      <option value="overdue">Vencido</option>
                      <option value="cancelled">Cancelado</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Categoria</label>
                    <select value={lancCategoryFilter} onChange={e => setLancCategoryFilter(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-700 text-slate-700 dark:text-slate-200">
                      <option value="">Todas</option>
                      {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Ordenar */}
            <div className="relative" ref={lancSortRef}>
              <button
                onClick={() => { setLancSortOpen(v => !v); setLancFilterOpen(false) }}
                className={cn('flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border rounded-lg transition-colors',
                  lancSortOpen ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 border-primary-300 dark:border-primary-700' : 'text-slate-600 dark:text-slate-300 border-slate-200 dark:border-dark-600 hover:bg-slate-100 dark:hover:bg-dark-700')}
              >
                <ArrowUpDown className="w-3.5 h-3.5" /> Ordenar
              </button>
              {lancSortOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-52 bg-white dark:bg-dark-800 border border-slate-200 dark:border-dark-600 rounded-xl shadow-modal z-50 p-2 space-y-0.5">
                  {([
                    { field: 'due_date' as const, dir: 'desc' as const, label: 'Vencimento (recente)' },
                    { field: 'due_date' as const, dir: 'asc' as const, label: 'Vencimento (antigo)' },
                    { field: 'amount' as const, dir: 'desc' as const, label: 'Maior valor' },
                    { field: 'amount' as const, dir: 'asc' as const, label: 'Menor valor' },
                    { field: 'client_name' as const, dir: 'asc' as const, label: 'Cliente A → Z' },
                  ]).map(opt => (
                    <button key={`${opt.field}-${opt.dir}`} onClick={() => { setLancSortField(opt.field); setLancSortDir(opt.dir); setLancSortOpen(false) }}
                      className={cn('w-full text-left px-3 py-2 text-xs rounded-lg transition-colors',
                        lancSortField === opt.field && lancSortDir === opt.dir ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 font-semibold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-dark-700')}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => setSecondaryTab('recorrentes')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-dark-600 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-700 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Recorrentes{recurringTemplates.length > 0 ? ` (${recurringTemplates.length})` : ''}
            </button>
            <button
              onClick={() => requestExport('lancamentos')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-dark-600 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Exportar
            </button>
            <button onClick={() => openNew('payable')} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-dark-600 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-700 transition-colors">
              <Minus className="w-3.5 h-3.5" /> Despesa
            </button>
            <button onClick={() => openNew('receivable')} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg transition-colors shadow-button">
              <Plus className="w-3.5 h-3.5" /> Receita
            </button>
          </div>

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 border-b border-primary-100 dark:border-primary-800/40 bg-primary-50/60 dark:bg-primary-900/10 flex-wrap">
              <span className="text-xs font-semibold text-primary-700 dark:text-primary-400">{selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}</span>
              <button onClick={bulkMarkPaid} disabled={bulkWorking} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
                <CheckCircle2 className="w-3.5 h-3.5" /> Marcar como pago
              </button>
              <button onClick={bulkDeleteLanc} disabled={bulkWorking} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                <Trash2 className="w-3.5 h-3.5" /> Excluir
              </button>
              <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">Limpar seleção</button>
            </div>
          )}

          {/* Planilha */}
          <FinancialSheet
            rows={sheetRows}
            accounts={accounts}
            categoryLabels={CATEGORY_LABELS}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelectLanc}
            onToggleSelectAll={toggleSelectAllLanc}
            onPatch={patchSheetRow}
            onTogglePaid={toggleSheetRowPaid}
            onQuickAdd={quickAddFinancial}
            hideQuickAdd={onlyOverdue}
            defaultNewDate={lancYear === currentYear && lancMonth === currentMonth ? toLocalISODate() : toLocalISODate(new Date(lancYear, lancMonth, 1))}
            renderMeta={row => {
              const f = row.financial
              if (!f.client_name && !f.process_number) return null
              return (
                <div className="flex items-center gap-2 not-italic">
                  {f.client_name && (
                    <button
                      onClick={() => navigate('/clientes', { state: { prefillSearch: f.client_name } })}
                      className="text-[11px] text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 hover:underline truncate max-w-[160px]"
                    >{f.client_name}</button>
                  )}
                  {f.process_number && (
                    <button
                      onClick={() => navigate('/processos', { state: { prefillSearch: f.process_number } })}
                      className="text-[11px] text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 hover:underline truncate max-w-[160px] font-mono"
                    >{f.process_number}</button>
                  )}
                </div>
              )
            }}
            renderActions={row => {
              const f = row.financial
              const linkedClient = clients.find(c => c.id === f.client_id)
              const wa = linkedClient?.phone ? waLink(linkedClient.phone) : null
              return (
                <>
                  {wa && f.type === 'receivable' && f.status !== 'paid' && (
                    <a
                      href={`${wa}?text=${encodeURIComponent(`Olá${f.client_name ? ' ' + f.client_name.split(' ')[0] : ''}, passando para lembrar do pagamento "${f.description}" no valor de ${formatCurrency(f.amount)}${f.due_date ? `, com vencimento em ${formatDate(f.due_date)}` : ''}.`)}`}
                      target="_blank" rel="noreferrer" title="Cobrar via WhatsApp"
                      className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 text-slate-400 hover:text-green-500"
                    ><MessageCircle className="w-3.5 h-3.5" /></a>
                  )}
                  <button onClick={() => editSheetRow(row)} title={row.projected ? 'Editar recorrência' : 'Editar lançamento'}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-600 text-slate-400 hover:text-primary-600">
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => deleteSheetRow(row)} title={row.projected ? 'Pular esta ocorrência' : 'Excluir'}
                    className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )
            }}
          />
        </Card>
        </>
        )}

        {/* ── Recorrentes ── */}
        {secondaryTab === 'recorrentes' && (
          <RecurringTab
            templates={recurringTemplates}
            financials={financials}
            year={recurringYear}
            onYearChange={setRecurringYear}
            onTogglePaid={toggleOccurrencePaid}
            onOpenMonth={openMonthInSheet}
            onAdjust={openAdjust}
            onEdit={openEdit}
            onStop={confirmStopRecurrence}
            onNew={openNewRecurring}
          />
        )}

        {/* ── Comissões ── */}
        {secondaryTab === 'comissoes' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Card className="p-4 border-l-4 border-primary-500">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">Total de Clientes</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{clientsWithCol.length}</p>
                    <p className="text-xs text-slate-400">com colaborador vinculado</p>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                    <Users className="w-5 h-5 text-primary-600" />
                  </div>
                </div>
              </Card>
              <Card className="p-4 border-l-4 border-green-500">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">Colaboradores Pagos</p>
                    <p className="text-2xl font-bold text-green-600 mt-1">{paidCols.length}</p>
                    <p className="text-xs text-slate-400">{formatCurrency(totalPagoCol)}</p>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  </div>
                </div>
              </Card>
              <Card className="p-4 border-l-4 border-orange-500">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">Pendentes</p>
                    <p className="text-2xl font-bold text-orange-600 mt-1">{pendingCols.length}</p>
                    <p className="text-xs text-slate-400">aguardando pagamento</p>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                    <Clock className="w-5 h-5 text-orange-600" />
                  </div>
                </div>
              </Card>
            </div>
            <Card className="p-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  placeholder="Buscar por cliente ou colaborador..."
                  value={comissaoSearch}
                  onChange={e => { setComissaoSearch(e.target.value); setComissaoPage(0) }}
                />
              </div>
            </Card>
            {filteredComissoes.length === 0 ? (
              <EmptyState icon={UserCheck} title="Nenhuma comissão registrada" />
            ) : (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-dark-700/40 border-b border-slate-200 dark:border-dark-700">
                      {['Cliente', 'Colaborador', 'Comissão', 'Valor Pago', 'Status', 'Data'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-dark-700/50">
                    {pageComissoes.map(c => {
                      const col = colaboradores.find(x => x.id === c.colaborador_id)
                      return (
                        <tr key={c.id} className="hover:bg-primary-50/30 dark:hover:bg-primary-900/10 transition-colors">
                          <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{c.name as string}</td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{col?.nome || '—'}</td>
                          <td className="px-4 py-3 text-primary-600 dark:text-primary-400 font-semibold">{col?.comissao_percent != null ? `${col.comissao_percent}%` : '—'}</td>
                          <td className="px-4 py-3 font-bold text-green-600 dark:text-green-400">{(c as any).colaborador_pago_valor != null ? formatCurrency((c as any).colaborador_pago_valor) : '—'}</td>
                          <td className="px-4 py-3">
                            <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
                              c.colaborador_pago ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                            )}>
                              {c.colaborador_pago ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                              {c.colaborador_pago ? 'Pago' : 'Pendente'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                            {c.colaborador_pago && (c as any).colaborador_pago_data ? formatDate((c as any).colaborador_pago_data) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                </div>
                {comissoesTotalPages > 1 && (
                  <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-slate-100 dark:border-dark-700 bg-slate-50/50 dark:bg-dark-700/20">
                    <p className="text-xs text-slate-400">
                      {comissaoPage * COMISSAO_PAGE_SIZE + 1}–{Math.min((comissaoPage + 1) * COMISSAO_PAGE_SIZE, filteredComissoes.length)} de {filteredComissoes.length}
                    </p>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setComissaoPage(p => p - 1)} disabled={comissaoPage === 0}
                        className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-dark-600 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-dark-700 disabled:opacity-40">
                        ← Anterior
                      </button>
                      <button onClick={() => setComissaoPage(p => p + 1)} disabled={comissaoPage >= comissoesTotalPages - 1}
                        className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-dark-600 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-dark-700 disabled:opacity-40">
                        Próximo →
                      </button>
                    </div>
                  </div>
                )}
              </Card>
            )}
          </div>
        )}

        {/* ── Minhas Despesas ── */}
        {secondaryTab === 'expenses' && (
          <div className="space-y-4">
            {isAdmin && teamMembers.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Ver despesas de</span>
                <select
                  value={effectiveUserId || ''}
                  onChange={e => setViewedUserId(e.target.value)}
                  className="text-sm border border-slate-200 dark:border-dark-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-dark-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                >
                  {teamMembers.map(m => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.user_id === currentUserId ? `Eu (${m.name || m.display_name})` : (m.name || m.display_name || 'Sem nome')}
                    </option>
                  ))}
                </select>
                {!viewingOwnExpenses && (
                  <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-full">
                    Somente leitura
                  </span>
                )}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Card className="p-4 border-l-4 border-primary-500">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">Total do Mês</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">{formatCurrency(monthExpTotal)}</p>
              </Card>
              <Card className="p-4 border-l-4 border-orange-500">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">A Reembolsar</p>
                <p className="text-xl font-bold text-orange-600 mt-1">{formatCurrency(pendingReimb)}</p>
              </Card>
              <Card className="p-4 border-l-4 border-green-500">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">Reembolsado</p>
                <p className="text-xl font-bold text-green-600 mt-1">{formatCurrency(alreadyReimb)}</p>
              </Card>
            </div>
            {budgetsWithSpend.length > 0 && (
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Metas do mês por categoria</h3>
                  {viewingOwnExpenses && (
                    <button onClick={openBudgetModal} className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline">Editar metas</button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {budgetsWithSpend.map(b => {
                    const meta = CATEGORY_META[b.category]
                    const pct = Math.min(100, Math.round((b.spent / b.monthly_limit) * 100))
                    const over = b.spent > b.monthly_limit
                    return (
                      <div key={b.id}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-medium text-slate-700 dark:text-slate-300">{meta.label}</span>
                          <span className={cn('font-semibold', over ? 'text-red-600' : 'text-slate-500 dark:text-slate-400')}>
                            {formatCurrency(b.spent)} / {formatCurrency(b.monthly_limit)}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-100 dark:bg-dark-700 overflow-hidden">
                          <div className={cn('h-full rounded-full transition-all', over ? 'bg-red-500' : meta.bar)} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Card>
            )}
            <div className="flex gap-2 flex-wrap">
              {viewingOwnExpenses && (
                <Button onClick={() => openNewExpense()} size="sm"><Plus className="w-3.5 h-3.5" /> Nova Despesa</Button>
              )}
              <button
                onClick={() => requestExport('expenses')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-dark-800 border border-slate-200 dark:border-dark-600 hover:bg-slate-50 dark:hover:bg-dark-700 rounded-lg transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Exportar
              </button>
              {viewingOwnExpenses && budgetsWithSpend.length === 0 && (
                <button
                  onClick={openBudgetModal}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-dark-800 border border-slate-200 dark:border-dark-600 hover:bg-slate-50 dark:hover:bg-dark-700 rounded-lg transition-colors"
                >
                  <Landmark className="w-3.5 h-3.5" /> Definir metas
                </button>
              )}
              <select className="px-3 py-2 text-sm border border-slate-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-slate-700 dark:text-slate-300" value={expCategory} onChange={e => setExpCategory(e.target.value)}>
                <option value="">Todas as categorias</option>
                {(Object.keys(CATEGORY_META) as ExpenseCategory[]).map(k => <option key={k} value={k}>{CATEGORY_META[k].label}</option>)}
              </select>
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  placeholder="Buscar..." value={expSearch} onChange={e => setExpSearch(e.target.value)} />
              </div>
            </div>
            {selectedExpenseIds.size > 0 && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl border border-primary-100 dark:border-primary-800/40 bg-primary-50/60 dark:bg-primary-900/10 flex-wrap">
                <span className="text-xs font-semibold text-primary-700 dark:text-primary-400">
                  {selectedExpenseIds.size} selecionada{selectedExpenseIds.size !== 1 ? 's' : ''}
                </span>
                <button onClick={bulkMarkReimbursed} disabled={bulkReimbursing}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 disabled:opacity-50">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Marcar como reembolsado
                </button>
                <button onClick={() => setSelectedExpenseIds(new Set())} className="ml-auto text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                  Limpar seleção
                </button>
              </div>
            )}
            {/* Planilha-kanban — uma coluna por mês do ano selecionado (sempre as 12,
                mesmo vazias). Uma despesa nova cai automaticamente na coluna do mês
                em que foi registrada, porque as colunas vêm de `expenses` via useMemo. */}
            {expenses.length === 0 ? (
              <EmptyState icon={Wallet} title="Nenhuma despesa registrada" description="Clique em “Nova Despesa” para começar a registrar." />
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setExpYear(y => y - 1)} title="Ano anterior"
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <select className="px-2.5 py-1.5 text-sm font-semibold border border-slate-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-slate-900 dark:text-slate-100"
                    value={expYear} onChange={e => setExpYear(Number(e.target.value))}>
                    {expYears.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <button onClick={() => setExpYear(y => y + 1)} title="Próximo ano"
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  {expYear !== now.getFullYear() && (
                    <button onClick={() => setExpYear(now.getFullYear())} className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline ml-1">
                      Ano atual
                    </button>
                  )}
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
                  {expenseMonthColumns.map(col => {
                    const isCurrent = expYear === currentYear && col.month === currentMonth
                    return (
                      <div key={col.month} className={cn(
                        'flex-shrink-0 w-[250px] sm:w-[270px] snap-start rounded-2xl border flex flex-col',
                        isCurrent ? 'border-primary-200 dark:border-primary-800/50 bg-primary-50/30 dark:bg-primary-900/5' : 'border-slate-200 dark:border-dark-700 bg-slate-50/50 dark:bg-dark-800/40'
                      )}>
                        <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-slate-200/70 dark:border-dark-700/70 flex-shrink-0">
                          <div className="min-w-0">
                            <h3 className={cn('font-bold text-xs uppercase tracking-wide truncate', isCurrent ? 'text-primary-700 dark:text-primary-400' : 'text-slate-700 dark:text-slate-300')}>
                              {MONTHS_PT[col.month]}
                            </h3>
                            <p className="text-[10px] text-slate-400">{col.items.length} despesa{col.items.length !== 1 ? 's' : ''}</p>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {col.total > 0 && <span className="font-bold text-red-600 dark:text-red-400 text-xs whitespace-nowrap">-{formatCurrency(col.total)}</span>}
                            {viewingOwnExpenses && (
                              <button
                                onClick={() => {
                                  const day = isCurrent ? now.getDate() : 1
                                  openNewExpense(`${expYear}-${String(col.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
                                }}
                                title="Registrar despesa neste mês"
                                className="p-1 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/30 text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors flex-shrink-0"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="p-2 space-y-2 min-h-[72px]">
                          {col.items.length === 0 ? (
                            <p className="text-[11px] text-slate-300 dark:text-dark-500 text-center py-6">Sem despesas</p>
                          ) : col.items.map(e => {
                            const meta = CATEGORY_META[e.category]
                            const Icon = meta.icon
                            const day = dateParts(e.expense_date)?.day
                            const canBulkSelect = e.reimbursable && !e.reimbursed && viewingOwnExpenses
                            return (
                              <div key={e.id} className="group rounded-xl border border-slate-200 dark:border-dark-600 bg-white dark:bg-dark-800 p-2.5 hover:shadow-card-hover transition-shadow">
                                <div className="flex items-start justify-between gap-1.5">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    {canBulkSelect && (
                                      <button onClick={() => toggleSelectExpense(e.id)} className="flex-shrink-0 text-slate-300 hover:text-primary-600 dark:text-dark-500 dark:hover:text-primary-400">
                                        {selectedExpenseIds.has(e.id) ? <CheckSquare className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400" /> : <Square className="w-3.5 h-3.5" />}
                                      </button>
                                    )}
                                    <span className="font-mono text-[10px] text-slate-400 flex-shrink-0">{day != null ? String(day).padStart(2, '0') : '—'}</span>
                                    <Badge className={cn(meta.badge, 'flex-shrink-0')}><Icon className="w-2.5 h-2.5 mr-0.5 inline" />{meta.label}</Badge>
                                  </div>
                                  {viewingOwnExpenses && (
                                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                      <button onClick={() => openEditExpense(e)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-600 text-slate-400"><Edit3 className="w-3 h-3" /></button>
                                      <button onClick={() => deleteExpense(e.id)} className="p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 mt-1.5">
                                  <p className="text-xs font-medium text-slate-900 dark:text-white truncate flex-1 min-w-0">{e.description}</p>
                                  {e.receipt_url && (
                                    <a href={e.receipt_url} target="_blank" rel="noreferrer" title="Ver comprovante" onClick={ev => ev.stopPropagation()}
                                      className="text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 flex-shrink-0">
                                      <Paperclip className="w-3 h-3" />
                                    </a>
                                  )}
                                </div>
                                <div className="flex items-center justify-between mt-1.5">
                                  <span className="font-bold text-red-600 dark:text-red-400 text-xs">-{formatCurrency(e.amount)}</span>
                                  {e.reimbursable && (
                                    <span className={cn('text-[9px] font-semibold', e.reimbursed ? 'text-green-600' : 'text-orange-500')}>
                                      {e.reimbursed ? 'Reembolsado' : 'A reembolsar'}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Fluxo de Caixa ── */}
        {secondaryTab === 'fluxo' && (
          <CashFlowTab
            financials={financials}
            year={cashFlowYear}
            onYearChange={setCashFlowYear}
            mode={cashFlowMode}
            onModeChange={setCashFlowMode}
            categoryLabels={CATEGORY_LABELS}
            onOpenCell={openCashFlowCell}
            onExport={exportCashFlow}
          />
        )}

      </div>

      {/* ── Drawer: Lançamento ── */}
      <FinancialDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSave={save}
        initial={drawerInitial}
        editId={editId}
        clients={clients.map(c => ({ id: c.id, name: (c as any).name }))}
        processes={processes.map(p => ({ id: p.id, number: p.number, title: p.title, client_id: p.client_id }))}
        accounts={accounts.map(a => ({ id: a.id, name: a.name }))}
        saving={saving}
        pendingExpensesByClient={pendingExpensesByClient}
        onReconcile={(clientId, clientName) => { setDrawerOpen(false); setReconcileTarget({ id: clientId, name: clientName }) }}
      />

      {/* ── Modal: Descontar gastos do cliente do honorário ── */}
      {reconcileTarget && (
        <ReconcileExpensesModal
          open={!!reconcileTarget}
          onClose={() => setReconcileTarget(null)}
          clientId={reconcileTarget.id}
          clientName={reconcileTarget.name}
          onDone={() => { setReconcileTarget(null); load() }}
        />
      )}

      {/* ── Modal: Reajustar recorrência a partir de um mês ── */}
      <Modal open={!!adjustTarget} onClose={() => setAdjustTarget(null)} title="Reajustar recorrência" size="sm">
        {adjustTarget && (() => {
          const plan = adjustFrom ? adjustmentPlan(adjustTarget, financials, adjustFrom) : { materializeDates: [], updateIds: [] }
          return (
            <div className="space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                <strong>{adjustTarget.description}</strong> · hoje {formatCurrency(adjustTarget.amount)}
              </p>
              <Input label="Novo valor (R$)" inputMode="decimal" value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)} />
              <Input label="A partir de" type="month" value={adjustFrom} onChange={e => setAdjustFrom(e.target.value)} />
              <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="adjust-preview">
                {plan.materializeDates.length > 0
                  ? `${plan.materializeDates.length} ocorrência(s) antes desse mês ficam gravada(s) com o valor atual. `
                  : 'Nenhuma ocorrência prevista antes desse mês. '}
                {plan.updateIds.length > 0 && `${plan.updateIds.length} lançamento(s) já gravado(s) e não pago(s) a partir desse mês recebem o valor novo.`}
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setAdjustTarget(null)}>Cancelar</Button>
                <Button onClick={saveAdjust} loading={savingAdjust} disabled={!adjustFrom || parseMoneyInput(adjustAmount) == null}>Reajustar</Button>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* ── Modal: Despesa pessoal ── */}
      <Modal open={expenseModalOpen} onClose={() => setExpenseModalOpen(false)} title={editExpenseId ? 'Editar Despesa' : 'Nova Despesa'} size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select label="Categoria *" value={expenseForm.category} onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value as ExpenseCategory })}>
              {(Object.keys(CATEGORY_META) as ExpenseCategory[]).map(k => <option key={k} value={k}>{CATEGORY_META[k].label}</option>)}
            </Select>
            <Input label="Data *" type="date" value={expenseForm.expense_date} onChange={e => setExpenseForm({ ...expenseForm, expense_date: e.target.value })} />
          </div>
          <Input label="Descrição *" value={expenseForm.description} onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })} />
          <Input label="Valor (R$) *" type="number" step="0.01" min="0" value={expenseForm.amount} onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })} />
          <Select label="Processo" value={expenseForm.process_id} onChange={e => setExpenseForm({ ...expenseForm, process_id: e.target.value })}>
            <option value="">Nenhum</option>
            {processes.map(p => <option key={p.id} value={p.id}>{p.number} — {p.title}</option>)}
          </Select>
          {expenseForm.category === 'travel' && (
            <Input label="Destino" value={expenseForm.trip_destination} onChange={e => setExpenseForm({ ...expenseForm, trip_destination: e.target.value })} />
          )}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
              <input type="checkbox" checked={expenseForm.reimbursable}
                onChange={e => setExpenseForm({ ...expenseForm, reimbursable: e.target.checked, reimbursed: e.target.checked ? expenseForm.reimbursed : false })}
                className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
              Reembolsável
            </label>
            {expenseForm.reimbursable && (
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer pl-6">
                <input type="checkbox" checked={expenseForm.reimbursed}
                  onChange={e => setExpenseForm({ ...expenseForm, reimbursed: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
                Já reembolsado
              </label>
            )}
          </div>
          <Textarea label="Observações" value={expenseForm.notes} onChange={e => setExpenseForm({ ...expenseForm, notes: e.target.value })} rows={2} />
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Comprovante</label>
            {expenseForm.receipt_url ? (
              <div className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-dark-600 bg-slate-50 dark:bg-dark-700">
                <Paperclip className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <a href={expenseForm.receipt_url} target="_blank" rel="noreferrer" className="text-sm text-primary-600 dark:text-primary-400 hover:underline truncate flex-1">
                  Ver comprovante anexado
                </a>
                <button type="button" onClick={() => setExpenseForm(f => ({ ...f, receipt_url: '' }))}
                  className="p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 flex-shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <label className={cn(
                'flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed cursor-pointer transition-colors text-sm',
                uploadingReceipt
                  ? 'border-slate-200 dark:border-dark-600 text-slate-400'
                  : 'border-slate-300 dark:border-dark-600 text-slate-500 dark:text-slate-400 hover:border-primary-400 hover:text-primary-600 dark:hover:text-primary-400'
              )}>
                {uploadingReceipt
                  ? <><div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-primary-500 rounded-full animate-spin" /> Enviando...</>
                  : <><Paperclip className="w-3.5 h-3.5" /> Anexar recibo/nota (PDF ou imagem)</>}
                <input type="file" accept="image/*,application/pdf" className="hidden" disabled={uploadingReceipt}
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadReceipt(f); e.target.value = '' }} />
              </label>
            )}
            {receiptError && <p className="text-xs text-red-500 mt-1">{receiptError}</p>}
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={() => setExpenseModalOpen(false)}>Cancelar</Button>
          <Button onClick={saveExpense} loading={savingExpense}>Salvar</Button>
        </div>
      </Modal>

      {/* ── Modal: Metas de orçamento por categoria ── */}
      <Modal open={budgetModalOpen} onClose={() => setBudgetModalOpen(false)} title="Metas mensais por categoria" size="md">
        <div className="space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Defina um teto mensal opcional para cada categoria de despesa pessoal. Deixe em branco para não acompanhar.
          </p>
          {(Object.keys(CATEGORY_META) as ExpenseCategory[]).map(cat => (
            <Input
              key={cat}
              label={CATEGORY_META[cat].label}
              type="number" step="0.01" min="0" placeholder="Sem meta"
              value={budgetForm[cat]}
              onChange={e => setBudgetForm(f => ({ ...f, [cat]: e.target.value }))}
            />
          ))}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={() => setBudgetModalOpen(false)}>Cancelar</Button>
          <Button onClick={saveBudgets} loading={savingBudgets}>Salvar metas</Button>
        </div>
      </Modal>

      {/* ── Modal: escolher período antes de exportar (ano inteiro ou mês específico) ── */}
      <Modal open={!!exportScopeOpen} onClose={() => setExportScopeOpen(null)} title="Exportar relatório" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Período</label>
            <div className="flex gap-2">
              <button
                onClick={() => setExportScopeMode('year')}
                className={cn('flex-1 px-3 py-2 text-sm font-semibold rounded-lg border transition-colors',
                  exportScopeMode === 'year' ? 'bg-primary-600 text-white border-primary-600' : 'border-slate-200 dark:border-dark-600 text-slate-600 dark:text-slate-300 hover:border-primary-400')}
              >
                Ano inteiro
              </button>
              <button
                onClick={() => setExportScopeMode('month')}
                className={cn('flex-1 px-3 py-2 text-sm font-semibold rounded-lg border transition-colors',
                  exportScopeMode === 'month' ? 'bg-primary-600 text-white border-primary-600' : 'border-slate-200 dark:border-dark-600 text-slate-600 dark:text-slate-300 hover:border-primary-400')}
              >
                Mês específico
              </button>
            </div>
          </div>

          <div className={cn('grid gap-3', exportScopeMode === 'month' ? 'grid-cols-2' : 'grid-cols-1')}>
            {exportScopeMode === 'month' && (
              <Select label="Mês" value={exportScopeMonth} onChange={e => setExportScopeMonth(Number(e.target.value))}>
                {MONTHS_PT.map((m, i) => <option key={m} value={i}>{m}</option>)}
              </Select>
            )}
            <Select label="Ano" value={exportScopeYear} onChange={e => setExportScopeYear(Number(e.target.value))}>
              {(exportScopeOpen === 'expenses' ? expYears : years).map(y => <option key={y} value={y}>{y}</option>)}
              {!(exportScopeOpen === 'expenses' ? expYears : years).includes(exportScopeYear) && (
                <option value={exportScopeYear}>{exportScopeYear}</option>
              )}
            </Select>
          </div>

          <p className="text-xs text-slate-400 dark:text-slate-500">
            {exportScopeMode === 'year'
              ? `O relatório trará os 12 meses de ${exportScopeYear}.`
              : `O relatório trará só ${MONTHS_PT[exportScopeMonth]} de ${exportScopeYear}.`}
          </p>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={() => setExportScopeOpen(null)}>Cancelar</Button>
          <Button onClick={confirmExportScope}><Download className="w-3.5 h-3.5" />Exportar</Button>
        </div>
      </Modal>
    </Layout>
  )
}
