import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Activity, AlertTriangle, BarChart3, CalendarPlus, ClipboardCheck, Inbox, LayoutGrid, RefreshCw, Settings2, ShieldCheck } from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Badge, Button, EmptyState, Spinner } from '@/components/ui'
import { toast } from '@/components/ui/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { cn, formatDate, toLocalISODate } from '@/lib/utils'
import {
  DEFAULT_SETTINGS, fetchCourtCalendar, fetchDeadlines, fetchDeadlineSettings, fetchHealth, fetchPendingCommunications, fetchProcessOptions, fetchTeam,
  importDjenCommunications, setDeadlinesEnabled, type CommunicationRow, type DeadlineSettings, type HealthSnapshot, type ProcessOption, type TeamMember,
} from '@/lib/deadlines/api'
import type { CourtCalendarRow } from '@/lib/deadlines/courtCalendar'
import { deadlineFlags, groupBoard, isClosed, STATUS_COLORS, STATUS_LABELS, type DeadlineRow } from '@/lib/deadlines/workflow'
import { DeadlineBoard } from './DeadlineBoard'
import { DeadlineDrawer } from './DeadlineDrawer'
import { DeadlineFormModal } from './DeadlineFormModal'
import { DeadlineSettingsModal } from './DeadlineSettingsModal'
import { HealthStrip } from './HealthStrip'
import { OfficesHealth } from './OfficesHealth'
import { ReportsTab } from './ReportsTab'
import { TriageInbox } from './TriageInbox'

type Tab = 'painel' | 'triar' | 'conferencia' | 'relatorios' | 'saude'
const TABS: Tab[] = ['painel', 'triar', 'conferencia', 'relatorios', 'saude']

