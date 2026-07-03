import { usePageLoadingState } from '@/contexts/PageLoadingContext'
import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Plus, Search, DollarSign, TrendingUp, TrendingDown, Trash2,
  Wallet, Plane, Coffee, Car, Bed, Receipt, Scale,
  Edit3, CheckCircle2, Clock, Users, UserCheck,
  ChevronLeft, ChevronRight, RefreshCw, Filter, ArrowUpDown, Download,
  ChevronDown, Minus, BarChart2, ArrowDownRight, ArrowUpRight,
} from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Button, Card, Badge, Modal, Input, Select, Textarea, EmptyState, Spinner } from '@/components/ui'
import { FinancialDrawer, type FinancialDrawerForm, DRAWER_EMPTY_FORM } from '@/components/financials/FinancialDrawer'
import { supabase } from '@/lib/supabase'
import { Financial, Client, Process, UserExpense, Colaborador } from '@/types'
import { useAuth } from '@/contexts/AuthContext'
import { formatDate, formatCurrency, FINANCIAL_STATUS_COLORS, FINANCIAL_STATUS_LABELS } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { openExportWindow } from '@/lib/exportUtils'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, BarChart, Bar,
} from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────
type ExpenseCategory = 'process' | 'travel' | 'food' | 'transport' | 'accommodation' | 'other'
type ExpenseForm = {
  category: ExpenseCategory; description: string; amount: string
  expense_date: string; process_id: string; trip_destination: string
  reimbursable: boolean; reimbursed: boolean; notes: string
}
const EMPTY_EXPENSE: ExpenseForm = {
  category: 'process', description: '', amount: '',
  expense_date: new Date().toISOString().slice(0, 10),
  process_id: '', trip_destination: '', reimbursable: true, reimbursed: false, notes: '',
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

const CATEGORY_LABELS: Record<string, string> = {
  fees: 'Honorários', costs: 'Custas', salary: 'Salário', rent: 'Aluguel',
  subscription: 'Assinatura', tax: 'Impostos', comissao: 'Comissão', other: 'Outros',
}

type SecondaryTab = 'comissoes' | 'expenses' | 'anual'

// ─── Main Component ───────────────────────────────────────────────────────────
export function FinancialsPage() {
  const { profile } = useAuth()
  const currentUserId = profile?.user_id

  const [financials, setFinancials] = useState<Financial[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [processes, setProcesses] = useState<Process[]>([])
  const [expenses, setExpenses] = useState<UserExpense[]>([])
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [loading, setLoading] = usePageLoadingState()

  // Lançamentos table state
  const now = new Date()
  const [lancMonth, setLancMonth] = useState(now.getMonth())
  const [lancYear, setLancYear] = useState(now.getFullYear())
  const [lancSearch, setLancSearch] = useState('')
  const [lancContaFilter, setLancContaFilter] = useState('')
  const [lancDateFilter, setLancDateFilter] = useState<'due' | 'paid'>('due')
  const [pageSize] = useState(50)

  // Secondary tabs
  const [secondaryTab, setSecondaryTab] = useState<SecondaryTab | null>(null)
  const [comissaoSearch, setComissaoSearch] = useState('')
  const [expSearch, setExpSearch] = useState('')
  const [expCategory, setExpCategory] = useState('')
  const [expPeriod, setExpPeriod] = useState<'all' | 'this_month' | 'last_month' | 'this_year'>('this_month')
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())

  // Contas bancárias accordion
  const [contasOpen, setContasOpen] = useState<Record<string, boolean>>({ principal: false, dinheiro: false, investimentos: false })

  // Drawer (lançamento)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerInitial, setDrawerInitial] = useState<Partial<FinancialDrawerForm>>(DRAWER_EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

  const [expenseModalOpen, setExpenseModalOpen] = useState(false)
  const [expenseForm, setExpenseForm] = useState<ExpenseForm>(EMPTY_EXPENSE)
  const [savingExpense, setSavingExpense] = useState(false)
  const [editExpenseId, setEditExpenseId] = useState<string | null>(null)

  // ── Load ────────────────────────────────────────────────────────────────────
  async function load() {
    setLoading(true)
    const promises: any[] = [
      supabase.from('financials').select('*').is('deleted_at', null).order('due_date', { ascending: false }),
      supabase.from('clients').select('id,name,colaborador_id,colaborador_pago,colaborador_pago_data,colaborador_pago_valor,total_billed').is('deleted_at', null).order('name'),
      supabase.from('processes').select('id,number,title').is('deleted_at', null).order('number'),
      supabase.from('colaboradores').select('*').eq('ativo', true).order('nome'),
    ]
    if (currentUserId) {
      promises.push(supabase.from('user_expenses').select('*').eq('user_id', currentUserId).is('deleted_at', null).order('expense_date', { ascending: false }))
    }
    const results = await Promise.all(promises)
    setFinancials(results[0].data || [])
    setClients(results[1].data || [])
    setProcesses(results[2].data || [])
    setColaboradores(results[3].data || [])
    if (results[4]) setExpenses(results[4].data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [currentUserId])

  const location = useLocation()
  useEffect(() => {
    if ((location.state as any)?.openNew) { openNew(); window.history.replaceState({}, '') }
  }, [location.state])

  // ── Computed values ─────────────────────────────────────────────────────────
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()

  // Month lançamentos (filtered by selected month/year)
  const lancMonthFinancials = useMemo(() => financials.filter(f => {
    const dateStr = lancDateFilter === 'paid' ? (f.paid_date || f.due_date) : f.due_date
    if (!dateStr) return false
    const d = new Date(dateStr)
    return d.getMonth() === lancMonth && d.getFullYear() === lancYear
  }), [financials, lancMonth, lancYear, lancDateFilter])

  const lancFiltered = useMemo(() => {
    if (!lancSearch) return lancMonthFinancials
    const q = lancSearch.toLowerCase()
    return lancMonthFinancials.filter(f =>
      f.description.toLowerCase().includes(q) ||
      f.client_name?.toLowerCase().includes(q) ||
      (CATEGORY_LABELS[f.category || ''] || '').toLowerCase().includes(q)
    )
  }, [lancMonthFinancials, lancSearch])

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
    return f.type === 'receivable' && f.status === 'pending' && f.due_date && f.due_date < today
  }).reduce((s, f) => s + Number(f.amount), 0)

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
    const d = new Date(e.expense_date)
    let ok = true
    if (expPeriod === 'this_month') ok = d.getMonth() === currentMonth && d.getFullYear() === currentYear
    else if (expPeriod === 'last_month') ok = d.getMonth() === prevMonth && d.getFullYear() === prevYear
    else if (expPeriod === 'this_year') ok = d.getFullYear() === currentYear
    const q = expSearch.toLowerCase()
    return ok && (!expCategory || e.category === expCategory) &&
      (!expSearch || e.description.toLowerCase().includes(q) || e.process_number?.toLowerCase().includes(q))
  }), [expenses, expSearch, expCategory, expPeriod, currentMonth, currentYear, prevMonth, prevYear])

  const monthExpTotal = expenses.filter(e => {
    const d = new Date(e.expense_date)
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear
  }).reduce((s, e) => s + Number(e.amount), 0)
  const pendingReimb = expenses.filter(e => e.reimbursable && !e.reimbursed).reduce((s, e) => s + Number(e.amount), 0)
  const alreadyReimb = expenses.filter(e => e.reimbursed).reduce((s, e) => s + Number(e.amount), 0)

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
      notes: f.notes || '',
    })
    setDrawerOpen(true)
  }
  async function save(form: FinancialDrawerForm) {
    setSaving(true)
    const selectedClient = clients.find(c => c.id === form.client_id)
    const selectedProcess = processes.find(p => p.id === form.process_id)
    const payload = {
      ...form, amount: parseFloat(form.amount),
      client_name: selectedClient?.name || form.client_name,
      process_number: selectedProcess?.number || form.process_number,
      client_id: form.client_id || null, process_id: form.process_id || null,
      due_date: form.due_date || null, paid_date: form.paid_date || null,
    }
    if (editId) await supabase.from('financials').update(payload).eq('id', editId)
    else await supabase.from('financials').insert(payload)
    setSaving(false)
    setDrawerOpen(false)
    load()
  }
  async function deleteFinancial(id: string) {
    if (!confirm('Deseja excluir este lançamento?')) return
    await supabase.from('financials').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    load()
  }

  function openNewExpense() {
    setEditExpenseId(null)
    setExpenseForm({ ...EMPTY_EXPENSE, expense_date: new Date().toISOString().slice(0, 10) })
    setExpenseModalOpen(true)
  }
  function openEditExpense(e: UserExpense) {
    setEditExpenseId(e.id)
    setExpenseForm({
      category: e.category, description: e.description, amount: String(e.amount),
      expense_date: e.expense_date, process_id: e.process_id || '',
      trip_destination: e.trip_destination || '', reimbursable: !!e.reimbursable,
      reimbursed: !!e.reimbursed, notes: e.notes || '',
    })
    setExpenseModalOpen(true)
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

  function navMonth(dir: -1 | 1) {
    const d = new Date(lancYear, lancMonth + dir, 1)
    setLancMonth(d.getMonth())
    setLancYear(d.getFullYear())
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
          <Card className="p-4">
            <div className="flex items-start justify-between">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Saldo</p>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </div>
            <div className="flex items-end gap-2 mt-1.5">
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{formatCurrency(saldo)}</p>
              <span className={cn('text-[11px] font-bold px-1.5 py-0.5 rounded-full mb-1',
                saldo >= 0 ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' : 'text-red-500 bg-red-50 dark:bg-red-900/20'
              )}>
                {saldo >= 0 ? '↑' : '↓'} 0%
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">vs mês anterior: {formatCurrency(prevMonthReceitas - prevMonthDespesas)}</p>
          </Card>

          {/* Receita mensal prevista */}
          <Card className="p-4">
            <div className="flex items-start justify-between">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Receita mensal prevista</p>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </div>
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
          <Card className="p-4">
            <div className="flex items-start justify-between">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Despesa mensal prevista</p>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </div>
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
          <Card className="p-4">
            <div className="flex items-start justify-between">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pagamentos atrasados</p>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </div>
            <p className={cn('text-2xl font-bold mt-1.5', pagamentosAtrasados > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white')}>
              {pagamentosAtrasados > 0 ? `-${formatCurrency(pagamentosAtrasados)}` : formatCurrency(0)}
            </p>
            <button
              onClick={() => {}}
              className="text-[11px] text-primary-600 dark:text-primary-400 hover:underline mt-1"
            >
              Mostrar lançamentos
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
              <button
                className="w-9 h-9 flex items-center justify-center bg-slate-100 dark:bg-dark-700 hover:bg-slate-200 dark:hover:bg-dark-600 text-slate-600 dark:text-slate-300 rounded-lg transition-colors"
                title="Expandir"
              >
                <BarChart2 className="w-4 h-4" />
              </button>
            </div>

            {/* Contas bancárias */}
            <div>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Contas bancárias</p>
              <div className="space-y-1">
                {[
                  { key: 'principal', label: 'Conta Principal', value: totalReceivablePaid },
                  { key: 'dinheiro', label: 'Dinheiro', value: 0 },
                  { key: 'investimentos', label: 'Investimentos', value: 0 },
                ].map(conta => (
                  <div key={conta.key} className="rounded-xl border border-slate-100 dark:border-dark-700 overflow-hidden">
                    <button
                      onClick={() => setContasOpen(o => ({ ...o, [conta.key]: !o[conta.key] }))}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-dark-700/50 transition-colors"
                    >
                      <div className="w-7 h-7 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold text-xs flex-shrink-0">
                        $
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{conta.label}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{formatCurrency(conta.value)}</p>
                      </div>
                      <ChevronDown className={cn('w-3.5 h-3.5 text-slate-400 transition-transform flex-shrink-0', contasOpen[conta.key] && 'rotate-180')} />
                    </button>
                    {contasOpen[conta.key] && (
                      <div className="px-4 pb-3 pt-1 bg-slate-50 dark:bg-dark-800/50 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-dark-700">
                        <div className="flex justify-between py-1"><span>Receitas pagas</span><span className="text-emerald-600 font-medium">{formatCurrency(conta.key === 'principal' ? totalReceivablePaid : 0)}</span></div>
                        <div className="flex justify-between py-1"><span>Despesas pagas</span><span className="text-red-500 font-medium">{formatCurrency(conta.key === 'principal' ? totalPayablePaid : 0)}</span></div>
                        <div className="flex justify-between py-1 font-semibold border-t border-slate-200 dark:border-dark-600 mt-1 pt-2"><span>Saldo</span><span className="text-slate-700 dark:text-slate-200">{formatCurrency(conta.value)}</span></div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>

        {/* ── Lançamentos section ── */}
        <Card className="overflow-hidden">
          {/* Header */}
          <div className="px-5 py-3 border-b border-slate-100 dark:border-dark-700/50">
            <h2 className="text-sm font-bold text-slate-800 dark:text-white">Lançamentos</h2>
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
              <option value="principal">Conta Principal</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="investimentos">Investimentos</option>
            </select>

            {/* Date type filter */}
            <select
              value={lancDateFilter}
              onChange={e => setLancDateFilter(e.target.value as 'due' | 'paid')}
              className="text-xs border border-slate-200 dark:border-dark-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-dark-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
            >
              <option value="due">Data de vencimento</option>
              <option value="paid">Data de pagamento</option>
            </select>

            {/* Month navigation */}
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

            <button className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-dark-600 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-700 transition-colors">
              <Filter className="w-3.5 h-3.5" /> Filtrar
            </button>
            <button className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-dark-600 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-700 transition-colors">
              <ArrowUpDown className="w-3.5 h-3.5" /> Ordenar
            </button>
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

          {/* Table */}
          {lancFiltered.length === 0 ? (
            <EmptyState icon={DollarSign} title="Nenhum lançamento neste período" description="Navegue entre os meses ou crie um novo lançamento." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-dark-700/50 bg-slate-50 dark:bg-dark-700/30">
                    {['Vencimento', 'Pagamento', 'Competência', 'Lançamento', 'Categoria', 'Valor'].map(h => (
                      <th key={h} className={cn(
                        'px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400',
                        h === 'Valor' ? 'text-right' : 'text-left'
                      )}>{h}</th>
                    ))}
                    <th className="px-4 py-2.5 w-16" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-dark-700/30">
                  {lancFiltered.slice(0, pageSize).map(f => {
                    const isReceita = f.type === 'receivable'
                    const catLabel = CATEGORY_LABELS[f.category || ''] || f.category || '—'
                    const competencia = f.due_date ? `${MONTHS_SHORT[new Date(f.due_date).getMonth()]}/${new Date(f.due_date).getFullYear()}` : '—'
                    return (
                      <tr key={f.id} className="hover:bg-primary-50/30 dark:hover:bg-primary-900/10 transition-colors group">
                        <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{formatDate(f.due_date)}</td>
                        <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{formatDate(f.paid_date)}</td>
                        <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{competencia}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', isReceita ? 'bg-emerald-500' : 'bg-red-400')} />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate max-w-[200px]">{f.description}</p>
                              {f.client_name && <p className="text-[11px] text-slate-400 truncate">{f.client_name}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-slate-500 dark:text-slate-400">{catLabel}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={cn('text-sm font-bold', isReceita ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                            {isReceita ? '' : '-'}{formatCurrency(f.amount)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
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
              <select className="text-xs border border-slate-200 dark:border-dark-600 rounded px-1.5 py-0.5 bg-white dark:bg-dark-800 text-slate-700 dark:text-slate-300">
                <option>50</option>
                <option>100</option>
                <option>200</option>
              </select>
              <span className="mx-1">0–{lancFiltered.length} de {lancFiltered.length}</span>
              <button className="p-1 rounded hover:bg-slate-200 dark:hover:bg-dark-600 disabled:opacity-40" disabled><ChevronLeft className="w-3.5 h-3.5" /></button>
              <button className="p-1 rounded hover:bg-slate-200 dark:hover:bg-dark-600 disabled:opacity-40" disabled><ChevronRight className="w-3.5 h-3.5" /></button>
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
            <div className="flex gap-2 flex-wrap">
              <Button onClick={openNewExpense} size="sm"><Plus className="w-3.5 h-3.5" /> Nova Despesa</Button>
              <select className="px-3 py-2 text-sm border border-slate-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-slate-700 dark:text-slate-300" value={expCategory} onChange={e => setExpCategory(e.target.value)}>
                <option value="">Todas as categorias</option>
                {(Object.keys(CATEGORY_META) as ExpenseCategory[]).map(k => <option key={k} value={k}>{CATEGORY_META[k].label}</option>)}
              </select>
              <select className="px-3 py-2 text-sm border border-slate-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-slate-700 dark:text-slate-300" value={expPeriod} onChange={e => setExpPeriod(e.target.value as any)}>
                <option value="all">Todas</option>
                <option value="this_month">Este mês</option>
                <option value="last_month">Mês passado</option>
                <option value="this_year">Este ano</option>
              </select>
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  placeholder="Buscar..." value={expSearch} onChange={e => setExpSearch(e.target.value)} />
              </div>
            </div>
            {filteredExpenses.length === 0 ? (
              <EmptyState icon={Wallet} title="Nenhuma despesa registrada" />
            ) : (
              <div className="space-y-2">
                {filteredExpenses.map(e => {
                  const meta = CATEGORY_META[e.category]
                  const Icon = meta.icon
                  return (
                    <Card key={e.id} className="p-4 hover:shadow-card-hover transition-shadow">
                      <div className="flex items-start gap-3">
                        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', meta.badge)}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-slate-900 dark:text-white text-sm truncate">{e.description}</p>
                              <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px]">
                                <Badge className={meta.badge}>{meta.label}</Badge>
                                {e.reimbursable && (e.reimbursed
                                  ? <Badge className="bg-green-100 text-green-700">Reembolsado</Badge>
                                  : <Badge className="bg-orange-100 text-orange-700">A reembolsar</Badge>)}
                                <span className="text-slate-400">{formatDate(e.expense_date)}</span>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                              <span className="font-bold text-red-600 text-sm">-{formatCurrency(e.amount)}</span>
                              <div className="flex gap-1">
                                <button onClick={() => openEditExpense(e)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-600 text-slate-400"><Edit3 className="w-3.5 h-3.5" /></button>
                                <button onClick={() => deleteExpense(e.id)} className="p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Card>
                  )
                })}
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
        saving={saving}
      />

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
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={() => setExpenseModalOpen(false)}>Cancelar</Button>
          <Button onClick={saveExpense} loading={savingExpense}>Salvar</Button>
        </div>
      </Modal>
    </Layout>
  )
}
