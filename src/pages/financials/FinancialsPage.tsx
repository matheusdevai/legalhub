import { usePageLoadingState } from '@/contexts/PageLoadingContext'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Plus, Search, DollarSign, TrendingUp, TrendingDown, Trash2,
  Wallet, Plane, Coffee, Car, Bed, Receipt, Scale,
  Edit3, CheckCircle2, Clock, Users, UserCheck,
  ChevronLeft, ChevronRight, RefreshCw, Filter, ArrowUpDown, Download,
  ChevronDown, Minus, ArrowDownRight, ArrowUpRight,
  MessageCircle, Sparkles, Landmark, X, SlidersHorizontal,
  Paperclip, CheckSquare, Square,
} from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Button, Card, Badge, Modal, Input, Select, Textarea, EmptyState, Spinner } from '@/components/ui'
import { FinancialDrawer, type FinancialDrawerForm, DRAWER_EMPTY_FORM, computeInstallmentAmounts } from '@/components/financials/FinancialDrawer'
import { ReconcileExpensesModal } from '@/components/financials/ReconcileExpensesModal'
import { supabase } from '@/lib/supabase'
import { Financial, Client, Process, UserExpense, Colaborador, FinancialAccount, ExpenseBudget } from '@/types'
import { useAuth } from '@/contexts/AuthContext'
import { formatDate, formatCurrency, formatPhone, FINANCIAL_STATUS_COLORS, FINANCIAL_STATUS_LABELS } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { openExportWindow } from '@/lib/exportUtils'
import { dateParts, groupExpensesByMonth } from '@/lib/expenseUtils'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, BarChart, Bar,
} from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────
type ExpenseCategory = 'process' | 'travel' | 'food' | 'transport' | 'accommodation' | 'other'
type ExpenseForm = {
  category: ExpenseCategory; description: string; amount: string
  expense_date: string; process_id: string; trip_destination: string
  reimbursable: boolean; reimbursed: boolean; notes: string; receipt_url: string
}
const EMPTY_EXPENSE: ExpenseForm = {
  category: 'process', description: '', amount: '',
  expense_date: new Date().toISOString().slice(0, 10),
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

const CATEGORY_LABELS: Record<string, string> = {
  fees: 'Honorários', costs: 'Custas', salary: 'Salário', rent: 'Aluguel',
  subscription: 'Assinatura', tax: 'Impostos', comissao: 'Comissão', other: 'Outros',
}

type SecondaryTab = 'comissoes' | 'expenses' | 'anual'

// ─── Main Component ───────────────────────────────────────────────────────────
export function FinancialsPage() {
  const { profile } = useAuth()
  const currentUserId = profile?.user_id
  const navigate = useNavigate()

  const [financials, setFinancials] = useState<Financial[]>([])
  const [recurringTemplates, setRecurringTemplates] = useState<Financial[]>([])
  const [recurringModalOpen, setRecurringModalOpen] = useState(false)
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
  const [lancSortDir, setLancSortDir] = useState<'asc' | 'desc'>('desc')
  const [lancFilterOpen, setLancFilterOpen] = useState(false)
  const [lancSortOpen, setLancSortOpen] = useState(false)
  const [lancPage, setLancPage] = useState(0)
  const [pageSize, setPageSize] = useState(50)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkWorking, setBulkWorking] = useState(false)

  // Secondary tabs
  const [secondaryTab, setSecondaryTab] = useState<SecondaryTab | null>(null)
  const [comissaoSearch, setComissaoSearch] = useState('')
  const [expSearch, setExpSearch] = useState('')
  const [expCategory, setExpCategory] = useState('')
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())

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
      supabase.from('processes').select('id,number,title').is('deleted_at', null).order('number'),
      supabase.from('colaboradores').select('*').eq('ativo', true).order('nome'),
      supabase.from('financial_accounts').select('*').order('created_at'),
    ]
    if (currentUserId) {
      promises.push(supabase.from('user_expenses').select('*').eq('user_id', currentUserId).is('deleted_at', null).order('expense_date', { ascending: false }))
      promises.push(supabase.from('expense_budgets').select('*').eq('user_id', currentUserId))
    }
    const results = await Promise.all(promises)
    const allFinancials: Financial[] = results[0].data || []
    let financialsData: Financial[] = allFinancials.filter(f => !f.recurring)
    setRecurringTemplates(allFinancials.filter(f => f.recurring))
    setClients(results[1].data || [])
    setProcesses(results[2].data || [])
    setColaboradores(results[3].data || [])
    setAccounts(results[4].data || [])
    if (results[5]) setExpenses(results[5].data || [])
    if (results[6]) setExpenseBudgets(results[6].data || [])

    // Sincroniza status "vencido" — pendentes com vencimento no passado deixam de depender de cálculo manual
    const todayStr = new Date().toISOString().slice(0, 10)
    const toMarkOverdue = financialsData.filter(f => f.status === 'pending' && f.due_date && f.due_date < todayStr).map(f => f.id)
    if (toMarkOverdue.length > 0) {
      await supabase.from('financials').update({ status: 'overdue' }).in('id', toMarkOverdue)
      financialsData = financialsData.map(f => toMarkOverdue.includes(f.id) ? { ...f, status: 'overdue' as const } : f)
    }
    setFinancials(financialsData)
    setLoading(false)
  }

  useEffect(() => { load() }, [currentUserId])

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
  const lancMonthFinancials = useMemo(() => {
    if (onlyOverdue) return financials.filter(f => f.status === 'overdue')
    return financials.filter(f => {
      const dateStr = lancDateFilter === 'paid' ? (f.paid_date || f.due_date) : f.due_date
      if (!dateStr) return false
      const d = new Date(dateStr)
      return d.getMonth() === lancMonth && d.getFullYear() === lancYear
    })
  }, [financials, lancMonth, lancYear, lancDateFilter, onlyOverdue])

  const lancFiltered = useMemo(() => {
    const q = lancSearch.toLowerCase()
    const result = lancMonthFinancials.filter(f => {
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
  }, [lancMonthFinancials, lancSearch, lancContaFilter, lancTypeFilter, lancStatusFilter, lancCategoryFilter, lancSortField, lancSortDir])

  useEffect(() => { setLancPage(0) }, [lancMonth, lancYear, lancSearch, lancContaFilter, lancTypeFilter, lancStatusFilter, lancCategoryFilter, onlyOverdue, pageSize])
  const lancTotalPages = Math.max(1, Math.ceil(lancFiltered.length / pageSize))
  const lancPageItems = lancFiltered.slice(lancPage * pageSize, (lancPage + 1) * pageSize)

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
  const monthFinancials = financials.filter(f => {
    const d = new Date(f.due_date || f.paid_date || f.created_at || '')
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear
  })
  const receitaMensalPrevista = monthFinancials.filter(f => f.type === 'receivable').reduce((s, f) => s + Number(f.amount), 0)
  const despesaMensalPrevista = monthFinancials.filter(f => f.type === 'payable').reduce((s, f) => s + Number(f.amount), 0)
  const receitaMensalRealizada = monthFinancials.filter(f => f.type === 'receivable' && f.status === 'paid').reduce((s, f) => s + Number(f.amount), 0)
  const despesaMensalRealizada = monthFinancials.filter(f => f.type === 'payable' && f.status === 'paid').reduce((s, f) => s + Number(f.amount), 0)

  const pagamentosAtrasados = financials.filter(f => {
    const today = now.toISOString().split('T')[0]
    return f.type === 'receivable' && (f.status === 'overdue' || (f.status === 'pending' && f.due_date && f.due_date < today))
  }).reduce((s, f) => s + Number(f.amount), 0)
  const pagamentosAtrasadosCount = financials.filter(f => {
    const today = now.toISOString().split('T')[0]
    return f.type === 'receivable' && (f.status === 'overdue' || (f.status === 'pending' && f.due_date && f.due_date < today))
  }).length

  // Previous month for comparison
  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1
  const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear
  const prevMonthReceitas = financials.filter(f => {
    const d = new Date(f.due_date || f.paid_date || f.created_at || '')
    return f.type === 'receivable' && d.getMonth() === prevMonth && d.getFullYear() === prevYear
  }).reduce((s, f) => s + Number(f.amount), 0)
  const prevMonthDespesas = financials.filter(f => {
    const d = new Date(f.due_date || f.paid_date || f.created_at || '')
    return f.type === 'payable' && d.getMonth() === prevMonth && d.getFullYear() === prevYear
  }).reduce((s, f) => s + Number(f.amount), 0)
  const prevMonthSaldoRealizado = financials.filter(f => {
    const d = new Date(f.due_date || f.paid_date || f.created_at || '')
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
      const items = financials.filter(f => {
        const fd = new Date(f.due_date || f.paid_date || f.created_at || '')
        return fd.getMonth() === m && fd.getFullYear() === y
      })
      return {
        month: MONTHS_SHORT[m],
        receita: items.filter(f => f.type === 'receivable').reduce((s, f) => s + Number(f.amount), 0),
        despesa: items.filter(f => f.type === 'payable').reduce((s, f) => s + Number(f.amount), 0),
      }
    })
  }, [financials, currentMonth, currentYear])

  // Lançamentos footer totals
  const lancTotal = lancFiltered.reduce((s, f) => s + Number(f.amount), 0)
  const lancSaldo = lancFiltered.filter(f => f.type === 'receivable' && f.status === 'paid').reduce((s, f) => s + Number(f.amount), 0)
    - lancFiltered.filter(f => f.type === 'payable' && f.status === 'paid').reduce((s, f) => s + Number(f.amount), 0)
  const lancPrevisto = lancFiltered.filter(f => f.status === 'pending').reduce((s, f) => s + Number(f.amount), 0)

  // Annual data
  const yearFinancials = financials.filter(f => {
    const d = new Date(f.due_date || f.paid_date || f.created_at || '')
    return d.getFullYear() === selectedYear
  })
  const monthlyData = MONTHS_SHORT.map((month, i) => {
    const items = yearFinancials.filter(f => new Date(f.due_date || f.paid_date || f.created_at || '').getMonth() === i)
    const receitas = items.filter(f => f.type === 'receivable' && f.status === 'paid').reduce((s, f) => s + Number(f.amount), 0)
    const despesas = items.filter(f => f.type === 'payable' && f.status === 'paid').reduce((s, f) => s + Number(f.amount), 0)
    return { month, receitas, despesas, saldo: receitas - despesas, total: items.length }
  })
  const yearTotalReceitas = monthlyData.reduce((s, m) => s + m.receitas, 0)
  const yearTotalDespesas = monthlyData.reduce((s, m) => s + m.despesas, 0)
  const yearSaldo = yearTotalReceitas - yearTotalDespesas

  const years = Array.from(new Set(financials.map(f => new Date(f.due_date || f.paid_date || f.created_at || '').getFullYear()))).sort((a, b) => b - a)
  if (!years.includes(selectedYear)) years.unshift(selectedYear)

  // Expense computed
  const filteredExpenses = useMemo(() => expenses.filter(e => {
    const q = expSearch.toLowerCase()
    return (!expCategory || e.category === expCategory) &&
      (!expSearch || e.description.toLowerCase().includes(q) || e.process_number?.toLowerCase().includes(q))
  }), [expenses, expSearch, expCategory])

  // Agrupa as despesas por mês/ano — planilha mensal, sempre exibindo todos os
  // meses de todos os anos em que houver despesa registrada (mais recente primeiro).
  const expensesByMonth = useMemo(() => groupExpensesByMonth(filteredExpenses), [filteredExpenses])

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
      await supabase.from('expense_budgets').upsert(toUpsert, { onConflict: 'user_id,category' })
    }
    if (toDelete.length > 0) {
      await supabase.from('expense_budgets').delete().eq('user_id', currentUserId).in('category', toDelete)
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
          due_date: dueDate.toISOString().slice(0, 10),
          paid_date: null,
          status: 'pending',
          notes: form.notes || null,
          installment_group_id: groupId, installment_number: i + 1, installment_total: count,
          reconciled: false,
        })
      })

      await supabase.from('financials').insert(rows)
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
      await supabase.from('financials').update(payload).eq('id', editId)
    } else {
      await supabase.from('financials').insert({ ...payload, reconciled: false })
    }
    setSaving(false)
    setDrawerOpen(false)
    load()
  }
  async function deleteFinancial(id: string) {
    if (!confirm('Deseja excluir este lançamento?')) return
    await supabase.from('financials').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    load()
  }
  async function toggleFinancialPaid(f: Financial) {
    const nowPaid = f.status !== 'paid'
    const payload = nowPaid
      ? { status: 'paid', paid_date: new Date().toISOString().slice(0, 10) }
      : { status: 'pending', paid_date: null }
    setFinancials(prev => prev.map(x => x.id === f.id ? { ...x, ...payload } as Financial : x))
    await supabase.from('financials').update(payload).eq('id', f.id)
  }

  async function stopRecurrence(templateId: string) {
    await supabase.from('financials').update({ recurring: false }).eq('id', templateId)
    setRecurringTemplates(prev => prev.filter(f => f.id !== templateId))
  }

  function openNewExpense(prefillDate?: string) {
    setEditExpenseId(null)
    setReceiptError('')
    setExpenseForm({ ...EMPTY_EXPENSE, expense_date: prefillDate || new Date().toISOString().slice(0, 10) })
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
      const path = `${profile.tenant_id}/receipts/${Date.now()}_${file.name.replace(/\s+/g, '_')}`
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
    if (editExpenseId) await supabase.from('user_expenses').update(payload).eq('id', editExpenseId)
    else await supabase.from('user_expenses').insert(payload)
    setSavingExpense(false)
    setExpenseModalOpen(false)
    load()
  }
  async function deleteExpense(id: string) {
    if (!confirm('Deseja excluir esta despesa?')) return
    await supabase.from('user_expenses').update({ deleted_at: new Date().toISOString() }).eq('id', id)
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
    await supabase.from('user_expenses').update({ reimbursed: true }).in('id', Array.from(selectedExpenseIds))
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
  function togglePageSelectionLanc() {
    setSelectedIds(prev => {
      const allSelected = lancPageItems.every(f => prev.has(f.id))
      const next = new Set(prev)
      if (allSelected) lancPageItems.forEach(f => next.delete(f.id))
      else lancPageItems.forEach(f => next.add(f.id))
      return next
    })
  }
  async function bulkMarkPaid() {
    setBulkWorking(true)
    await supabase.from('financials').update({ status: 'paid', paid_date: new Date().toISOString().slice(0, 10) }).in('id', Array.from(selectedIds))
    setBulkWorking(false)
    setSelectedIds(new Set())
    load()
  }
  async function bulkDeleteLanc() {
    if (!confirm(`Excluir ${selectedIds.size} lançamento(s) selecionado(s)?`)) return
    setBulkWorking(true)
    await supabase.from('financials').update({ deleted_at: new Date().toISOString() }).in('id', Array.from(selectedIds))
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
    await supabase.from('financial_accounts').insert({ name: newAccountName.trim() })
    setSavingAccount(false)
    setNewAccountName('')
    setNewAccountOpen(false)
    load()
  }

  function exportLancamentos() {
    const receitas = lancFiltered.filter(f => f.type === 'receivable').reduce((s, f) => s + Number(f.amount), 0)
    const despesas = lancFiltered.filter(f => f.type === 'payable').reduce((s, f) => s + Number(f.amount), 0)
    const pagos = lancFiltered.filter(f => f.status === 'paid').length
    const STATUS_BADGE: Record<string, string> = { paid: 'green', pending: 'amber', overdue: 'red', cancelled: 'gray' }
    const STATUS_LABEL: Record<string, string> = { paid: 'Pago', pending: 'Pendente', overdue: 'Vencido', cancelled: 'Cancelado' }
    const csvContent = [
      'Vencimento,Pagamento,Lançamento,Categoria,Tipo,Valor,Status',
      ...lancFiltered.map(f =>
        `"${formatDate(f.due_date)}","${formatDate(f.paid_date)}","${f.description}","${CATEGORY_LABELS[f.category || ''] || f.category || '—'}","${f.type === 'receivable' ? 'Receita' : 'Despesa'}","${f.type === 'receivable' ? '' : '-'}${formatCurrency(f.amount)}","${STATUS_LABEL[f.status || 'pending'] ?? ''}"`
      ),
    ].join('\n')
    openExportWindow({
      title: `Lançamentos — ${MONTHS_PT[lancMonth]} ${lancYear}`,
      subtitle: `${MONTHS_PT[lancMonth]} de ${lancYear}`,
      filename: `lancamentos-${MONTHS_PT[lancMonth].toLowerCase()}-${lancYear}`,
      stats: [
        { value: lancFiltered.length, label: 'Lançamentos', accent: '#2563eb' },
        { value: formatCurrency(receitas), label: 'Receitas', accent: '#16a34a' },
        { value: formatCurrency(despesas), label: 'Despesas', accent: '#dc2626' },
        { value: pagos, label: 'Pagos', accent: '#7c3aed' },
      ],
      columns: ['Vencimento', 'Pagamento', 'Lançamento', 'Categoria', 'Tipo', 'Valor', 'Status'],
      rows: lancFiltered.map(f => [
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

  function exportExpenses() {
    const total = expensesByMonth.reduce((s, g) => s + g.total, 0)
    const totalCount = expensesByMonth.reduce((s, g) => s + g.items.length, 0)
    const csvContent = [
      'Mês,Dia,Descrição,Categoria,Valor,Reembolsável,Reembolsado',
      ...expensesByMonth.flatMap(g => g.items.map(e => {
        const day = dateParts(e.expense_date)?.day ?? ''
        return `"${MONTHS_PT[g.month]}/${g.year}","${day}","${e.description}","${CATEGORY_META[e.category].label}","-${formatCurrency(e.amount)}","${e.reimbursable ? 'Sim' : 'Não'}","${e.reimbursed ? 'Sim' : 'Não'}"`
      })),
    ].join('\n')
    openExportWindow({
      title: 'Minhas Despesas',
      subtitle: expCategory ? `Categoria: ${CATEGORY_META[expCategory as ExpenseCategory].label}` : 'Todos os meses',
      filename: 'minhas-despesas',
      stats: [
        { value: totalCount, label: 'Despesas', accent: '#2563eb' },
        { value: formatCurrency(total), label: 'Total gasto', accent: '#dc2626' },
        { value: formatCurrency(pendingReimb), label: 'A reembolsar', accent: '#f97316' },
        { value: formatCurrency(alreadyReimb), label: 'Reembolsado', accent: '#16a34a' },
      ],
      columns: ['Dia', 'Descrição', 'Categoria', 'Valor', 'Reembolso'],
      rows: [],
      groups: expensesByMonth.map(g => ({
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

  // ── Render ───────────────────────────────────────────────────────────────────
  if (loading) return null

  const pctReceita = prevMonthReceitas > 0 ? Math.round(((receitaMensalPrevista - prevMonthReceitas) / prevMonthReceitas) * 100) : 0
  const pctDespesa = prevMonthDespesas > 0 ? Math.round(((despesaMensalPrevista - prevMonthDespesas) / prevMonthDespesas) * 100) : 0

  return (
    <Layout title="Financeiro">
      <div className="space-y-4 animate-fade-in">

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
                setLancPage(0)
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
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.5} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => v > 0 ? `${(v / 1000).toFixed(0)}k` : '0'} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v: number) => formatCurrency(v)}
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: 12 }}
                />
                <Line type="monotone" dataKey="receita" name="Receita" stroke="#0f172a" strokeWidth={2} dot={{ fill: '#0f172a', r: 3 }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="despesa" name="Despesa" stroke="#94a3b8" strokeWidth={2} dot={{ fill: '#94a3b8', r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
            {/* Month labels row */}
            <div className="flex justify-between text-[10px] text-slate-400 mt-1 px-1">
              {chartData.map(d => <span key={d.month}>{d.month}</span>)}
            </div>
          </Card>

          {/* Side panel */}
          <Card className="p-4 flex flex-col gap-4">
            {/* Action buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => openNew('receivable')}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" /> Nova receita
              </button>
              <button
                onClick={() => openNew('payable')}
                className="w-9 h-9 flex items-center justify-center bg-slate-100 dark:bg-dark-700 hover:bg-slate-200 dark:hover:bg-dark-600 text-slate-600 dark:text-slate-300 rounded-lg transition-colors"
                title="Nova despesa"
              >
                <Minus className="w-4 h-4" />
              </button>
            </div>

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
            <button
              onClick={() => navigate('/dashboard', {
                state: { openTab: 'ia', prefillQuestion: 'Como está a saúde financeira do escritório este mês? Aponte riscos e o que precisa de atenção.' },
              })}
              className="flex items-center gap-1.5 text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
            >
              <Sparkles className="w-3.5 h-3.5" /> Perguntar ao Copiloto
            </button>
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
            <select
              value={lancDateFilter}
              onChange={e => setLancDateFilter(e.target.value as 'due' | 'paid')}
              disabled={onlyOverdue}
              className="text-xs border border-slate-200 dark:border-dark-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-dark-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:opacity-50"
            >
              <option value="due">Data de vencimento</option>
              <option value="paid">Data de pagamento</option>
            </select>

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

            {recurringTemplates.length > 0 && (
              <button
                onClick={() => setRecurringModalOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-dark-600 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-700 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Recorrentes ({recurringTemplates.length})
              </button>
            )}
            <button
              onClick={exportLancamentos}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-dark-600 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Exportar
            </button>
            <button onClick={() => openNew()} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors shadow-button">
              <Plus className="w-3.5 h-3.5" /> Novo
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

          {/* Table */}
          {lancFiltered.length === 0 ? (
            <EmptyState icon={DollarSign} title="Nenhum lançamento neste período" description="Navegue entre os meses ou crie um novo lançamento." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-dark-700/50 bg-slate-50 dark:bg-dark-700/30">
                    <th className="w-9 px-3 py-2.5">
                      <input type="checkbox" className="w-3.5 h-3.5 rounded border-slate-300 dark:border-dark-500 text-primary-600 focus:ring-primary-400"
                        checked={lancPageItems.length > 0 && lancPageItems.every(f => selectedIds.has(f.id))}
                        onChange={togglePageSelectionLanc} />
                    </th>
                    {['Vencimento', 'Pagamento', 'Competência', 'Lançamento', 'Categoria', 'Status', 'Valor'].map(h => (
                      <th key={h} className={cn(
                        'px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400',
                        h === 'Valor' ? 'text-right' : 'text-left'
                      )}>{h}</th>
                    ))}
                    <th className="px-4 py-2.5 w-20" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-dark-700/30">
                  {lancPageItems.map(f => {
                    const isReceita = f.type === 'receivable'
                    const catLabel = CATEGORY_LABELS[f.category || ''] || f.category || '—'
                    const competencia = f.due_date ? `${MONTHS_SHORT[new Date(f.due_date).getMonth()]}/${new Date(f.due_date).getFullYear()}` : '—'
                    const linkedClient = clients.find(c => c.id === f.client_id)
                    const wa = linkedClient?.phone ? waLink(linkedClient.phone) : null
                    return (
                      <tr key={f.id} className="hover:bg-primary-50/30 dark:hover:bg-primary-900/10 transition-colors group">
                        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                          <input type="checkbox" className="w-3.5 h-3.5 rounded border-slate-300 dark:border-dark-500 text-primary-600 focus:ring-primary-400"
                            checked={selectedIds.has(f.id)} onChange={() => toggleSelectLanc(f.id)} />
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{formatDate(f.due_date)}</td>
                        <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{formatDate(f.paid_date)}</td>
                        <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{competencia}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', isReceita ? 'bg-emerald-500' : 'bg-red-400')} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate max-w-[200px]">{f.description}</p>
                                {f.installment_group_id && (
                                  <span className="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300">
                                    {f.installment_number === 0 ? 'Entrada' : `Parcela ${f.installment_number}/${f.installment_total}`}
                                  </span>
                                )}
                              </div>
                              {f.client_name && (
                                <button
                                  onClick={() => navigate('/clientes', { state: { prefillSearch: f.client_name } })}
                                  className="text-[11px] text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 hover:underline truncate block"
                                >{f.client_name}</button>
                              )}
                              {f.process_number && (
                                <button
                                  onClick={() => navigate('/processos', { state: { prefillSearch: f.process_number } })}
                                  className="text-[11px] text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 hover:underline truncate block font-mono"
                                >{f.process_number}</button>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-slate-500 dark:text-slate-400">{catLabel}</span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => toggleFinancialPaid(f)}
                            title={f.status === 'paid' ? 'Marcar como pendente' : 'Marcar como pago'}
                            className={cn(
                              'text-[10px] font-semibold px-2 py-1 rounded-full border transition-colors',
                              FINANCIAL_STATUS_COLORS[f.status || 'pending']
                            )}
                          >
                            {FINANCIAL_STATUS_LABELS[f.status || 'pending']}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={cn('text-sm font-bold', isReceita ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                            {isReceita ? '' : '-'}{formatCurrency(f.amount)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            {wa && isReceita && f.status !== 'paid' && (
                              <a
                                href={`${wa}?text=${encodeURIComponent(`Olá${f.client_name ? ' ' + f.client_name.split(' ')[0] : ''}, passando para lembrar do pagamento "${f.description}" no valor de ${formatCurrency(f.amount)}${f.due_date ? `, com vencimento em ${formatDate(f.due_date)}` : ''}.`)}`}
                                target="_blank" rel="noreferrer" title="Cobrar via WhatsApp"
                                className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 text-slate-400 hover:text-green-500"
                              ><MessageCircle className="w-3.5 h-3.5" /></a>
                            )}
                            <button onClick={() => openEdit(f)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-600 text-slate-400 hover:text-primary-600">
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => deleteFinancial(f.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer totals */}
          <div className="flex items-center justify-between gap-4 px-4 py-3 bg-slate-50 dark:bg-dark-700/30 border-t border-slate-100 dark:border-dark-700/50 flex-wrap text-xs text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-6">
              <span>total do período filtrado: <strong className="text-slate-700 dark:text-slate-200">{formatCurrency(lancTotal)}</strong></span>
              <span>saldo: <strong className={cn(lancSaldo >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500')}>{formatCurrency(lancSaldo)}</strong></span>
              <span>previsto: <strong className="text-slate-700 dark:text-slate-200">{formatCurrency(lancPrevisto)}</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <span>Registros por página:</span>
              <select
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setLancPage(0) }}
                className="text-xs border border-slate-200 dark:border-dark-600 rounded px-1.5 py-0.5 bg-white dark:bg-dark-800 text-slate-700 dark:text-slate-300"
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
              <span className="mx-1">{lancFiltered.length === 0 ? 0 : lancPage * pageSize + 1}–{Math.min((lancPage + 1) * pageSize, lancFiltered.length)} de {lancFiltered.length}</span>
              <button onClick={() => setLancPage(p => Math.max(0, p - 1))} disabled={lancPage === 0} className="p-1 rounded hover:bg-slate-200 dark:hover:bg-dark-600 disabled:opacity-40"><ChevronLeft className="w-3.5 h-3.5" /></button>
              <button onClick={() => setLancPage(p => Math.min(lancTotalPages - 1, p + 1))} disabled={lancPage >= lancTotalPages - 1} className="p-1 rounded hover:bg-slate-200 dark:hover:bg-dark-600 disabled:opacity-40"><ChevronRight className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        </Card>

        {/* ── Secondary tabs ── */}
        <div className="flex gap-1 border-b border-slate-200 dark:border-dark-700 overflow-x-auto">
          {([
            { id: 'comissoes', label: 'Comissões', icon: Users },
            { id: 'expenses', label: 'Minhas Despesas', icon: Wallet },
            { id: 'anual', label: 'Relatório Anual', icon: TrendingUp },
          ] as { id: SecondaryTab; label: string; icon: any }[]).map(t => {
            const Icon = t.icon
            const active = secondaryTab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setSecondaryTab(active ? null : t.id)}
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
                  onChange={e => setComissaoSearch(e.target.value)}
                />
              </div>
            </Card>
            {filteredComissoes.length === 0 ? (
              <EmptyState icon={UserCheck} title="Nenhuma comissão registrada" />
            ) : (
              <Card className="overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-dark-700/40 border-b border-slate-200 dark:border-dark-700">
                      {['Cliente', 'Colaborador', 'Comissão', 'Valor Pago', 'Status', 'Data'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-dark-700/50">
                    {filteredComissoes.map(c => {
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
              </Card>
            )}
          </div>
        )}

        {/* ── Minhas Despesas ── */}
        {secondaryTab === 'expenses' && (
          <div className="space-y-4">
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
                  <button onClick={openBudgetModal} className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline">Editar metas</button>
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
              <Button onClick={() => openNewExpense()} size="sm"><Plus className="w-3.5 h-3.5" /> Nova Despesa</Button>
              <button
                onClick={exportExpenses}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-dark-800 border border-slate-200 dark:border-dark-600 hover:bg-slate-50 dark:hover:bg-dark-700 rounded-lg transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Exportar
              </button>
              {budgetsWithSpend.length === 0 && (
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
            {/* Planilha mensal — um cartão por mês/ano, do mais recente ao mais antigo,
                sempre mostrando todos os meses em que houver alguma despesa registrada. */}
            {expensesByMonth.length === 0 ? (
              <EmptyState icon={Wallet} title="Nenhuma despesa registrada" description="Clique em “Nova Despesa” para começar a registrar." />
            ) : (
              <div className="space-y-4">
                {expensesByMonth.map(g => (
                  <Card key={g.key} className="overflow-hidden">
                    <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 bg-slate-50 dark:bg-dark-700/30 border-b border-slate-100 dark:border-dark-700/50">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-slate-900 dark:text-white text-sm truncate">
                          {MONTHS_PT[g.month]} de {g.year}
                        </h3>
                        <p className="text-[11px] text-slate-400">{g.items.length} despesa{g.items.length !== 1 ? 's' : ''}</p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="font-bold text-red-600 dark:text-red-400 text-sm">-{formatCurrency(g.total)}</span>
                        <button
                          onClick={() => {
                            const day = (g.year === currentYear && g.month === currentMonth) ? now.getDate() : 1
                            openNewExpense(`${g.year}-${String(g.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
                          }}
                          title="Registrar despesa neste mês"
                          className="p-1.5 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 dark:border-dark-700/50">
                            <th className="px-3 py-2 w-8" />
                            <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 w-14">Dia</th>
                            <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Descrição</th>
                            <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 hidden sm:table-cell">Categoria</th>
                            <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Valor</th>
                            <th className="px-4 py-2 w-16" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-dark-700/30">
                          {g.items.map(e => {
                            const meta = CATEGORY_META[e.category]
                            const Icon = meta.icon
                            const day = dateParts(e.expense_date)?.day
                            const canBulkSelect = e.reimbursable && !e.reimbursed
                            return (
                              <tr key={e.id} className="hover:bg-primary-50/30 dark:hover:bg-primary-900/10 transition-colors group">
                                <td className="px-3 py-2.5" onClick={ev => ev.stopPropagation()}>
                                  {canBulkSelect && (
                                    <button onClick={() => toggleSelectExpense(e.id)} className="text-slate-300 hover:text-primary-600 dark:text-dark-500 dark:hover:text-primary-400">
                                      {selectedExpenseIds.has(e.id) ? <CheckSquare className="w-4 h-4 text-primary-600 dark:text-primary-400" /> : <Square className="w-4 h-4" />}
                                    </button>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 font-mono text-xs">{day != null ? String(day).padStart(2, '0') : '—'}</td>
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center gap-1.5">
                                    <p className="font-medium text-slate-900 dark:text-white truncate max-w-[220px]">{e.description}</p>
                                    {e.receipt_url && (
                                      <a href={e.receipt_url} target="_blank" rel="noreferrer" title="Ver comprovante" onClick={ev => ev.stopPropagation()}
                                        className="text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 flex-shrink-0">
                                        <Paperclip className="w-3 h-3" />
                                      </a>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5 mt-0.5 sm:hidden">
                                    <Badge className={meta.badge}>{meta.label}</Badge>
                                  </div>
                                  {e.reimbursable && (
                                    <span className={cn('inline-block mt-0.5 text-[10px] font-semibold', e.reimbursed ? 'text-green-600' : 'text-orange-500')}>
                                      {e.reimbursed ? 'Reembolsado' : 'A reembolsar'}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 hidden sm:table-cell">
                                  <Badge className={meta.badge}><Icon className="w-3 h-3 mr-1 inline" />{meta.label}</Badge>
                                </td>
                                <td className="px-4 py-2.5 text-right font-bold text-red-600 dark:text-red-400 whitespace-nowrap">-{formatCurrency(e.amount)}</td>
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                                    <button onClick={() => openEditExpense(e)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-600 text-slate-400"><Edit3 className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => deleteExpense(e.id)} className="p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Relatório Anual ── */}
        {secondaryTab === 'anual' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <select className="px-3 py-2 text-sm border border-slate-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-slate-900 dark:text-slate-100"
                value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Card className="p-4 border-l-4 border-green-500">
                <p className="text-xs text-slate-500 font-medium">Total Receitas {selectedYear}</p>
                <p className="text-xl font-bold text-green-600 mt-1">{formatCurrency(yearTotalReceitas)}</p>
              </Card>
              <Card className="p-4 border-l-4 border-red-500">
                <p className="text-xs text-slate-500 font-medium">Total Despesas {selectedYear}</p>
                <p className="text-xl font-bold text-red-600 mt-1">{formatCurrency(yearTotalDespesas)}</p>
              </Card>
              <Card className={cn('p-4 border-l-4', yearSaldo >= 0 ? 'border-primary-500' : 'border-orange-500')}>
                <p className="text-xs text-slate-500 font-medium">Saldo Líquido {selectedYear}</p>
                <p className={cn('text-xl font-bold mt-1', yearSaldo >= 0 ? 'text-primary-600' : 'text-orange-600')}>{formatCurrency(yearSaldo)}</p>
              </Card>
            </div>
            <Card className="p-5">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-4 text-sm">Receitas vs Despesas — {selectedYear}</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={monthlyData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => v > 0 ? `${(v / 1000).toFixed(0)}k` : '0'} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="receitas" name="Receitas" fill="#0f172a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="despesas" name="Despesas" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
            <Card className="overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 dark:border-dark-700">
                <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Detalhamento por Mês</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-dark-700">
                    <th className="px-4 py-3 text-left font-medium text-slate-500">Mês</th>
                    <th className="px-4 py-3 text-right font-medium text-green-600">Receitas</th>
                    <th className="px-4 py-3 text-right font-medium text-red-600">Despesas</th>
                    <th className="px-4 py-3 text-right font-medium text-primary-600">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyData.map((m, i) => (
                    <tr key={i} className={cn('border-b border-slate-50 dark:border-dark-700 transition-colors', (m.receitas > 0 || m.despesas > 0) ? 'hover:bg-slate-50 dark:hover:bg-dark-700/30' : 'opacity-40')}>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{MONTHS_PT[i]}</td>
                      <td className="px-4 py-3 text-right font-semibold text-green-600">{m.receitas > 0 ? formatCurrency(m.receitas) : '—'}</td>
                      <td className="px-4 py-3 text-right font-semibold text-red-600">{m.despesas > 0 ? formatCurrency(m.despesas) : '—'}</td>
                      <td className={cn('px-4 py-3 text-right font-bold', m.saldo > 0 ? 'text-primary-600' : m.saldo < 0 ? 'text-red-600' : 'text-slate-400')}>
                        {(m.receitas > 0 || m.despesas > 0) ? formatCurrency(m.saldo) : '—'}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 dark:bg-dark-700/50 font-bold border-t border-slate-200 dark:border-dark-700">
                    <td className="px-4 py-3 text-slate-900 dark:text-white">Total</td>
                    <td className="px-4 py-3 text-right text-green-600">{formatCurrency(yearTotalReceitas)}</td>
                    <td className="px-4 py-3 text-right text-red-600">{formatCurrency(yearTotalDespesas)}</td>
                    <td className={cn('px-4 py-3 text-right', yearSaldo >= 0 ? 'text-primary-600' : 'text-red-600')}>{formatCurrency(yearSaldo)}</td>
                  </tr>
                </tbody>
              </table>
            </Card>
          </div>
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
        processes={processes.map(p => ({ id: p.id, number: p.number, title: p.title }))}
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

      {/* ── Modal: Lançamentos recorrentes ativos ── */}
      <Modal open={recurringModalOpen} onClose={() => setRecurringModalOpen(false)} title="Lançamentos recorrentes ativos" size="md">
        <div className="space-y-2">
          {recurringTemplates.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">Nenhuma recorrência ativa.</p>
          ) : recurringTemplates.map(f => (
            <div key={f.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-100 dark:border-dark-700">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                  {f.description} · {formatCurrency(f.amount)}
                </p>
                <p className="text-xs text-slate-400">
                  {f.type === 'receivable' ? 'Receita' : 'Despesa'} · a cada {f.recurrence_interval === 'weekly' ? 'semana' : f.recurrence_interval === 'yearly' ? 'ano' : 'mês'} · próxima em {formatDate(f.due_date)}
                  {f.recurrence_end_date && ` · até ${formatDate(f.recurrence_end_date)}`}
                </p>
              </div>
              <button onClick={() => stopRecurrence(f.id)}
                className="flex-shrink-0 text-xs font-medium text-red-500 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                Parar
              </button>
            </div>
          ))}
        </div>
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
    </Layout>
  )
}
