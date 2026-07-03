import { usePageLoadingState } from '@/contexts/PageLoadingContext'
import { useEffect, useMemo, useState, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Plus, Search, Briefcase, Trash2, Download, ChevronDown, ChevronRight,
  ArrowRight, Scale, Edit3, Gavel, FileText, Calendar,
  User, Building2, Hash, AlertCircle, Printer, CheckCircle2, TrendingUp, X,
  FolderOpen, Globe, DollarSign, RotateCcw, Upload, CheckSquare,
} from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Button, Card, Badge, Modal, Input, Select, Textarea, EmptyState, Spinner, StatsCard } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { Process, Client, Colaborador, Task, Financial, ProcessUpdate } from '@/types'
import { formatDate, formatCurrency, PROCESS_STATUS_COLORS, PROCESS_STATUS_LABELS, PRIORITY_COLORS, PRIORITY_LABELS, FINANCIAL_STATUS_LABELS, FINANCIAL_STATUS_COLORS, TASK_STATUS_LABELS } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { openExportWindow } from '@/lib/exportUtils'

type ProcessForm = {
  number: string; title: string; client_id: string; client_name: string; area: string;
  type: string; status: string; priority: string; assigned_lawyer: string; court: string;
  judge: string; counterparty: string; description: string; modalidade: string;
  data_protocolo: string; next_deadline: string; colaborador_id: string;
  // ADVBOX fields
  grupo_acao: string; fase: string; etapa: string;
  numero_protocolo: string; processo_originario: string; pasta_caso: string;
  data_requerimento: string; valor_causa: string; valor_honorarios: string;
  percentual_honorarios: string; contingenciamento: string;
}

const EMPTY_FORM: ProcessForm = {
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
  'Previdenciário': ['Aposentadoria', 'BPC/LOAS', 'Auxílio-doença', 'Outro'],
  'Empresarial': ['Recuperação judicial', 'Dissolução societária', 'Outro'],
  'Imobiliário': ['Usucapião', 'Despejo', 'Compra e venda', 'Outro'],
  'Outro': ['Outro'],
}
const FASES = ['NEGOCIAÇÃO', 'CONHECIMENTO', 'RECURSAL', 'EXECUÇÃO', 'ENCERRADO']
const CONTINGENCIAMENTOS = ['Remoto', 'Possível', 'Provável', 'Quase certo']

type ViewMode = 'table' | 'byColaborador'

const PAGE_SIZE = 15

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mt-2 mb-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-primary-600 dark:text-primary-400 whitespace-nowrap">
        {children}
      </span>
      <div className="flex-1 h-px bg-gradient-to-r from-primary-200 dark:from-primary-800 to-transparent" />
    </div>
  )
}