export function PrazosPage() {
  const { profile } = useAuth()
  const me = profile?.id || ''
  const isSuperAdmin = profile?.role === 'super_admin'
  const isAdmin = isSuperAdmin || profile?.role === 'admin'
  const [params, setParams] = useSearchParams()
  const [settings, setSettings] = useState<DeadlineSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>(() => (TABS as string[]).includes(params.get('aba') || '') ? params.get('aba') as Tab : 'painel')
  const [deadlines, setDeadlines] = useState<DeadlineRow[]>([])
  const [pending, setPending] = useState<CommunicationRow[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [processes, setProcesses] = useState<ProcessOption[]>([])
  const [calendarRows, setCalendarRows] = useState<CourtCalendarRow[]>([])
  const [form, setForm] = useState<{ communication?: CommunicationRow | null; existing?: DeadlineRow | null } | null>(null)
  // Links dos alertas: /prazos?prazo=<id> abre a ficha; /prazos?aba=triar abre a caixa A triar.
  const [openId, setOpenId] = useState<string | null>(() => params.get('prazo'))
  const [importing, setImporting] = useState(false)
  const [health, setHealth] = useState<HealthSnapshot | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    if (params.has('prazo') || params.has('aba')) setParams({}, { replace: true })
  }, [params, setParams])

  const loadHealth = useCallback(async () => {
    if (profile?.tenant_id) setHealth(await fetchHealth(profile.tenant_id).catch(() => null))
  }, [profile?.tenant_id])

  const loadData = useCallback(async () => {
    const [d, p] = await Promise.all([fetchDeadlines(), fetchPendingCommunications()])
    setDeadlines(d); setPending(p)
  }, [])

  const importNew = useCallback(async (s: DeadlineSettings, silent: boolean) => {
    setImporting(true)
    try {
      const n = await importDjenCommunications(s.triage_owner_id)
      if (n > 0 || !silent) toast(n > 0 ? `${n} intimação(ões) nova(s) na caixa A triar.` : 'Nenhuma intimação nova do DJEN.', n > 0 ? 'success' : 'info')
      if (n > 0) await loadData()
    } catch (e) {
      toast(`Erro ao importar intimações: ${e instanceof Error ? e.message : ''}`, 'error')
    } finally {
      setImporting(false)
    }
  }, [loadData])

  useEffect(() => {
    if (!profile?.tenant_id) return
    let alive = true
    ;(async () => {
      setLoading(true)
      const s = await fetchDeadlineSettings(profile.tenant_id!)
      if (!alive) return
      setSettings(s)
      if (s.enabled) {
        const [t, pr, cal] = await Promise.all([fetchTeam(), fetchProcessOptions(), fetchCourtCalendar()])
        if (!alive) return
        setTeam(t); setProcesses(pr); setCalendarRows(cal)
        try { await loadData() } catch (e) { toast(e instanceof Error ? e.message : 'Erro ao carregar prazos', 'error') }
        void loadHealth()
        void importNew(s, true)
      }
      setLoading(false)
    })()
    return () => { alive = false }
  }, [profile?.tenant_id, loadData, importNew, loadHealth])

  const today = toLocalISODate()
  const open = useMemo(() => deadlines.filter(d => !isClosed(d.status)), [deadlines])
  const board = useMemo(() => groupBoard(open, today), [open, today])
  const toReview = open.filter(d => d.status === 'calculado' && d.reviewer_id === me)
  const counters = [
    { label: 'A triar', value: pending.length, alert: pending.length > 0, onClick: () => setTab('triar') },
    { label: 'Aguardando conferência', value: open.filter(d => d.status === 'calculado').length, alert: open.some(d => deadlineFlags(d, today).semConferente), onClick: () => setTab('conferencia') },
    { label: 'Vencem hoje', value: board.hoje.length, alert: board.hoje.length > 0, onClick: () => setTab('painel') },
    { label: 'Próximos 3 dias úteis', value: board.tres_dias.length, alert: false, onClick: () => setTab('painel') },
    { label: 'Prazo interno vencido', value: open.filter(d => deadlineFlags(d, today).internoVencido).length, alert: open.some(d => deadlineFlags(d, today).internoVencido), onClick: () => setTab('painel') },
  ]
  const openDeadline = deadlines.find(d => d.id === openId) || null

  async function enable() {
    if (!profile?.tenant_id) return
    const { error } = await setDeadlinesEnabled(profile.tenant_id, true)
    if (error) { toast(`Não foi possível ativar: ${error.message}`, 'error'); return }
    toast('Controle de Prazos ativado para este escritório.', 'success')
    window.location.reload()
  }

  if (loading) return <Layout title="Prazos"><div className="flex justify-center py-20"><Spinner /></div></Layout>

  if (!settings.enabled) {
    return (
      <Layout title="Prazos">
        <div className="max-w-xl mx-auto mt-10 rounded-2xl border border-slate-100 dark:border-dark-700 bg-white dark:bg-dark-800 p-8 text-center shadow-card">
          <ShieldCheck className="w-10 h-10 mx-auto text-primary-600 dark:text-primary-400" />
          <h1 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">Controle de Prazos em fase piloto</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Triagem de intimações, cálculo de prazos com memória de cálculo, dupla conferência e protocolo comprovado.
            A funcionalidade é liberada por escritório depois da validação do cálculo.
          </p>
          {isSuperAdmin && <Button className="mt-6" onClick={enable}>Ativar para este escritório</Button>}
        </div>
      </Layout>
    )
  }

  return (
    <Layout title="Prazos">
      <div className="space-y-5">
        {health && <HealthStrip snapshot={health} onChanged={loadHealth} />}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {counters.map(c => (
            <button key={c.label} onClick={c.onClick}
              className={cn('text-left rounded-2xl border p-4 bg-white dark:bg-dark-800 shadow-card transition-colors', c.alert ? 'border-red-200 dark:border-red-900/50' : 'border-slate-100 dark:border-dark-700')}>
              <p className="text-xs text-slate-500">{c.label}</p>
              <p className={cn('mt-1 text-2xl font-bold', c.alert ? 'text-red-600' : 'text-slate-900 dark:text-white')}>{c.value}</p>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-xl bg-slate-100 dark:bg-dark-800 p-1" role="tablist">
            {([['painel', 'Painel', LayoutGrid], ['triar', 'A triar', Inbox], ['conferencia', 'Conferência', ClipboardCheck], ['relatorios', 'Relatórios', BarChart3], ...(isSuperAdmin ? [['saude', 'Saúde (todos)', Activity] as const] : [])] as const).map(([id, label, Icon]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium', tab === id ? 'bg-white dark:bg-dark-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500')}>
                <Icon className="w-4 h-4" /> {label}
                {id === 'triar' && pending.length > 0 && <span className="ml-1 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">{pending.length}</span>}
                {id === 'conferencia' && toReview.length > 0 && <span className="ml-1 rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">{toReview.length}</span>}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {isAdmin && <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)} aria-label="Configurações de prazos"><Settings2 className="w-4 h-4" /></Button>}
            <Button variant="secondary" size="sm" onClick={() => importNew(settings, false)} loading={importing}><RefreshCw className="w-4 h-4" /> Buscar intimações</Button>
            <Button size="sm" onClick={() => setForm({})}><CalendarPlus className="w-4 h-4" /> Novo prazo</Button>
          </div>
        </div>

        {tab === 'painel' && <DeadlineBoard deadlines={open} team={team} processes={processes} calendar={[]} onOpen={d => setOpenId(d.id)} />}
        {tab === 'saude' && isSuperAdmin && <OfficesHealth calendarRows={calendarRows} />}
        {tab === 'relatorios' && <ReportsTab deadlines={deadlines} team={team} />}
        {tab === 'triar' && <TriageInbox items={pending} processes={processes} onCreateDeadline={c => setForm({ communication: c })} onChanged={loadData} />}
        {tab === 'conferencia' && (
          <div className="space-y-2">
            {toReview.length === 0 && <EmptyState icon={ClipboardCheck} title="Nada para você conferir" description="Os prazos em que você for o conferente aparecem aqui." />}
            {toReview.map(d => (
              <button key={d.id} onClick={() => setOpenId(d.id)} className="w-full text-left flex items-center justify-between gap-3 rounded-xl border border-slate-100 dark:border-dark-700 bg-white dark:bg-dark-800 p-4 shadow-card">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{d.act_type}</p>
                  <p className="text-xs text-slate-500">Fatal {formatDate(d.fatal_date)} · cadastrado por {team.find(t => t.id === d.created_by)?.name || '—'}</p>
                </div>
                <div className="flex items-center gap-2">
                  {d.manually_adjusted && <span title="Data ajustada manualmente" className="text-amber-600"><AlertTriangle className="w-4 h-4" /></span>}
                  <Badge className={STATUS_COLORS[d.status]}>{STATUS_LABELS[d.status]}</Badge>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {form && (
        <DeadlineFormModal open onClose={() => setForm(null)} onSaved={() => { setForm(null); setOpenId(null); loadData() }}
          me={me} team={team} processes={processes} calendarRows={calendarRows} settings={settings}
          communication={form.communication} existing={form.existing} />
      )}
      {settingsOpen && profile?.tenant_id && (
        <DeadlineSettingsModal tenantId={profile.tenant_id} settings={settings} team={team} onClose={() => setSettingsOpen(false)}
          onSaved={s => { setSettings(s); setSettingsOpen(false) }} />
      )}
      {openDeadline && !form && (
        <DeadlineDrawer deadline={openDeadline} onClose={() => setOpenId(null)} onChanged={loadData}
          onRecalculate={d => setForm({ existing: d })} me={me} team={team} processes={processes} settings={settings} />
      )}
    </Layout>
  )
}
