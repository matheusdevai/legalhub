import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Search, Trash2, Mail, Phone, Briefcase, ChevronDown, ChevronUp,
  SlidersHorizontal, ArrowUpDown, Download, RefreshCw, Edit3, Users,
  MessageCircle, Sparkles, DollarSign, Clock, CheckCircle2, X, UserCheck,
} from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Modal, Input, Select, Textarea, Spinner, Badge } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { Colaborador } from '@/types'
import { cn, formatDate, formatCurrency, formatCPFCNPJ, formatPhone, PROCESS_STATUS_LABELS } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { openExportWindow } from '@/lib/exportUtils'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { toast } from '@/components/ui/Toast'

function waLink(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 10) return null
  return `https://wa.me/${digits.length <= 11 ? '55' + digits : digits}`
}

const CLIENT_STATUS_LABELS: Record<string, string> = { active: 'Ativo', inactive: 'Inativo', prospect: 'Prospect' }

type ParceiroClientRow = {
  id: string; name: string; type: string; cpf_cnpj: string | null
  phone: string | null; email: string | null; cidade: string | null; status: string | null
}
type ParceiroProcessRow = {
  id: string; number: string; title: string; client_name: string | null
  modalidade: string | null; area: string | null; status: string | null; next_deadline: string | null
}

const EMPTY_FORM = {
  nome: '', email: '', telefone: '', cargo: 'parceiro', comissao_percent: '',
  ativo: true, notas: '', cidade: '',
}

const CARGO_LABELS: Record<string, string> = {
  parceiro:  'Parceiro',
  advogado:  'Advogado',
  estagiario:'Estagiário',
  secretaria:'Secretária',
  financeiro:'Financeiro',
  outros:    'Outros',
}

// Same X-axis categories as ADVBOX
const CHART_CATEGORIES = [
  'Marketing', 'Negociação', 'Consultoria', 'Administrativo',
  'Judicial', 'Recursal', 'Execução/cobrança',
]

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mt-2 mb-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-primary-600 dark:text-primary-400 whitespace-nowrap">{children}</span>
      <div className="flex-1 h-px bg-gradient-to-r from-primary-200 dark:from-primary-800 to-transparent" />
    </div>
  )
}

// Line chart matching ADVBOX style
function LineChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map(d => d.value), 1)
  const W = 700, H = 160, PAD = { top: 24, bottom: 32, left: 32, right: 16 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  const points = data.map((d, i) => ({
    x: PAD.left + (i / (data.length - 1 || 1)) * innerW,
    y: PAD.top + innerH - (d.value / max) * innerH,
  }))

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 160 }}>
      {/* Y grid lines */}
      {[0, 0.5, 1].map(t => {
        const y = PAD.top + innerH - t * innerH
        return (
          <g key={t}>
            <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
              stroke="currentColor" strokeOpacity={0.08} strokeWidth={1} />
            <text x={PAD.left - 4} y={y + 4} textAnchor="end"
              fontSize={9} fill="currentColor" fillOpacity={0.4}>
              {(t * max).toFixed(t === 0 ? 0 : 1)}
            </text>
          </g>
        )
      })}
      {/* Line */}
      {points.length > 1 && (
        <path d={pathD} fill="none" stroke="#3B82F6" strokeWidth={2} strokeLinejoin="round" />
      )}
      {/* Dots */}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} fill="#3B82F6" />
      ))}
      {/* X labels */}
      {data.map((d, i) => (
        <text key={i}
          x={PAD.left + (i / (data.length - 1 || 1)) * innerW}
          y={H - 4}
          textAnchor="middle" fontSize={9} fill="currentColor" fillOpacity={0.5}>
          {d.label}
        </text>
      ))}
    </svg>
  )
}

type ParceiroClientFull = ParceiroClientRow & {
  colaborador_id: string | null; colaborador_pago: boolean | null
  colaborador_pago_valor: number | null; colaborador_pago_data: string | null
}