export function ProcessesPage() {
  const [processes, setProcesses] = useState<Process[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [loading, setLoading] = usePageLoadingState()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [modalidadeFilter, setModalidadeFilter] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [modalOpen, setModalOpen] = useState(false)
  const [viewProcess, setViewProcess] = useState<Process | null>(null)
  const [moveModal, setMoveModal] = useState<{ process: Process; targetId: string } | null>(null)
  const [form, setForm] = useState<ProcessForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [areaOptions, setAreaOptions] = useState<string[]>([])
  const [cpfSearch, setCpfSearch] = useState('')
  const [groupPages, setGroupPages] = useState<Record<string, number>>({})
  const [tablePage, setTablePage] = useState(0)
  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function load() {
    setLoading(true)
    const [{ data: p }, { data: c }, { data: col }] = await Promise.all([
      supabase.from('processes').select('*').is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('clients').select('id,name,cpf_cnpj,phone,email,cidade,assigned_lawyer,colaborador_id,modalidade,area_direito').is('deleted_at', null).order('name'),
      supabase.from('colaboradores').select('*').eq('ativo', true).order('nome'),
    ])
    setProcesses(p || [])
    setClients((c || []) as Client[])
    setColaboradores(col || [])
    const allIds = new Set(['sem-colaborador', ...(col || []).map((x: Colaborador) => x.id)])
    setExpandedGroups(allIds)

    const DEFAULT_AREAS = ['Previdenciário', 'Cível', 'Consumidor', 'Trabalhista', 'Tributário', 'Criminal']
    const dbAreas = Array.from(new Set(
      (p || []).map((proc: any) => proc.area).filter(Boolean)
    )) as string[]
    const allAreas = Array.from(new Set([...DEFAULT_AREAS, ...dbAreas])).sort()
    setAreaOptions(allAreas)

    setLoading(false)
  }

  useEffect(() => { load() }, [])
  useEffect(() => { setTablePage(0) }, [search, statusFilter, modalidadeFilter, viewMode])

  const location = useLocation()
  useEffect(() => {
    if ((location.state as any)?.openNew) { openNew(); window.history.replaceState({}, '') }
  }, [location.state])

  const filtered = processes.filter(p => {
    const matchSearch = !search ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.number.toLowerCase().includes(search.toLowerCase()) ||
      p.client_name?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = !statusFilter || p.status === statusFilter
    const matchModalidade = !modalidadeFilter || p.modalidade === modalidadeFilter
    return matchSearch && matchStatus && matchModalidade
  })

  // Stats — calculated from full processes list (not filtered)
  const stats = useMemo(() => {
    const total = processes.length
    const active = processes.filter(p => p.status === 'active').length
    const protocolados = processes.filter(p => p.data_protocolo).length
    const won = processes.filter(p => p.status === 'won').length
    const lost = processes.filter(p => p.status === 'lost').length
    const returned = processes.filter(p => p.status === 'returned').length
    const encerrados = won + lost + returned
    const judicial = processes.filter(p => p.modalidade === 'judicial').length
    const admin = processes.filter(p => p.modalidade === 'administrativo').length
    const todayStr = new Date().toISOString().slice(0, 10)
    const comPrazo = processes.filter(p => p.next_deadline && p.next_deadline >= todayStr).length
    const taxa = encerrados > 0 ? Math.round((won / encerrados) * 100) : 0
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
    const fechamentosThisMonth = processes.filter(p => (p.updated_at ?? '') >= monthStart && (p.status === 'won' || p.status === 'lost')).length
    const fechamentosPrevMonth = processes.filter(p => (p.updated_at ?? '') >= prevMonthStart && (p.updated_at ?? '') < monthStart && (p.status === 'won' || p.status === 'lost')).length
    const arquivadosThisMonth = processes.filter(p => (p.updated_at ?? '') >= monthStart && p.status === 'archived').length
    const arquivadosPrevMonth = processes.filter(p => (p.updated_at ?? '') >= prevMonthStart && (p.updated_at ?? '') < monthStart && p.status === 'archived').length
    return { total, active, protocolados, encerrados, judicial, admin, comPrazo, taxa, won, lost, returned, fechamentosThisMonth, fechamentosPrevMonth, arquivadosThisMonth, arquivadosPrevMonth }
  }, [processes])

  // Chart data: volume por fase — categorias fixas ADVBOX
  const CHART_CATS = ['Marketing', 'Negociação', 'Consultoria', 'Administrativo', 'Judicial', 'Recursal', 'Execução']
  const volumePorFase = useMemo(() => {
    const count: Record<string, number> = {}
    for (const cat of CHART_CATS) count[cat] = 0
    for (const p of processes) {
      const area = (p.area || p.modalidade || '').toLowerCase()
      if (area.includes('market')) count['Marketing'] = (count['Marketing'] || 0) + 1
      else if (area.includes('negoc') || area.includes('acordo')) count['Negociação'] = (count['Negociação'] || 0) + 1
      else if (area.includes('consul')) count['Consultoria'] = (count['Consultoria'] || 0) + 1
      else if (area.includes('admin')) count['Administrativo'] = (count['Administrativo'] || 0) + 1
      else if (area.includes('recurs')) count['Recursal'] = (count['Recursal'] || 0) + 1
      else if (area.includes('execu') || area.includes('cobran')) count['Execução'] = (count['Execução'] || 0) + 1
      else count['Judicial'] = (count['Judicial'] || 0) + 1
    }
    return CHART_CATS.map(label => ({ label, value: count[label] || 0 }))
  }, [processes])

  // Status counts for tabs
  const statusCounts = useMemo(() => {
    const base = processes.filter(p => {
      const matchSearch = !search ||
        p.title.toLowerCase().includes(search.toLowerCase()) ||
        p.number.toLowerCase().includes(search.toLowerCase()) ||
        p.client_name?.toLowerCase().includes(search.toLowerCase())
      const matchModalidade = !modalidadeFilter || p.modalidade === modalidadeFilter
      return matchSearch && matchModalidade
    })
    return {
      all: base.length,
      active: base.filter(p => p.status === 'active').length,
      protocolados: base.filter(p => p.data_protocolo).length,
      won: base.filter(p => p.status === 'won').length,
      lost: base.filter(p => p.status === 'lost').length,
      returned: base.filter(p => p.status === 'returned').length,
      archived: base.filter(p => p.status === 'archived').length,
      suspended: base.filter(p => p.status === 'suspended').length,
    }
  }, [processes, search, modalidadeFilter])

  function toggleGroup(id: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function openNew() { setEditId(null); setForm(EMPTY_FORM); setCpfSearch(''); setModalOpen(true) }
  function openEdit(p: Process) {
    setEditId(p.id)
    setForm({
      number: p.number, title: p.title, client_id: p.client_id || '',
      client_name: p.client_name || '', area: p.area || '', type: p.type || '',
      status: (p.status as any) || 'active', priority: (p.priority as any) || 'medium',
      assigned_lawyer: p.assigned_lawyer || '', court: p.court || '',
      judge: p.judge || '', counterparty: p.counterparty || '',
      description: p.description || '', modalidade: p.modalidade || '',
      data_protocolo: p.data_protocolo || '', next_deadline: p.next_deadline || '',
      colaborador_id: p.colaborador_id || '',
      grupo_acao: p.area || '',
      fase: 'NEGOCIAÇÃO', etapa: 'ANÁLISE DO CASO',
      numero_protocolo: '', processo_originario: '', pasta_caso: '',
      data_requerimento: p.data_protocolo || '', valor_causa: '', valor_honorarios: '',
      percentual_honorarios: '', contingenciamento: '',
    })
    setCpfSearch('')
    setModalOpen(true)
  }

  async function save() {
    const selectedClient = clients.find(c => c.id === form.client_id)
    const derivedTitle = form.title.trim() || form.type || selectedClient?.name || 'Sem título'
    if (!form.client_id && !form.client_name.trim()) return
    setSaving(true)
    const payload: any = {
      ...form,
      title: derivedTitle,
      area: form.area || form.grupo_acao || '',
      client_name: selectedClient?.name || form.client_name || '',
      colaborador_id: form.colaborador_id || null,
      data_protocolo: form.data_protocolo || form.data_requerimento || null,
      data_requerimento: form.data_requerimento || null,
      next_deadline: form.next_deadline || null,
      modalidade: form.modalidade || null,
    }
    if (!payload.client_id) delete payload.client_id
    let error: any = null
    if (editId) {
      const res = await supabase.from('processes').update(payload).eq('id', editId)
      error = res.error
    } else {
      const res = await supabase.from('processes').insert(payload)
      error = res.error
    }
    setSaving(false)
    if (error) {
      alert(`Erro ao salvar processo: ${error.message}`)
      return
    }
    setModalOpen(false)
    load()
  }

  async function deleteProcess(id: string) {
    if (!confirm('Deseja excluir este processo?')) return
    await supabase.from('processes').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    load()
  }

  async function moveProcess(processId: string, newColaboradorId: string) {
    await supabase.from('processes').update({ colaborador_id: newColaboradorId || null }).eq('id', processId)
    setMoveModal(null)
    load()
  }

  /** scope: 'all' agrupa todos os parceiros; 'sem-parceiro' ou um colaborador_id exporta só aquele recorte */
  function exportAll(scope: string = 'all') {
    const scoped = scope === 'all'
      ? filtered
      : scope === 'sem-parceiro'
      ? filtered.filter(p => !p.colaborador_id)
      : filtered.filter(p => p.colaborador_id === scope)

    const judicial = scoped.filter(p => p.modalidade === 'judicial').length
    const admin = scoped.filter(p => p.modalidade === 'administrativo').length
    const active = scoped.filter(p => p.status === 'active').length

    function processRow(p: Process) {
      return [
        { text: p.number, mono: true, bold: true },
        { text: p.title },
        { text: p.client_name || '—' },
        { text: p.modalidade === 'judicial' ? 'Judicial' : p.modalidade === 'administrativo' ? 'Administrativo' : '—', badge: (p.modalidade === 'judicial' ? 'purple' : 'cyan') as any },
        { text: p.area || '—' },
        { text: p.court || '—' },
        { text: PROCESS_STATUS_LABELS[p.status || 'active'], badge: (p.status === 'active' ? 'green' : p.status === 'won' ? 'blue' : p.status === 'lost' ? 'red' : p.status === 'archived' ? 'gray' : 'amber') as any },
        { text: formatDate(p.next_deadline) },
      ]
    }

    const columns = ['Número', 'Título', 'Cliente', 'Modalidade', 'Área', 'Vara', 'Status', 'Próximo Prazo']

    if (scope !== 'all') {
      const parceiroNome = scope === 'sem-parceiro' ? 'Sem parceiro' : (colaboradores.find(c => c.id === scope)?.nome || 'Parceiro')
      const csvLines = ['Número,Título,Cliente,Modalidade,Área,Vara,Status,Próximo Prazo']
      for (const p of scoped) {
        csvLines.push(`"${p.number}","${p.title}","${p.client_name || '—'}","${p.modalidade === 'judicial' ? 'Judicial' : p.modalidade === 'administrativo' ? 'Administrativo' : '—'}","${p.area || '—'}","${p.court || '—'}","${PROCESS_STATUS_LABELS[p.status || 'active']}","${formatDate(p.next_deadline)}"`)
      }
      openExportWindow({
        title: 'Relatório de Processos',
        subtitle: `Parceiro: ${parceiroNome}`,
        filename: `processos-${parceiroNome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`,
        stats: [
          { value: scoped.length, label: 'Total de processos', accent: '#2563eb' },
          { value: judicial, label: 'Judiciais', accent: '#7c3aed' },
          { value: admin, label: 'Administrativos', accent: '#0e7490' },
          { value: active, label: 'Ativos', accent: '#16a34a' },
        ],
        columns,
        rows: scoped.map(processRow),
        csvContent: csvLines.join('\n'),
      })
      return
    }

    // Grupos por parceiro
    const parceiroGroups = [
      ...colaboradores.map(col => ({
        label: col.nome,
        rows: filtered.filter(p => p.colaborador_id === col.id).map(processRow),
      })),
      {
        label: 'Sem parceiro',
        rows: filtered.filter(p => !p.colaborador_id).map(processRow),
      },
    ].filter(g => g.rows.length > 0)

    // CSV com seções por parceiro
    const csvLines = ['Parceiro,Número,Título,Cliente,Modalidade,Área,Vara,Status,Próximo Prazo']
    for (const col of colaboradores) {
      for (const p of filtered.filter(x => x.colaborador_id === col.id)) {
        csvLines.push(`"${col.nome}","${p.number}","${p.title}","${p.client_name || '—'}","${p.modalidade === 'judicial' ? 'Judicial' : p.modalidade === 'administrativo' ? 'Administrativo' : '—'}","${p.area || '—'}","${p.court || '—'}","${PROCESS_STATUS_LABELS[p.status || 'active']}","${formatDate(p.next_deadline)}"`)
      }
    }
    for (const p of filtered.filter(x => !x.colaborador_id)) {
      csvLines.push(`"Sem parceiro","${p.number}","${p.title}","${p.client_name || '—'}","${p.modalidade === 'judicial' ? 'Judicial' : p.modalidade === 'administrativo' ? 'Administrativo' : '—'}","${p.area || '—'}","${p.court || '—'}","${PROCESS_STATUS_LABELS[p.status || 'active']}","${formatDate(p.next_deadline)}"`)
    }

    openExportWindow({
      title: 'Relatório de Processos',
      subtitle: 'Agrupado por parceiro',
      filename: 'processos-por-parceiro',
      stats: [
        { value: filtered.length, label: 'Total de processos', accent: '#2563eb' },
        { value: judicial, label: 'Judiciais', accent: '#7c3aed' },
        { value: admin, label: 'Administrativos', accent: '#0e7490' },
        { value: active, label: 'Ativos', accent: '#16a34a' },
      ],
      columns,
      rows: [],
      groups: parceiroGroups,
      csvContent: csvLines.join('\n'),
    })
  }

  const groups = [
    ...colaboradores.map(col => ({
      id: col.id,
      name: col.nome,
      processes: filtered.filter(p => p.colaborador_id === col.id),
    })),
    {
      id: null,
      name: 'Sem colaborador',
      processes: filtered.filter(p => !p.colaborador_id),
    },
  ].filter(g => g.processes.length > 0)

  const today = new Date().toISOString().slice(0, 10)
  const [tableCollapsed, setTableCollapsed] = useState(false)
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false)

  const statusTabs: { id: string; label: string; count: number }[] = [
    { id: '', label: 'Todos', count: statusCounts.all },
    { id: 'active', label: 'Ativos', count: statusCounts.active },
    { id: '__protocolados__', label: 'Protocolados', count: statusCounts.protocolados },
    { id: 'won', label: 'Ganhos', count: statusCounts.won },
    { id: 'lost', label: 'Perdidos', count: statusCounts.lost },
    { id: 'returned', label: 'Devolvidos', count: statusCounts.returned },
    { id: 'archived', label: 'Arquivados', count: statusCounts.archived },
    { id: 'suspended', label: 'Suspensos', count: statusCounts.suspended },
  ]

  // virtual filter: protocolados is not really a status, handle it specially
  const protocoladosOnly = statusFilter === '__protocolados__'
  const effectiveFiltered = protocoladosOnly
    ? processes.filter(p => {
        const matchSearch = !search ||
          p.title.toLowerCase().includes(search.toLowerCase()) ||
          p.number.toLowerCase().includes(search.toLowerCase()) ||
          p.client_name?.toLowerCase().includes(search.toLowerCase())
        const matchModalidade = !modalidadeFilter || p.modalidade === modalidadeFilter
        return matchSearch && matchModalidade && p.data_protocolo
      })
    : filtered

  const effectiveGroups = protocoladosOnly
    ? [
        ...colaboradores.map(col => ({
          id: col.id,
          name: col.nome,
          processes: effectiveFiltered.filter(p => p.colaborador_id === col.id),
        })),
        {
          id: null,
          name: 'Sem colaborador',
          processes: effectiveFiltered.filter(p => !p.colaborador_id),
        },
      ].filter(g => g.processes.length > 0)
    : groups

  const totalTablePages = Math.ceil(effectiveFiltered.length / PAGE_SIZE)
  const pageProcesses = effectiveFiltered.slice(tablePage * PAGE_SIZE, (tablePage + 1) * PAGE_SIZE)

  return (
    <Layout>
      {/* ── STATS ROW ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        {/* Processos ativos */}
        <Card className="p-4">
          <div className="flex items-start justify-between">
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1">Processos ativos <span className="text-gray-300 dark:text-gray-600 ml-1">ⓘ</span></p>
            <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.active}</p>
          <span className="mt-1 text-xs text-primary-600 dark:text-primary-400">Mostrar processos</span>
        </Card>

        {/* Fechamentos */}
        <Card className="p-4">
          <div className="flex items-start justify-between">
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1">Fechamentos</p>
            <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </div>
          <div className="flex items-end gap-3">
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.fechamentosThisMonth}</p>
            <span className="mb-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              → {stats.fechamentosPrevMonth > 0 ? Math.round(((stats.fechamentosThisMonth - stats.fechamentosPrevMonth) / stats.fechamentosPrevMonth) * 100) : 0}%
            </span>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">vs mês anterior: {stats.fechamentosPrevMonth}</p>
        </Card>

        {/* Arquivados este mês */}
        <Card className="p-4">
          <div className="flex items-start justify-between">
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1">Arquivados este mês</p>
            <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </div>
          <div className="flex items-end gap-3">
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.arquivadosThisMonth}</p>
            <span className="mb-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              → {stats.arquivadosPrevMonth > 0 ? Math.round(((stats.arquivadosThisMonth - stats.arquivadosPrevMonth) / stats.arquivadosPrevMonth) * 100) : 0}%
            </span>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">vs mês anterior: {stats.arquivadosPrevMonth}</p>
        </Card>
      </div>

      {/* ── CHART + META ROW ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 mb-5">
        {/* Volume por fase */}
        <Card className="p-4">
          <p className="text-sm font-semibold text-gray-800 dark:text-white mb-4">Volume por fase</p>
          {volumePorFase.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-gray-300 dark:text-gray-600 text-xs">Sem dados</div>
          ) : (() => {
            const max = Math.max(...volumePorFase.map(d => d.value), 1)
            const ticks = [0, Math.ceil(max * 0.25), Math.ceil(max * 0.5), Math.ceil(max * 0.75), max]
            return (
              <div className="flex gap-3 items-end h-52">
                <div className="flex flex-col justify-between h-full text-right pr-1 flex-shrink-0 pb-5">
                  {[...ticks].reverse().map(t => (
                    <span key={t} className="text-[10px] text-gray-400 leading-none">{t}</span>
                  ))}
                </div>
                <div className="flex-1 flex items-end gap-3 h-full">
                  {volumePorFase.map(item => (
                    <div key={item.label} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                      <div
                        className="w-full bg-primary-500 dark:bg-primary-600 rounded-sm transition-all duration-500 min-h-[2px]"
                        style={{ height: `${Math.max((item.value / max) * 100, 2)}%` }}
                      />
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate w-full text-center pb-1">
                        {item.label.length > 12 ? item.label.slice(0, 10) + '…' : item.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </Card>

        {/* Meta de fechamentos */}
        <Card className="p-4 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-gray-800 dark:text-white">Meta de fechamentos</p>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-gray-400" />
              <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              </button>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div className="bg-gray-50 dark:bg-dark-700/50 rounded-xl p-5 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                Você ainda não configurou as metas do seu escritório.{' '}
                <button className="text-primary-600 dark:text-primary-400 hover:underline font-medium">Clique aqui</button>{' '}
                para configurar.
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* ── TABLE SECTION ── */}
      <div>
      <Card className="overflow-hidden">
        {/* Section header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-dark-700">
          <button
            className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white text-sm hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            onClick={() => setTableCollapsed(v => !v)}
          >
            Processos
            <svg className={cn('w-4 h-4 transition-transform', tableCollapsed && 'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
          </button>
        </div>

        {!tableCollapsed && (
          <>
            {/* Toolbar */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-dark-700 flex-wrap">
              <Button onClick={openNew} className="h-8 text-xs px-3">
                Novo processo
              </Button>

              {/* Status dropdown */}
              <div className="relative">
                <button
                  onClick={() => setStatusDropdownOpen(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-dark-600 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors"
                >
                  {statusFilter === '' ? 'Todos os processos' : statusTabs.find(t => t.id === statusFilter)?.label || 'Todos os processos'}
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                {statusDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1 bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-600 rounded-xl shadow-lg z-20 py-1 min-w-[180px]">
                    {statusTabs.map(t => (
                      <button key={t.id || 'all'} onClick={() => { setStatusFilter(t.id); setStatusDropdownOpen(false) }}
                        className={cn('w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors flex items-center justify-between',
                          statusFilter === t.id && 'text-primary-600 dark:text-primary-400 font-semibold')}>
                        {t.label}
                        <span className="text-[10px] text-gray-400 bg-gray-100 dark:bg-dark-600 px-1.5 py-0.5 rounded-full">{t.count}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  className="pl-8 pr-7 py-1.5 text-xs border border-gray-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 w-52"
                  placeholder="Buscar processo..."
                  value={search} onChange={e => setSearch(e.target.value)}
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-dark-600 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" /></svg>
                Filtrar
              </button>
              <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-dark-600 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M6 12h12M9 17h6" /></svg>
                Ordenar
              </button>
              <div className="relative" ref={exportRef}>
                <button
                  onClick={() => setExportOpen(v => !v)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors',
                    exportOpen
                      ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 border-primary-300 dark:border-primary-700'
                      : 'text-gray-600 dark:text-gray-300 border-gray-200 dark:border-dark-600 hover:bg-gray-50 dark:hover:bg-dark-700'
                  )}
                >
                  <Download className="w-3.5 h-3.5" /> Exportar
                </button>
                {exportOpen && (
                  <div className="absolute left-0 top-full mt-1.5 w-64 max-h-80 overflow-y-auto bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-600 rounded-xl shadow-modal z-50 p-2 space-y-0.5">
                    <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-2 py-1.5">Exportar processos</p>
                    <button
                      onClick={() => { exportAll('all'); setExportOpen(false) }}
                      className="w-full text-left px-3 py-2 text-xs rounded-lg transition-colors font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700"
                    >
                      Todos os parceiros
                    </button>
                    <div className="pt-1 mt-1 border-t border-gray-100 dark:border-dark-700" />
                    {colaboradores.map(col => (
                      <button
                        key={col.id}
                        onClick={() => { exportAll(col.id); setExportOpen(false) }}
                        className="w-full text-left px-3 py-2 text-xs rounded-lg transition-colors text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700"
                      >
                        {col.nome}
                      </button>
                    ))}
                    <button
                      onClick={() => { exportAll('sem-parceiro'); setExportOpen(false) }}
                      className="w-full text-left px-3 py-2 text-xs rounded-lg transition-colors text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-dark-700"
                    >
                      Sem parceiro
                    </button>
                  </div>
                )}
              </div>

              {/* Toggle Lista / Por parceiro */}
              <div className="flex items-center rounded-lg border border-gray-200 dark:border-dark-600 overflow-hidden ml-auto">
                <button
                  onClick={() => setViewMode('table')}
                  className={cn('px-3 py-1.5 text-xs font-medium transition-colors',
                    viewMode === 'table'
                      ? 'bg-primary-600 text-white'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-dark-700'
                  )}
                >
                  Lista
                </button>
                <button
                  onClick={() => setViewMode('byColaborador')}
                  className={cn('px-3 py-1.5 text-xs font-medium border-l border-gray-200 dark:border-dark-600 transition-colors',
                    viewMode === 'byColaborador'
                      ? 'bg-primary-600 text-white border-l-primary-700'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-dark-700'
                  )}
                >
                  Por parceiro
                </button>
              </div>
            </div>

            {/* Table */}
            {!loading && (effectiveFiltered.length === 0 ? (
              <EmptyState icon={Briefcase} title="Nenhum processo encontrado" />
            ) : viewMode === 'table' ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-dark-700/40 border-b border-gray-100 dark:border-dark-700">
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        <span className="flex items-center gap-1 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
                          Partes
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
                        </span>
                      </th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Tipo de Ação</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Número do Processo</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Data Cadastro</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Último Andamento</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Data Andamento</th>
                      <th className="w-16 px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-dark-700/50">
                    {pageProcesses.map(p => (
                      <tr key={p.id}
                        className="hover:bg-primary-50/40 dark:hover:bg-primary-900/10 transition-colors cursor-pointer group"
                        onClick={() => setViewProcess(p)}
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900 dark:text-white text-sm leading-snug">{p.client_name || '—'}</p>
                          {p.counterparty && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">x {p.counterparty}</p>}
                          {p.assigned_lawyer && <p className="text-xs text-gray-400 dark:text-gray-500">x {p.assigned_lawyer}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-gray-600 dark:text-gray-300">{p.area || p.type || '—'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono text-gray-700 dark:text-gray-300">{p.number}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                          {formatDate(p.created_at)}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">N/A</td>
                        <td className="px-4 py-3 text-xs text-gray-400">N/A</td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-600 text-gray-400 hover:text-primary-600 transition-colors">
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => deleteProcess(p.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {totalTablePages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-dark-700">
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {tablePage * PAGE_SIZE + 1}–{Math.min((tablePage + 1) * PAGE_SIZE, effectiveFiltered.length)} de {effectiveFiltered.length} processos
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        disabled={tablePage === 0}
                        onClick={() => setTablePage(p => p - 1)}
                        className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 dark:border-dark-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-dark-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        ← Anterior
                      </button>
                      {Array.from({ length: totalTablePages }, (_, i) => i).filter(i => Math.abs(i - tablePage) <= 2).map(i => (
                        <button
                          key={i}
                          onClick={() => setTablePage(i)}
                          className={`w-7 h-7 text-xs rounded-lg transition-colors ${i === tablePage ? 'bg-primary-600 text-white font-semibold' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-700'}`}
                        >
                          {i + 1}
                        </button>
                      ))}
                      <button
                        disabled={tablePage >= totalTablePages - 1}
                        onClick={() => setTablePage(p => p + 1)}
                        className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 dark:border-dark-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-dark-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        Próxima →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Vista agrupada por parceiro */
              <div className="divide-y divide-gray-100 dark:divide-dark-700/50">
                {effectiveGroups.map(group => {
                  const gKey = group.id ?? 'sem-colaborador'
                  const isExpanded = expandedGroups.has(gKey)
                  const pageForGroup = groupPages[gKey] ?? 0
                  const totalGroupPages = Math.ceil(group.processes.length / PAGE_SIZE)
                  const pageItems = group.processes.slice(pageForGroup * PAGE_SIZE, (pageForGroup + 1) * PAGE_SIZE)
                  return (
                    <div key={gKey}>
                      <button
                        onClick={() => toggleGroup(gKey)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 bg-slate-50/80 dark:bg-dark-700/30 hover:bg-primary-50/40 dark:hover:bg-primary-900/10 transition-colors text-left"
                      >
                        <ChevronDown className={cn('w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform', !isExpanded && '-rotate-90')} />
                        <User className="w-4 h-4 text-primary-500 dark:text-primary-400 flex-shrink-0" />
                        <span className="flex-1 text-xs font-bold text-gray-800 dark:text-gray-100">{group.name}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400">
                          {group.processes.length} processo{group.processes.length !== 1 ? 's' : ''}
                        </span>
                      </button>

                      {isExpanded && (
                        <div>
                          <table className="w-full text-sm">
                            <tbody className="divide-y divide-gray-50 dark:divide-dark-700/50">
                              {pageItems.map(p => (
                                <tr key={p.id}
                                  className="hover:bg-primary-50/40 dark:hover:bg-primary-900/10 transition-colors cursor-pointer group"
                                  onClick={() => setViewProcess(p)}
                                >
                                  <td className="px-4 py-3 pl-12">
                                    <p className="font-medium text-gray-900 dark:text-white text-sm leading-snug">{p.client_name || '—'}</p>
                                    {p.counterparty && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">x {p.counterparty}</p>}
                                  </td>
                                  <td className="px-4 py-3"><span className="text-xs text-gray-600 dark:text-gray-300">{p.area || p.type || '—'}</span></td>
                                  <td className="px-4 py-3"><span className="text-xs font-mono text-gray-700 dark:text-gray-300">{p.number}</span></td>
                                  <td className="px-4 py-3">
                                    <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', PROCESS_STATUS_COLORS[p.status || 'active'])}>
                                      {PROCESS_STATUS_LABELS[p.status || 'active']}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{formatDate(p.created_at)}</td>
                                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-600 text-gray-400 hover:text-primary-600 transition-colors">
                                        <Edit3 className="w-3.5 h-3.5" />
                                      </button>
                                      <button onClick={() => deleteProcess(p.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors">
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {totalGroupPages > 1 && (
                            <div className="flex items-center justify-center gap-3 py-2 border-t border-gray-100 dark:border-dark-700 text-xs text-gray-500">
                              <button disabled={pageForGroup === 0}
                                onClick={() => setGroupPages(prev => ({ ...prev, [gKey]: pageForGroup - 1 }))}
                                className="hover:text-primary-600 disabled:opacity-30">← Anterior</button>
                              <span>{pageForGroup + 1} / {totalGroupPages}</span>
                              <button disabled={pageForGroup >= totalGroupPages - 1}
                                onClick={() => setGroupPages(prev => ({ ...prev, [gKey]: pageForGroup + 1 }))}
                                className="hover:text-primary-600 disabled:opacity-30">Próxima →</button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </>
        )}
      </Card>
      </div>

      {viewProcess && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setViewProcess(null)}
        >
          <ViewPanel
            process={viewProcess}
            colaboradores={colaboradores}
            onClose={() => setViewProcess(null)}
            onSaved={() => { setViewProcess(null); load() }}
            onDelete={() => { deleteProcess(viewProcess.id); setViewProcess(null) }}
          />
        </div>
      )}

      {/* Form Modal — ADVBOX style */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-end sm:justify-end bg-black/40 backdrop-blur-sm">
          <div className="w-full sm:w-[440px] h-full sm:h-screen bg-white dark:bg-dark-800 flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-dark-700 flex-shrink-0">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">{editId ? 'Editar processo' : 'Criar novo processo'}</h2>
              <button onClick={() => { setModalOpen(false); setCpfSearch('') }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-700 text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

              {/* Partes envolvidas */}
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Adicionar partes envolvidas *</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-gray-200 dark:bg-dark-600 flex items-center justify-center flex-shrink-0">
                    <svg className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                  </div>
                  <select
                    value={form.client_id}
                    onChange={e => {
                      const clientId = e.target.value
                      const selected = clients.find(c => c.id === clientId)
                      setForm({ ...form, client_id: clientId, client_name: selected?.name || '', colaborador_id: selected?.colaborador_id || form.colaborador_id || '', area: selected?.area_direito || form.area })
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
                    value={form.colaborador_id}
                    onChange={e => setForm({ ...form, colaborador_id: e.target.value })}
                    className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 font-medium focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 appearance-none"
                  >
                    <option value="">Sem responsável</option>
                    {colaboradores.map(col => <option key={col.id} value={col.id}>{col.nome.toUpperCase()}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Anotações gerais */}
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Anotações gerais</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
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
                    value={form.grupo_acao}
                    onChange={e => setForm({ ...form, grupo_acao: e.target.value, type: '' })}
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
                    value={form.type}
                    onChange={e => setForm({ ...form, type: e.target.value })}
                    className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 appearance-none"
                  >
                    <option value="">Selecione o tipo de ação</option>
                    {(TIPOS_ACAO[form.grupo_acao] || []).map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Fase */}
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Fase *</label>
                <div className="relative">
                  <select
                    value={form.fase}
                    onChange={e => setForm({ ...form, fase: e.target.value })}
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
                    value={form.etapa}
                    onChange={e => setForm({ ...form, etapa: e.target.value })}
                    className="w-full px-4 pr-9 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 font-medium focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400"
                  />
                  {form.etapa && (
                    <button onClick={() => setForm({ ...form, etapa: '' })} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Número do processo CNJ */}
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Número do processo (CNJ)</label>
                <input
                  value={form.number}
                  onChange={e => setForm({ ...form, number: e.target.value })}
                  placeholder="9999999-99.9999.9.99.9999"
                  className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 font-mono"
                />
              </div>

              {/* Número do protocolo */}
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Número do protocolo/requerimento</label>
                <input
                  value={form.numero_protocolo}
                  onChange={e => setForm({ ...form, numero_protocolo: e.target.value })}
                  placeholder="123456789-0"
                  className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400"
                />
              </div>

              {/* Processo originário */}
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Processo originário</label>
                <input
                  value={form.processo_originario}
                  onChange={e => setForm({ ...form, processo_originario: e.target.value })}
                  placeholder="9999999-99.9999.9.99.9999"
                  className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 font-mono"
                />
              </div>

              {/* Pasta/Caso */}
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Pasta/Caso</label>
                <input
                  value={form.pasta_caso}
                  onChange={e => setForm({ ...form, pasta_caso: e.target.value })}
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
                    value={form.data_requerimento}
                    onChange={e => setForm({ ...form, data_requerimento: e.target.value })}
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
                    value={form.valor_causa}
                    onChange={e => setForm({ ...form, valor_causa: e.target.value })}
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
                    value={form.valor_honorarios}
                    onChange={e => setForm({ ...form, valor_honorarios: e.target.value })}
                    placeholder="999.999,99"
                    className="w-full pl-8 pr-4 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400"
                  />
                </div>
              </div>

              {/* Percentual de honorários */}
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Percentual de honorários (%)</label>
                <input
                  value={form.percentual_honorarios}
                  onChange={e => setForm({ ...form, percentual_honorarios: e.target.value })}
                  placeholder="99%"
                  className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400"
                />
              </div>

              {/* Contingenciamento */}
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Contingenciamento</label>
                <div className="relative">
                  <select
                    value={form.contingenciamento}
                    onChange={e => setForm({ ...form, contingenciamento: e.target.value })}
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
            <div className="px-5 py-4 border-t border-gray-100 dark:border-dark-700 flex-shrink-0">
              <button
                onClick={save}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3.5 rounded-xl text-sm transition-all disabled:opacity-50 active:scale-[0.98]"
              >
                {saving
                  ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : (editId ? 'Salvar alterações' : 'Criar novo processo')
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move Modal */}
      {moveModal && (
        <Modal open={!!moveModal} onClose={() => setMoveModal(null)} title="Mover Processo" size="sm">
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Mover <strong className="text-gray-900 dark:text-white">{moveModal.process.title}</strong> para:
            </p>
            <Select
              label="Novo Colaborador"
              value={moveModal.targetId}
              onChange={e => setMoveModal({ ...moveModal, targetId: e.target.value })}
            >
              <option value="">Sem colaborador</option>
              {colaboradores.map(col => <option key={col.id} value={col.id}>{col.nome}</option>)}
            </Select>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setMoveModal(null)}>Cancelar</Button>
              <Button onClick={() => moveProcess(moveModal.process.id, moveModal.targetId)}>Mover</Button>
            </div>
          </div>
        </Modal>
      )}

    </Layout>
  )
}

function DetailField({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold mb-1 flex items-center gap-1">
        <Icon className="w-3 h-3" /> {label}
      </p>
      <p className="text-sm text-gray-900 dark:text-white">{value || '—'}</p>
    </div>
  )
}

const SEGMENTOS = ['JUSTIÇA FEDERAL', 'JUSTIÇA ESTADUAL', 'JUSTIÇA DO TRABALHO', 'JUSTIÇA ELEITORAL', 'JUSTIÇA MILITAR', 'TRIBUNAIS SUPERIORES']
const SISTEMAS_ELETRONICOS = ['PJe', 'e-SAJ', 'PROJUDI', 'EPROC', 'ESAJ', 'TUCUJURIS', 'Outro']
const RESULTADOS = ['Procedente', 'Improcedente', 'Parcialmente procedente', 'Extinto sem resolução', 'Acordo', 'Desistência']

type DocItem = {
  id: string; title: string; type: string
  file_url: string | null; file_name: string | null; file_size: number | null
  created_at: string | null
}

const UPDATE_TYPE_LABELS: Record<string, string> = {
  andamento: 'Andamento', despacho: 'Despacho', decisao: 'Decisão',
  sentenca: 'Sentença', acordao: 'Acórdão', publicacao: 'Publicação',
  peticao: 'Petição', audiencia: 'Audiência', outro: 'Outro',
}

type PanelTab = 'dados' | 'documentos' | 'movimentacoes' | 'financeiro' | 'publicacoes' | 'tarefas'

const PANEL_TABS: { id: PanelTab; icon: React.ElementType; label: string }[] = [
  { id: 'dados',         icon: FolderOpen,  label: 'Dados do processo' },
  { id: 'documentos',    icon: Upload,      label: 'Documentos' },
  { id: 'movimentacoes', icon: RotateCcw,   label: 'Movimentações' },
  { id: 'financeiro',    icon: DollarSign,  label: 'Financeiro' },
  { id: 'publicacoes',   icon: Globe,       label: 'Publicações' },
  { id: 'tarefas',       icon: CheckSquare, label: 'Tarefas' },
]

type PanelForm = {
  number: string; court: string; judge: string; counterparty: string
  assigned_lawyer: string; description: string; area: string; type: string
  data_protocolo: string; next_deadline: string; colaborador_id: string
  status: string; modalidade: string
  // ADVBOX extra
  ano_ajuizamento: string; segmento: string; comarca: string; vara: string
  tribunal: string; sistema_eletronico: string; numero_protocolo: string
  processo_originario: string; pasta_caso: string; data_requerimento: string
  valor_causa: string; valor_honorarios: string; percentual_honorarios: string
  contingenciamento: string; data_fechamento: string; transito_julgado: string
  arquivamento: string; resultado: string; fase: string; etapa: string
  notificar_sms: boolean; notificar_email: boolean
}

function PanelInput({ label, value, onChange, placeholder, mono, type: t = 'text', clearable }: {
  label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string; mono?: boolean; type?: string; clearable?: boolean
}) {
  return (
    <div className="mb-4">
      <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={t}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={cn(
            'w-full px-3.5 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400',
            mono && 'font-mono',
            clearable && value && 'pr-8'
          )}
        />
        {clearable && value && (
          <button onClick={() => onChange({ target: { value: '' } } as any)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

function PanelSelect({ label, value, onChange, options, placeholder }: {
  label: string; value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void
  options: string[]; placeholder?: string
}) {
  return (
    <div className="mb-4">
      <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={onChange}
          className="w-full px-3.5 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 appearance-none"
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      </div>
    </div>
  )
}

function DatePair({ label1, value1, onChange1, label2, value2, onChange2 }: {
  label1: string; value1: string; onChange1: (e: React.ChangeEvent<HTMLInputElement>) => void
  label2: string; value2: string; onChange2: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3 mb-4">
      {[{ label: label1, value: value1, onChange: onChange1 }, { label: label2, value: value2, onChange: onChange2 }].map(d => (
        <div key={d.label}>
          <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">{d.label}</label>
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <input type="date" value={d.value} onChange={d.onChange}
              className="w-full pl-8 pr-2 py-2.5 text-xs border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400"
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function ViewPanel({ process: p, colaboradores, onClose, onSaved, onDelete }: {
  process: Process
  colaboradores: Colaborador[]
  onClose: () => void
  onSaved: () => void
  onDelete: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<PanelTab>('dados')
  const [form, setForm] = useState<PanelForm>({
    number: p.number || '',
    court: p.court || '',
    judge: p.judge || '',
    counterparty: p.counterparty || '',
    assigned_lawyer: p.assigned_lawyer || '',
    description: p.description || '',
    area: p.area || '',
    type: p.type || '',
    data_protocolo: p.data_protocolo || '',
    next_deadline: p.next_deadline || '',
    colaborador_id: p.colaborador_id || '',
    status: p.status || 'active',
    modalidade: p.modalidade || '',
    ano_ajuizamento: p.created_at ? new Date(p.created_at).getFullYear().toString() : '',
    segmento: '', comarca: '', vara: p.court || '', tribunal: '',
    sistema_eletronico: '', numero_protocolo: '', processo_originario: '',
    pasta_caso: '', data_requerimento: p.data_protocolo || '',
    valor_causa: '', valor_honorarios: '', percentual_honorarios: '',
    contingenciamento: '', data_fechamento: '', transito_julgado: '',
    arquivamento: '', resultado: '', fase: p.area || 'NEGOCIAÇÃO',
    etapa: 'AÇÃO PROTOCOLADA/INICIADA', notificar_sms: false, notificar_email: false,
  })

  const { profile } = useAuth()

  // ── Tab data states ──
  const [tabLoading, setTabLoading] = useState(false)
  const [tabsLoaded, setTabsLoaded] = useState<Set<PanelTab>>(new Set())
  const [tabTasks, setTabTasks] = useState<Task[]>([])
  const [tabFinancials, setTabFinancials] = useState<Financial[]>([])
  const [tabUpdates, setTabUpdates] = useState<ProcessUpdate[]>([])
  const [tabPublicacoes, setTabPublicacoes] = useState<ProcessUpdate[]>([])
  const [tabDocuments, setTabDocuments] = useState<DocItem[]>([])

  // Movimentações form
  const [showUpdateForm, setShowUpdateForm] = useState(false)
  const [newUpdate, setNewUpdate] = useState({ title: '', description: '', date: new Date().toISOString().slice(0, 10), type: 'andamento' })
  const [savingUpdate, setSavingUpdate] = useState(false)

  // Documentos upload
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function loadTab(tab: PanelTab) {
    if (tabsLoaded.has(tab)) return
    setTabLoading(true)
    try {
      if (tab === 'tarefas') {
        const { data } = await supabase.from('tasks').select('*').eq('process_id', p.id).is('deleted_at', null).order('due_date')
        setTabTasks(data || [])
      } else if (tab === 'financeiro') {
        const { data } = await supabase.from('financials').select('*').eq('process_id', p.id).is('deleted_at', null).order('due_date')
        setTabFinancials(data || [])
      } else if (tab === 'movimentacoes') {
        const { data } = await supabase.from('process_updates').select('*').eq('process_id', p.id).order('date', { ascending: false })
        setTabUpdates(data || [])
      } else if (tab === 'publicacoes') {
        const { data } = await supabase.from('process_updates').select('*').eq('process_id', p.id).eq('type', 'publicacao').order('date', { ascending: false })
        setTabPublicacoes(data || [])
      } else if (tab === 'documentos') {
        const { data } = await supabase.from('documents').select('id,title,type,file_url,file_name,file_size,created_at').eq('process_id', p.id).is('deleted_at', null).order('created_at', { ascending: false })
        setTabDocuments((data || []) as DocItem[])
      }
    } finally {
      setTabsLoaded(prev => new Set([...prev, tab]))
      setTabLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab !== 'dados') loadTab(activeTab)
  }, [activeTab])

  async function addUpdate() {
    if (!newUpdate.title.trim()) return
    setSavingUpdate(true)
    await supabase.from('process_updates').insert({
      process_id: p.id,
      title: newUpdate.title.trim(),
      description: newUpdate.description || null,
      date: newUpdate.date || null,
      author: profile?.name || null,
      type: newUpdate.type,
    })
    const { data } = await supabase.from('process_updates').select('*').eq('process_id', p.id).order('date', { ascending: false })
    setTabUpdates(data || [])
    setNewUpdate({ title: '', description: '', date: new Date().toISOString().slice(0, 10), type: 'andamento' })
    setShowUpdateForm(false)
    setSavingUpdate(false)
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !p.tenant_id) return
    setUploading(true)
    try {
      const path = `${p.tenant_id}/${p.id}/${Date.now()}_${file.name}`
      const { error: uploadErr } = await supabase.storage.from('documents').upload(path, file)
      if (uploadErr) throw uploadErr
      const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(path)
      await supabase.from('documents').insert({
        tenant_id: p.tenant_id,
        process_id: p.id,
        title: file.name.replace(/\.[^.]+$/, ''),
        type: 'other',
        category: 'Processo',
        content: '',
        is_template: false,
        file_url: publicUrl,
        file_name: file.name,
        file_size: file.size,
        file_mime: file.type,
      })
      const { data } = await supabase.from('documents').select('id,title,type,file_url,file_name,file_size,created_at').eq('process_id', p.id).is('deleted_at', null).order('created_at', { ascending: false })
      setTabDocuments((data || []) as DocItem[])
    } catch { /* silently fail */ }
    finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function toggleTaskStatus(taskId: string, current: string) {
    const next = current === 'done' ? 'pending' : 'done'
    await supabase.from('tasks').update({ status: next, completed_at: next === 'done' ? new Date().toISOString() : null }).eq('id', taskId)
    setTabTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: next as any, completed_at: next === 'done' ? new Date().toISOString() : null } : t))
  }

  const f = (k: keyof PanelForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }))

  async function handleSave() {
    setSaving(true)
    await supabase.from('processes').update({
      number: form.number,
      court: form.court || form.vara,
      judge: form.judge,
      counterparty: form.counterparty,
      assigned_lawyer: form.assigned_lawyer,
      description: form.description,
      area: form.area,
      type: form.type,
      data_protocolo: form.data_protocolo || form.data_requerimento || null,
      next_deadline: form.next_deadline || null,
      colaborador_id: form.colaborador_id || null,
      status: form.status as any,
      modalidade: (form.modalidade || null) as any,
    }).eq('id', p.id)
    setSaving(false)
    onSaved()
  }

  // Build title like ADVBOX: "CLIENT x COUNTERPARTY"
  const panelTitle = [p.client_name, p.counterparty].filter(Boolean).join(' x ').toUpperCase() || p.title

  return (
    <div
      className="bg-white dark:bg-dark-800 rounded-2xl shadow-2xl flex flex-col w-full max-w-2xl max-h-[88vh] overflow-hidden"
      onClick={e => e.stopPropagation()}
    >
      {/* Icon tabs bar — dark top strip */}
      <div className="flex items-center gap-0.5 px-3 py-2.5 bg-[#0f1e36] rounded-t-2xl flex-shrink-0">
        {PANEL_TABS.map(tab => (
          <button
            key={tab.id}
            title={tab.label}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'p-2 rounded-lg transition-colors',
              activeTab === tab.id
                ? 'bg-primary-600 text-white'
                : 'text-gray-400 hover:bg-white/10 hover:text-gray-200'
            )}
          >
            <tab.icon className="w-[18px] h-[18px]" />
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={onClose}
          className="p-2 rounded-lg text-gray-400 hover:bg-white/10 hover:text-gray-200 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Process title subheader */}
      <div className="px-4 py-3 border-b border-gray-100 dark:border-dark-700 flex-shrink-0 bg-gray-50 dark:bg-dark-700/40">
        <p className="text-sm font-bold text-gray-900 dark:text-white leading-snug line-clamp-2">{panelTitle}</p>
        {p.number && (
          <p className="text-[11px] text-gray-400 dark:text-gray-500 font-mono mt-0.5 flex items-center gap-1">
            <Hash className="w-3 h-3" />{p.number}
          </p>
        )}
      </div>

      {/* Loading state for tabs */}
      {activeTab !== 'dados' && tabLoading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* ── Documentos tab ── */}
      {activeTab === 'documentos' && !tabLoading && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Documentos do processo</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 text-xs bg-primary-600 hover:bg-primary-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {uploading
                ? <span className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
                : <Upload className="w-3 h-3" />}
              {uploading ? 'Enviando…' : 'Upload'}
            </button>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
          </div>
          {tabDocuments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
              <Upload className="w-8 h-8 text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum documento anexado</p>
              <p className="text-xs text-gray-400 dark:text-gray-600">Clique em Upload para adicionar</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tabDocuments.map(doc => (
                <div key={doc.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-dark-700/50 rounded-xl border border-gray-100 dark:border-dark-600">
                  <div className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{doc.title || doc.file_name || 'Documento'}</p>
                    <p className="text-[11px] text-gray-400 dark:text-gray-600">
                      {doc.file_size ? `${(doc.file_size / 1024).toFixed(0)} KB · ` : ''}{formatDate(doc.created_at)}
                    </p>
                  </div>
                  {doc.file_url && (
                    <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                      className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors flex-shrink-0">
                      <Download className="w-4 h-4" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Movimentações tab ── */}
      {activeTab === 'movimentacoes' && !tabLoading && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Andamentos processuais</p>
            <button
              onClick={() => setShowUpdateForm(v => !v)}
              className="flex items-center gap-1.5 text-xs bg-primary-600 hover:bg-primary-700 text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus className="w-3 h-3" /> Novo
            </button>
          </div>

          {showUpdateForm && (
            <div className="bg-gray-50 dark:bg-dark-700/60 rounded-xl border border-gray-200 dark:border-dark-600 p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Tipo</label>
                  <select value={newUpdate.type} onChange={e => setNewUpdate(prev => ({ ...prev, type: e.target.value }))}
                    className="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-400 appearance-none">
                    {Object.entries(UPDATE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Data</label>
                  <input type="date" value={newUpdate.date} onChange={e => setNewUpdate(prev => ({ ...prev, date: e.target.value }))}
                    className="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-400" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Título *</label>
                <input value={newUpdate.title} onChange={e => setNewUpdate(prev => ({ ...prev, title: e.target.value }))} placeholder="Descreva o andamento…"
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-400" />
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Descrição</label>
                <textarea value={newUpdate.description} onChange={e => setNewUpdate(prev => ({ ...prev, description: e.target.value }))} rows={2} placeholder="Detalhes…"
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-400 resize-none" />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowUpdateForm(false)} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-dark-600 text-gray-500 hover:bg-gray-100 dark:hover:bg-dark-600 transition-colors">Cancelar</button>
                <button onClick={addUpdate} disabled={savingUpdate || !newUpdate.title.trim()}
                  className="text-xs px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-50 transition-colors">
                  {savingUpdate ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </div>
          )}

          {tabUpdates.length === 0 && !showUpdateForm ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
              <RotateCcw className="w-8 h-8 text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Nenhuma movimentação registrada</p>
            </div>
          ) : (
            <div className="relative ml-2">
              <div className="absolute left-2.5 top-0 bottom-0 w-px bg-gray-200 dark:bg-dark-600" />
              <div className="space-y-3">
                {tabUpdates.map(u => (
                  <div key={u.id} className="flex gap-3 relative pl-7">
                    <div className="absolute left-0 top-1.5 w-5 h-5 rounded-full bg-white dark:bg-dark-800 border-2 border-primary-400 flex items-center justify-center z-10">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary-500" />
                    </div>
                    <div className="flex-1 bg-gray-50 dark:bg-dark-700/50 rounded-xl border border-gray-100 dark:border-dark-600 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
                            {UPDATE_TYPE_LABELS[u.type || ''] || u.type || 'Andamento'}
                          </span>
                          <p className="text-xs font-medium text-gray-800 dark:text-gray-200 mt-0.5">{u.title}</p>
                        </div>
                        <p className="text-[10px] text-gray-400 dark:text-gray-600 flex-shrink-0">{formatDate(u.date || u.created_at)}</p>
                      </div>
                      {u.description && <p className="text-[11px] text-gray-500 dark:text-gray-500 mt-1 leading-relaxed">{u.description}</p>}
                      {u.author && <p className="text-[10px] text-gray-400 dark:text-gray-600 mt-1">{u.author}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Financeiro tab ── */}
      {activeTab === 'financeiro' && !tabLoading && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Financeiro do processo</p>
          {(() => {
            const receitas = tabFinancials.filter(f => f.type === 'receivable')
            const despesas = tabFinancials.filter(f => f.type === 'payable')
            const totalReceitas = receitas.reduce((s, f) => s + (f.amount || 0), 0)
            const totalDespesas = despesas.reduce((s, f) => s + (f.amount || 0), 0)
            return (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800 p-3 text-center">
                    <p className="text-[10px] uppercase font-semibold text-emerald-600 dark:text-emerald-400">Receitas</p>
                    <p className="text-base font-bold text-emerald-700 dark:text-emerald-300 mt-0.5">{formatCurrency(totalReceitas)}</p>
                  </div>
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-800 p-3 text-center">
                    <p className="text-[10px] uppercase font-semibold text-red-600 dark:text-red-400">Despesas</p>
                    <p className="text-base font-bold text-red-700 dark:text-red-300 mt-0.5">{formatCurrency(totalDespesas)}</p>
                  </div>
                </div>
                {tabFinancials.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                    <DollarSign className="w-8 h-8 text-gray-300 dark:text-gray-600" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum lançamento financeiro</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {tabFinancials.map(fin => (
                      <div key={fin.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-dark-700/50 rounded-xl border border-gray-100 dark:border-dark-600">
                        <div className={cn('w-2 h-8 rounded-full flex-shrink-0', fin.type === 'receivable' ? 'bg-emerald-400' : 'bg-red-400')} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{fin.description}</p>
                          <p className="text-[11px] text-gray-400 dark:text-gray-600">{fin.category} · Venc. {formatDate(fin.due_date)}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={cn('text-sm font-semibold', fin.type === 'receivable' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                            {fin.type === 'receivable' ? '+' : '-'}{formatCurrency(fin.amount)}
                          </p>
                          <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', FINANCIAL_STATUS_COLORS[fin.status || ''] || 'bg-gray-100 text-gray-500')}>
                            {FINANCIAL_STATUS_LABELS[fin.status || ''] || fin.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )
          })()}
        </div>
      )}

      {/* ── Publicações tab ── */}
      {activeTab === 'publicacoes' && !tabLoading && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Publicações e intimações</p>
          {tabPublicacoes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
              <Globe className="w-8 h-8 text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Nenhuma publicação registrada</p>
              <p className="text-xs text-gray-400 dark:text-gray-600 max-w-xs">As publicações são registradas em Movimentações com tipo "Publicação"</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tabPublicacoes.map(pub => (
                <div key={pub.id} className="p-3 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-100 dark:border-amber-800">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-medium text-gray-800 dark:text-gray-200">{pub.title}</p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-600 flex-shrink-0">{formatDate(pub.date || pub.created_at)}</p>
                  </div>
                  {pub.description && <p className="text-[11px] text-gray-500 dark:text-gray-500 mt-1 leading-relaxed">{pub.description}</p>}
                  {pub.author && <p className="text-[10px] text-amber-600 dark:text-amber-500 mt-1 font-medium">{pub.author}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tarefas tab ── */}
      {activeTab === 'tarefas' && !tabLoading && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Tarefas vinculadas · {tabTasks.filter(t => t.status !== 'done' && t.status !== 'cancelled').length} pendentes
            </p>
          </div>
          {tabTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
              <CheckSquare className="w-8 h-8 text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Nenhuma tarefa vinculada</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tabTasks.map(task => (
                <div key={task.id} className={cn(
                  'flex items-center gap-3 p-3 rounded-xl border transition-colors',
                  task.status === 'done'
                    ? 'bg-gray-50 dark:bg-dark-700/30 border-gray-100 dark:border-dark-700 opacity-60'
                    : 'bg-white dark:bg-dark-700/50 border-gray-100 dark:border-dark-600'
                )}>
                  <button
                    onClick={() => toggleTaskStatus(task.id, task.status || 'pending')}
                    className={cn(
                      'w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                      task.status === 'done'
                        ? 'bg-primary-600 border-primary-600 text-white'
                        : 'border-gray-300 dark:border-dark-500 hover:border-primary-400'
                    )}
                  >
                    {task.status === 'done' && <CheckCircle2 className="w-3 h-3" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-xs font-medium truncate', task.status === 'done' ? 'line-through text-gray-400 dark:text-gray-600' : 'text-gray-800 dark:text-gray-200')}>
                      {task.title}
                    </p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-600">
                      {TASK_STATUS_LABELS[task.status || ''] || task.status}
                      {task.due_date ? ` · ${formatDate(task.due_date)}` : ''}
                    </p>
                  </div>
                  {task.priority && (
                    <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0', PRIORITY_COLORS[task.priority] || 'bg-gray-100 text-gray-500')}>
                      {PRIORITY_LABELS[task.priority] || task.priority}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Dados tab — scrollable body */}
      {activeTab === 'dados' && (
      <>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

        {/* Partes envolvidas */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            Partes envolvidas *
          </label>
          <div className="space-y-1.5">
            {p.client_name && (
              <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-dark-700/50 rounded-lg border border-gray-100 dark:border-dark-600">
                <span className="text-sm text-gray-800 dark:text-gray-200 truncate flex-1">{p.client_name}</span>
                <span className="ml-2 flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800">
                  Cliente
                </span>
              </div>
            )}
            {form.counterparty && (
              <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-dark-700/50 rounded-lg border border-gray-100 dark:border-dark-600">
                <span className="text-sm text-gray-800 dark:text-gray-200 truncate flex-1">{form.counterparty}</span>
                <span className="ml-2 flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800">
                  Contrária
                </span>
              </div>
            )}
            {/* Campo para editar parte contrária */}
            <div className="relative mt-1">
              <input
                value={form.counterparty}
                onChange={f('counterparty')}
                placeholder="Adicionar parte contrária..."
                className="w-full px-3 py-2 text-sm border border-dashed border-gray-300 dark:border-dark-500 rounded-lg bg-transparent text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400"
              />
            </div>
          </div>
        </div>

        {/* Anotações gerais */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
            Anotações gerais
          </label>
          <textarea
            value={form.description}
            onChange={f('description')}
            placeholder="Anotações, tags, fatos e fundamentos"
            rows={3}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 resize-none"
          />
        </div>

        {/* Grupo de ação */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
            Grupo de ação *
          </label>
          <div className="relative">
            <select
              value={form.area}
              onChange={e => setForm(prev => ({ ...prev, area: e.target.value, type: '' }))}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-700 text-gray-800 dark:text-gray-200 font-semibold focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 appearance-none"
            >
              <option value="">Selecione o grupo de ação</option>
              {GRUPOS_ACAO.map(g => <option key={g} value={g}>{g.toUpperCase()}</option>)}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Tipo de ação */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
            Tipo de ação *
          </label>
          <div className="relative">
            <select
              value={form.type}
              onChange={f('type')}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-700 text-gray-800 dark:text-gray-200 font-semibold focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 appearance-none"
            >
              <option value="">Selecione o tipo de ação</option>
              {(TIPOS_ACAO[form.area] || []).map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Número do processo (CNJ) */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
            Número do processo (CNJ)
          </label>
          <input
            value={form.number}
            onChange={f('number')}
            placeholder="9999999-99.9999.9.99.9999"
            className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-700 text-gray-800 dark:text-gray-200 font-mono placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400"
          />
        </div>

        {/* Vara / Tribunal */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Vara</label>
            <input value={form.vara} onChange={f('vara')} placeholder="Ex: 3ª Vara Federal"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Juiz</label>
            <input value={form.judge} onChange={f('judge')} placeholder="Nome do juiz"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400" />
          </div>
        </div>

        {/* Status / Fase */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Status</label>
            <div className="relative">
              <select value={form.status} onChange={f('status')}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 appearance-none">
                {['active','suspended','archived','won','lost','returned'].map(s => (
                  <option key={s} value={s}>{PROCESS_STATUS_LABELS[s] || s}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Fase</label>
            <div className="relative">
              <select value={form.fase} onChange={f('fase')}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 appearance-none">
                {FASES.map(f2 => <option key={f2} value={f2}>{f2}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Próximo prazo */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Próximo prazo</label>
          <input type="date" value={form.next_deadline} onChange={f('next_deadline')}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400" />
        </div>

        {/* Responsável */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Responsável</label>
          <div className="relative">
            <select value={form.colaborador_id} onChange={f('colaborador_id')}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 appearance-none">
              <option value="">Sem responsável</option>
              {colaboradores.map(col => <option key={col.id} value={col.id}>{col.nome}</option>)}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        </div>

      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-100 dark:border-dark-700 flex items-center gap-2 flex-shrink-0 bg-gray-50/50 dark:bg-dark-700/20">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-2.5 rounded-xl text-sm transition-all disabled:opacity-50 active:scale-[0.98]"
        >
          {saving
            ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : 'Atualizar dados do processo'
          }
        </button>
        <button
          onClick={() => { if (confirm('Excluir este processo?')) onDelete() }}
          className="p-2.5 rounded-xl border border-gray-200 dark:border-dark-600 text-gray-400 hover:text-red-500 hover:border-red-200 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      </>
      )}
    </div>
  )
}
