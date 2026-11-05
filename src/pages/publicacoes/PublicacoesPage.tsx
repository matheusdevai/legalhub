import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronDown, Filter, Printer, ChevronLeft, ChevronRight, ArrowUpDown,
  RefreshCw, AlertCircle, Download, Search, X, Clock, CheckCircle2,
} from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Spinner, Modal, Input, Select, Button } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { cn, formatDate } from '@/lib/utils'
import { openExportWindow } from '@/lib/exportUtils'
import { OabSyncModal } from '@/components/cnj/OabSyncModal'
import { toast } from '@/components/ui/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { fetchCourtCalendar, fetchDeadlineSettings } from '@/lib/deadlines/api'
import { calendarForProcess, type CourtCalendarRow } from '@/lib/deadlines/courtCalendar'
import { courtLabel } from '@/lib/deadlines/courts'
import type { Regime, Unit } from '@/lib/deadlines/engine'
import { notifyTaskAssignment } from '@/lib/taskActions'
import { formatCnj } from '@/lib/oabSync'
import {
  calcIntimacaoPrazo, canAssignTaskTo, countyFromOrgan, courtOfIntimacao, intimacaoDate,
  intimacaoRef, intimacaoTaskDescription, suggestRegime,
} from '@/lib/intimacaoPrazo'
import { IntimacaoListItem } from './IntimacaoListItem'
import { IntimacaoReadingPanel } from './IntimacaoReadingPanel'

interface CnjMovimento {
  codigo?: number
  nome?: string
  dataHora?: string
  complementosTabelados?: { codigo: number; nome: string; valor: string }[]
  // Campos específicos de comunicações vindas do PJe/DJEN (sync-pje) — o CNJ/
  // DataJud é mais estruturado e não traz um texto livre equivalente a `teor`.
  teor?: string
  orgao?: string
  link?: string
  fonte?: string
  idComunicacao?: string | number | null
  hash?: string | null
  tribunal?: string | null
  classe?: string | null
  cancelada?: boolean
}

/** Tarefa de prazo ligada a uma intimação (tasks.intimacao_ref). */
export interface IntimacaoTask {
  id: string
  intimacao_ref: string
  due_date: string | null
  deadline_date: string | null
  assigned_to: string | null
  assigned_name: string | null
  status: string
}

interface TeamOption { user_id: string; name: string; role: string }

const REGIMES: { value: Regime; label: string }[] = [
  { value: 'civel', label: 'Cível (CPC) — dias úteis' },
  { value: 'juizado', label: 'Juizado Especial — dias úteis' },
  { value: 'trabalhista', label: 'Trabalhista (CLT) — dias úteis' },
  { value: 'penal', label: 'Penal (CPP) — dias corridos, em validação' },
  { value: 'administrativo', label: 'Administrativo — dias corridos' },
  { value: 'fixado_juiz', label: 'Fixado pelo juiz' },
]
const DEFAULT_UNIT: Record<Regime, Unit> = { civel: 'dias_uteis', juizado: 'dias_uteis', trabalhista: 'dias_uteis', administrativo: 'dias_corridos', fixado_juiz: 'dias_uteis', penal: 'dias_corridos' }
const DEFAULT_RECESS: Record<Regime, boolean> = { civel: true, juizado: false, trabalhista: true, administrativo: false, fixado_juiz: true, penal: true }

interface Intimacao {
  id: string
  /** Chave estável gravada em tasks.intimacao_ref. */
  ref: string
  /** Sigla do tribunal (court_calendar.court): 'tjpb', 'trt13'… */
  courtCode: string | null
  classe: string | null
  process_id: string
  client_id: string | null
  numero_processo: string
  partes: string
  tribunal: string
  orgao: string
  publicacao: string
  conteudo: string
  /** Texto completo da comunicação quando disponível (fonte PJe/DJEN); senão repete `conteudo`. */
  teor: string
  temTeorCompleto: boolean
  link: string | null
  fonte: string | null
  complementos: { codigo: number; nome: string; valor: string }[]
  responsavel: string
  situacao: 'Pendente' | 'Lida' | 'Cumprida'
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

const PRAZO_KEY = 'lh_intimacao_prazo'
function getPrazoMap(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(PRAZO_KEY) || '{}') } catch { return {} }
}
function savePrazoCriado(id: string, dueDate: string) {
  const m = getPrazoMap(); m[id] = dueDate
  localStorage.setItem(PRAZO_KEY, JSON.stringify(m))
}

