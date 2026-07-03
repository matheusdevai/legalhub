import { useState, useEffect, useMemo } from 'react'
import {
  ChevronDown, Filter, Printer, CheckCircle2, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, RefreshCw, AlertCircle, Download,
} from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Spinner, EmptyState } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { cn, formatDate } from '@/lib/utils'
import { openExportWindow } from '@/lib/exportUtils'
import { useAuth } from '@/contexts/AuthContext'

interface CnjMovimento {
  codigo?: number
  nome?: string
  dataHora?: string
  complementosTabelados?: { codigo: number; nome: string; valor: string }[]
}

interface Intimacao {
  id: string
  process_id: string
  numero_processo: string
  partes: string
  tribunal: string
  publicacao: string
  conteudo: string
  responsavel: string
  situacao: 'Pendente' | 'Lida' | 'Cumprida'
}

const SITUACAO_STYLE: Record<string, string> = {
  Pendente: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800',
  Lida:     'bg-gray-100 text-gray-500 border-gray-200 dark:bg-dark-700 dark:text-gray-400 dark:border-dark-600',
  Cumprida: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800',
}

const PAGE_SIZES = [10, 25, 50, 100]
const PERIODOS = ['Hoje', 'Esta semana', 'Este mês', 'Últimos 3 meses', 'Todos']

const STATUS_KEY = 'lh_intimacao_status'
function getStatusMap(): Record<string, 'Lida' | 'Cumprida'> {
  try { return JSON.parse(localStorage.getItem(STATUS_KEY) || '{}') } catch { return {} }
}
function saveStatus(id: string, s: 'Lida' | 'Cumprida') {
  const m = getStatusMap(); m[id] = s
  localStorage.setItem(STATUS_KEY, JSON.stringify(m))
}

function isIntimacao(movimento: CnjMovimento): boolean {
  const nome = (movimento.nome || '').toLowerCase()
  return nome.includes('intima') || nome.includes('citação') || nome.includes('citacao')
}

