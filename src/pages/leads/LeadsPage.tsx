import { usePageLoadingState } from '@/contexts/PageLoadingContext'
import { useEffect, useState, useCallback } from 'react'
import {
  Plus, Search, TrendingUp, Trash2, Phone, Mail, Facebook,
  MessageCircle, BarChart2, Users, Target, DollarSign, Zap,
  ChevronRight, X, Star, Calendar, ArrowUpRight, Edit2,
  CheckCircle, PhoneCall, AtSign, Video, FileText,
  Wifi, WifiOff, ExternalLink, Copy, Eye, EyeOff,
  RefreshCw, AlertCircle, Activity
} from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Button, Card, Badge, Modal, Input, Select, Textarea, EmptyState, Spinner } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { Lead } from '@/types'
import { formatDate, formatPhone, formatCurrency, LEAD_STATUS_COLORS, LEAD_STATUS_LABELS } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'

// ─── Extended types ────────────────────────────────────────────────────────────
interface ExtLead extends Lead {
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  utm_term?: string | null
  ad_campaign?: string | null
  ad_set?: string | null
  ad_name?: string | null
  lead_score?: number | null
  followup_date?: string | null
  meta_account_id?: string | null
  whatsapp_account_id?: string | null
  converted_at?: string | null
}

interface MetaAccount {
  id: string
  name: string
  account_id: string | null
  business_manager: string | null
  status: string
  daily_budget: number | null
  monthly_budget: number | null
  total_spend: number | null
  campaigns_count: number | null
  pixel_id: string | null
  access_token: string | null
  notes: string | null
  created_at: string
}

interface WhatsAppAccount {
  id: string
  name: string
  phone_number: string
  provider: string
  status: string
  api_url: string | null
  api_key: string | null
  instance_name: string | null
  webhook_url: string | null
  last_message_at: string | null
  notes: string | null
  created_at: string
}

interface LeadInteraction {
  id: string
  lead_id: string
  type: string
  content: string
  created_by: string | null
  created_at: string
}

// ─── Constants ─────────────────────────────────────────────────────────────────
const KANBAN_COLUMNS = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost']

const SOURCE_LABELS: Record<string, string> = {
  website: 'Site', referral: 'Indicação', social: 'Redes Sociais',
  ads: 'Anúncios', meta: 'Meta Ads', google: 'Google Ads', other: 'Outros',
}

const INTERACTION_TYPES = [
  { value: 'note', label: 'Anotação', icon: FileText, color: 'text-gray-500' },
  { value: 'call', label: 'Ligação', icon: PhoneCall, color: 'text-blue-500' },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, color: 'text-green-500' },
  { value: 'email', label: 'Email', icon: AtSign, color: 'text-purple-500' },
  { value: 'meeting', label: 'Reunião', icon: Video, color: 'text-orange-500' },
]

const META_STATUS: Record<string, { label: string; color: string }> = {
  active: { label: 'Ativa', color: 'bg-green-100 text-green-700' },
  paused: { label: 'Pausada', color: 'bg-yellow-100 text-yellow-700' },
  disabled: { label: 'Desativada', color: 'bg-red-100 text-red-700' },
}

const WA_PROVIDERS: Record<string, string> = {
  evolution: 'Evolution API', zapi: 'Z-API', wppconnect: 'WPPConnect',
  twilio: 'Twilio', official: 'WhatsApp Business API', other: 'Outro',
}

function scoreColor(s: number) {
  if (s >= 70) return 'text-green-600 bg-green-50'
  if (s >= 40) return 'text-yellow-600 bg-yellow-50'
  return 'text-red-500 bg-red-50'
}
function scoreLabel(s: number) {
  if (s >= 70) return 'Quente 🔥'
  if (s >= 40) return 'Morno'
  return 'Frio'
}

const EMPTY_LEAD_FORM = {
  name: '', email: '', phone: '', area: '', source: 'ads' as const,
  status: 'new' as const, value: '', notes: '', last_contact: '',
  utm_source: '', utm_medium: '', utm_campaign: '', utm_term: '',
  ad_campaign: '', ad_set: '', ad_name: '',
  lead_score: '0', followup_date: '',
  meta_account_id: '', whatsapp_account_id: '',
}

const EMPTY_META_FORM = {
  name: '', account_id: '', business_manager: '', status: 'active',
  daily_budget: '', monthly_budget: '', total_spend: '', campaigns_count: '',
  pixel_id: '', access_token: '', notes: '',
}

const EMPTY_WA_FORM = {
  name: '', phone_number: '', provider: 'evolution', status: 'disconnected',
  api_url: '', api_key: '', instance_name: '', webhook_url: '', notes: '',
}