function isIntimacao(movimento: CnjMovimento): boolean {
  // Tudo que vem do DJEN é comunicação processual (intimação, citação, edital);
  // dos andamentos do DataJud, só os que são intimação/citação.
  if (movimento.fonte === 'pje') return !movimento.cancelada
  const nome = (movimento.nome || '').toLowerCase()
  return nome.includes('intima') || nome.includes('citação') || nome.includes('citacao')
}

export function PublicacoesPage() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<Intimacao[]>([])
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<string>('')
  const [hasCnjData, setHasCnjData] = useState(true)

  const [search, setSearch] = useState('')
  const [periodoOpen, setPeriodoOpen] = useState(false)
  const [periodo, setPeriodo] = useState('Todos')
  const [responsavelOpen, setResponsavelOpen] = useState(false)
  const [responsavelFilter, setResponsavelFilter] = useState('')
  const [situacaoOpen, setSituacaoOpen] = useState(false)
  const [situacaoFilter, setSituacaoFilter] = useState<'' | 'Pendente' | 'Lida' | 'Cumprida'>('')
  const [pageSize, setPageSize] = useState(25)
  const [page, setPage] = useState(0)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [statusMap, setStatusMap] = useState<Record<string, 'Lida' | 'Cumprida'>>(getStatusMap)
  const [oabSyncOpen, setOabSyncOpen] = useState(false)
  const [prazoMap, setPrazoMap] = useState<Record<string, string>>(getPrazoMap)
  const [prazoItem, setPrazoItem] = useState<Intimacao | null>(null)
  const [prazoDias, setPrazoDias] = useState(15)
  const [prazoUnidade, setPrazoUnidade] = useState<Unit>('dias_uteis')
  const [prazoRegime, setPrazoRegime] = useState<Regime>('civel')
  const [regimeReason, setRegimeReason] = useState('')
  const [prazoDobro, setPrazoDobro] = useState(false)
  const [prazoDobroMotivo, setPrazoDobroMotivo] = useState('')
  const [prazoRecesso, setPrazoRecesso] = useState(true)
  const [prazoResponsavel, setPrazoResponsavel] = useState('')
  const [prazoSaving, setPrazoSaving] = useState(false)
  const [tasksByRef, setTasksByRef] = useState<Record<string, IntimacaoTask>>({})
  const [team, setTeam] = useState<TeamOption[]>([])
  const [calendarRows, setCalendarRows] = useState<CourtCalendarRow[]>([])
  const [marginDays, setMarginDays] = useState(2)
  const { profile } = useAuth()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const navigate = useNavigate()

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('processes')
      .select('id, number, title, client_id, client_name, court, area, assigned_lawyer, movimentos, cnj_synced_at')
      .is('deleted_at', null)
      // Sem filtrar por cnj_source: as intimações também chegam aos processos
      // cadastrados à mão (a sincronização acha o processo pelo número).
      .not('movimentos', 'is', null)
      .order('cnj_synced_at', { ascending: false, nullsFirst: false })

    const [{ data: taskRows }, { data: teamRows }, cal, settings] = await Promise.all([
      supabase.from('tasks').select('id, intimacao_ref, due_date, deadline_date, assigned_to, assigned_name, status')
        .not('intimacao_ref', 'is', null).is('deleted_at', null),
      supabase.from('profiles').select('user_id, name, display_name, role').neq('role', 'client').order('name'),
      fetchCourtCalendar(),
      profile?.tenant_id ? fetchDeadlineSettings(profile.tenant_id) : Promise.resolve(null),
    ])
    const byRef: Record<string, IntimacaoTask> = {}
    for (const t of (taskRows || []) as IntimacaoTask[]) byRef[t.intimacao_ref] = t
    setTasksByRef(byRef)
    setTeam((teamRows || []).map(t => ({ user_id: t.user_id, name: t.display_name || t.name || '—', role: t.role })))
    setCalendarRows(cal)
    if (settings) setMarginDays(settings.internal_margin_days)

    if (!error && data) {
      setHasCnjData(data.length > 0)
      const map = getStatusMap()
      const intimacoes: Intimacao[] = []
      let migratedStatus = false

      for (const proc of data) {
        const movimentos: CnjMovimento[] = Array.isArray(proc.movimentos) ? proc.movimentos : []
        const relevant = movimentos.filter(isIntimacao)

        relevant.forEach((mov, idx) => {
          const ref = intimacaoRef(proc.id, mov, idx)
          const intimId = `${proc.id}|${ref}`
          // Situação lida/cumprida gravada no formato antigo (por posição) passa para a chave estável.
          const legacyId = `${proc.id}_mov_${idx}`
          if (!map[intimId] && map[legacyId]) { map[intimId] = map[legacyId]; migratedStatus = true }
          const teorCompleto = (mov.teor || '').trim()
          const courtCode = courtOfIntimacao(mov.tribunal, proc.number)
          const task = byRef[ref]
          intimacoes.push({
            id: intimId,
            ref,
            courtCode,
            classe: mov.classe || null,
            process_id: proc.id,
            client_id: proc.client_id || null,
            numero_processo: formatCnj(proc.number) || '—',
            partes: proc.client_name || proc.title || '—',
            tribunal: courtCode ? courtLabel(courtCode) : (proc.court || '—'),
            orgao: mov.orgao || proc.court || '—',
            publicacao: intimacaoDate(mov.dataHora) || (proc.cnj_synced_at ? intimacaoDate(proc.cnj_synced_at) || '' : ''),
            conteudo: mov.nome || 'Intimação',
            teor: teorCompleto || mov.nome || 'Intimação',
            temTeorCompleto: teorCompleto.length > 0,
            link: mov.link || null,
            fonte: mov.fonte || null,
            complementos: Array.isArray(mov.complementosTabelados) ? mov.complementosTabelados : [],
            // Responsável da tarefa de prazo, quando existe; senão o advogado do processo.
            responsavel: task?.assigned_name || proc.assigned_lawyer || '',
            situacao: map[intimId] || 'Pendente',
          })
        })
      }
      if (migratedStatus) { try { localStorage.setItem(STATUS_KEY, JSON.stringify(map)); setStatusMap({ ...map }) } catch { /* sem storage */ } }

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
    if (situacaoFilter) list = list.filter(i => i.situacao === situacaoFilter)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(i =>
        i.numero_processo?.toLowerCase().includes(q) ||
        i.partes?.toLowerCase().includes(q) ||
        i.conteudo?.toLowerCase().includes(q) ||
        i.teor?.toLowerCase().includes(q) ||
        i.tribunal?.toLowerCase().includes(q) ||
        i.responsavel?.toLowerCase().includes(q)
      )
    }

    list.sort((a, b) => sortDir === 'desc'
      ? b.publicacao.localeCompare(a.publicacao)
      : a.publicacao.localeCompare(b.publicacao)
    )
    return list
  }, [items, periodo, responsavelFilter, situacaoFilter, sortDir, statusMap, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paginated = useMemo(
    () => filtered.slice(page * pageSize, (page + 1) * pageSize),
    [filtered, page, pageSize],
  )
  const start = filtered.length === 0 ? 0 : page * pageSize + 1
  const end = Math.min((page + 1) * pageSize, filtered.length)

  // Mantém uma intimação sempre selecionada (a primeira da página atual), a
  // não ser que a seleção atual ainda esteja visível — evita perder a leitura
  // em andamento ao só marcar como lida/cumprida (o que recalcula `filtered`).
  useEffect(() => {
    if (paginated.length === 0) { setSelectedId(null); return }
    setSelectedId(prev => (prev && paginated.some(i => i.id === prev)) ? prev : paginated[0].id)
  }, [paginated])

  const selectedItem = useMemo(
    () => paginated.find(i => i.id === selectedId) || null,
    [paginated, selectedId],
  )

  function markStatus(id: string, s: 'Lida' | 'Cumprida') {
    saveStatus(id, s)
    setStatusMap(m => ({ ...m, [id]: s }))
  }

  const isManager = ['admin', 'lawyer', 'super_admin'].includes(profile?.role || '')
  const assignableTeam = useMemo(
    () => team.filter(t => canAssignTaskTo(profile?.role, profile?.user_id, t.user_id)),
    [team, profile?.role, profile?.user_id],
  )

  function openPrazoModal(item: Intimacao) {
    const sg = suggestRegime({ court: item.courtCode, organ: item.orgao, classe: item.classe })
    setPrazoItem(item)
    setPrazoDias(15)
    setPrazoRegime(sg.regime)
    setRegimeReason(sg.reason)
    setPrazoUnidade(DEFAULT_UNIT[sg.regime])
    setPrazoRecesso(DEFAULT_RECESS[sg.regime])
    setPrazoDobro(false)
    setPrazoDobroMotivo('')
    // Padrão: quem está criando (estagiário/financeiro só podem atribuir a si mesmos).
    setPrazoResponsavel(profile?.user_id || '')
  }

  function changePrazoRegime(r: Regime) {
    setPrazoRegime(r); setPrazoUnidade(DEFAULT_UNIT[r]); setPrazoRecesso(DEFAULT_RECESS[r]); setRegimeReason('')
  }

  const prazoCalendar = useMemo(
    () => prazoItem ? calendarForProcess(calendarRows, { court: prazoItem.courtCode, county: countyFromOrgan(prazoItem.orgao) }) : [],
    [prazoItem, calendarRows],
  )

  const prazoCalc = useMemo(() => {
    if (!prazoItem) return null
    if (!prazoItem.publicacao) return { result: null, error: 'Intimação sem data de disponibilização — cadastre o prazo em Prazos/Atividades informando a data.' }
    return calcIntimacaoPrazo({
      disponibilizacao: prazoItem.publicacao, regime: prazoRegime, amount: prazoDias, unit: prazoUnidade,
      doubled: prazoDobro, applyRecess: prazoRecesso, internalMarginDays: marginDays, calendar: prazoCalendar,
    })
  }, [prazoItem, prazoRegime, prazoDias, prazoUnidade, prazoDobro, prazoRecesso, marginDays, prazoCalendar])

  async function criarTarefaPrazo() {
    const result = prazoCalc?.result
    if (!prazoItem || !result) return
    if (prazoDobro && !prazoDobroMotivo.trim()) { toast('Informe o motivo do prazo em dobro (ex.: Fazenda Pública, CPC art. 183).', 'error'); return }
    if (prazoResponsavel && !canAssignTaskTo(profile?.role, profile?.user_id, prazoResponsavel)) {
      toast('Seu perfil só pode atribuir tarefas a você mesmo.', 'error'); return
    }
    setPrazoSaving(true)
    const resp = team.find(t => t.user_id === prazoResponsavel) || null
    const title = `Prazo: ${prazoItem.conteudo || 'Intimação'} — ${prazoItem.numero_processo}`
    const { data, error } = await supabase.from('tasks').insert({
      title,
      description: intimacaoTaskDescription({
        tribunal: prazoItem.tribunal, result, regimeLabel: REGIMES.find(r => r.value === prazoRegime)?.label || prazoRegime,
        amount: prazoDias, unit: prazoUnidade, doubled: prazoDobro, doubledReason: prazoDobroMotivo.trim(),
      }),
      process_id: prazoItem.process_id || null,
      client_id: prazoItem.client_id || null,
      // Mesma convenção das tarefas do Controle de Prazos: a tarefa vence no
      // prazo INTERNO (margem para revisar e protocolar) e guarda o FATAL.
      due_date: result.internalDate,
      deadline_date: result.fatalDate,
      priority: 'high',
      status: 'pending',
      type: 'deadline',
      // Vazio = distribuição automática (trigger trg_auto_assign_task).
      assigned_to: resp?.user_id || null,
      assigned_name: resp?.name || null,
      created_by: profile?.user_id || null,
      intimacao_ref: prazoItem.ref,
    }).select('id, intimacao_ref, due_date, deadline_date, assigned_to, assigned_name, status').single()
    setPrazoSaving(false)
    if (error) {
      toast(/tasks_intimacao_ref_uniq/.test(error.message) ? 'Já existe uma tarefa de prazo para esta intimação.' : `Erro ao criar tarefa de prazo: ${error.message}`, 'error')
      if (/tasks_intimacao_ref_uniq/.test(error.message)) load()
      return
    }
    const task = data as IntimacaoTask
    setTasksByRef(m => ({ ...m, [task.intimacao_ref]: task }))
    if (task.assigned_to && task.assigned_to !== profile?.user_id) notifyTaskAssignment(task.assigned_to, title).catch(() => {})
    savePrazoCriado(prazoItem.id, result.fatalDate)
    setPrazoMap(m => ({ ...m, [prazoItem.id]: result.fatalDate }))
    setItems(list => list.map(i => i.ref === task.intimacao_ref ? { ...i, responsavel: task.assigned_name || i.responsavel } : i))
    toast(`Tarefa criada: fatal ${formatDate(result.fatalDate)}${task.assigned_name ? ` · responsável ${task.assigned_name}` : ' · distribuição automática'}.`, 'success')
    setPrazoItem(null)
    if (!task.assigned_to) load() // pega o responsável escolhido pela distribuição automática
  }

  /** Atribui, troca ou remove (null) o responsável da tarefa de prazo de uma intimação. */
  async function changeResponsavel(item: Intimacao, userId: string | null) {
    const task = tasksByRef[item.ref]
    if (!task) return
    if (userId && !canAssignTaskTo(profile?.role, profile?.user_id, userId)) { toast('Seu perfil só pode atribuir tarefas a você mesmo.', 'error'); return }
    if (!isManager && task.assigned_to && task.assigned_to !== profile?.user_id) { toast('Só advogados e administradores alteram o responsável de tarefas de outras pessoas.', 'error'); return }
    const resp = userId ? team.find(t => t.user_id === userId) || null : null
    const { error } = await supabase.from('tasks')
      .update({ assigned_to: resp?.user_id || null, assigned_name: resp?.name || null })
      .eq('id', task.id)
    if (error) { toast(`Erro ao alterar responsável: ${error.message}`, 'error'); return }
    const updated = { ...task, assigned_to: resp?.user_id || null, assigned_name: resp?.name || null }
    setTasksByRef(m => ({ ...m, [item.ref]: updated }))
    setItems(list => list.map(i => i.ref === item.ref ? { ...i, responsavel: resp?.name || '' } : i))
    if (resp && resp.user_id !== profile?.user_id) notifyTaskAssignment(resp.user_id, `Prazo: ${item.conteudo} — ${item.numero_processo}`).catch(() => {})
    toast(resp ? `Responsável: ${resp.name}` : 'Responsável removido — a tarefa sai da Agenda até alguém ser atribuído.', 'success')
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
              {hasCnjData ? 'Processos sincronizados via CNJ DataJud / PJe' : 'Nenhum processo sincronizado ainda — clique em "Sincronizar" para importar intimações'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {lastSync && (
              <span className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">
                Lista atualizada às {lastSync}
              </span>
            )}
            <button
              onClick={handleSync}
              disabled={syncing}
              title="Recarrega a lista com os dados já sincronizados (não busca novos dados nos tribunais)"
              className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-200 transition-colors font-medium"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', syncing && 'animate-spin')} />
              Atualizar lista
            </button>
            <button
              onClick={() => setOabSyncOpen(true)}
              className="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg transition-colors font-medium"
            >
              Sincronizar agora
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
          {/* Busca */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              className="pl-9 pr-8 py-2 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 w-64"
              placeholder="Buscar intimação..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0) }}
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

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

          {/* Situação */}
          <div className="relative">
            <button
              onClick={() => setSituacaoOpen(v => !v)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded-lg bg-white dark:bg-dark-800 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors',
                situacaoFilter
                  ? 'border-primary-300 text-primary-700 dark:border-primary-700 dark:text-primary-400'
                  : 'border-gray-200 dark:border-dark-600 text-gray-700 dark:text-gray-300',
              )}
            >
              <Filter className="w-4 h-4" /> {situacaoFilter || 'Filtrar'} <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
            {situacaoOpen && (
              <div className="absolute top-full left-0 mt-1 bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-600 rounded-xl shadow-lg z-20 py-1 min-w-[160px]">
                <button onClick={() => { setSituacaoFilter(''); setSituacaoOpen(false) }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-dark-700">Todas as situações</button>
                {(['Pendente', 'Lida', 'Cumprida'] as const).map(s => (
                  <button key={s} onClick={() => { setSituacaoFilter(s); setSituacaoOpen(false) }}
                    className={cn('w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors',
                      situacaoFilter === s && 'text-primary-600 dark:text-primary-400 font-semibold')}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Ordenação por data de publicação */}
          <button
            onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
            title={sortDir === 'desc' ? 'Mais recentes primeiro' : 'Mais antigas primeiro'}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors"
          >
            <ArrowUpDown className="w-4 h-4 text-gray-400" /> {sortDir === 'desc' ? 'Recentes' : 'Antigas'}
          </button>

          <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
            <Printer className="w-4 h-4" /> Imprimir
          </button>
          <button onClick={exportAll} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-dark-600 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
            <Download className="w-3.5 h-3.5" /> Exportar
          </button>
        </div>

        {/* Master-detail: lista à esquerda, leitura completa à direita.
            Em telas estreitas (abaixo de lg), a lista ocupa a tela inteira e a
            seleção de um item substitui a lista pelo painel de leitura (com
            botão "Voltar"), em vez de dividir a tela em duas colunas apertadas. */}
        <div className="flex flex-col lg:flex-row gap-4 lg:h-[70vh] lg:min-h-[480px] lg:max-h-[760px]">
          {/* Lista */}
          <div className={cn(
            'lg:w-[380px] lg:flex-shrink-0 bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-xl overflow-hidden flex flex-col',
            selectedId && 'hidden lg:flex',
          )}>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="py-16 text-center"><Spinner className="w-6 h-6 mx-auto" /></div>
              ) : !hasCnjData ? (
                <div className="flex flex-col items-center gap-3 text-center px-8 py-12">
                  <AlertCircle className="w-10 h-10 text-amber-400" />
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Nenhum processo CNJ sincronizado ainda</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Faça login novamente ou acesse Configurações → Sincronizar OAB para importar seus processos do DataJud.
                  </p>
                </div>
              ) : paginated.length === 0 ? (
                <p className="px-5 py-16 text-center text-sm text-gray-400">Nenhuma intimação encontrada para o período selecionado.</p>
              ) : (
                paginated.map(item => (
                  <IntimacaoListItem
                    key={item.id}
                    item={item}
                    active={item.id === selectedId}
                    temPrazoCriado={!!tasksByRef[item.ref] || !!prazoMap[item.id]}
                    responsavelTarefa={tasksByRef[item.ref] ? (tasksByRef[item.ref].assigned_name || 'Sem responsável') : null}
                    onSelect={() => setSelectedId(item.id)}
                  />
                ))
              )}
            </div>

            {/* Paginação compacta */}
            {filtered.length > 0 && (
              <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 dark:border-dark-700 text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(0) }}
                  className="border border-gray-200 dark:border-dark-600 rounded-lg px-1.5 py-1 bg-white dark:bg-dark-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-100">
                  {PAGE_SIZES.map(s => <option key={s} value={s}>{s}/pág.</option>)}
                </select>
                <div className="flex items-center gap-2">
                  <span>{start}-{end} de {filtered.length}</span>
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                      className="p-1 rounded hover:bg-gray-100 dark:hover:bg-dark-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                      className="p-1 rounded hover:bg-gray-100 dark:hover:bg-dark-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Painel de leitura */}
          <div className={cn(
            'flex-1 min-w-0 bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-xl overflow-hidden',
            !selectedId && 'hidden lg:block',
          )}>
            <IntimacaoReadingPanel
              item={selectedItem}
              tarefa={selectedItem ? tasksByRef[selectedItem.ref] || null : null}
              prazoCriadoEm={selectedItem && !tasksByRef[selectedItem.ref] ? prazoMap[selectedItem.id] || null : null}
              team={assignableTeam}
              canChangeResponsavel={!!selectedItem && (isManager || !tasksByRef[selectedItem.ref]?.assigned_to || tasksByRef[selectedItem.ref]?.assigned_to === profile?.user_id)}
              onChangeResponsavel={userId => selectedItem && changeResponsavel(selectedItem, userId)}
              onBack={() => setSelectedId(null)}
              onMarkStatus={s => selectedItem && markStatus(selectedItem.id, s)}
              onCriarPrazo={() => selectedItem && openPrazoModal(selectedItem)}
              onVerTarefa={() => navigate('/tarefas')}
            />
          </div>
        </div>

      </div>

      {oabSyncOpen && <OabSyncModal onDone={() => { setOabSyncOpen(false); load() }} />}

      {/* Criar tarefa de prazo */}
      {prazoItem && (
        <Modal open onClose={() => setPrazoItem(null)} title="Criar tarefa de prazo" size="md">
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              <strong>{prazoItem.numero_processo}</strong> — {prazoItem.conteudo}
              <br />
              <span className="text-xs text-gray-400">
                Disponibilizada no DJEN em {formatDate(prazoItem.publicacao)} · {prazoItem.tribunal}{prazoItem.orgao && prazoItem.orgao !== '—' ? ` — ${prazoItem.orgao}` : ''}
              </span>
            </p>

            <Select label="Regime de contagem" value={prazoRegime} onChange={e => changePrazoRegime(e.target.value as Regime)}>
              {REGIMES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </Select>
            {regimeReason && <p className="-mt-2 text-[11px] text-gray-400 dark:text-gray-500">Sugerido pelo tribunal/órgão: {regimeReason}. Confira.</p>}

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Prazo"
                type="number"
                min={1}
                value={prazoDias}
                onChange={e => setPrazoDias(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
              />
              <Select label="Unidade" value={prazoUnidade} onChange={e => setPrazoUnidade(e.target.value as Unit)}>
                <option value="dias_uteis">Dias úteis</option>
                <option value="dias_corridos">Dias corridos</option>
                <option value="meses">Meses</option>
              </Select>
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-700 dark:text-gray-200">
              <label className="flex items-center gap-2"><input type="checkbox" checked={prazoDobro} onChange={e => setPrazoDobro(e.target.checked)} /> Prazo em dobro</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={prazoRecesso} onChange={e => setPrazoRecesso(e.target.checked)} /> Suspende no recesso (20/12 a 20/01)</label>
            </div>
            {prazoDobro && (
              <Input label="Motivo do prazo em dobro *" value={prazoDobroMotivo} onChange={e => setPrazoDobroMotivo(e.target.value)} placeholder="Ex.: Fazenda Pública (CPC, art. 183) — não vale nos Juizados Federais" />
            )}

            <Select label="Responsável" value={prazoResponsavel} onChange={e => setPrazoResponsavel(e.target.value)}>
              {isManager && <option value="">Distribuir automaticamente (quem tem menos tarefas)</option>}
              {assignableTeam.map(t => <option key={t.user_id} value={t.user_id}>{t.name}{t.user_id === profile?.user_id ? ' (eu)' : ''}</option>)}
            </Select>

            {prazoCalc?.result ? (
              <div className="p-3 bg-primary-50 dark:bg-primary-900/20 rounded-xl space-y-1.5">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary-600 dark:text-primary-400 flex-shrink-0" />
                  <p className="text-sm font-semibold text-primary-700 dark:text-primary-400">
                    Prazo fatal: {formatDate(prazoCalc.result.fatalDate)}
                    <span className="font-normal text-primary-600/80 dark:text-primary-400/80"> · tarefa vence no prazo interno: {formatDate(prazoCalc.result.internalDate)}</span>
                  </p>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  Publicação: {formatDate(prazoCalc.result.referenceDate)} (1º dia útil após a disponibilização) · 1º dia contado: {formatDate(prazoCalc.result.startDate)}
                  {prazoCalendar.length > 0 ? ` · ${new Set(prazoCalendar.map(c => c.date)).size} dia(s) do calendário do tribunal considerados` : ' · sem feriados locais cadastrados para este tribunal'}
                </p>
                {prazoCalc.result.warnings.map(w => (
                  <p key={w} className="flex gap-1.5 text-[11px] text-amber-700 dark:text-amber-400"><AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />{w}</p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-red-500">{prazoCalc?.error}</p>
            )}

            <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-2.5">
              O cálculo considera feriados nacionais, recesso e o calendário cadastrado do tribunal. Feriados locais e
              suspensões não cadastrados não entram — confira a data com a fonte oficial antes de protocolar.
            </p>

            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setPrazoItem(null)}
                className="px-4 py-2 text-sm font-medium border border-gray-200 dark:border-dark-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
                Cancelar
              </button>
              <Button onClick={criarTarefaPrazo} loading={prazoSaving} disabled={!prazoCalc?.result}>Criar tarefa</Button>
            </div>
          </div>
        </Modal>
      )}
    </Layout>
  )
}
