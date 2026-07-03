import { usePageLoadingState } from '@/contexts/PageLoadingContext'
import { useEffect, useMemo, useState } from 'react'
import {
  BarChart2, Download, Trophy, TrendingUp, Briefcase, Users, Scale,
  Award, CheckCircle2, XCircle, RotateCcw, Activity, FileCheck, UserCheck,
  Filter, Search, ArrowUpDown, Zap, Clock, AlertCircle, X,
} from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Card, Badge, Spinner, EmptyState, StatsCard } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { Colaborador, Process, Profile, Client, Task } from '@/types'
import { cn, formatDate, PROCESS_STATUS_COLORS } from '@/lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, PieChart, Pie, Cell as PieCell,
} from 'recharts'
import {
  computeAgilityMetrics, agilityPerUser, overdueTasksByType,
  scoreLabel, scoreColorClass, formatDelayDays, avgDelayDays, isCompletedOnTime, isOverdue,
  type TaskLike,
} from '@/lib/reportsUtils'

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const MONTHS_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const COLORS = ['#0f172a','#94a3b8','#7c3aed','#3b82f6','#10b981','#f59e0b','#ec4899','#06b6d4','#8b5cf6','#f97316']

type ActiveTab = 'agilidade' | 'produtividade' | 'resultados' | 'ranking'
type ProductivityPeriod = 'day' | 'week' | 'month'

interface ColabStats {
  id: string; nome: string; total: number; judicial: number; administrativo: number
  won: number; lost: number; returned: number; byMonth: number[]; rankScore: number
}
interface UserProductivity {
  user_id: string; name: string; role: string
  clientsCount: number; protocoladosCount: number; tasksCount: number; total: number
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador', lawyer: 'Advogado', intern: 'Estagiário',
  financial: 'Financeiro', super_admin: 'Super Admin',
}

const NAV_TABS = [
  { id: 'agilidade' as ActiveTab,    label: 'Agilidade',    icon: Zap },
  { id: 'produtividade' as ActiveTab, label: 'Produtividade', icon: Activity },
  { id: 'resultados' as ActiveTab,   label: 'Resultados',   icon: Scale },
  { id: 'ranking' as ActiveTab,      label: 'Ranking',      icon: Trophy },
]

