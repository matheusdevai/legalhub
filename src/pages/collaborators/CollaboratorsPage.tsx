import { useEffect, useMemo, useState } from 'react'
import {
  Plus, Search, Trash2, Mail, Briefcase, ChevronDown, ChevronUp,
  Filter, Download, RefreshCw, Edit3, Users,
} from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Modal, Input, Select, Textarea, Spinner } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { Colaborador } from '@/types'
import { cn, formatDate } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { openExportWindow } from '@/lib/exportUtils'

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

export function CollaboratorsPage() {
  const { profile } = useAuth()
  const [collaborators, setCollaborators] = useState<Colaborador[]>([])
  const [clientCounts, setClientCounts] = useState<Record<string, number>>({})
  const [indicacoesCounts, setIndicacoesCounts] = useState<Record<string, number>>({})
  const [processCounts, setProcessCounts] = useState<Record<string, number>>({})
  const [processAreas, setProcessAreas] = useState<Record<string, number>>({})
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

  async function load() {
    setLoading(true)
    const [{ data: col }, { data: cli }, { data: proc }] = await Promise.all([
      supabase.from('colaboradores').select('*').order('nome'),
      supabase.from('clients').select('id,colaborador_id,origem').is('deleted_at', null),
      supabase.from('processes').select('id,colaborador_id,area').is('deleted_at', null),
    ])
    setCollaborators(col || [])

    const cMap: Record<string, number> = {}
    const indicMap: Record<string, number> = {}
    for (const c of (cli || [])) {
      if (c.colaborador_id) {
        cMap[c.colaborador_id] = (cMap[c.colaborador_id] || 0) + 1
        // Conta como indicação todo cliente vinculado ao parceiro (com ou sem origem='indicacao')
        indicMap[c.colaborador_id] = (indicMap[c.colaborador_id] || 0) + 1
      }
    }
    setClientCounts(cMap)
    setIndicacoesCounts(indicMap)

    const pMap: Record<string, number> = {}
    const aMap: Record<string, number> = {}
    for (const p of (proc || [])) {
      if (p.colaborador_id) pMap[p.colaborador_id] = (pMap[p.colaborador_id] || 0) + 1
      if (p.area) aMap[p.area] = (aMap[p.area] || 0) + 1
    }
    setProcessCounts(pMap)
    setProcessAreas(aMap)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const stats = useMemo(() => {
    const ativos = collaborators.filter(c => c.ativo)
    const inativos = collaborators.filter(c => !c.ativo)
    const totalProcessos = Object.values(processCounts).reduce((a, b) => a + b, 0)
    const totalIndicacoes = Object.values(indicacoesCounts).reduce((a, b) => a + b, 0)
    const demandaEscritorio = ativos.filter(c => (processCounts[c.id] || 0) > 0).length
    const demandaParceiro = inativos.length
    return { ativos, inativos, totalProcessos, totalIndicacoes, demandaEscritorio, demandaParceiro }
  }, [collaborators, processCounts, indicacoesCounts])

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

  const filtered = collaborators.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return c.nome.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      (CARGO_LABELS[c.cargo || ''] || c.cargo || '').toLowerCase().includes(q)
  })

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
      if (error) { alert('Erro: ' + error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('colaboradores').insert(payload)
      if (error) { alert('Erro: ' + error.message); setSaving(false); return }
    }
    setSaving(false); setModalOpen(false); load()
  }

  async function deleteCollaborator(id: string) {
    if (!confirm('Deseja excluir este parceiro?')) return
    await supabase.from('colaboradores').delete().eq('id', id)
    load()
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
            para ver o histórico detalhado
          </p>
        </div>

        {/* 4 stat cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Card 1 */}
          <div className="bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-xl p-5">
            <p className="text-sm text-gray-500 dark:text-gray-400">Processos compartilhados (ativos)</p>
            <div className="flex items-center justify-between mt-2">
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.totalProcessos}</p>
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
                {collaborators.filter(c => (processCounts[c.id] || 0) > 0).map(c => (
                  <div key={c.id} className="flex items-center justify-between text-xs">
                    <span className="text-gray-600 dark:text-gray-300 truncate">{c.nome}</span>
                    <span className="font-semibold text-gray-900 dark:text-white ml-2">{processCounts[c.id]}</span>
                  </div>
                ))}
                {collaborators.filter(c => (processCounts[c.id] || 0) > 0).length === 0 && (
                  <p className="text-xs text-gray-400">Nenhum processo atribuído</p>
                )}
              </div>
            )}
          </div>

          {/* Card 2 */}
          <div className="bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-xl p-5">
            <p className="text-sm text-gray-500 dark:text-gray-400">Demanda pendente pelo escritório</p>
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
                {stats.ativos.filter(c => (processCounts[c.id] || 0) > 0).map(c => (
                  <div key={c.id} className="flex items-center justify-between text-xs">
                    <span className="text-gray-600 dark:text-gray-300 truncate">{c.nome}</span>
                    <span className="font-semibold text-gray-900 dark:text-white ml-2">{processCounts[c.id]}</span>
                  </div>
                ))}
                {stats.ativos.filter(c => (processCounts[c.id] || 0) > 0).length === 0 && (
                  <p className="text-xs text-gray-400">Sem demanda pendente</p>
                )}
              </div>
            )}
          </div>

          {/* Card 3 */}
          <div className="bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-xl p-5">
            <p className="text-sm text-gray-500 dark:text-gray-400">Demanda pendente pelo parceiro</p>
            <div className="flex items-center justify-between mt-2">
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.demandaParceiro}</p>
              <button onClick={() => setExpandParceiro(v => !v)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <ChevronDown className={cn('w-4 h-4 transition-transform', expandParceiro && 'rotate-180')} />
              </button>
            </div>
            <button onClick={() => setExpandParceiro(v => !v)}
              className="text-xs text-primary-600 dark:text-primary-400 hover:underline mt-1">
              Mostrar processos
            </button>
            {expandParceiro && (
              <div className="mt-3 space-y-1.5 border-t border-gray-100 dark:border-dark-700 pt-3">
                {stats.inativos.map(c => (
                  <div key={c.id} className="text-xs text-gray-600 dark:text-gray-300 truncate">{c.nome}</div>
                ))}
                {stats.inativos.length === 0 && <p className="text-xs text-gray-400">Nenhum parceiro inativo</p>}
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
                <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
                  <Filter className="w-4 h-4" /> Filtrar
                </button>
                <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M6 12h12M9 17h6" />
                  </svg>
                  Ordenar
                </button>
                <button onClick={exportAll} className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
                  <Download className="w-4 h-4" /> Exportar
                </button>
              </div>

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
                      <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        <button className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300">
                          Partes <ChevronUp className="w-3 h-3" />
                        </button>
                      </th>
                      <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Tipo de Ação</th>
                      <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Número do Processo</th>
                      <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Parceiro</th>
                      <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Data</th>
                      <th className="w-10 px-2 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={6} className="py-16 text-center"><Spinner className="w-6 h-6 mx-auto" /></td></tr>
                    ) : filtered.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-16 text-center text-sm text-gray-400">
                          Não encontramos nenhum registro.
                        </td>
                      </tr>
                    ) : (
                      filtered.map((c, idx) => (
                        <tr key={c.id}
                          className={cn(
                            'border-b border-gray-50 dark:border-dark-700/50 hover:bg-gray-50/60 dark:hover:bg-dark-700/30 transition-colors group',
                            idx % 2 === 1 && 'bg-gray-50/30 dark:bg-dark-700/10'
                          )}
                        >
                          {/* Partes = nome */}
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                'w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0',
                                c.ativo ? 'bg-primary-500' : 'bg-gray-400'
                              )}>
                                {c.nome[0]?.toUpperCase()}
                              </div>
                              <span className="font-medium text-gray-900 dark:text-white text-sm">{c.nome}</span>
                            </div>
                          </td>
                          {/* Tipo de Ação = cargo */}
                          <td className="px-5 py-3.5 text-xs text-gray-600 dark:text-gray-300">
                            {CARGO_LABELS[c.cargo || ''] || c.cargo || '—'}
                          </td>
                          {/* Número do Processo = count + indicações */}
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
                          {/* Parceiro = email */}
                          <td className="px-5 py-3.5 text-xs text-gray-500 dark:text-gray-400">
                            <div className="flex items-center gap-1">
                              {c.email
                                ? <><Mail className="w-3.5 h-3.5 flex-shrink-0" /><span className="truncate max-w-[150px]">{c.email}</span></>
                                : '—'}
                            </div>
                          </td>
                          {/* Data = created_at via cidade proxy */}
                          <td className="px-5 py-3.5 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                            {c.cidade || '—'}
                          </td>
                          {/* Actions */}
                          <td className="px-2 py-3.5">
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => openEdit(c)}
                                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-dark-600 text-gray-400 hover:text-primary-600 transition-colors" title="Editar">
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => deleteCollaborator(c.id)}
                                className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors" title="Excluir">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
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
    </Layout>
  )
}