export function PublicacoesPage() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<Intimacao[]>([])
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<string>('')
  const [hasCnjData, setHasCnjData] = useState(true)

  const [periodoOpen, setPeriodoOpen] = useState(false)
  const [periodo, setPeriodo] = useState('Todos')
  const [responsavelOpen, setResponsavelOpen] = useState(false)
  const [responsavelFilter, setResponsavelFilter] = useState('')
  const [pageSize, setPageSize] = useState(50)
  const [page, setPage] = useState(0)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [statusMap, setStatusMap] = useState<Record<string, 'Lida' | 'Cumprida'>>(getStatusMap)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('processes')
      .select('id, number, title, client_name, court, area, assigned_lawyer, movimentos, cnj_synced_at')
      .is('deleted_at', null)
      .eq('cnj_source', true)
      .not('movimentos', 'is', null)
      .order('cnj_synced_at', { ascending: false })

    if (!error && data) {
      setHasCnjData(data.length > 0)
      const map = getStatusMap()
      const intimacoes: Intimacao[] = []

      for (const proc of data) {
        const movimentos: CnjMovimento[] = Array.isArray(proc.movimentos) ? proc.movimentos : []
        const relevant = movimentos.filter(isIntimacao)

        relevant.forEach((mov, idx) => {
          const intimId = `${proc.id}_mov_${idx}`
          intimacoes.push({
            id: intimId,
            process_id: proc.id,
            numero_processo: proc.number || '—',
            partes: proc.client_name || proc.title || '—',
            tribunal: proc.court || '—',
            publicacao: mov.dataHora ? mov.dataHora.slice(0, 10) : (proc.cnj_synced_at?.slice(0, 10) || ''),
            conteudo: mov.nome || 'Intimação',
            responsavel: proc.assigned_lawyer || '',
            situacao: map[intimId] || 'Pendente',
          })
        })
      }

      // Ordena por data de publicação (mais recentes primeiro)
      intimacoes.sort((a, b) => b.publicacao.localeCompare(a.publicacao))
      setItems(intimacoes)
    }

    const now = new Date()
    setLastSync(`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const responsaveis = useMemo(() => {
    const set = new Set(items.map(i => i.responsavel).filter(Boolean))
    return Array.from(set).sort()
  }, [items])

  const filtered = useMemo(() => {
    const now = new Date()
    let cutoff: Date | null = null
    if (periodo === 'Hoje') cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    else if (periodo === 'Esta semana') { cutoff = new Date(now); cutoff.setDate(now.getDate() - 7) }
    else if (periodo === 'Este mês') cutoff = new Date(now.getFullYear(), now.getMonth(), 1)
    else if (periodo === 'Últimos 3 meses') { cutoff = new Date(now); cutoff.setMonth(now.getMonth() - 3) }

    let list = items.map(i => ({
      ...i,
      situacao: (statusMap[i.id] || 'Pendente') as 'Pendente' | 'Lida' | 'Cumprida',
    }))

    if (cutoff) list = list.filter(i => i.publicacao && new Date(i.publicacao) >= cutoff!)
    if (responsavelFilter) list = list.filter(i => i.responsavel === responsavelFilter)

    list.sort((a, b) => sortDir === 'desc'
      ? b.publicacao.localeCompare(a.publicacao)
      : a.publicacao.localeCompare(b.publicacao)
    )
    return list
  }, [items, periodo, responsavelFilter, sortDir, statusMap])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paginated = filtered.slice(page * pageSize, (page + 1) * pageSize)
  const start = filtered.length === 0 ? 0 : page * pageSize + 1
  const end = Math.min((page + 1) * pageSize, filtered.length)

  function markStatus(id: string, s: 'Lida' | 'Cumprida') {
    saveStatus(id, s)
    setStatusMap(m => ({ ...m, [id]: s }))
  }

  async function handleSync() {
    setSyncing(true)
    await load()
    setSyncing(false)
  }

  function exportAll() {
    const STATUS_LABEL: Record<string, string> = { Pendente: 'Pendente', Lida: 'Lida', Cumprida: 'Cumprida' }
    const STATUS_BADGE: Record<string, string> = { Pendente: 'amber', Lida: 'blue', Cumprida: 'green' }
    const pendentes = filtered.filter(i => i.situacao === 'Pendente').length
    const lidas = filtered.filter(i => i.situacao === 'Lida').length
    const cumpridas = filtered.filter(i => i.situacao === 'Cumprida').length
    const csvContent = [
      'Processo,Tribunal,Data Publicação,Conteúdo,Situação',
      ...filtered.map(i =>
        `"${i.numero_processo || '—'}","${i.tribunal || '—'}","${i.publicacao || '—'}","${(i.conteudo || '').replace(/"/g, '""')}","${i.situacao ?? '—'}"`
      ),
    ].join('\n')
    openExportWindow({
      title: 'Relatório de Publicações',
      filename: 'publicacoes',
      stats: [
        { value: filtered.length, label: 'Total', accent: '#2563eb' },
        { value: pendentes, label: 'Pendentes', accent: '#d97706' },
        { value: lidas, label: 'Lidas', accent: '#2563eb' },
        { value: cumpridas, label: 'Cumpridas', accent: '#16a34a' },
      ],
      columns: ['Processo', 'Tribunal', 'Data', 'Conteúdo', 'Situação'],
      rows: filtered.map(i => [
        { text: i.numero_processo || '—', mono: true, bold: true },
        { text: i.tribunal || '—' },
        { text: i.publicacao ? formatDate(i.publicacao) : '—' },
        { text: i.conteudo ? (i.conteudo.length > 80 ? i.conteudo.slice(0, 77) + '…' : i.conteudo) : '—' },
        { text: STATUS_LABEL[i.situacao] ?? i.situacao ?? '—', badge: STATUS_BADGE[i.situacao] ?? 'gray' },
      ]),
      csvContent,
    })
  }

  return (
    <Layout title="Intimações">
      <div className="space-y-4">

        {/* Sync banner */}
        <div className="flex items-center justify-between px-5 py-3 rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-900/10 dark:border-emerald-800">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
            <span className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
              {hasCnjData ? 'Processos sincronizados via CNJ DataJud' : 'Sincronize seus processos pelo botão na barra superior'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {lastSync && (
              <span className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">
                Atualizado às {lastSync}
              </span>
            )}
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-200 transition-colors font-medium"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', syncing && 'animate-spin')} />
              Atualizar
            </button>
          </div>
        </div>

        {/* Title + count */}
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Intimações recebidas</h2>
          {filtered.length > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-primary-100 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400">
              {filtered.length}
            </span>
          )}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Período */}
          <div className="relative">
            <button
              onClick={() => setPeriodoOpen(v => !v)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors"
            >
              {periodo} <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
            {periodoOpen && (
              <div className="absolute top-full left-0 mt-1 bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-600 rounded-xl shadow-lg z-20 py-1 min-w-[160px]">
                {PERIODOS.map(p => (
                  <button key={p} onClick={() => { setPeriodo(p); setPeriodoOpen(false); setPage(0) }}
                    className={cn('w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors',
                      periodo === p && 'text-primary-600 dark:text-primary-400 font-semibold')}>
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Responsável */}
          <div className="relative">
            <button
              onClick={() => setResponsavelOpen(v => !v)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors"
            >
              {responsavelFilter || 'Responsável'} <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
            {responsavelOpen && (
              <div className="absolute top-full left-0 mt-1 bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-600 rounded-xl shadow-lg z-20 py-1 min-w-[180px]">
                <button onClick={() => { setResponsavelFilter(''); setResponsavelOpen(false) }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-dark-700">Todos</button>
                {responsaveis.map(r => (
                  <button key={r} onClick={() => { setResponsavelFilter(r); setResponsavelOpen(false) }}
                    className={cn('w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors',
                      responsavelFilter === r && 'text-primary-600 dark:text-primary-400 font-semibold')}>
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
            <Filter className="w-4 h-4" /> Filtrar
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
            <Printer className="w-4 h-4" /> Imprimir
          </button>
          <button onClick={exportAll} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-dark-600 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
            <Download className="w-3.5 h-3.5" /> Exportar
          </button>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-dark-700">
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Partes / Conteúdo</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    <button className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300"
                      onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}>
                      Publicação
                      <svg className={cn('w-3 h-3 transition-transform', sortDir === 'asc' && 'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
                    </button>
                  </th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Tribunal</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Número do Processo</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Responsável</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Situação</th>
                  <th className="w-10 px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="py-16 text-center"><Spinner className="w-6 h-6 mx-auto" /></td></tr>
                ) : !hasCnjData ? (
                  <tr>
                    <td colSpan={7} className="py-12">
                      <div className="flex flex-col items-center gap-3 text-center px-8">
                        <AlertCircle className="w-10 h-10 text-amber-400" />
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Nenhum processo CNJ sincronizado ainda</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Faça login novamente ou acesse Configurações → Sincronizar OAB para importar seus processos do DataJud.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : paginated.length === 0 ? (
                  <tr><td colSpan={7} className="px-5 py-16 text-center text-sm text-gray-400">Nenhuma intimação encontrada para o período selecionado.</td></tr>
                ) : (
                  paginated.map((item, idx) => (
                    <tr key={item.id}
                      className={cn('border-b border-gray-50 dark:border-dark-700/50 hover:bg-gray-50/60 dark:hover:bg-dark-700/30 transition-colors group',
                        idx % 2 === 1 && 'bg-gray-50/30 dark:bg-dark-700/10'
                      )}
                    >
                      <td className="px-5 py-3.5 max-w-[280px]">
                        <p className="font-medium text-gray-900 dark:text-white text-sm leading-snug truncate">{item.partes}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{item.conteudo}</p>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {item.publicacao ? formatDate(item.publicacao) : '—'}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-gray-600 dark:text-gray-300 font-medium whitespace-nowrap">
                        {item.tribunal}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs font-mono text-gray-700 dark:text-gray-300">{item.numero_processo}</span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {item.responsavel || '—'}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={cn('inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border', SITUACAO_STYLE[item.situacao])}>
                          {item.situacao}
                        </span>
                      </td>
                      <td className="px-2 py-3.5">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {item.situacao !== 'Lida' && (
                            <button onClick={() => markStatus(item.id, 'Lida')}
                              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-dark-600 text-gray-400 hover:text-emerald-600 transition-colors" title="Marcar como lida">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {item.situacao !== 'Cumprida' && (
                            <button onClick={() => markStatus(item.id, 'Cumprida')}
                              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-dark-600 text-gray-400 hover:text-primary-600 transition-colors" title="Marcar como cumprida">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 dark:border-dark-700 bg-white dark:bg-dark-800">
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <span>Registros por página</span>
              <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(0) }}
                className="border border-gray-200 dark:border-dark-600 rounded-lg px-2 py-1 text-sm bg-white dark:bg-dark-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-100">
                {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
              <span>{start}-{end} de {filtered.length}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(0)} disabled={page === 0} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-dark-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronsLeft className="w-4 h-4" /></button>
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-dark-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronLeft className="w-4 h-4" /></button>
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-dark-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronRight className="w-4 h-4" /></button>
                <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-dark-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronsRight className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        </div>

      </div>
    </Layout>
  )
}