// ─── Component ────────────────────────────────────────────────────────────────
export function ReportsPage() {
  const [loading, setLoading] = usePageLoadingState()
  const [processes, setProcesses] = useState<Process[]>([])
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [users, setUsers] = useState<Profile[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [stats, setStats] = useState<ColabStats[]>([])
  const [chartData, setChartData] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<ActiveTab>('agilidade')
  const [productivityPeriod, setProductivityPeriod] = useState<ProductivityPeriod>('month')

  // Agilidade filters
  const [agilFilter, setAgilFilter] = useState<string>('') // user filter (user_id)
  const [agilSearch, setAgilSearch] = useState('')

  async function load() {
    setLoading(true)
    const [{ data: p }, { data: c }, { data: u }, { data: cl }, { data: tk }] = await Promise.all([
      supabase.from('processes').select('*').is('deleted_at', null),
      supabase.from('colaboradores').select('*').order('nome'),
      supabase.from('profiles').select('*').order('name'),
      supabase.from('clients').select('*').is('deleted_at', null),
      supabase.from('tasks').select('*').is('deleted_at', null),
    ])
    setProcesses(p || [])
    setColaboradores(c || [])
    setUsers((u || []) as Profile[])
    setClients((cl || []) as Client[])
    setTasks((tk || []) as Task[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!processes.length && !colaboradores.length) return
    computeStats()
  }, [processes, colaboradores, selectedYear])

  function computeStats() {
    const yearProcs = processes.filter(p => {
      const date = p.created_at || p.data_protocolo
      if (!date) return true
      return new Date(date).getFullYear() === selectedYear
    })
    const colabMap: Record<string, ColabStats> = {}
    for (const col of colaboradores) {
      colabMap[col.id] = { id: col.id, nome: col.nome, total: 0, judicial: 0, administrativo: 0, won: 0, lost: 0, returned: 0, byMonth: Array(12).fill(0), rankScore: 0 }
    }
    colabMap['none'] = { id: 'none', nome: 'Sem colaborador', total: 0, judicial: 0, administrativo: 0, won: 0, lost: 0, returned: 0, byMonth: Array(12).fill(0), rankScore: 0 }
    for (const proc of yearProcs) {
      const key = colabMap[proc.colaborador_id || ''] ? proc.colaborador_id! : 'none'
      colabMap[key].total++
      if (proc.modalidade === 'judicial') colabMap[key].judicial++
      else if (proc.modalidade === 'administrativo') colabMap[key].administrativo++
      if (proc.status === 'won') colabMap[key].won++
      else if (proc.status === 'lost') colabMap[key].lost++
      else if (proc.status === 'returned') colabMap[key].returned++
      const date = proc.created_at || proc.data_protocolo
      if (date) colabMap[key].byMonth[new Date(date).getMonth()]++
    }
    const statsArr = Object.values(colabMap).filter(s => s.total > 0 || s.id !== 'none').map(s => ({ ...s, rankScore: s.total })).sort((a, b) => b.total - a.total)
    setStats(statsArr)
    setChartData(MONTHS.map((month, i) => {
      const entry: any = { month }
      for (const col of statsArr.filter(s => s.id !== 'none').slice(0, 6)) entry[col.nome.split(' ')[0]] = col.byMonth[i]
      return entry
    }))
  }

  // ── Computed ────────────────────────────────────────────────────────────────
  const now = new Date()
  const taskLikes: TaskLike[] = tasks.map(t => ({
    status: t.status as any,
    due_date: t.due_date,
    completed_at: t.completed_at,
    assigned_to: t.assigned_to,
    assigned_name: t.assigned_name,
    title: t.title,
    type: t.type ?? undefined,
  }))

  const globalMetrics = useMemo(() => computeAgilityMetrics(taskLikes, now), [tasks])
  const perUserMetrics = useMemo(() => agilityPerUser(taskLikes, now), [tasks])
  const overdueByType = useMemo(() => overdueTasksByType(taskLikes, now), [tasks])
  const avgDelay = useMemo(() => avgDelayDays(taskLikes), [tasks])

  // Top overdue users
  const overdueUsers = useMemo(() => {
    return perUserMetrics.filter(u => u.metrics.overdue > 0 && u.userId !== '__none__').sort((a, b) => b.metrics.overdue - a.metrics.overdue).slice(0, 5)
  }, [perUserMetrics])

  // Agilidade table tasks (filterable)
  const agilTableTasks = useMemo(() => {
    return tasks.filter(t => {
      if (t.status === 'cancelled') return false
      if (agilFilter && t.assigned_to !== agilFilter) return false
      if (agilSearch) {
        const q = agilSearch.toLowerCase()
        return t.title.toLowerCase().includes(q) || (t.assigned_name || '').toLowerCase().includes(q)
      }
      return true
    })
  }, [tasks, agilFilter, agilSearch])

  const agilFilterUser = users.find(u => u.user_id === agilFilter)
  const totalScore = agilTableTasks.reduce((sum, t) => {
    const tl: TaskLike = { status: t.status as any, due_date: t.due_date, completed_at: t.completed_at }
    if (t.status === 'done') return sum + (isCompletedOnTime(tl) ? 3 : 1)
    return sum
  }, 0)

  // Productivity
  function getPeriodStart(period: ProductivityPeriod): Date {
    const d = new Date(now)
    if (period === 'day') { d.setHours(0, 0, 0, 0); return d }
    if (period === 'week') {
      const day = d.getDay()
      d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
      d.setHours(0, 0, 0, 0); return d
    }
    return new Date(now.getFullYear(), now.getMonth(), 1)
  }
  function inPeriod(dateStr: string | null | undefined, start: Date) {
    if (!dateStr) return false
    return new Date(dateStr) >= start
  }
  const productivityStart = getPeriodStart(productivityPeriod)
  const productivityLabel = { day: 'Hoje', week: 'Esta Semana', month: 'Este Mês' }[productivityPeriod]
  const userProductivity: UserProductivity[] = users.map(u => {
    const name = u.name || u.display_name || ''
    const clientsCount = clients.filter(c => c.assigned_lawyer === name && inPeriod(c.created_at, productivityStart)).length
    const protocoladosCount = processes.filter(p => p.assigned_lawyer === name && inPeriod(p.data_protocolo, productivityStart)).length
    const tasksCount = tasks.filter(t => t.assigned_to === u.user_id && t.status === 'done' && inPeriod(t.completed_at, productivityStart)).length
    return { user_id: u.user_id, name, role: u.role, clientsCount, protocoladosCount, tasksCount, total: clientsCount + protocoladosCount + tasksCount }
  }).sort((a, b) => b.total - a.total)

  // Results
  const totalYear = stats.reduce((s, c) => s + c.total, 0)
  const totalWon = stats.reduce((s, c) => s + c.won, 0)
  const totalLost = stats.reduce((s, c) => s + c.lost, 0)
  const totalReturned = stats.reduce((s, c) => s + c.returned, 0)
  const totalOutcome = totalWon + totalLost + totalReturned
  const winRate = totalOutcome > 0 ? Math.round((totalWon / totalOutcome) * 100) : 0
  const pieData = [
    { name: 'Ganhos', value: totalWon, color: '#22c55e' },
    { name: 'Perdidos', value: totalLost, color: '#ef4444' },
    { name: 'Devolvidos', value: totalReturned, color: '#f97316' },
  ].filter(d => d.value > 0)

  const years = Array.from(new Set(processes.map(p => { const d = p.created_at || p.data_protocolo; return d ? new Date(d).getFullYear() : null }).filter(Boolean))).sort((a, b) => (b as number) - (a as number)) as number[]
  if (!years.includes(selectedYear)) years.unshift(selectedYear)

  function exportReport() {
    const rows = [
      `RELATÓRIO ${selectedYear} — Score de Agilidade`,
      `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
      '',
      '=== AGILIDADE ===',
      `Concluídas em dia: ${globalMetrics.onTime} | Com atraso: ${globalMetrics.late} | Pendentes: ${globalMetrics.pending} | Vencidas: ${globalMetrics.overdue} | Score Global: ${globalMetrics.score}%`,
      '',
      '=== POR USUÁRIO ===',
      ...perUserMetrics.map(u => `${u.name} → Score: ${u.metrics.score}% (${scoreLabel(u.metrics.score)}) | Em dia: ${u.metrics.onTime} | Atraso: ${u.metrics.late}`),
      '',
      '=== PROCESSOS / COLABORADORES ===',
      ...stats.map((s, i) => `${i + 1}º ${s.nome}: ${s.total} processo(s) | Ganhos: ${s.won} | Perdidos: ${s.lost} | Devolvidos: ${s.returned}`),
    ].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([rows], { type: 'text/plain;charset=utf-8' }))
    a.download = `relatorio-agilidade-${selectedYear}.txt`
    a.click()
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  if (loading) return null

  return (
    <Layout
      title="Relatórios"
      actions={
        <div className="flex items-center gap-2">
          <select className="px-3 py-2 text-sm border border-slate-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-slate-900 dark:text-slate-100" value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={exportReport} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-dark-600 rounded-lg hover:bg-slate-50 dark:hover:bg-dark-700 transition-colors">
            <Download className="w-4 h-4" /> Exportar
          </button>
        </div>
      }
    >
      <div className="flex gap-4 animate-fade-in min-h-0">

        {/* ── Left nav (AdvBox-style) ── */}
        <nav className="w-36 flex-shrink-0 space-y-0.5">
          {NAV_TABS.map(tab => {
            const Icon = tab.icon
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                data-testid={`nav-${tab.id}`}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left relative',
                  active
                    ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-dark-800 hover:text-slate-800 dark:hover:text-slate-200'
                )}
              >
                {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary-600 rounded-r-full" />}
                <Icon className={cn('w-4 h-4 flex-shrink-0', active ? 'text-primary-600 dark:text-primary-400' : 'text-slate-400 dark:text-slate-500')} />
                <span>{tab.label}</span>
              </button>
            )
          })}

          {/* Year label */}
          <div className="pt-4 px-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600">Ano</p>
            <p className="text-lg font-bold text-slate-700 dark:text-slate-300 leading-none mt-0.5">{selectedYear}</p>
          </div>
        </nav>

        {/* ── Main content ── */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* ── AGILIDADE ── */}
          {activeTab === 'agilidade' && (
            <>
              {/* Donut chart */}
              <Card className="p-5">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h2 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider">Agilidade</h2>
                    <p className="text-xs text-slate-400 mt-0.5">Score global de cumprimento de tarefas</p>
                  </div>
                  <span className={cn('px-2.5 py-1 rounded-full text-xs font-bold border', scoreColorClass(globalMetrics.score))}>
                    {globalMetrics.score}% — {scoreLabel(globalMetrics.score)}
                  </span>
                </div>

                <div className="flex items-center gap-6">
                  {/* Donut */}
                  <div className="flex-shrink-0">
                    <ResponsiveContainer width={200} height={160}>
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Em dia', value: globalMetrics.onTime, fill: '#10b981' },
                            { name: 'Com atraso', value: globalMetrics.late, fill: '#f59e0b' },
                            { name: 'Pendentes', value: globalMetrics.pending, fill: '#6366f1' },
                            { name: 'Vencidas', value: globalMetrics.overdue, fill: '#ef4444' },
                            ...(globalMetrics.total === 0 ? [{ name: 'Sem dados', value: 1, fill: '#e5e7eb' }] : []),
                          ]}
                          cx="50%" cy="50%" innerRadius={45} outerRadius={72}
                          dataKey="value" startAngle={90} endAngle={-270}
                        >
                          {[{ fill: '#10b981' }, { fill: '#f59e0b' }, { fill: '#6366f1' }, { fill: '#ef4444' }, { fill: '#e5e7eb' }].map((c, i) => (
                            <PieCell key={i} fill={c.fill} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v, n) => [`${v} tarefa(s)`, n]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Legend */}
                  <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                    {[
                      { label: 'Concluídas em dia', value: globalMetrics.onTime, color: 'bg-emerald-500' },
                      { label: 'Concluídas em atraso', value: globalMetrics.late, color: 'bg-amber-500' },
                      { label: 'Pendentes', value: globalMetrics.pending, color: 'bg-indigo-500' },
                      { label: 'Vencidas', value: globalMetrics.overdue, color: 'bg-red-500' },
                    ].map(item => (
                      <div key={item.label} className="flex items-center gap-2.5">
                        <div className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', item.color)} />
                        <div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">{item.label}</p>
                          <p className="text-base font-bold text-slate-800 dark:text-white leading-tight">{item.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              {/* Gestão table */}
              <Card className="overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 dark:border-dark-700/50">
                  <h2 className="text-sm font-bold text-slate-800 dark:text-white">Gestão</h2>
                </div>

                {/* Toolbar */}
                <div className="flex items-center gap-2 px-4 py-2.5 flex-wrap bg-slate-50/50 dark:bg-dark-800/30 border-b border-slate-100 dark:border-dark-700/50">
                  {/* User filter chip */}
                  <div className="relative">
                    <select
                      value={agilFilter}
                      onChange={e => setAgilFilter(e.target.value)}
                      className="appearance-none pl-2.5 pr-7 py-1.5 text-xs border border-slate-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                    >
                      <option value="">Produtividade — Todos</option>
                      {users.map(u => <option key={u.user_id} value={u.user_id}>{u.name || u.display_name}</option>)}
                    </select>
                  </div>

                  {/* Active filter chip */}
                  {agilFilter && agilFilterUser && (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300">
                      {agilFilterUser.name || agilFilterUser.display_name}
                      <button onClick={() => setAgilFilter('')}><X className="w-3 h-3" /></button>
                    </span>
                  )}

                  <div className="flex-1" />

                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                      value={agilSearch}
                      onChange={e => setAgilSearch(e.target.value)}
                      placeholder="Buscar..."
                      className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary-100 w-32"
                    />
                  </div>
                  <button className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-dark-600 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-700 transition-colors">
                    <Filter className="w-3.5 h-3.5" /> Filtrar
                  </button>
                  <button className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-dark-600 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-700 transition-colors">
                    <ArrowUpDown className="w-3.5 h-3.5" /> Ordenar
                  </button>
                </div>

                {/* Table */}
                {agilTableTasks.length === 0 ? (
                  <EmptyState icon={CheckCircle2} title="Nenhuma tarefa encontrada" description="Ajuste os filtros ou cadastre tarefas." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-dark-700/30 border-b border-slate-100 dark:border-dark-700/50">
                          {['Responsável', 'Tarefa', 'Pontuação', 'Data compromisso', 'Conclusão'].map(h => (
                            <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 dark:divide-dark-700/30">
                        {agilTableTasks.slice(0, 100).map(t => {
                          const tl: TaskLike = { status: t.status as any, due_date: t.due_date, completed_at: t.completed_at }
                          const taskOverdue = isOverdue(tl, now)
                          const onTime = t.status === 'done' && isCompletedOnTime(tl)
                          const pts = t.status === 'done' ? (onTime ? 3 : 1) : 0
                          return (
                            <tr key={t.id} className="hover:bg-primary-50/20 dark:hover:bg-primary-900/10 transition-colors">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 text-[10px] font-bold flex-shrink-0">
                                    {(t.assigned_name || '?')[0].toUpperCase()}
                                  </div>
                                  <span className="text-xs text-slate-700 dark:text-slate-300 truncate max-w-[100px]">{t.assigned_name || '—'}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1.5">
                                  {taskOverdue && <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
                                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate max-w-[200px]">{t.title}</span>
                                </div>
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                  {t.status === 'done' ? (onTime ? '✓ No prazo' : '⚠ Com atraso') : t.status === 'pending' ? 'Pendente' : t.status === 'in_progress' ? 'Em andamento' : t.status}
                                </p>
                              </td>
                              <td className="px-4 py-3">
                                <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-bold border',
                                  pts === 3 ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800' :
                                  pts === 1 ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800' :
                                  'bg-slate-50 text-slate-500 border-slate-200 dark:bg-dark-700 dark:text-slate-400 dark:border-dark-600'
                                )}>
                                  {pts} pts
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{formatDate(t.due_date)}</td>
                              <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{formatDate(t.completed_at)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Footer */}
                <div className="px-4 py-2.5 bg-slate-50 dark:bg-dark-700/30 border-t border-slate-100 dark:border-dark-700/50 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Total <strong className="text-slate-700 dark:text-slate-200">{totalScore} pontos</strong></span>
                  <span>{agilTableTasks.length} registro(s)</span>
                </div>
              </Card>
            </>
          )}

          {/* ── PRODUTIVIDADE ── */}
          {activeTab === 'produtividade' && (
            <Card className="overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-dark-700 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-primary-600" />
                  <h2 className="font-semibold text-slate-900 dark:text-white">Produtividade por Usuário — {productivityLabel}</h2>
                </div>
                <div className="flex rounded-lg border border-slate-200 dark:border-dark-600 overflow-hidden">
                  {(['day', 'week', 'month'] as const).map((p, i) => (
                    <button key={p} onClick={() => setProductivityPeriod(p)}
                      className={cn('px-3 py-1.5 text-xs font-medium transition-colors', i > 0 && 'border-l border-slate-200 dark:border-dark-600',
                        productivityPeriod === p ? 'bg-primary-600 text-white' : 'bg-white dark:bg-dark-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-dark-700'
                      )}>
                      {{ day: 'Hoje', week: 'Semana', month: 'Mês' }[p]}
                    </button>
                  ))}
                </div>
              </div>

              {userProductivity.length === 0 ? (
                <EmptyState icon={Users} title="Nenhum usuário cadastrado" />
              ) : (
                <div className="p-5 space-y-5">
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Clientes Captados', val: userProductivity.reduce((a, u) => a + u.clientsCount, 0), icon: UserCheck, color: 'purple' },
                      { label: 'Processos Protocolados', val: userProductivity.reduce((a, u) => a + u.protocoladosCount, 0), icon: FileCheck, color: 'emerald' },
                      { label: 'Tarefas Realizadas', val: userProductivity.reduce((a, u) => a + u.tasksCount, 0), icon: CheckCircle2, color: 'blue' },
                    ].map(({ label, val, icon: Icon, color }) => (
                      <div key={label} className={`p-4 rounded-xl bg-${color}-50 dark:bg-${color}-900/20 border border-${color}-100 dark:border-${color}-900/40`}>
                        <div className="flex items-center gap-2 mb-1">
                          <Icon className={`w-4 h-4 text-${color}-600 dark:text-${color}-400`} />
                          <span className={`text-xs font-medium text-${color}-700 dark:text-${color}-300`}>{label}</span>
                        </div>
                        <p className={`text-2xl font-bold text-${color}-700 dark:text-${color}-300`}>{val}</p>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-3">
                    {userProductivity.map((u, i) => (
                      <div key={u.user_id} className={cn('p-4 rounded-xl border transition-all',
                        u.total > 0 ? 'border-primary-200 dark:border-primary-800 bg-gradient-to-r from-primary-50/50 to-transparent dark:from-primary-900/10' : 'border-slate-200 dark:border-dark-600 bg-white dark:bg-dark-800'
                      )}>
                        <div className="flex items-center gap-3 mb-3">
                          <div className={cn('w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0',
                            i === 0 && u.total > 0 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                            i === 1 && u.total > 0 ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' :
                            i === 2 && u.total > 0 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                            'bg-primary-50 text-primary-600 dark:bg-primary-900/20 dark:text-primary-400'
                          )}>
                            {u.total > 0 && i < 3 ? ['🥇','🥈','🥉'][i] : (u.name[0] || '?').toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-900 dark:text-white text-sm">{u.name || 'Sem nome'}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{ROLE_LABELS[u.role] || u.role}</p>
                          </div>
                          <span className="text-lg font-bold text-primary-600 dark:text-primary-400">{u.total}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-900/30">
                            <UserCheck className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 flex-shrink-0" />
                            <div><p className="text-purple-600 dark:text-purple-400">Clientes</p><p className="font-bold text-purple-700 dark:text-purple-300">{u.clientsCount}</p></div>
                          </div>
                          <div className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/30">
                            <FileCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                            <div><p className="text-emerald-600 dark:text-emerald-400">Prot.</p><p className="font-bold text-emerald-700 dark:text-emerald-300">{u.protocoladosCount}</p></div>
                          </div>
                          <div className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30">
                            <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                            <div><p className="text-blue-600 dark:text-blue-400">Tarefas</p><p className="font-bold text-blue-700 dark:text-blue-300">{u.tasksCount}</p></div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* ── RESULTADOS ── */}
          {activeTab === 'resultados' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Processos Ganhos', value: totalWon, icon: CheckCircle2, color: 'border-green-500', vcolor: 'text-green-600 dark:text-green-400', pct: winRate + '% êxito' },
                  { label: 'Processos Perdidos', value: totalLost, icon: XCircle, color: 'border-red-500', vcolor: 'text-red-600 dark:text-red-400', pct: totalOutcome > 0 ? Math.round((totalLost / totalOutcome) * 100) + '%' : '—' },
                  { label: 'Devolvidos', value: totalReturned, icon: RotateCcw, color: 'border-orange-500', vcolor: 'text-orange-600 dark:text-orange-400', pct: totalOutcome > 0 ? Math.round((totalReturned / totalOutcome) * 100) + '%' : '—' },
                ].map(({ label, value, icon: Icon, color, vcolor, pct }) => (
                  <Card key={label} className={`p-5 border-l-4 ${color}`}>
                    <div className="flex items-center justify-between mb-2"><Icon className={`w-6 h-6 ${vcolor}`} /><span className={`text-3xl font-bold ${vcolor}`}>{value}</span></div>
                    <p className="font-semibold text-slate-900 dark:text-white text-sm">{label}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{pct}</p>
                  </Card>
                ))}
              </div>
              {totalOutcome > 0 ? (
                <Card className="p-5">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-4">Distribuição de Resultados</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`} labelLine={false} fontSize={11}>
                          {pieData.map((e, i) => <PieCell key={i} fill={e.color} />)}
                        </Pie>
                        <Tooltip formatter={(v) => [`${v} processo(s)`]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Por Colaborador</p>
                      {stats.filter(s => s.id !== 'none' && (s.won + s.lost + s.returned) > 0).map(s => {
                        const tot = s.won + s.lost + s.returned
                        return (
                          <div key={s.id}>
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="font-medium text-slate-700 dark:text-slate-300 truncate">{s.nome}</span>
                              <div className="flex gap-2 flex-shrink-0 ml-2">
                                <span className="text-green-600 font-semibold">{s.won}G</span>
                                <span className="text-red-500 font-semibold">{s.lost}P</span>
                                <span className="text-orange-500 font-semibold">{s.returned}D</span>
                              </div>
                            </div>
                            <div className="h-2 bg-slate-100 dark:bg-dark-700 rounded-full overflow-hidden flex">
                              {s.won > 0 && <div className="h-full bg-green-500" style={{ width: `${(s.won / tot) * 100}%` }} />}
                              {s.lost > 0 && <div className="h-full bg-red-500" style={{ width: `${(s.lost / tot) * 100}%` }} />}
                              {s.returned > 0 && <div className="h-full bg-orange-500" style={{ width: `${(s.returned / tot) * 100}%` }} />}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </Card>
              ) : (
                <EmptyState icon={Scale} title="Sem processos encerrados ainda" description="Marque processos como Ganhos, Perdidos ou Devolvidos para ver o detalhamento." />
              )}

              {/* Indicações por Parceiro */}
              {(() => {
                const indicMap: Record<string, { nome: string; count: number }> = {}
                for (const cl of clients) {
                  if ((cl as any).origem === 'indicacao' && (cl as any).colaborador_id) {
                    const cid = (cl as any).colaborador_id as string
                    if (!indicMap[cid]) {
                      const col = colaboradores.find(c => c.id === cid)
                      indicMap[cid] = { nome: col?.nome || 'Parceiro desconhecido', count: 0 }
                    }
                    indicMap[cid].count++
                  }
                }
                const entries = Object.entries(indicMap).sort((a, b) => b[1].count - a[1].count)
                if (entries.length === 0) return null
                const maxCount = entries[0][1].count
                return (
                  <Card className="p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Users className="w-5 h-5 text-emerald-600" />
                      <h3 className="text-sm font-bold text-slate-800 dark:text-white">Indicações por Parceiro</h3>
                      <Badge className="ml-auto bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 text-[10px]">
                        {entries.reduce((s, e) => s + e[1].count, 0)} total
                      </Badge>
                    </div>
                    <div className="space-y-3">
                      {entries.map(([id, data]) => (
                        <div key={id}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-medium text-slate-700 dark:text-slate-300 truncate">{data.nome}</span>
                            <span className="font-bold text-emerald-600 dark:text-emerald-400 ml-2 flex-shrink-0">
                              {data.count} indicaç{data.count === 1 ? 'ão' : 'ões'}
                            </span>
                          </div>
                          <div className="h-2 bg-slate-100 dark:bg-dark-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                              style={{ width: `${(data.count / maxCount) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )
              })()}
            </div>
          )}

          {/* ── RANKING ── */}
          {activeTab === 'ranking' && (
            <div className="space-y-4">
              {/* Score de Agilidade por usuário */}
              <Card className="overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-dark-700 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-primary-600" />
                  <h2 className="font-semibold text-slate-900 dark:text-white">Score de Agilidade por Usuário</h2>
                  <Badge className="ml-auto bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 text-[10px]">Novo</Badge>
                </div>
                {perUserMetrics.length === 0 ? (
                  <EmptyState icon={Zap} title="Sem dados de agilidade" />
                ) : (
                  <div className="divide-y divide-slate-50 dark:divide-dark-700/30">
                    {perUserMetrics.filter(u => u.userId !== '__none__').map((u, i) => (
                      <div key={u.userId} className="px-5 py-4 flex items-center gap-4">
                        <div className={cn('w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0',
                          i === 0 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                          i === 1 ? 'bg-slate-100 text-slate-600' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-primary-50 text-primary-600'
                        )}>
                          {i < 3 ? ['🥇','🥈','🥉'][i] : i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{u.name}</p>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                              <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-bold border', scoreColorClass(u.metrics.score))}>
                                {u.metrics.score}% — {scoreLabel(u.metrics.score)}
                              </span>
                            </div>
                          </div>
                          <div className="h-2 bg-slate-100 dark:bg-dark-700 rounded-full overflow-hidden">
                            <div className={cn('h-full rounded-full transition-all duration-700',
                              u.metrics.score >= 80 ? 'bg-emerald-500' : u.metrics.score >= 60 ? 'bg-blue-500' : u.metrics.score >= 40 ? 'bg-amber-500' : 'bg-red-500'
                            )} style={{ width: `${u.metrics.score}%` }} />
                          </div>
                          <div className="flex gap-3 mt-1.5 text-[10px] text-slate-400">
                            <span className="text-emerald-600">✓ {u.metrics.onTime} em dia</span>
                            <span className="text-amber-600">⚠ {u.metrics.late} com atraso</span>
                            <span className="text-slate-500">◦ {u.metrics.pending} pendentes</span>
                            {u.metrics.overdue > 0 && <span className="text-red-500">✕ {u.metrics.overdue} vencidas</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Colaboradores ranking (processos) */}
              <Card className="overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-dark-700 flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-yellow-500" />
                  <h2 className="font-semibold text-slate-900 dark:text-white">Ranking de Colaboradores — {selectedYear}</h2>
                </div>
                {stats.filter(s => s.id !== 'none').length === 0 ? (
                  <EmptyState icon={BarChart2} title="Sem dados para este ano" />
                ) : (
                  <div className="divide-y divide-slate-50 dark:divide-dark-700/30">
                    {stats.filter(s => s.id !== 'none').map((s, i) => {
                      const pct = Math.round((s.total / (stats[0]?.total || 1)) * 100)
                      return (
                        <div key={s.id} className="px-5 py-4 flex items-center gap-4">
                          <div className={cn('w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0',
                            i === 0 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30' : i === 1 ? 'bg-slate-100 text-slate-600' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-primary-50 text-primary-600'
                          )}>
                            {i < 3 ? ['🥇','🥈','🥉'][i] : i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{s.nome}</p>
                              <div className="flex gap-1.5 text-xs flex-shrink-0 ml-2">
                                <span className="text-purple-600">{s.judicial}J</span>
                                <span className="text-blue-600">{s.administrativo}A</span>
                                <span className="font-bold text-slate-900 dark:text-white">{s.total}</span>
                              </div>
                            </div>
                            <div className="h-2 bg-slate-100 dark:bg-dark-700 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-gradient-to-r from-primary-600 to-primary-400 transition-all duration-700" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>

              {/* Monthly chart */}
              {chartData.length > 0 && stats.filter(s => s.id !== 'none' && s.total > 0).length > 0 && (
                <Card className="p-5">
                  <div className="flex items-center gap-2 mb-4"><TrendingUp className="w-5 h-5 text-primary-600" /><h2 className="font-semibold text-slate-900 dark:text-white">Processos por Mês — {selectedYear}</h2></div>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} allowDecimals={false} />
                      <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {stats.filter(s => s.id !== 'none' && s.total > 0).slice(0, 6).map((s, i) => (
                        <Bar key={s.id} dataKey={s.nome.split(' ')[0]} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              )}
            </div>
          )}
        </div>

        {/* ── Right sidebar ── */}
        <aside className="w-72 flex-shrink-0 space-y-3">

          {/* Tarefas com mais atrasos */}
          <div className="rounded-2xl overflow-hidden">
            <div className="px-4 py-3 bg-primary-600 dark:bg-primary-700">
              <p className="text-[11px] font-bold uppercase tracking-widest text-white/80">Tarefas com mais atrasos</p>
            </div>
            <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-900/40 rounded-b-2xl divide-y divide-primary-100 dark:divide-primary-900/40">
              {overdueByType.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-primary-500 dark:text-primary-400">Nenhuma tarefa vencida</div>
              ) : overdueByType.slice(0, 5).map(item => (
                <div key={item.type} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-xs font-medium text-primary-800 dark:text-primary-200 truncate">{item.type}</span>
                  <span className="text-xs font-bold text-white bg-primary-500 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 ml-2">{item.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Colaboradores com mais tarefas atrasadas */}
          <Card className="p-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-3">Colaboradores com mais atrasos</p>
            {overdueUsers.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-2">Tudo em dia!</p>
            ) : (
              <div className="space-y-2.5">
                {overdueUsers.map(u => (
                  <div key={u.userId} className="flex items-center gap-2.5">
                    <div className="relative flex-shrink-0">
                      <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-dark-600 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300">
                        {u.name[0]?.toUpperCase() || '?'}
                      </div>
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{u.metrics.overdue}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{u.name}</p>
                      <p className="text-[10px] text-red-500">{u.metrics.overdue} vencida{u.metrics.overdue > 1 ? 's' : ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Agilidade Geral */}
          <Card className="p-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-3">Agilidade Geral</p>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                <Clock className="w-4 h-4 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className={cn('text-lg font-bold leading-tight', scoreColorClass(globalMetrics.score))}>{globalMetrics.score}%</p>
                <p className="text-[11px] text-slate-400">score global</p>
              </div>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-dark-700">
                <span className="text-slate-500 dark:text-slate-400">Média de cumprimento</span>
                <span className={cn('font-semibold', globalMetrics.score > 0 ? 'text-emerald-600' : 'text-slate-400')}>{globalMetrics.score > 0 ? `${globalMetrics.score}%` : 'N/A'}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-dark-700">
                <span className="text-slate-500 dark:text-slate-400">Média de atraso</span>
                <span className={cn('font-semibold', avgDelay !== null && avgDelay > 0 ? 'text-red-500' : 'text-slate-400')}>{formatDelayDays(avgDelay)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-dark-700">
                <span className="text-slate-500 dark:text-slate-400">Total de tarefas</span>
                <span className="font-semibold text-slate-700 dark:text-slate-200">{globalMetrics.total}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-slate-500 dark:text-slate-400">Tarefas vencidas</span>
                <span className={cn('font-semibold', globalMetrics.overdue > 0 ? 'text-red-500' : 'text-emerald-600')}>{globalMetrics.overdue}</span>
              </div>
            </div>
          </Card>

          {/* Top performer */}
          {stats[0] && stats[0].id !== 'none' && stats[0].total > 0 && (
            <Card className="p-4 bg-gradient-to-br from-primary-700 to-primary-500 border-0">
              <p className="text-[11px] font-bold uppercase tracking-widest text-white/70 mb-2">Destaque {selectedYear}</p>
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  <Award className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-white font-bold text-sm truncate">{stats[0].nome}</p>
                  <p className="text-white/70 text-[11px]">{stats[0].total} processos captados</p>
                </div>
              </div>
            </Card>
          )}
        </aside>
      </div>
    </Layout>
  )
}