export function CollaboratorsPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [collaborators, setCollaborators] = useState<Colaborador[]>([])
  const [allClients, setAllClients] = useState<ParceiroClientFull[]>([])
  const [clientCounts, setClientCounts] = useState<Record<string, number>>({})
  const [indicacoesCounts, setIndicacoesCounts] = useState<Record<string, number>>({})
  const [processCounts, setProcessCounts] = useState<Record<string, number>>({})
  const [activeProcessCounts, setActiveProcessCounts] = useState<Record<string, number>>({})
  const [processAreas, setProcessAreas] = useState<Record<string, number>>({})
  const [pendingCommissionCounts, setPendingCommissionCounts] = useState<Record<string, number>>({})
  const [paidCommissionValue, setPaidCommissionValue] = useState<Record<string, number>>({})
  const [pendingCommissionValue, setPendingCommissionValue] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [tableCollapsed, setTableCollapsed] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [expandAtivos, setExpandAtivos] = useState(false)
  const [expandEscritorio, setExpandEscritorio] = useState(false)
  const [expandParceiro, setExpandParceiro] = useState(false)
  const [exportingId, setExportingId] = useState<string | null>(null)

  // Filtrar / Ordenar
  const [cargoFilter, setCargoFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sortField, setSortField] = useState<'nome' | 'processos' | 'indicacoes'>('nome')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [filterOpen, setFilterOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)
  const sortRef = useRef<HTMLDivElement>(null)

  // Seleção em massa
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkWorking, setBulkWorking] = useState(false)

  // Painel de detalhe do parceiro
  const [viewPartner, setViewPartner] = useState<Colaborador | null>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false)
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function load() {
    setLoading(true)
    const [{ data: col }, { data: cli }, { data: proc }] = await Promise.all([
      supabase.from('colaboradores').select('*').is('deleted_at', null).order('nome'),
      supabase.from('clients').select('id,name,type,cpf_cnpj,phone,email,cidade,status,colaborador_id,origem,colaborador_pago,colaborador_pago_valor,colaborador_pago_data').is('deleted_at', null),
      supabase.from('processes').select('id,colaborador_id,area,status').is('deleted_at', null),
    ])
    setCollaborators(col || [])
    setAllClients((cli || []) as ParceiroClientFull[])

    const cMap: Record<string, number> = {}
    const indicMap: Record<string, number> = {}
    const pendCommCount: Record<string, number> = {}
    const paidCommVal: Record<string, number> = {}
    const pendCommVal: Record<string, number> = {}
    for (const c of (cli || [])) {
      if (c.colaborador_id) {
        cMap[c.colaborador_id] = (cMap[c.colaborador_id] || 0) + 1
        // Conta como indicação todo cliente vinculado ao parceiro (com ou sem origem='indicacao')
        indicMap[c.colaborador_id] = (indicMap[c.colaborador_id] || 0) + 1
        if (c.colaborador_pago) {
          paidCommVal[c.colaborador_id] = (paidCommVal[c.colaborador_id] || 0) + (c.colaborador_pago_valor || 0)
        } else {
          pendCommCount[c.colaborador_id] = (pendCommCount[c.colaborador_id] || 0) + 1
          pendCommVal[c.colaborador_id] = (pendCommVal[c.colaborador_id] || 0) + (c.colaborador_pago_valor || 0)
        }
      }
    }
    setClientCounts(cMap)
    setIndicacoesCounts(indicMap)
    setPendingCommissionCounts(pendCommCount)
    setPaidCommissionValue(paidCommVal)
    setPendingCommissionValue(pendCommVal)

    const pMap: Record<string, number> = {}
    const activeMap: Record<string, number> = {}
    const aMap: Record<string, number> = {}
    for (const p of (proc || [])) {
      if (p.colaborador_id) {
        pMap[p.colaborador_id] = (pMap[p.colaborador_id] || 0) + 1
        if (p.status === 'active') activeMap[p.colaborador_id] = (activeMap[p.colaborador_id] || 0) + 1
      }
      if (p.area) aMap[p.area] = (aMap[p.area] || 0) + 1
    }
    setProcessCounts(pMap)
    setActiveProcessCounts(activeMap)
    setProcessAreas(aMap)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const stats = useMemo(() => {
    const ativos = collaborators.filter(c => c.ativo)
    const inativos = collaborators.filter(c => !c.ativo)
    // Processos ativos vinculados a parceiros — antes contava TODOS os status apesar do rótulo "(ativos)"
    const totalProcessosAtivos = Object.values(activeProcessCounts).reduce((a, b) => a + b, 0)
    const totalIndicacoes = Object.values(indicacoesCounts).reduce((a, b) => a + b, 0)
    // "Demanda do escritório" soma só os processos ativos de COLABORADORES ATIVOS,
    // para bater com a lista de detalhamento (que só lista `stats.ativos`) — se
    // somasse `totalProcessosAtivos` (todos, incluindo inativos com processo ainda
    // vinculado), o número do card ficava maior que a soma da lista expandida.
    const demandaEscritorio = ativos.reduce((s, c) => s + (activeProcessCounts[c.id] || 0), 0)
    // Antes: contagem de parceiros inativos (não tinha relação com "demanda"). Agora: comissões pendentes de pagamento.
    const comissoesPendentesCount = Object.values(pendingCommissionCounts).reduce((a, b) => a + b, 0)
    const comissoesPendentesValor = Object.values(pendingCommissionValue).reduce((a, b) => a + b, 0)
    return { ativos, inativos, totalProcessosAtivos, totalIndicacoes, demandaEscritorio, comissoesPendentesCount, comissoesPendentesValor }
  }, [collaborators, activeProcessCounts, indicacoesCounts, pendingCommissionCounts, pendingCommissionValue])

  // Map process areas to ADVBOX chart categories
  const chartData = useMemo(() => {
    return CHART_CATEGORIES.map(label => {
      // Match area names loosely
      const val = Object.entries(processAreas).reduce((sum, [area, count]) => {
        const a = area.toLowerCase()
        const l = label.toLowerCase()
        if (
          l === 'judicial' && (a.includes('judicial') || a.includes('cível') || a.includes('trabalhista')) ||
          l === 'administrativo' && a.includes('admin') ||
          l === 'recursal' && a.includes('recurs') ||
          l === 'consultoria' && a.includes('consul') ||
          l === 'negociação' && (a.includes('negoc') || a.includes('acordo')) ||
          l === 'execução/cobrança' && (a.includes('execu') || a.includes('cobran')) ||
          l === 'marketing' && a.includes('market')
        ) return sum + count
        return sum
      }, 0)
      return { label, value: val }
    })
  }, [processAreas])

  const filtered = useMemo(() => {
    const result = collaborators.filter(c => {
      const q = search.toLowerCase()
      const matchSearch = !search ||
        c.nome.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        (CARGO_LABELS[c.cargo || ''] || c.cargo || '').toLowerCase().includes(q)
      const matchCargo = !cargoFilter || c.cargo === cargoFilter
      const matchStatus = !statusFilter || (statusFilter === 'ativo' ? c.ativo : !c.ativo)
      return matchSearch && matchCargo && matchStatus
    })
    return [...result].sort((a, b) => {
      let va = 0, vb = 0
      if (sortField === 'processos') { va = processCounts[a.id] || 0; vb = processCounts[b.id] || 0 }
      else if (sortField === 'indicacoes') { va = indicacoesCounts[a.id] || 0; vb = indicacoesCounts[b.id] || 0 }
      else return sortDir === 'asc' ? a.nome.localeCompare(b.nome) : b.nome.localeCompare(a.nome)
      return sortDir === 'asc' ? va - vb : vb - va
    })
  }, [collaborators, search, cargoFilter, statusFilter, sortField, sortDir, processCounts, indicacoesCounts])

  function exportAll() {
    const ativos = filtered.filter(c => c.ativo).length
    const totalIndicacoes = filtered.reduce((s, c) => s + (indicacoesCounts[c.id] ?? 0), 0)
    const csvContent = [
      'Nome,Cargo,Telefone,Email,Comissão %,Status,Indicações',
      ...filtered.map(c =>
        `"${c.nome}","${c.cargo || '—'}","${c.telefone || '—'}","${c.email || '—'}","${c.comissao_percent ?? '—'}","${c.ativo ? 'Ativo' : 'Inativo'}","${indicacoesCounts[c.id] ?? 0}"`
      ),
    ].join('\n')
    openExportWindow({
      title: 'Relatório de Colaboradores',
      filename: 'colaboradores',
      stats: [
        { value: filtered.length, label: 'Total', accent: '#2563eb' },
        { value: ativos, label: 'Ativos', accent: '#16a34a' },
        { value: filtered.length - ativos, label: 'Inativos', accent: '#64748b' },
        { value: totalIndicacoes, label: 'Indicações', accent: '#d97706' },
      ],
      columns: ['Nome', 'Cargo', 'Telefone', 'Email', 'Comissão %', 'Status', 'Indicações'],
      rows: filtered.map(c => [
        { text: c.nome, bold: true },
        { text: c.cargo || '—' },
        { text: c.telefone || '—' },
        { text: c.email || '—' },
        { text: c.comissao_percent != null ? `${c.comissao_percent}%` : '—' },
        { text: c.ativo ? 'Ativo' : 'Inativo', badge: c.ativo ? 'green' : 'gray' },
        { text: String(indicacoesCounts[c.id] ?? 0), badge: (indicacoesCounts[c.id] ?? 0) > 0 ? 'amber' : 'gray' },
      ]),
      csvContent,
    })
  }

  async function exportParceiro(col: Colaborador) {
    setExportingId(col.id)
    const [{ data: cli }, { data: proc }] = await Promise.all([
      supabase.from('clients')
        .select('id,name,type,cpf_cnpj,phone,email,cidade,status')
        .eq('colaborador_id', col.id).is('deleted_at', null).order('name'),
      supabase.from('processes')
        .select('id,number,title,client_name,modalidade,area,status,next_deadline')
        .eq('colaborador_id', col.id).is('deleted_at', null).order('created_at', { ascending: false }),
    ])
    setExportingId(null)

    const clients = (cli || []) as ParceiroClientRow[]
    const processes = (proc || []) as ParceiroProcessRow[]

    const contatosRows = clients.map(c => [
      { text: c.name, sub: formatCPFCNPJ(c.cpf_cnpj || '') || undefined, bold: true },
      { text: c.type === 'pf' ? 'PF' : 'PJ', badge: (c.type === 'pf' ? 'purple' : 'cyan') as any },
      { text: formatPhone(c.phone || '') || '—' },
      { text: c.email || '—' },
      { text: c.cidade || '—' },
      { text: CLIENT_STATUS_LABELS[c.status || 'active'] || c.status || '—', badge: (c.status === 'active' ? 'green' : c.status === 'inactive' ? 'gray' : 'blue') as any },
    ])

    const processosRows = processes.map(p => [
      { text: p.number, mono: true, bold: true },
      { text: p.title },
      { text: p.client_name || '—' },
      { text: p.modalidade === 'judicial' ? 'Judicial' : p.modalidade === 'administrativo' ? 'Administrativo' : '—', badge: (p.modalidade === 'judicial' ? 'purple' : 'cyan') as any },
      { text: p.area || '—' },
      { text: PROCESS_STATUS_LABELS[p.status || 'active'], badge: (p.status === 'active' ? 'green' : p.status === 'won' ? 'blue' : p.status === 'lost' ? 'red' : p.status === 'archived' ? 'gray' : 'amber') as any },
      { text: formatDate(p.next_deadline) },
    ])

    const csvLines = [`Parceiro: ${col.nome}`, '', 'Contatos', 'Nome,Tipo,CPF/CNPJ,Telefone,Email,Cidade,Status']
    for (const c of clients) {
      csvLines.push(`"${c.name}","${c.type === 'pf' ? 'Pessoa Física' : 'Pessoa Jurídica'}","${formatCPFCNPJ(c.cpf_cnpj || '') || '—'}","${formatPhone(c.phone || '') || '—'}","${c.email || '—'}","${c.cidade || '—'}","${CLIENT_STATUS_LABELS[c.status || 'active'] || c.status || '—'}"`)
    }
    csvLines.push('', 'Processos', 'Número,Título,Cliente,Modalidade,Área,Status,Próximo Prazo')
    for (const p of processes) {
      csvLines.push(`"${p.number}","${p.title}","${p.client_name || '—'}","${p.modalidade === 'judicial' ? 'Judicial' : p.modalidade === 'administrativo' ? 'Administrativo' : '—'}","${p.area || '—'}","${PROCESS_STATUS_LABELS[p.status || 'active']}","${formatDate(p.next_deadline)}"`)
    }

    openExportWindow({
      title: `Relatório do Parceiro — ${col.nome}`,
      subtitle: 'Contatos e processos vinculados a este parceiro',
      filename: `parceiro-${col.nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`,
      stats: [
        { value: clients.length, label: 'Contatos', accent: '#2563eb' },
        { value: processes.length, label: 'Processos', accent: '#7c3aed' },
        { value: clients.filter(c => c.status === 'active').length, label: 'Contatos ativos', accent: '#16a34a' },
        { value: processes.filter(p => p.status === 'active').length, label: 'Processos ativos', accent: '#0e7490' },
      ],
      columns: [],
      rows: [],
      sections: [
        { title: 'Contatos', columns: ['Nome', 'Tipo', 'Telefone', 'Email', 'Cidade', 'Status'], rows: contatosRows },
        { title: 'Processos', columns: ['Número', 'Título', 'Cliente', 'Modalidade', 'Área', 'Status', 'Próximo Prazo'], rows: processosRows },
      ],
      csvContent: csvLines.join('\n'),
    })
  }

  function openNew() { setEditId(null); setForm(EMPTY_FORM); setModalOpen(true) }
  function openEdit(c: Colaborador) {
    setEditId(c.id)
    setForm({
      nome: c.nome, email: c.email || '', telefone: c.telefone || '',
      cargo: c.cargo || 'parceiro',
      comissao_percent: c.comissao_percent ? String(c.comissao_percent) : '',
      ativo: c.ativo ?? true, notas: c.notas || '', cidade: c.cidade || '',
    })
    setModalOpen(true)
  }

  async function save() {
    if (!form.nome.trim()) return
    setSaving(true)
    const payload = {
      ...form,
      comissao_percent: form.comissao_percent ? parseFloat(form.comissao_percent) : 0,
      tenant_id: profile?.tenant_id ?? null,
    }
    if (editId) {
      const { error } = await supabase.from('colaboradores').update(payload).eq('id', editId)
      if (error) { toast('Erro: ' + error.message, 'error'); setSaving(false); return }
    } else {
      const { error } = await supabase.from('colaboradores').insert(payload)
      if (error) { toast('Erro: ' + error.message, 'error'); setSaving(false); return }
    }
    setSaving(false); setModalOpen(false); load()
  }

  async function deleteCollaborator(id: string) {
    if (!(await confirmDialog('Deseja excluir este parceiro?'))) return
    await supabase.from('colaboradores').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    load()
  }

  // ─── Seleção em massa ────────────────────────────────────────────────────────
  function toggleSelect(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }
  function togglePageSelection() {
    setSelectedIds(prev => {
      const allSelected = filtered.every(c => prev.has(c.id))
      const next = new Set(prev)
      if (allSelected) filtered.forEach(c => next.delete(c.id))
      else filtered.forEach(c => next.add(c.id))
      return next
    })
  }
  async function bulkSetAtivo(ativo: boolean) {
    setBulkWorking(true)
    await supabase.from('colaboradores').update({ ativo }).in('id', Array.from(selectedIds))
    setBulkWorking(false)
    setSelectedIds(new Set())
    load()
  }
  async function bulkDelete() {
    if (!(await confirmDialog(`Excluir ${selectedIds.size} parceiro(s) selecionado(s)?`))) return
    setBulkWorking(true)
    await supabase.from('colaboradores').update({ deleted_at: new Date().toISOString() }).in('id', Array.from(selectedIds))
    setBulkWorking(false)
    setSelectedIds(new Set())
    load()
  }

  // ─── Navegação pros contatos/processos do parceiro ───────────────────────────
  function goToClientes(col: Colaborador) {
    navigate('/clientes', { state: { prefillColaborador: col.id } })
  }
  function goToProcessos(col: Colaborador) {
    navigate('/processos', { state: { prefillColaborador: col.id } })
  }
  function askCopiloto(col: Colaborador) {
    navigate('/dashboard', {
      state: {
        openTab: 'ia',
        prefillQuestion: `Me dê um resumo da rede do parceiro ${col.nome}: contatos indicados, processos em andamento e comissões pendentes.`,
      },
    })
  }

  return (
    <Layout title="Parceiros">
      <div className="space-y-4">

        {/* Page header — exact ADVBOX style */}
        <div>
          <button className="flex items-center gap-2 group">
            <h1 className="text-base font-bold uppercase tracking-wide text-gray-900 dark:text-white">
              Você e todos os seus parceiros
            </h1>
            <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
          </button>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Se preferir, você pode{' '}
            <button
              className="text-primary-600 dark:text-primary-400 hover:underline"
              onClick={() => setShowSearch(true)}
            >
              selecionar um parceiro
            </button>{' '}
            na tabela abaixo para ver o histórico detalhado
          </p>
        </div>

        {/* 4 stat cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Card 1 */}
          <div className="bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-xl p-5">
            <p className="text-sm text-gray-500 dark:text-gray-400">Processos compartilhados (ativos)</p>
            <div className="flex items-center justify-between mt-2">
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.totalProcessosAtivos}</p>
              <button onClick={() => setExpandAtivos(v => !v)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <ChevronDown className={cn('w-4 h-4 transition-transform', expandAtivos && 'rotate-180')} />
              </button>
            </div>
            <button onClick={() => setExpandAtivos(v => !v)}
              className="text-xs text-primary-600 dark:text-primary-400 hover:underline mt-1">
              Mostrar processos
            </button>
            {expandAtivos && (
              <div className="mt-3 space-y-1.5 border-t border-gray-100 dark:border-dark-700 pt-3">
                {collaborators.filter(c => (activeProcessCounts[c.id] || 0) > 0).map(c => (
                  <div key={c.id} className="flex items-center justify-between text-xs">
                    <span className="text-gray-600 dark:text-gray-300 truncate">{c.nome}</span>
                    <span className="font-semibold text-gray-900 dark:text-white ml-2">{activeProcessCounts[c.id]}</span>
                  </div>
                ))}
                {collaborators.filter(c => (activeProcessCounts[c.id] || 0) > 0).length === 0 && (
                  <p className="text-xs text-gray-400">Nenhum processo ativo atribuído</p>
                )}
              </div>
            )}
          </div>

          {/* Card 2 */}
          <div className="bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-xl p-5">
            <p className="text-sm text-gray-500 dark:text-gray-400">Processos ativos aguardando o escritório</p>
            <div className="flex items-center justify-between mt-2">
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.demandaEscritorio}</p>
              <button onClick={() => setExpandEscritorio(v => !v)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <ChevronDown className={cn('w-4 h-4 transition-transform', expandEscritorio && 'rotate-180')} />
              </button>
            </div>
            <button onClick={() => setExpandEscritorio(v => !v)}
              className="text-xs text-primary-600 dark:text-primary-400 hover:underline mt-1">
              Mostrar processos
            </button>
            {expandEscritorio && (
              <div className="mt-3 space-y-1.5 border-t border-gray-100 dark:border-dark-700 pt-3">
                {stats.ativos.filter(c => (activeProcessCounts[c.id] || 0) > 0).map(c => (
                  <div key={c.id} className="flex items-center justify-between text-xs">
                    <span className="text-gray-600 dark:text-gray-300 truncate">{c.nome}</span>
                    <span className="font-semibold text-gray-900 dark:text-white ml-2">{activeProcessCounts[c.id]}</span>
                  </div>
                ))}
                {stats.ativos.filter(c => (activeProcessCounts[c.id] || 0) > 0).length === 0 && (
                  <p className="text-xs text-gray-400">Sem demanda pendente</p>
                )}
              </div>
            )}
          </div>

          {/* Card 3 — Comissões pendentes */}
          <div className="bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-xl p-5">
            <p className="text-sm text-gray-500 dark:text-gray-400">Comissões pendentes de pagamento</p>
            <div className="flex items-center justify-between mt-2">
              <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">{formatCurrency(stats.comissoesPendentesValor)}</p>
              <button onClick={() => setExpandParceiro(v => !v)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <ChevronDown className={cn('w-4 h-4 transition-transform', expandParceiro && 'rotate-180')} />
              </button>
            </div>
            <button onClick={() => setExpandParceiro(v => !v)}
              className="text-xs text-primary-600 dark:text-primary-400 hover:underline mt-1">
              {stats.comissoesPendentesCount} contato{stats.comissoesPendentesCount !== 1 ? 's' : ''} aguardando pagamento
            </button>
            {expandParceiro && (
              <div className="mt-3 space-y-1.5 border-t border-gray-100 dark:border-dark-700 pt-3">
                {collaborators.filter(c => (pendingCommissionValue[c.id] || 0) > 0).map(c => (
                  <div key={c.id} className="flex items-center justify-between text-xs">
                    <span className="text-gray-600 dark:text-gray-300 truncate">{c.nome}</span>
                    <span className="font-semibold text-orange-600 dark:text-orange-400 ml-2">{formatCurrency(pendingCommissionValue[c.id])}</span>
                  </div>
                ))}
                {collaborators.filter(c => (pendingCommissionValue[c.id] || 0) > 0).length === 0 && (
                  <p className="text-xs text-gray-400">Nenhuma comissão pendente</p>
                )}
              </div>
            )}
          </div>

          {/* Card 4 — Indicações */}
          <div className="bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-xl p-5">
            <p className="text-sm text-gray-500 dark:text-gray-400">Clientes indicados por parceiros</p>
            <div className="flex items-center justify-between mt-2">
              <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.totalIndicacoes}</p>
              <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <Users className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
            <p className="text-xs text-primary-600 dark:text-primary-400 mt-1">indicações registradas</p>
            {stats.totalIndicacoes > 0 && (
              <div className="mt-3 space-y-1.5 border-t border-gray-100 dark:border-dark-700 pt-3">
                {collaborators.filter(c => (indicacoesCounts[c.id] || 0) > 0)
                  .sort((a, b) => (indicacoesCounts[b.id] || 0) - (indicacoesCounts[a.id] || 0))
                  .map(c => (
                    <div key={c.id} className="flex items-center justify-between text-xs">
                      <span className="text-gray-600 dark:text-gray-300 truncate">{c.nome}</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400 ml-2 bg-emerald-50 dark:bg-emerald-900/20 px-1.5 py-0.5 rounded">
                        {indicacoesCounts[c.id]}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>

        </div>

        {/* Chart — "Processos compartilhados" */}
        <div className="bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-xl p-5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Processos compartilhados</p>
            <button onClick={load} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          <LineChart data={chartData} />
        </div>

        {/* Rede section (collapsible) */}
        <div className="bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-xl overflow-hidden">

          {/* Section header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-dark-700">
            <button
              className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              onClick={() => setTableCollapsed(v => !v)}
            >
              Rede
              {tableCollapsed
                ? <ChevronDown className="w-4 h-4" />
                : <ChevronUp className="w-4 h-4" />
              }
            </button>
          </div>

          {!tableCollapsed && (
            <>
              {/* Toolbar */}
              <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-50 dark:border-dark-700/50 flex-wrap">
                <button
                  onClick={openNew}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" /> Novo parceiro
                </button>
                <button
                  onClick={() => setShowSearch(v => !v)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors"
                >
                  <Search className="w-4 h-4" /> Buscar
                </button>

                {/* Filtrar */}
                <div className="relative" ref={filterRef}>
                  <button
                    onClick={() => { setFilterOpen(v => !v); setSortOpen(false) }}
                    className={cn('flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded-lg transition-colors',
                      filterOpen || cargoFilter || statusFilter
                        ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 border-primary-300 dark:border-primary-700'
                        : 'text-gray-700 dark:text-gray-300 border-gray-200 dark:border-dark-600 bg-white dark:bg-dark-800 hover:bg-gray-50 dark:hover:bg-dark-700')}
                  >
                    <SlidersHorizontal className="w-4 h-4" /> Filtrar
                    {[cargoFilter, statusFilter].filter(Boolean).length > 0 && (
                      <span className="ml-0.5 w-4 h-4 rounded-full bg-primary-600 text-white text-[10px] font-bold flex items-center justify-center">
                        {[cargoFilter, statusFilter].filter(Boolean).length}
                      </span>
                    )}
                  </button>
                  {filterOpen && (
                    <div className="absolute left-0 top-full mt-1.5 w-64 bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-600 rounded-xl shadow-lg z-50 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider">Filtros</p>
                        {(cargoFilter || statusFilter) && (
                          <button onClick={() => { setCargoFilter(''); setStatusFilter('') }} className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium">Limpar</button>
                        )}
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Status</label>
                        <div className="flex gap-1.5">
                          {[{ v: '', l: 'Todos' }, { v: 'ativo', l: 'Ativo' }, { v: 'inativo', l: 'Inativo' }].map(o => (
                            <button key={o.v} onClick={() => setStatusFilter(o.v)} className={cn('px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors',
                              statusFilter === o.v ? 'bg-primary-600 text-white border-primary-600' : 'border-gray-200 dark:border-dark-600 text-gray-600 dark:text-gray-300')}>{o.l}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Cargo</label>
                        <select value={cargoFilter} onChange={e => setCargoFilter(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs border border-gray-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-700 text-gray-700 dark:text-gray-200">
                          <option value="">Todos</option>
                          {Object.entries(CARGO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* Ordenar */}
                <div className="relative" ref={sortRef}>
                  <button
                    onClick={() => { setSortOpen(v => !v); setFilterOpen(false) }}
                    className={cn('flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded-lg transition-colors',
                      sortOpen ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 border-primary-300 dark:border-primary-700' : 'text-gray-700 dark:text-gray-300 border-gray-200 dark:border-dark-600 bg-white dark:bg-dark-800 hover:bg-gray-50 dark:hover:bg-dark-700')}
                  >
                    <ArrowUpDown className="w-4 h-4" /> Ordenar
                  </button>
                  {sortOpen && (
                    <div className="absolute left-0 top-full mt-1.5 w-56 bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-600 rounded-xl shadow-lg z-50 p-2 space-y-0.5">
                      {([
                        { field: 'nome' as const, dir: 'asc' as const, label: 'Nome A → Z' },
                        { field: 'nome' as const, dir: 'desc' as const, label: 'Nome Z → A' },
                        { field: 'processos' as const, dir: 'desc' as const, label: 'Mais processos' },
                        { field: 'indicacoes' as const, dir: 'desc' as const, label: 'Mais indicações' },
                      ]).map(opt => (
                        <button key={`${opt.field}-${opt.dir}`} onClick={() => { setSortField(opt.field); setSortDir(opt.dir); setSortOpen(false) }}
                          className={cn('w-full text-left px-3 py-2 text-xs rounded-lg transition-colors',
                            sortField === opt.field && sortDir === opt.dir ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 font-semibold' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700')}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button onClick={exportAll} className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
                  <Download className="w-4 h-4" /> Exportar
                </button>
              </div>

              {selectedIds.size > 0 && (
                <div className="flex items-center gap-2 px-5 py-2.5 border-b border-primary-100 dark:border-primary-800/40 bg-primary-50/60 dark:bg-primary-900/10 flex-wrap">
                  <span className="text-xs font-semibold text-primary-700 dark:text-primary-400">{selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}</span>
                  <button onClick={() => bulkSetAtivo(true)} disabled={bulkWorking} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Ativar
                  </button>
                  <button onClick={() => bulkSetAtivo(false)} disabled={bulkWorking} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-dark-600 text-gray-500 hover:bg-gray-50 dark:hover:bg-dark-700">
                    <Clock className="w-3.5 h-3.5" /> Desativar
                  </button>
                  <button onClick={bulkDelete} disabled={bulkWorking} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                    <Trash2 className="w-3.5 h-3.5" /> Excluir
                  </button>
                  <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">Limpar seleção</button>
                </div>
              )}

              {/* Inline search */}
              {showSearch && (
                <div className="px-5 py-3 border-b border-gray-50 dark:border-dark-700/50">
                  <div className="relative max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      autoFocus
                      className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                      placeholder="Buscar parceiros..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-dark-700">
                      <th className="w-9 px-3 py-3">
                        <input type="checkbox" className="w-3.5 h-3.5 rounded border-gray-300 dark:border-dark-500 text-primary-600 focus:ring-primary-400"
                          checked={filtered.length > 0 && filtered.every(c => selectedIds.has(c.id))}
                          onChange={togglePageSelection} />
                      </th>
                      <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Nome</th>
                      <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Cargo</th>
                      <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Rede</th>
                      <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Contato</th>
                      <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Status</th>
                      <th className="w-24 px-2 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={7} className="py-16 text-center"><Spinner className="w-6 h-6 mx-auto" /></td></tr>
                    ) : filtered.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-5 py-16 text-center text-sm text-gray-400">
                          Não encontramos nenhum registro.
                        </td>
                      </tr>
                    ) : (
                      filtered.map((c, idx) => {
                        const wa = c.telefone ? waLink(c.telefone) : null
                        return (
                        <tr key={c.id}
                          onClick={() => setViewPartner(c)}
                          className={cn(
                            'border-b border-gray-50 dark:border-dark-700/50 hover:bg-gray-50/60 dark:hover:bg-dark-700/30 transition-colors group cursor-pointer',
                            idx % 2 === 1 && 'bg-gray-50/30 dark:bg-dark-700/10'
                          )}
                        >
                          <td className="px-3 py-3.5" onClick={e => e.stopPropagation()}>
                            <input type="checkbox" className="w-3.5 h-3.5 rounded border-gray-300 dark:border-dark-500 text-primary-600 focus:ring-primary-400"
                              checked={selectedIds.has(c.id)} onChange={e => toggleSelect(c.id, e as any)} />
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                'w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0',
                                c.ativo ? 'bg-primary-500' : 'bg-gray-400'
                              )}>
                                {c.nome[0]?.toUpperCase()}
                              </div>
                              <span className="font-medium text-gray-900 dark:text-white text-sm hover:text-primary-600 dark:hover:text-primary-400 transition-colors">{c.nome}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-xs text-gray-600 dark:text-gray-300">
                            {CARGO_LABELS[c.cargo || ''] || c.cargo || '—'}
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                              <div className="flex items-center gap-1">
                                <Briefcase className="w-3.5 h-3.5 text-gray-400" />
                                <span>{processCounts[c.id] || 0} processo{(processCounts[c.id] || 0) !== 1 ? 's' : ''}</span>
                              </div>
                              {(indicacoesCounts[c.id] || 0) > 0 && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                                  <Users className="w-3 h-3" />
                                  {indicacoesCounts[c.id]} indicaç{indicacoesCounts[c.id] === 1 ? 'ão' : 'ões'}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-xs text-gray-500 dark:text-gray-400" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-2">
                              {wa && (
                                <a href={wa} target="_blank" rel="noreferrer" title="WhatsApp" className="text-gray-400 hover:text-green-500 transition-colors flex-shrink-0">
                                  <MessageCircle className="w-3.5 h-3.5" />
                                </a>
                              )}
                              {c.email && (
                                <a href={`mailto:${c.email}`} title={c.email} className="flex items-center gap-1 truncate max-w-[140px] hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
                                  <Mail className="w-3.5 h-3.5 flex-shrink-0" /><span className="truncate">{c.email}</span>
                                </a>
                              )}
                              {!c.email && !wa && '—'}
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <Badge className={c.ativo ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-dark-700 dark:text-gray-400'}>
                              {c.ativo ? 'Ativo' : 'Inativo'}
                            </Badge>
                          </td>
                          {/* Actions */}
                          <td className="px-2 py-3.5" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => exportParceiro(c)} disabled={exportingId === c.id}
                                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-dark-600 text-gray-400 hover:text-primary-600 transition-colors disabled:opacity-50" title="Exportar contatos e processos deste parceiro">
                                {exportingId === c.id ? <Spinner className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
                              </button>
                              <button onClick={() => openEdit(c)}
                                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-dark-600 text-gray-400 hover:text-primary-600 transition-colors" title="Editar">
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => deleteCollaborator(c.id)}
                                className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors" title="Excluir">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

      </div>

      {/* Form Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Editar Parceiro' : 'Novo Parceiro'} size="md">
        <div className="space-y-4">
          <SectionLabel>Identificação</SectionLabel>
          <Input label="Nome *" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Nome completo" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select label="Cargo" value={form.cargo} onChange={e => setForm({ ...form, cargo: e.target.value })}>
              <option value="parceiro">Parceiro</option>
              <option value="advogado">Advogado</option>
              <option value="estagiario">Estagiário</option>
              <option value="secretaria">Secretária</option>
              <option value="financeiro">Financeiro</option>
              <option value="outros">Outros</option>
            </Select>
            <Select label="Status" value={form.ativo ? 'ativo' : 'inativo'} onChange={e => setForm({ ...form, ativo: e.target.value === 'ativo' })}>
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </Select>
          </div>
          <SectionLabel>Contato</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@exemplo.com" />
            <Input label="Telefone" value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} placeholder="(00) 00000-0000" />
          </div>
          <Input label="Cidade" value={form.cidade} onChange={e => setForm({ ...form, cidade: e.target.value })} placeholder="Cidade de atuação" />
          <SectionLabel>Financeiro</SectionLabel>
          <Input label="Comissão (%)" type="number" min="0" max="100" step="0.1"
            value={form.comissao_percent} onChange={e => setForm({ ...form, comissao_percent: e.target.value })} placeholder="0" />
          <SectionLabel>Observações</SectionLabel>
          <Textarea label="" value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} placeholder="Notas internas..." rows={3} />
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setModalOpen(false)}
            className="px-4 py-2 text-sm font-medium border border-gray-200 dark:border-dark-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
            Cancelar
          </button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm font-semibold bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </Modal>

      {/* Painel de detalhe do parceiro */}
      {viewPartner && (
        <PartnerDetailPanel
          partner={viewPartner}
          clients={allClients.filter(c => c.colaborador_id === viewPartner.id)}
          paidValue={paidCommissionValue[viewPartner.id] || 0}
          pendingValue={pendingCommissionValue[viewPartner.id] || 0}
          onClose={() => setViewPartner(null)}
          onEdit={() => { openEdit(viewPartner); setViewPartner(null) }}
          onGoToClientes={() => goToClientes(viewPartner)}
          onGoToProcessos={() => goToProcessos(viewPartner)}
          onAskCopiloto={() => askCopiloto(viewPartner)}
        />
      )}
    </Layout>
  )
}

function PartnerDetailPanel({ partner, clients, paidValue, pendingValue, onClose, onEdit, onGoToClientes, onGoToProcessos, onAskCopiloto }: {
  partner: Colaborador
  clients: ParceiroClientFull[]
  paidValue: number
  pendingValue: number
  onClose: () => void
  onEdit: () => void
  onGoToClientes: () => void
  onGoToProcessos: () => void
  onAskCopiloto: () => void
}) {
  const [processes, setProcesses] = useState<ParceiroProcessRow[]>([])
  const [loadingProc, setLoadingProc] = useState(true)
  const wa = partner.telefone ? waLink(partner.telefone) : null

  useEffect(() => {
    let active = true
    setLoadingProc(true)
    supabase.from('processes')
      .select('id,number,title,client_name,modalidade,area,status,next_deadline')
      .eq('colaborador_id', partner.id).is('deleted_at', null).order('created_at', { ascending: false })
      .then(({ data }) => { if (active) { setProcesses((data || []) as ParceiroProcessRow[]); setLoadingProc(false) } })
    return () => { active = false }
  }, [partner.id])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-dark-800 rounded-2xl shadow-2xl flex flex-col w-full max-w-2xl max-h-[88vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative overflow-hidden bg-gradient-to-br from-primary-700 via-primary-600 to-primary-500 text-white px-6 py-6 flex-shrink-0">
          <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors">
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center text-2xl font-bold flex-shrink-0">
              {partner.nome[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-xl font-bold">{partner.nome}</h3>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge className="bg-white/20 text-white border border-white/30">{CARGO_LABELS[partner.cargo || ''] || partner.cargo || '—'}</Badge>
                <Badge className={partner.ativo ? 'bg-white/20 text-white border border-white/30' : 'bg-black/20 text-white/70 border border-white/20'}>
                  {partner.ativo ? 'Ativo' : 'Inativo'}
                </Badge>
                {partner.comissao_percent != null && (
                  <Badge className="bg-white/20 text-white border border-white/30">{partner.comissao_percent}% comissão</Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Stats + ações */}
          <div className="p-5 border-b border-gray-100 dark:border-dark-700 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="text-center p-3 rounded-xl bg-gray-50 dark:bg-dark-700/50">
                <p className="text-lg font-bold text-gray-900 dark:text-white">{clients.length}</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">Contatos</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-gray-50 dark:bg-dark-700/50">
                <p className="text-lg font-bold text-gray-900 dark:text-white">{processes.length}</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">Processos</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(paidValue)}</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">Comissão paga</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-orange-50 dark:bg-orange-900/20">
                <p className="text-lg font-bold text-orange-600 dark:text-orange-400">{formatCurrency(pendingValue)}</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">Comissão pendente</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {wa && (
                <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-lg border border-green-200 dark:border-green-800 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors">
                  <MessageCircle className="w-3.5 h-3.5" />WhatsApp
                </a>
              )}
              <button onClick={onGoToClientes} className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-lg border border-gray-200 dark:border-dark-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
                <UserCheck className="w-3.5 h-3.5" />Ver contatos
              </button>
              <button onClick={onGoToProcessos} className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-lg border border-gray-200 dark:border-dark-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
                <Briefcase className="w-3.5 h-3.5" />Ver processos
              </button>
              <button onClick={onAskCopiloto} className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-lg border border-gray-200 dark:border-dark-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
                <Sparkles className="w-3.5 h-3.5" />Copiloto
              </button>
              <button onClick={onEdit} className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition-colors">
                <Edit3 className="w-3.5 h-3.5" />Editar
              </button>
            </div>
          </div>

          {/* Contatos vinculados */}
          <div className="p-5 border-b border-gray-100 dark:border-dark-700">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">Contatos vinculados</p>
            {clients.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">Nenhum contato indicado por este parceiro ainda.</p>
            ) : (
              <div className="space-y-1.5">
                {clients.slice(0, 8).map(c => (
                  <div key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 dark:bg-dark-700/50 rounded-lg">
                    <span className="text-sm text-gray-800 dark:text-gray-200 truncate">{c.name}</span>
                    <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0',
                      c.colaborador_pago ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400')}>
                      {c.colaborador_pago ? 'Comissão paga' : 'Comissão pendente'}
                    </span>
                  </div>
                ))}
                {clients.length > 8 && (
                  <button onClick={onGoToClientes} className="text-xs text-primary-600 dark:text-primary-400 hover:underline pt-1">Ver todos os {clients.length} contatos →</button>
                )}
              </div>
            )}
          </div>

          {/* Processos vinculados */}
          <div className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">Processos vinculados</p>
            {loadingProc ? (
              <div className="flex justify-center py-6"><Spinner className="w-5 h-5" /></div>
            ) : processes.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">Nenhum processo vinculado a este parceiro.</p>
            ) : (
              <div className="space-y-1.5">
                {processes.slice(0, 8).map(p => (
                  <div key={p.id} className="flex items-center gap-3 bg-gray-50 dark:bg-dark-700/50 rounded-lg px-3 py-2 overflow-hidden">
                    <div className={cn('w-1 self-stretch rounded-full flex-shrink-0', p.modalidade === 'judicial' ? 'bg-purple-500' : 'bg-blue-500')} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{p.title}</p>
                      <p className="text-[11px] font-mono text-gray-400">{p.number}</p>
                    </div>
                    <Badge className={cn(p.status === 'active' ? 'bg-green-100 text-green-700' : p.status === 'won' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600')}>
                      {PROCESS_STATUS_LABELS[p.status || 'active'] || p.status}
                    </Badge>
                  </div>
                ))}
                {processes.length > 8 && (
                  <button onClick={onGoToProcessos} className="text-xs text-primary-600 dark:text-primary-400 hover:underline pt-1">Ver todos os {processes.length} processos →</button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