// ═══════════════════════════════════════════════════════════════════════════════
export function LeadsPage() {
  const { profile } = useAuth()
  const [tab, setTab] = useState<'dashboard' | 'leads' | 'meta' | 'whatsapp'>('dashboard')

  // Data
  const [leads, setLeads] = useState<ExtLead[]>([])
  const [metaAccounts, setMetaAccounts] = useState<MetaAccount[]>([])
  const [waAccounts, setWaAccounts] = useState<WhatsAppAccount[]>([])
  const [interactions, setInteractions] = useState<LeadInteraction[]>([])
  const [loading, setLoading] = usePageLoadingState()

  // Leads UI
  const [view, setView] = useState<'list' | 'kanban'>('kanban')
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSource, setFilterSource] = useState('')
  const [leadModal, setLeadModal] = useState(false)
  const [leadForm, setLeadForm] = useState(EMPTY_LEAD_FORM)
  const [editLeadId, setEditLeadId] = useState<string | null>(null)
  const [detailLead, setDetailLead] = useState<ExtLead | null>(null)
  const [saving, setSaving] = useState(false)

  // Interaction
  const [interactionForm, setInteractionForm] = useState({ type: 'note', content: '' })
  const [addingInteraction, setAddingInteraction] = useState(false)

  // Meta UI
  const [metaModal, setMetaModal] = useState(false)
  const [metaForm, setMetaForm] = useState(EMPTY_META_FORM)
  const [editMetaId, setEditMetaId] = useState<string | null>(null)
  const [showToken, setShowToken] = useState<Record<string, boolean>>({})

  // WA UI
  const [waModal, setWaModal] = useState(false)
  const [waForm, setWaForm] = useState(EMPTY_WA_FORM)
  const [editWaId, setEditWaId] = useState<string | null>(null)
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({})

  // ─── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: l }, { data: m }, { data: w }] = await Promise.all([
      supabase.from('leads').select('*').is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('meta_accounts').select('*').is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('whatsapp_accounts').select('*').is('deleted_at', null).order('created_at', { ascending: false }),
    ])
    setLeads((l || []) as ExtLead[])
    setMetaAccounts(m || [])
    setWaAccounts(w || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function loadInteractions(leadId: string) {
    const { data } = await supabase
      .from('lead_interactions')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
    setInteractions(data || [])
  }

  function openDetail(lead: ExtLead) {
    setDetailLead(lead)
    loadInteractions(lead.id)
  }

  // ─── Leads CRUD ────────────────────────────────────────────────────────────
  function openNewLead() {
    setEditLeadId(null)
    setLeadForm(EMPTY_LEAD_FORM)
    setLeadModal(true)
  }

  function openEditLead(l: ExtLead) {
    setEditLeadId(l.id)
    setLeadForm({
      name: l.name, email: l.email || '', phone: l.phone || '', area: l.area || '',
      source: (l.source as any) || 'ads', status: (l.status as any) || 'new',
      value: l.value ? String(l.value) : '', notes: l.notes || '',
      last_contact: l.last_contact || '', utm_source: l.utm_source || '',
      utm_medium: l.utm_medium || '', utm_campaign: l.utm_campaign || '',
      utm_term: l.utm_term || '', ad_campaign: l.ad_campaign || '',
      ad_set: l.ad_set || '', ad_name: l.ad_name || '',
      lead_score: String(l.lead_score ?? 0), followup_date: l.followup_date || '',
      meta_account_id: l.meta_account_id || '', whatsapp_account_id: l.whatsapp_account_id || '',
    })
    setLeadModal(true)
  }

  async function saveLead() {
    if (!leadForm.name.trim()) return
    setSaving(true)
    const payload: any = {
      ...leadForm,
      value: leadForm.value ? parseFloat(leadForm.value) : null,
      lead_score: parseInt(leadForm.lead_score) || 0,
      last_contact: leadForm.last_contact || null,
      followup_date: leadForm.followup_date || null,
      meta_account_id: leadForm.meta_account_id || null,
      whatsapp_account_id: leadForm.whatsapp_account_id || null,
    }
    delete payload.lead_score_label
    if (editLeadId) {
      await supabase.from('leads').update(payload).eq('id', editLeadId)
    } else {
      await supabase.from('leads').insert(payload)
    }
    setSaving(false)
    setLeadModal(false)
    load()
  }

  async function deleteLead(id: string) {
    if (!confirm('Excluir este lead?')) return
    await supabase.from('leads').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (detailLead?.id === id) setDetailLead(null)
    load()
  }

  async function updateLeadStatus(id: string, status: string) {
    const converted_at = status === 'won' ? new Date().toISOString() : null
    await supabase.from('leads').update({ status, converted_at }).eq('id', id)
    load()
    if (detailLead?.id === id) setDetailLead(prev => prev ? { ...prev, status: status as any, converted_at } : null)
  }

  // ─── Interactions ──────────────────────────────────────────────────────────
  async function addInteraction() {
    if (!detailLead || !interactionForm.content.trim()) return
    setAddingInteraction(true)
    await supabase.from('lead_interactions').insert({
      lead_id: detailLead.id,
      type: interactionForm.type,
      content: interactionForm.content,
      created_by: profile?.name || profile?.display_name || null,
    })
    setInteractionForm({ type: 'note', content: '' })
    setAddingInteraction(false)
    loadInteractions(detailLead.id)
    // Update last_contact
    await supabase.from('leads').update({ last_contact: new Date().toISOString().split('T')[0] }).eq('id', detailLead.id)
    load()
  }

  // ─── Meta CRUD ─────────────────────────────────────────────────────────────
  function openNewMeta() {
    setEditMetaId(null)
    setMetaForm(EMPTY_META_FORM)
    setMetaModal(true)
  }

  function openEditMeta(m: MetaAccount) {
    setEditMetaId(m.id)
    setMetaForm({
      name: m.name, account_id: m.account_id || '',
      business_manager: m.business_manager || '', status: m.status,
      daily_budget: m.daily_budget ? String(m.daily_budget) : '',
      monthly_budget: m.monthly_budget ? String(m.monthly_budget) : '',
      total_spend: m.total_spend ? String(m.total_spend) : '',
      campaigns_count: m.campaigns_count ? String(m.campaigns_count) : '',
      pixel_id: m.pixel_id || '', access_token: m.access_token || '', notes: m.notes || '',
    })
    setMetaModal(true)
  }

  async function saveMeta() {
    if (!metaForm.name.trim()) return
    setSaving(true)
    const payload = {
      ...metaForm,
      daily_budget: metaForm.daily_budget ? parseFloat(metaForm.daily_budget) : null,
      monthly_budget: metaForm.monthly_budget ? parseFloat(metaForm.monthly_budget) : null,
      total_spend: metaForm.total_spend ? parseFloat(metaForm.total_spend) : null,
      campaigns_count: metaForm.campaigns_count ? parseInt(metaForm.campaigns_count) : null,
    }
    if (editMetaId) {
      await supabase.from('meta_accounts').update(payload).eq('id', editMetaId)
    } else {
      await supabase.from('meta_accounts').insert(payload)
    }
    setSaving(false)
    setMetaModal(false)
    load()
  }

  async function deleteMeta(id: string) {
    if (!confirm('Excluir esta conta Meta?')) return
    await supabase.from('meta_accounts').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    load()
  }

  // ─── WhatsApp CRUD ─────────────────────────────────────────────────────────
  function openNewWa() {
    setEditWaId(null)
    setWaForm(EMPTY_WA_FORM)
    setWaModal(true)
  }

  function openEditWa(w: WhatsAppAccount) {
    setEditWaId(w.id)
    setWaForm({
      name: w.name, phone_number: w.phone_number, provider: w.provider,
      status: w.status, api_url: w.api_url || '', api_key: w.api_key || '',
      instance_name: w.instance_name || '', webhook_url: w.webhook_url || '',
      notes: w.notes || '',
    })
    setWaModal(true)
  }

  async function saveWa() {
    if (!waForm.name.trim() || !waForm.phone_number.trim()) return
    setSaving(true)
    if (editWaId) {
      await supabase.from('whatsapp_accounts').update(waForm).eq('id', editWaId)
    } else {
      await supabase.from('whatsapp_accounts').insert(waForm)
    }
    setSaving(false)
    setWaModal(false)
    load()
  }

  async function deleteWa(id: string) {
    if (!confirm('Excluir esta conta WhatsApp?')) return
    await supabase.from('whatsapp_accounts').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    load()
  }

  async function toggleWaStatus(w: WhatsAppAccount) {
    const status = w.status === 'connected' ? 'disconnected' : 'connected'
    await supabase.from('whatsapp_accounts').update({ status }).eq('id', w.id)
    load()
  }

  // ─── Filtered leads ────────────────────────────────────────────────────────
  const filtered = leads.filter(l => {
    const matchSearch = !search || l.name.toLowerCase().includes(search.toLowerCase()) ||
      l.email?.toLowerCase().includes(search.toLowerCase()) || l.phone?.includes(search)
    const matchStatus = !filterStatus || l.status === filterStatus
    const matchSource = !filterSource || l.source === filterSource
    return matchSearch && matchStatus && matchSource
  })

  // ─── Dashboard stats ───────────────────────────────────────────────────────
  const now = new Date()
  const thisMonth = leads.filter(l => {
    if (!l.created_at) return false
    const d = new Date(l.created_at)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })
  const won = leads.filter(l => l.status === 'won')
  const pipeline = leads.filter(l => l.status !== 'won' && l.status !== 'lost' && !l.deleted_at)
  const pipelineValue = pipeline.reduce((acc, l) => acc + (l.value || 0), 0)
  const convRate = leads.length > 0 ? Math.round((won.length / leads.length) * 100) : 0
  const followups = leads.filter(l => l.followup_date && new Date(l.followup_date) >= now && l.status !== 'won' && l.status !== 'lost')
    .sort((a, b) => (a.followup_date || '') < (b.followup_date || '') ? -1 : 1)
    .slice(0, 5)

  const bySource = Object.entries(
    leads.reduce((acc, l) => { const k = l.source || 'other'; acc[k] = (acc[k] || 0) + 1; return acc }, {} as Record<string, number>)
  ).sort((a, b) => b[1] - a[1])

  const maxSource = bySource[0]?.[1] || 1

  // ─── Render ────────────────────────────────────────────────────────────────
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart2 },
    { id: 'leads', label: 'Leads / CRM', icon: TrendingUp },
    { id: 'meta', label: 'Contas Meta', icon: Facebook },
    { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  ] as const

  return (
    <Layout title="Leads & Tráfego Pago">
      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-6 bg-gray-100 dark:bg-dark-800 p-1 rounded-xl w-fit">
        {tabs.map(t => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                active
                  ? 'bg-white dark:bg-dark-700 text-primary-600 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {!loading && (
        <>
          {/* ════════════ DASHBOARD ════════════ */}
          {tab === 'dashboard' && (
            <div className="space-y-6">
              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {[
                  { label: 'Total Leads', value: leads.length, icon: Users, color: 'from-blue-500 to-blue-600' },
                  { label: 'Novos (mês)', value: thisMonth.length, icon: Plus, color: 'from-purple-500 to-purple-600' },
                  { label: 'Convertidos', value: won.length, icon: CheckCircle, color: 'from-green-500 to-green-600' },
                  { label: 'Conversão', value: `${convRate}%`, icon: Target, color: 'from-orange-500 to-orange-600' },
                  { label: 'Pipeline', value: formatCurrency(pipelineValue), icon: DollarSign, color: 'from-pink-500 to-pink-600' },
                ].map(s => {
                  const Icon = s.icon
                  return (
                    <Card key={s.label} className="p-4 relative overflow-hidden">
                      <div className={`absolute inset-0 bg-gradient-to-br ${s.color} opacity-5`} />
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{s.label}</p>
                        <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${s.color} flex items-center justify-center`}>
                          <Icon className="w-4 h-4 text-white" />
                        </div>
                      </div>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{s.value}</p>
                    </Card>
                  )
                })}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Funil */}
                <Card className="p-5 md:col-span-1">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary-500" /> Funil de Vendas
                  </h3>
                  <div className="space-y-2">
                    {KANBAN_COLUMNS.map((status, i) => {
                      const count = leads.filter(l => l.status === status).length
                      const pct = leads.length > 0 ? Math.round((count / leads.length) * 100) : 0
                      const colors = ['bg-blue-400', 'bg-purple-400', 'bg-yellow-400', 'bg-orange-400', 'bg-green-400', 'bg-red-400']
                      return (
                        <div key={status}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-gray-600 dark:text-gray-400">{LEAD_STATUS_LABELS[status]}</span>
                            <span className="font-semibold text-gray-700 dark:text-gray-300">{count}</span>
                          </div>
                          <div className="h-2 bg-gray-100 dark:bg-dark-700 rounded-full overflow-hidden">
                            <div className={`h-full ${colors[i]} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </Card>

                {/* Por origem */}
                <Card className="p-5 md:col-span-1">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-yellow-500" /> Leads por Origem
                  </h3>
                  {bySource.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-8">Nenhum dado</p>
                  ) : (
                    <div className="space-y-2">
                      {bySource.map(([src, count]) => (
                        <div key={src}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-gray-600 dark:text-gray-400">{SOURCE_LABELS[src] || src}</span>
                            <span className="font-semibold text-gray-700 dark:text-gray-300">{count}</span>
                          </div>
                          <div className="h-2 bg-gray-100 dark:bg-dark-700 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-primary-500 to-primary-400 rounded-full" style={{ width: `${(count / maxSource) * 100}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                {/* Contas ativas */}
                <Card className="p-5 md:col-span-1">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
                    <Wifi className="w-4 h-4 text-green-500" /> Contas Ativas
                  </h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                      <div className="flex items-center gap-2">
                        <Facebook className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Meta Ads</span>
                      </div>
                      <span className="text-lg font-bold text-blue-600">{metaAccounts.filter(m => m.status === 'active').length}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 dark:bg-green-900/20">
                      <div className="flex items-center gap-2">
                        <MessageCircle className="w-4 h-4 text-green-600" />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">WhatsApp</span>
                      </div>
                      <span className="text-lg font-bold text-green-600">{waAccounts.filter(w => w.status === 'connected').length}</span>
                    </div>
                    <button onClick={() => setTab('leads')} className="w-full text-xs text-primary-600 hover:underline flex items-center justify-center gap-1 mt-2">
                      Ver todos os leads <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </Card>
              </div>

              {/* Follow-ups */}
              {followups.length > 0 && (
                <Card className="p-5">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-orange-500" /> Próximos Follow-ups
                  </h3>
                  <div className="space-y-2">
                    {followups.map(l => (
                      <div key={l.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-700 cursor-pointer" onClick={() => { setTab('leads'); openDetail(l) }}>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-primary-400 flex items-center justify-center text-white text-sm font-bold">
                            {l.name[0]?.toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">{l.name}</p>
                            <p className="text-xs text-gray-400">{l.area || l.source}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-semibold text-orange-500">{formatDate(l.followup_date)}</p>
                          {l.lead_score != null && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${scoreColor(l.lead_score)}`}>
                              {l.lead_score}pts
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* ════════════ LEADS / CRM ════════════ */}
          {tab === 'leads' && (
            <div className="flex gap-4 h-full">
              {/* Main panel */}
              <div className={`flex-1 min-w-0 space-y-4 transition-all ${detailLead ? 'hidden md:block' : ''}`}>
                {/* Toolbar */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-200" placeholder="Buscar leads..." value={search} onChange={e => setSearch(e.target.value)} />
                  </div>
                  <select className="text-sm border border-gray-200 dark:border-dark-600 rounded-lg px-3 py-2 bg-white dark:bg-dark-800 text-gray-700 dark:text-gray-300" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                    <option value="">Todos os status</option>
                    {KANBAN_COLUMNS.map(s => <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>)}
                  </select>
                  <select className="text-sm border border-gray-200 dark:border-dark-600 rounded-lg px-3 py-2 bg-white dark:bg-dark-800 text-gray-700 dark:text-gray-300" value={filterSource} onChange={e => setFilterSource(e.target.value)}>
                    <option value="">Todas as origens</option>
                    {Object.entries(SOURCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <div className="flex rounded-lg border border-gray-200 dark:border-dark-600 overflow-hidden flex-shrink-0">
                    <button onClick={() => setView('kanban')} className={`px-3 py-2 text-sm ${view === 'kanban' ? 'bg-primary-600 text-white' : 'bg-white dark:bg-dark-800 text-gray-600 dark:text-gray-400'}`}>Kanban</button>
                    <button onClick={() => setView('list')} className={`px-3 py-2 text-sm ${view === 'list' ? 'bg-primary-600 text-white' : 'bg-white dark:bg-dark-800 text-gray-600 dark:text-gray-400'}`}>Lista</button>
                  </div>
                  <Button onClick={openNewLead} className="flex-shrink-0"><Plus className="w-4 h-4" /> Novo Lead</Button>
                </div>

                {/* Kanban */}
                {view === 'kanban' && (
                  <div className="flex gap-3 overflow-x-auto pb-4">
                    {KANBAN_COLUMNS.map(status => {
                      const col = filtered.filter(l => (l.status || 'new') === status)
                      const colValue = col.reduce((acc, l) => acc + (l.value || 0), 0)
                      return (
                        <div key={status} className="flex-shrink-0 w-60">
                          <div className="flex items-center justify-between mb-3 px-1">
                            <div className="flex items-center gap-2">
                              <Badge className={LEAD_STATUS_COLORS[status]}>{LEAD_STATUS_LABELS[status]}</Badge>
                              <span className="text-xs text-gray-400 font-medium">{col.length}</span>
                            </div>
                            {colValue > 0 && <span className="text-xs text-green-600 font-medium">{formatCurrency(colValue)}</span>}
                          </div>
                          <div className="space-y-2">
                            {col.map(l => (
                              <Card key={l.id} className="p-3 cursor-pointer hover:shadow-md transition-all border border-transparent hover:border-primary-200 dark:hover:border-primary-800" onClick={() => openDetail(l)}>
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <p className="font-medium text-sm text-gray-900 dark:text-white leading-tight">{l.name}</p>
                                  {l.lead_score != null && l.lead_score > 0 && (
                                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${scoreColor(l.lead_score)}`}>{l.lead_score}</span>
                                  )}
                                </div>
                                {l.area && <p className="text-xs text-gray-500 dark:text-gray-400">{l.area}</p>}
                                {l.ad_campaign && <p className="text-xs text-blue-500 truncate">📢 {l.ad_campaign}</p>}
                                <div className="flex items-center justify-between mt-2">
                                  {l.value ? <p className="text-xs font-semibold text-green-600">{formatCurrency(l.value)}</p> : <span />}
                                  {l.followup_date && new Date(l.followup_date) >= now && (
                                    <span className="text-xs text-orange-500 flex items-center gap-0.5"><Calendar className="w-3 h-3" />{formatDate(l.followup_date)}</span>
                                  )}
                                </div>
                                {l.phone && (
                                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100 dark:border-dark-700">
                                    <a href={`tel:${l.phone}`} onClick={e => e.stopPropagation()} className="text-gray-400 hover:text-blue-500 transition-colors"><PhoneCall className="w-3.5 h-3.5" /></a>
                                    <a href={`https://wa.me/${l.phone?.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-gray-400 hover:text-green-500 transition-colors"><MessageCircle className="w-3.5 h-3.5" /></a>
                                    {l.email && <a href={`mailto:${l.email}`} onClick={e => e.stopPropagation()} className="text-gray-400 hover:text-purple-500 transition-colors"><AtSign className="w-3.5 h-3.5" /></a>}
                                  </div>
                                )}
                              </Card>
                            ))}
                            {col.length === 0 && (
                              <div className="border-2 border-dashed border-gray-200 dark:border-dark-700 rounded-xl p-6 text-center">
                                <p className="text-xs text-gray-400">Nenhum lead</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* List */}
                {view === 'list' && (
                  filtered.length === 0 ? (
                    <EmptyState icon={TrendingUp} title="Nenhum lead encontrado" />
                  ) : (
                    <Card>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-100 dark:border-dark-700 text-left">
                              <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Nome</th>
                              <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Contato</th>
                              <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Campanha</th>
                              <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Score</th>
                              <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Valor</th>
                              <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Status</th>
                              <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Follow-up</th>
                              <th className="px-4 py-3" />
                            </tr>
                          </thead>
                          <tbody>
                            {filtered.map(l => (
                              <tr key={l.id} className="border-b border-gray-50 dark:border-dark-800 hover:bg-gray-50 dark:hover:bg-dark-800 cursor-pointer" onClick={() => openDetail(l)}>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary-500 to-primary-400 flex items-center justify-center text-white text-xs font-bold">{l.name[0]?.toUpperCase()}</div>
                                    <span className="font-medium text-gray-900 dark:text-white">{l.name}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  {l.phone && <p className="text-xs text-gray-500 flex items-center gap-1"><Phone className="w-3 h-3" />{formatPhone(l.phone)}</p>}
                                  {l.email && <p className="text-xs text-gray-500 flex items-center gap-1"><Mail className="w-3 h-3" />{l.email}</p>}
                                </td>
                                <td className="px-4 py-3">
                                  {l.ad_campaign && <p className="text-xs text-blue-600 dark:text-blue-400">{l.ad_campaign}</p>}
                                  <p className="text-xs text-gray-400">{SOURCE_LABELS[l.source || 'other']}</p>
                                </td>
                                <td className="px-4 py-3">
                                  {l.lead_score != null && l.lead_score > 0 && (
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${scoreColor(l.lead_score)}`}>{l.lead_score}pts</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{l.value ? formatCurrency(l.value) : '—'}</td>
                                <td className="px-4 py-3">
                                  <select className="text-xs border-0 bg-transparent text-gray-700 dark:text-gray-300 cursor-pointer" value={l.status || 'new'} onChange={e => { e.stopPropagation(); updateLeadStatus(l.id, e.target.value) }} onClick={e => e.stopPropagation()}>
                                    {KANBAN_COLUMNS.map(s => <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>)}
                                  </select>
                                </td>
                                <td className="px-4 py-3 text-xs text-orange-500">{l.followup_date ? formatDate(l.followup_date) : '—'}</td>
                                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                  <div className="flex items-center gap-1">
                                    <button onClick={() => openEditLead(l)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-700 text-gray-400"><Edit2 className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => deleteLead(l.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  )
                )}
              </div>

              {/* Detail drawer */}
              {detailLead && (
                <div className="w-full md:w-96 flex-shrink-0">
                  <Card className="p-5 sticky top-4">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-bold text-gray-900 dark:text-white text-lg">{detailLead.name}</h3>
                        <p className="text-xs text-gray-400">{detailLead.area || SOURCE_LABELS[detailLead.source || 'other']}</p>
                      </div>
                      <button onClick={() => setDetailLead(null)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-700 text-gray-400"><X className="w-4 h-4" /></button>
                    </div>

                    {/* Score + status */}
                    <div className="flex items-center gap-2 mb-4">
                      <select className="flex-1 text-sm border border-gray-200 dark:border-dark-600 rounded-lg px-2 py-1.5 bg-white dark:bg-dark-800 text-gray-700 dark:text-gray-300" value={detailLead.status || 'new'} onChange={e => updateLeadStatus(detailLead.id, e.target.value)}>
                        {KANBAN_COLUMNS.map(s => <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>)}
                      </select>
                      {detailLead.lead_score != null && (
                        <span className={`text-sm px-3 py-1.5 rounded-lg font-semibold ${scoreColor(detailLead.lead_score)}`}>
                          <Star className="w-3.5 h-3.5 inline mr-1" />{detailLead.lead_score} — {scoreLabel(detailLead.lead_score)}
                        </span>
                      )}
                    </div>

                    {/* Contact */}
                    <div className="space-y-1.5 mb-4">
                      {detailLead.phone && (
                        <div className="flex items-center gap-2">
                          <a href={`tel:${detailLead.phone}`} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400">
                            <Phone className="w-3.5 h-3.5" /> {formatPhone(detailLead.phone)}
                          </a>
                          <a href={`https://wa.me/${detailLead.phone?.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="ml-1 text-green-500 hover:text-green-600">
                            <MessageCircle className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      )}
                      {detailLead.email && (
                        <a href={`mailto:${detailLead.email}`} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-purple-600">
                          <Mail className="w-3.5 h-3.5" /> {detailLead.email}
                        </a>
                      )}
                      {detailLead.value && (
                        <p className="flex items-center gap-2 text-sm text-green-600 font-semibold">
                          <DollarSign className="w-3.5 h-3.5" /> {formatCurrency(detailLead.value)}
                        </p>
                      )}
                      {detailLead.followup_date && (
                        <p className="flex items-center gap-2 text-sm text-orange-500">
                          <Calendar className="w-3.5 h-3.5" /> Follow-up: {formatDate(detailLead.followup_date)}
                        </p>
                      )}
                    </div>

                    {/* Campaign info */}
                    {(detailLead.ad_campaign || detailLead.utm_campaign) && (
                      <div className="mb-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800">
                        <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1">📢 Origem da Campanha</p>
                        {detailLead.ad_campaign && <p className="text-xs text-gray-600 dark:text-gray-400">Campanha: {detailLead.ad_campaign}</p>}
                        {detailLead.ad_set && <p className="text-xs text-gray-600 dark:text-gray-400">Conjunto: {detailLead.ad_set}</p>}
                        {detailLead.ad_name && <p className="text-xs text-gray-600 dark:text-gray-400">Anúncio: {detailLead.ad_name}</p>}
                        {detailLead.utm_campaign && <p className="text-xs text-gray-600 dark:text-gray-400">UTM: {detailLead.utm_campaign}</p>}
                      </div>
                    )}

                    {detailLead.notes && (
                      <div className="mb-4 p-3 rounded-lg bg-gray-50 dark:bg-dark-700">
                        <p className="text-xs text-gray-500 dark:text-gray-400">{detailLead.notes}</p>
                      </div>
                    )}

                    <div className="flex gap-2 mb-5">
                      <button onClick={() => openEditLead(detailLead)} className="flex-1 flex items-center justify-center gap-1 text-sm py-2 rounded-lg border border-gray-200 dark:border-dark-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-dark-700">
                        <Edit2 className="w-3.5 h-3.5" /> Editar
                      </button>
                      <button onClick={() => deleteLead(detailLead.id)} className="flex items-center justify-center gap-1 text-sm py-2 px-3 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Interactions */}
                    <div>
                      <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-3">Histórico de Interações</p>
                      <div className="flex gap-2 mb-3">
                        <select className="text-xs border border-gray-200 dark:border-dark-600 rounded-lg px-2 py-1.5 bg-white dark:bg-dark-800 text-gray-700 dark:text-gray-300" value={interactionForm.type} onChange={e => setInteractionForm({ ...interactionForm, type: e.target.value })}>
                          {INTERACTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <input className="flex-1 text-xs border border-gray-200 dark:border-dark-600 rounded-lg px-3 py-2 bg-white dark:bg-dark-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-200" placeholder="Adicionar nota, ligação..." value={interactionForm.content} onChange={e => setInteractionForm({ ...interactionForm, content: e.target.value })} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addInteraction() } }} />
                        <button onClick={addInteraction} disabled={addingInteraction || !interactionForm.content.trim()} className="px-3 py-2 bg-primary-600 text-white rounded-lg text-xs hover:bg-primary-700 disabled:opacity-50 flex-shrink-0">
                          {addingInteraction ? '...' : <Plus className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                      <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                        {interactions.map(inter => {
                          const itype = INTERACTION_TYPES.find(t => t.value === inter.type) || INTERACTION_TYPES[0]
                          const IIcon = itype.icon
                          return (
                            <div key={inter.id} className="flex gap-2 p-2.5 rounded-lg bg-gray-50 dark:bg-dark-700">
                              <IIcon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${itype.color}`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-gray-700 dark:text-gray-300">{inter.content}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-xs text-gray-400">{inter.created_by || 'Sistema'}</span>
                                  <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
                                  <span className="text-xs text-gray-400">{new Date(inter.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                        {interactions.length === 0 && <p className="text-xs text-gray-400 text-center py-4">Nenhuma interação registrada</p>}
                      </div>
                    </div>
                  </Card>
                </div>
              )}
            </div>
          )}

          {/* ════════════ META ADS ════════════ */}
          {tab === 'meta' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">Contas Meta Ads</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Facebook, Instagram e Messenger</p>
                </div>
                <Button onClick={openNewMeta}><Plus className="w-4 h-4" /> Nova Conta</Button>
              </div>

              {metaAccounts.length === 0 ? (
                <EmptyState icon={Facebook} title="Nenhuma conta Meta cadastrada" description="Adicione suas contas de anúncios para gerenciar campanhas." />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {metaAccounts.map(m => (
                    <Card key={m.id} className="p-5">
                      {/* Header */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
                            <Facebook className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900 dark:text-white">{m.name}</p>
                            {m.account_id && <p className="text-xs text-gray-400 font-mono">act_{m.account_id}</p>}
                          </div>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${META_STATUS[m.status]?.color || 'bg-gray-100 text-gray-600'}`}>
                          {META_STATUS[m.status]?.label || m.status}
                        </span>
                      </div>

                      {/* Stats grid */}
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        {[
                          { label: 'Budget Diário', value: m.daily_budget ? formatCurrency(m.daily_budget) : '—' },
                          { label: 'Budget Mensal', value: m.monthly_budget ? formatCurrency(m.monthly_budget) : '—' },
                          { label: 'Gasto Total', value: m.total_spend ? formatCurrency(m.total_spend) : '—' },
                          { label: 'Campanhas', value: m.campaigns_count ?? '—' },
                        ].map(s => (
                          <div key={s.label} className="p-2.5 rounded-lg bg-gray-50 dark:bg-dark-700">
                            <p className="text-xs text-gray-400 mb-0.5">{s.label}</p>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">{s.value}</p>
                          </div>
                        ))}
                      </div>

                      {/* Extra info */}
                      {m.business_manager && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1">
                          <span className="font-medium">BM:</span> {m.business_manager}
                        </p>
                      )}
                      {m.pixel_id && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1">
                          <span className="font-medium">Pixel:</span> <span className="font-mono">{m.pixel_id}</span>
                        </p>
                      )}
                      {m.access_token && (
                        <div className="flex items-center gap-2 mb-3">
                          <p className="text-xs text-gray-500 dark:text-gray-400 flex-1 truncate">
                            <span className="font-medium">Token:</span> {showToken[m.id] ? m.access_token : '••••••••••••••••'}
                          </p>
                          <button onClick={() => setShowToken(prev => ({ ...prev, [m.id]: !prev[m.id] }))} className="text-gray-400 hover:text-gray-600">
                            {showToken[m.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={() => navigator.clipboard.writeText(m.access_token || '')} className="text-gray-400 hover:text-gray-600">
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                      {m.notes && <p className="text-xs text-gray-400 mb-3 italic">{m.notes}</p>}

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-3 border-t border-gray-100 dark:border-dark-700">
                        {m.account_id && (
                          <a href={`https://business.facebook.com/adsmanager/manage/campaigns?act=${m.account_id}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                            <ExternalLink className="w-3 h-3" /> Abrir no Meta
                          </a>
                        )}
                        <div className="flex-1" />
                        <button onClick={() => openEditMeta(m)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-700 text-gray-400 hover:text-gray-600"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => deleteMeta(m.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ════════════ WHATSAPP ════════════ */}
          {tab === 'whatsapp' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">Contas WhatsApp</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Gerencie seus números e instâncias</p>
                </div>
                <Button onClick={openNewWa}><Plus className="w-4 h-4" /> Nova Conta</Button>
              </div>

              {waAccounts.length === 0 ? (
                <EmptyState icon={MessageCircle} title="Nenhuma conta WhatsApp cadastrada" description="Adicione seus números para centralizar o atendimento." />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {waAccounts.map(w => (
                    <Card key={w.id} className="p-5">
                      {/* Header */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${w.status === 'connected' ? 'bg-gradient-to-br from-green-500 to-green-600' : 'bg-gray-200 dark:bg-dark-600'}`}>
                            <MessageCircle className={`w-5 h-5 ${w.status === 'connected' ? 'text-white' : 'text-gray-400'}`} />
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900 dark:text-white">{w.name}</p>
                            <p className="text-xs text-gray-400 font-mono">{formatPhone(w.phone_number)}</p>
                          </div>
                        </div>
                        <button onClick={() => toggleWaStatus(w)} className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium transition-all ${w.status === 'connected' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 hover:bg-green-200' : 'bg-gray-100 text-gray-500 dark:bg-dark-700 hover:bg-gray-200'}`}>
                          {w.status === 'connected' ? <><Wifi className="w-3 h-3" /> Conectado</> : <><WifiOff className="w-3 h-3" /> Desconectado</>}
                        </button>
                      </div>

                      {/* Provider */}
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 px-2 py-0.5 rounded-full font-medium">
                          {WA_PROVIDERS[w.provider] || w.provider}
                        </span>
                        {w.instance_name && <span className="text-xs text-gray-400 font-mono">{w.instance_name}</span>}
                      </div>

                      {/* API info */}
                      {w.api_url && (
                        <div className="mb-2">
                          <p className="text-xs text-gray-400 mb-0.5 font-medium">API URL</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400 font-mono truncate">{w.api_url}</p>
                        </div>
                      )}
                      {w.api_key && (
                        <div className="mb-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-gray-400 font-medium">API Key</p>
                            <div className="flex gap-1">
                              <button onClick={() => setShowApiKey(prev => ({ ...prev, [w.id]: !prev[w.id] }))} className="text-gray-400 hover:text-gray-600"><EyeOff className="w-3 h-3" /></button>
                              <button onClick={() => navigator.clipboard.writeText(w.api_key || '')} className="text-gray-400 hover:text-gray-600"><Copy className="w-3 h-3" /></button>
                            </div>
                          </div>
                          <p className="text-xs text-gray-600 dark:text-gray-400 font-mono truncate">{showApiKey[w.id] ? w.api_key : '••••••••••••••••'}</p>
                        </div>
                      )}
                      {w.webhook_url && (
                        <div className="mb-2">
                          <p className="text-xs text-gray-400 mb-0.5 font-medium">Webhook</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400 font-mono truncate">{w.webhook_url}</p>
                        </div>
                      )}
                      {w.last_message_at && (
                        <p className="text-xs text-gray-400 mb-2">Última msg: {new Date(w.last_message_at).toLocaleString('pt-BR')}</p>
                      )}
                      {w.notes && <p className="text-xs text-gray-400 italic mb-3">{w.notes}</p>}

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-3 border-t border-gray-100 dark:border-dark-700">
                        <a href={`https://web.whatsapp.com/`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-green-600 hover:underline">
                          <ExternalLink className="w-3 h-3" /> WhatsApp Web
                        </a>
                        <div className="flex-1" />
                        <button onClick={() => openEditWa(w)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-700 text-gray-400 hover:text-gray-600"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => deleteWa(w.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ════════════ MODAL: LEAD ════════════ */}
      <Modal open={leadModal} onClose={() => setLeadModal(false)} title={editLeadId ? 'Editar Lead' : 'Novo Lead'} size="md">
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <Input label="Nome *" value={leadForm.name} onChange={e => setLeadForm({ ...leadForm, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Email" type="email" value={leadForm.email} onChange={e => setLeadForm({ ...leadForm, email: e.target.value })} />
            <Input label="Telefone / WhatsApp" value={leadForm.phone} onChange={e => setLeadForm({ ...leadForm, phone: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Área de interesse" value={leadForm.area} onChange={e => setLeadForm({ ...leadForm, area: e.target.value })} />
            <Input label="Valor estimado (R$)" type="number" value={leadForm.value} onChange={e => setLeadForm({ ...leadForm, value: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Origem" value={leadForm.source} onChange={e => setLeadForm({ ...leadForm, source: e.target.value as any })}>
              {Object.entries(SOURCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
            <Select label="Status" value={leadForm.status} onChange={e => setLeadForm({ ...leadForm, status: e.target.value as any })}>
              {KANBAN_COLUMNS.map(s => <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Score do Lead (0–100)</label>
              <div className="flex items-center gap-3">
                <input type="range" min="0" max="100" value={leadForm.lead_score} onChange={e => setLeadForm({ ...leadForm, lead_score: e.target.value })} className="flex-1" />
                <span className={`text-sm font-bold px-2 py-0.5 rounded-lg ${scoreColor(parseInt(leadForm.lead_score))}`}>{leadForm.lead_score}</span>
              </div>
            </div>
            <Input label="Follow-up" type="date" value={leadForm.followup_date} onChange={e => setLeadForm({ ...leadForm, followup_date: e.target.value })} />
          </div>

          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide pt-2">Conta de Tráfego</p>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Conta Meta" value={leadForm.meta_account_id} onChange={e => setLeadForm({ ...leadForm, meta_account_id: e.target.value })}>
              <option value="">Nenhuma</option>
              {metaAccounts.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
            <Select label="Conta WhatsApp" value={leadForm.whatsapp_account_id} onChange={e => setLeadForm({ ...leadForm, whatsapp_account_id: e.target.value })}>
              <option value="">Nenhuma</option>
              {waAccounts.map(w => <option key={w.id} value={w.id}>{w.name} — {w.phone_number}</option>)}
            </Select>
          </div>

          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide pt-2">Dados da Campanha</p>
          <div className="grid grid-cols-3 gap-3">
            <Input label="Campanha" value={leadForm.ad_campaign} onChange={e => setLeadForm({ ...leadForm, ad_campaign: e.target.value })} />
            <Input label="Conjunto" value={leadForm.ad_set} onChange={e => setLeadForm({ ...leadForm, ad_set: e.target.value })} />
            <Input label="Anúncio" value={leadForm.ad_name} onChange={e => setLeadForm({ ...leadForm, ad_name: e.target.value })} />
          </div>

          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide pt-2">UTM Tracking</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="utm_source" value={leadForm.utm_source} onChange={e => setLeadForm({ ...leadForm, utm_source: e.target.value })} />
            <Input label="utm_medium" value={leadForm.utm_medium} onChange={e => setLeadForm({ ...leadForm, utm_medium: e.target.value })} />
            <Input label="utm_campaign" value={leadForm.utm_campaign} onChange={e => setLeadForm({ ...leadForm, utm_campaign: e.target.value })} />
            <Input label="utm_term" value={leadForm.utm_term} onChange={e => setLeadForm({ ...leadForm, utm_term: e.target.value })} />
          </div>

          <Input label="Último Contato" type="date" value={leadForm.last_contact} onChange={e => setLeadForm({ ...leadForm, last_contact: e.target.value })} />
          <Textarea label="Observações" value={leadForm.notes} onChange={e => setLeadForm({ ...leadForm, notes: e.target.value })} />
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={() => setLeadModal(false)}>Cancelar</Button>
          <Button onClick={saveLead} loading={saving}>Salvar Lead</Button>
        </div>
      </Modal>

      {/* ════════════ MODAL: META ════════════ */}
      <Modal open={metaModal} onClose={() => setMetaModal(false)} title={editMetaId ? 'Editar Conta Meta' : 'Nova Conta Meta'} size="md">
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <Input label="Nome da conta *" value={metaForm.name} onChange={e => setMetaForm({ ...metaForm, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="ID da Conta (act_XXXXX)" value={metaForm.account_id} onChange={e => setMetaForm({ ...metaForm, account_id: e.target.value })} />
            <Select label="Status" value={metaForm.status} onChange={e => setMetaForm({ ...metaForm, status: e.target.value })}>
              <option value="active">Ativa</option>
              <option value="paused">Pausada</option>
              <option value="disabled">Desativada</option>
            </Select>
          </div>
          <Input label="Business Manager (ID ou nome)" value={metaForm.business_manager} onChange={e => setMetaForm({ ...metaForm, business_manager: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Budget Diário (R$)" type="number" value={metaForm.daily_budget} onChange={e => setMetaForm({ ...metaForm, daily_budget: e.target.value })} />
            <Input label="Budget Mensal (R$)" type="number" value={metaForm.monthly_budget} onChange={e => setMetaForm({ ...metaForm, monthly_budget: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Gasto Total (R$)" type="number" value={metaForm.total_spend} onChange={e => setMetaForm({ ...metaForm, total_spend: e.target.value })} />
            <Input label="Qtd. Campanhas" type="number" value={metaForm.campaigns_count} onChange={e => setMetaForm({ ...metaForm, campaigns_count: e.target.value })} />
          </div>
          <Input label="Pixel ID" value={metaForm.pixel_id} onChange={e => setMetaForm({ ...metaForm, pixel_id: e.target.value })} />
          <Input label="Access Token" type="password" value={metaForm.access_token} onChange={e => setMetaForm({ ...metaForm, access_token: e.target.value })} />
          <Textarea label="Observações" value={metaForm.notes} onChange={e => setMetaForm({ ...metaForm, notes: e.target.value })} />
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={() => setMetaModal(false)}>Cancelar</Button>
          <Button onClick={saveMeta} loading={saving}>Salvar Conta</Button>
        </div>
      </Modal>

      {/* ════════════ MODAL: WHATSAPP ════════════ */}
      <Modal open={waModal} onClose={() => setWaModal(false)} title={editWaId ? 'Editar Conta WhatsApp' : 'Nova Conta WhatsApp'} size="md">
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Nome / Rótulo *" value={waForm.name} onChange={e => setWaForm({ ...waForm, name: e.target.value })} />
            <Input label="Número *" placeholder="5511999999999" value={waForm.phone_number} onChange={e => setWaForm({ ...waForm, phone_number: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Provedor" value={waForm.provider} onChange={e => setWaForm({ ...waForm, provider: e.target.value })}>
              {Object.entries(WA_PROVIDERS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
            <Select label="Status" value={waForm.status} onChange={e => setWaForm({ ...waForm, status: e.target.value })}>
              <option value="connected">Conectado</option>
              <option value="disconnected">Desconectado</option>
              <option value="banned">Banido</option>
            </Select>
          </div>
          <Input label="Nome da Instância" value={waForm.instance_name} onChange={e => setWaForm({ ...waForm, instance_name: e.target.value })} />
          <Input label="API URL" placeholder="https://api.exemplo.com" value={waForm.api_url} onChange={e => setWaForm({ ...waForm, api_url: e.target.value })} />
          <Input label="API Key / Token" type="password" value={waForm.api_key} onChange={e => setWaForm({ ...waForm, api_key: e.target.value })} />
          <Input label="Webhook URL" placeholder="https://seu-site.com/webhook" value={waForm.webhook_url} onChange={e => setWaForm({ ...waForm, webhook_url: e.target.value })} />
          <Textarea label="Observações" value={waForm.notes} onChange={e => setWaForm({ ...waForm, notes: e.target.value })} />
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={() => setWaModal(false)}>Cancelar</Button>
          <Button onClick={saveWa} loading={saving}>Salvar Conta</Button>
        </div>
      </Modal>
    </Layout>
  )
}
