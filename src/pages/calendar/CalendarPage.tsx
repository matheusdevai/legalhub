import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Plus, Calendar, Trash2, ChevronLeft, ChevronRight,
  RefreshCw, Link2Off, ExternalLink,
  CheckCircle, AlertCircle, Loader,
  Clock, MapPin, Scale, User, List, LayoutGrid,
  CalendarDays, Target, Users, Gavel, Download, ArrowRight, Search, X,
} from 'lucide-react'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, isSameMonth, isToday, isSameDay, parseISO,
  addDays, startOfWeek, endOfWeek, addWeeks, subWeeks,
  isWithinInterval, addMonths, subMonths,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useNavigate } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { Button, Card, Badge, Modal, Input, Select, Textarea, EmptyState, Spinner } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { CalendarEvent, Process, Task } from '@/types'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { openExportWindow } from '@/lib/exportUtils'
import { useAuth } from '@/contexts/AuthContext'

// ─── Constants ────────────────────────────────────────────────────────────────
const GCAL_SCOPE = 'https://www.googleapis.com/auth/calendar'
const GCAL_API   = 'https://www.googleapis.com/calendar/v3'
const CLIENT_ID  = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

const TYPE_COLORS: Record<string, string> = {
  hearing:  'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
  deadline: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800',
  meeting:  'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
  task:     'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
}
const TYPE_DOT: Record<string, string> = {
  hearing: 'bg-red-500', deadline: 'bg-orange-500', meeting: 'bg-blue-500', task: 'bg-green-500',
}
const TYPE_BG: Record<string, string> = {
  hearing: 'bg-red-400', deadline: 'bg-orange-400', meeting: 'bg-blue-400', task: 'bg-green-400',
}
const TYPE_LABELS: Record<string, string> = {
  hearing: 'Audiência', deadline: 'Prazo', meeting: 'Reunião', task: 'Tarefa',
}
const TYPE_ICONS: Record<string, React.ElementType> = {
  hearing: Gavel, deadline: Target, meeting: Users, task: CheckCircle,
}

const EMPTY_FORM = {
  title: '', type: 'meeting' as 'hearing' | 'deadline' | 'meeting' | 'task',
  date: '', time: '', end_date: '', end_time: '',
  process_id: '', process_number: '', client_name: '',
  location: '', description: '',
  status: 'scheduled' as 'scheduled' | 'completed' | 'cancelled',
  sync_google: true,
}

// ─── Google helpers ───────────────────────────────────────────────────────────
function gTokenKey(uid: string)     { return `gcal_token_${uid}` }
function gEmailKey(uid: string)     { return `gcal_email_${uid}` }
function gConnectedKey(uid: string) { return `gcal_connected_${uid}` }

function getStoredToken(uid: string): string | null {
  try {
    const raw = localStorage.getItem(gTokenKey(uid))
    if (!raw) return null
    const { access_token, expires_at } = JSON.parse(raw)
    if (Date.now() > expires_at - 60_000) return null
    return access_token
  } catch { return null }
}
function storeToken(uid: string, token: string, expiresIn: number) {
  localStorage.setItem(gTokenKey(uid), JSON.stringify({ access_token: token, expires_at: Date.now() + expiresIn * 1000 }))
}
function clearToken(uid: string) {
  localStorage.removeItem(gTokenKey(uid))
  localStorage.removeItem(gEmailKey(uid))
  localStorage.removeItem(gConnectedKey(uid))
}
function wasConnected(uid: string) { return localStorage.getItem(gConnectedKey(uid)) === '1' }

async function gcalRequest(path: string, method = 'GET', token: string, body?: object) {
  const res = await fetch(`${GCAL_API}${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.error?.message || `HTTP ${res.status}`) }
  if (res.status === 204) return null
  return res.json()
}

function toGCalEvent(form: typeof EMPTY_FORM) {
  const description = [form.description, form.client_name ? `Cliente: ${form.client_name}` : '', form.process_number ? `Processo: ${form.process_number}` : ''].filter(Boolean).join('\n') || undefined
  if (form.time) {
    return {
      summary: form.title, location: form.location || undefined, description,
      start: { dateTime: `${form.date}T${form.time}:00`, timeZone: 'America/Sao_Paulo' },
      end:   { dateTime: `${form.end_date || form.date}T${form.end_time || form.time}:00`, timeZone: 'America/Sao_Paulo' },
    }
  }
  return {
    summary: form.title, location: form.location || undefined, description,
    start: { date: form.date },
    end:   { date: form.end_date || addDays(parseISO(form.date), 1).toISOString().slice(0, 10) },
  }
}

// ─── Mini Google icon ─────────────────────────────────────────────────────────
function GIcon({ className = 'w-3 h-3' }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

// ════════════════════════════════════════════════════════════════════════════
function isTaskEvent(ev: CalendarEvent) { return ev.id.startsWith('task_') }

export function CalendarPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const uid = profile?.user_id || profile?.id || ''

  const [events,    setEvents]    = useState<CalendarEvent[]>([])
  const [processes, setProcesses] = useState<Process[]>([])
  const [loading,   setLoading]   = useState(true)

  const [currentDate, setCurrentDate] = useState(new Date())
  const [view, setView]               = useState<'month' | 'week' | 'day' | 'list'>('month')
  const [modalOpen, setModalOpen]     = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [form, setForm]               = useState(EMPTY_FORM)
  const [saving, setSaving]           = useState(false)
  const [editId, setEditId]           = useState<string | null>(null)

  // Google state
  const [gToken,      setGToken]      = useState<string | null>(null)
  const [gEmail,      setGEmail]      = useState<string | null>(null)
  const [gConnecting, setGConnecting] = useState(false)
  const [gSyncing,    setGSyncing]    = useState(false)
  const [gMsg,        setGMsg]        = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [setupModal,  setSetupModal]  = useState(false)

  const [filterShowConcluded, setFilterShowConcluded] = useState(false)
  const [filterType, setFilterType]   = useState<string>('')
  const [search, setSearch] = useState('')
  const [overflowDay, setOverflowDay] = useState<Date | null>(null)

  // Restore token
  useEffect(() => {
    if (!uid) return
    const t = getStoredToken(uid)
    if (t) { setGToken(t); const e = localStorage.getItem(gEmailKey(uid)); if (e) setGEmail(e) }
  }, [uid])

  // Load GIS + silent refresh
  useEffect(() => {
    if (!CLIENT_ID || !uid) return
    function doSilentRefresh() {
      if (!wasConnected(uid) || !!getStoredToken(uid)) return
      const g = (window as any).google
      if (!g?.accounts?.oauth2) return
      g.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID, scope: GCAL_SCOPE + ' https://www.googleapis.com/auth/userinfo.email', prompt: '',
        callback: (resp: any) => {
          if (!resp.error && resp.access_token) {
            storeToken(uid, resp.access_token, resp.expires_in || 3600)
            setGToken(resp.access_token)
            const email = localStorage.getItem(gEmailKey(uid))
            if (email) setGEmail(email)
          }
        },
      }).requestAccessToken({ prompt: '' })
    }
    const existing = document.getElementById('gis-script')
    if (existing) { doSilentRefresh(); return }
    const s = document.createElement('script')
    s.id = 'gis-script'; s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true
    s.onload = doSilentRefresh
    document.body.appendChild(s)
  }, [uid])

  // ─── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!uid) return
    setLoading(true)
    const tenantId = profile?.tenant_id || ''
    const [{ data: e }, { data: p }, { data: t }] = await Promise.all([
      supabase.from('calendar_events').select('*').is('deleted_at', null).eq('user_id', uid).order('date').order('time'),
      supabase.from('processes').select('id,number,title').is('deleted_at', null).order('number'),
      supabase.from('tasks')
        .select('id,title,due_date,status,description,assigned_name,process_id')
        .eq('tenant_id', tenantId)
        .eq('assigned_to', uid)
        .not('due_date', 'is', null)
        .neq('status', 'done')
        .neq('status', 'cancelled')
        .is('deleted_at', null),
    ])
    const taskEvents: CalendarEvent[] = ((t || []) as Task[])
      .filter(task => task.due_date)
      .map(task => ({
        id: `task_${task.id}`,
        tenant_id: tenantId,
        title: task.title,
        type: 'task' as const,
        date: task.due_date!,
        time: null,
        end_date: null,
        end_time: null,
        process_id: task.process_id || null,
        process_number: null,
        client_name: task.assigned_name || null,
        location: null,
        description: task.description || null,
        status: 'scheduled' as const,
        google_event_id: null,
        user_id: uid,
        sync_google: false,
        created_at: null,
        deleted_at: null,
      }))
    setEvents([...(e || []), ...taskEvents])
    setProcesses((p || []) as Process[])
    setLoading(false)
  }, [uid, profile?.tenant_id])

  useEffect(() => { load() }, [load])

  // ─── Derived data ──────────────────────────────────────────────────────────
  const today = format(new Date(), 'yyyy-MM-dd')

  const upcomingEvents = useMemo(() =>
    events
      .filter(e => e.date >= today && e.status !== 'completed')
      .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''))
      .slice(0, 6),
    [events, today]
  )

  function matchesSearch(e: CalendarEvent) {
    if (!search) return true
    const q = search.toLowerCase()
    return Boolean(
      e.title?.toLowerCase().includes(q) ||
      e.location?.toLowerCase().includes(q) ||
      e.client_name?.toLowerCase().includes(q) ||
      e.description?.toLowerCase().includes(q)
    )
  }

  const applyFilters = (list: CalendarEvent[]) =>
    list.filter(e => {
      if (!filterShowConcluded && e.status === 'completed') return false
      if (filterType && e.type !== filterType) return false
      if (!matchesSearch(e)) return false
      return true
    })

  function eventsOnDay(date: Date) {
    return events
      .filter(e => { try { return isSameDay(parseISO(e.date), date) } catch { return false } })
      .filter(matchesSearch)
  }

  // Month data
  const monthStart = startOfMonth(currentDate)
  const monthEnd   = endOfMonth(currentDate)
  const days       = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const startDay   = getDay(monthStart)

  // Week data
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 })
  const weekEnd   = endOfWeek(currentDate, { weekStartsOn: 0 })
  const weekDays  = eachDayOfInterval({ start: weekStart, end: weekEnd })

  // List data — all events from current month onward
  const listEvents = useMemo(() =>
    applyFilters(events.filter(e => e.date >= format(monthStart, 'yyyy-MM-dd')))
      .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '')),
    [events, filterShowConcluded, filterType, monthStart, search]
  )

  // ─── Navigation ───────────────────────────────────────────────────────────
  function goBack() {
    if (view === 'month' || view === 'list') setCurrentDate(d => subMonths(d, 1))
    else if (view === 'week') setCurrentDate(d => subWeeks(d, 1))
    else setCurrentDate(d => addDays(d, -1))
  }
  function goForward() {
    if (view === 'month' || view === 'list') setCurrentDate(d => addMonths(d, 1))
    else if (view === 'week') setCurrentDate(d => addWeeks(d, 1))
    else setCurrentDate(d => addDays(d, 1))
  }
  function goToday() { setCurrentDate(new Date()) }

  function periodLabel() {
    if (view === 'month' || view === 'list') return format(currentDate, 'MMMM yyyy', { locale: ptBR })
    if (view === 'week') return `${format(weekStart, "d 'de' MMM", { locale: ptBR })} – ${format(weekEnd, "d 'de' MMM yyyy", { locale: ptBR })}`
    return format(currentDate, "EEEE, d 'de' MMMM yyyy", { locale: ptBR })
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────
  function openNew(date?: Date, type?: typeof EMPTY_FORM['type']) {
    setEditId(null)
    setForm({ ...EMPTY_FORM, date: date ? format(date, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'), type: type || 'meeting', sync_google: !!gToken })
    setModalOpen(true)
  }

  function openEdit(ev: CalendarEvent) {
    setEditId(ev.id)
    setForm({
      title: ev.title, type: (ev.type as any) || 'meeting', date: ev.date,
      time: ev.time || '', end_date: ev.end_date || '', end_time: ev.end_time || '',
      process_id: ev.process_id || '', process_number: ev.process_number || '',
      client_name: ev.client_name || '', location: ev.location || '',
      description: ev.description || '', status: (ev.status as any) || 'scheduled',
      sync_google: ev.sync_google ?? !!gToken,
    })
    setModalOpen(true)
  }

  async function save() {
    if (!form.title.trim() || !form.date) return
    setSaving(true)
    const selectedProcess = processes.find(p => p.id === form.process_id)
    const token = gToken || getStoredToken(uid)
    let googleEventId: string | null = editId ? (events.find(e => e.id === editId)?.google_event_id || null) : null

    if (token && form.sync_google) {
      try {
        const body = toGCalEvent(form)
        if (googleEventId) {
          await gcalRequest(`/calendars/primary/events/${googleEventId}`, 'PUT', token, body)
        } else {
          const res = await gcalRequest('/calendars/primary/events', 'POST', token, body)
          googleEventId = res?.id || null
        }
      } catch (e: any) { console.warn('Google push failed:', e.message) }
    }

    const payload: any = {
      ...form, process_number: selectedProcess?.number || form.process_number,
      process_id: form.process_id || null, end_date: form.end_date || null, end_time: form.end_time || null,
      google_event_id: form.sync_google && googleEventId ? googleEventId : (editId ? (events.find(e => e.id === editId)?.google_event_id || null) : null),
      user_id: uid || null,
    }

    const { error } = editId
      ? await supabase.from('calendar_events').update(payload).eq('id', editId)
      : await supabase.from('calendar_events').insert(payload)

    setSaving(false)
    if (error) { alert(`Erro ao salvar: ${error.message}`); return }
    if (token && form.sync_google && googleEventId) {
      setGMsg({ type: 'ok', text: '✓ Sincronizado com Google Calendar' })
      setTimeout(() => setGMsg(null), 4000)
    }
    setModalOpen(false)
    load()
  }

  async function deleteEvent(id: string) {
    if (!confirm('Deseja excluir este evento?')) return
    const ev = events.find(e => e.id === id)
    const token = gToken || getStoredToken(uid)
    if (ev?.google_event_id && token) {
      try { await gcalRequest(`/calendars/primary/events/${ev.google_event_id}`, 'DELETE', token) } catch {}
    }
    await supabase.from('calendar_events').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    setSelectedEvent(null)
    load()
  }

  async function markDone(id: string) {
    await supabase.from('calendar_events').update({ status: 'completed' }).eq('id', id)
    setSelectedEvent(null)
    load()
  }

  // ─── Google OAuth ──────────────────────────────────────────────────────────
  function connectGoogle() {
    if (!CLIENT_ID) { setSetupModal(true); return }
    setGConnecting(true)
    const g = (window as any).google
    if (!g?.accounts?.oauth2) { setGMsg({ type: 'err', text: 'Biblioteca Google não carregada.' }); setGConnecting(false); return }
    clearToken(uid); setGToken(null); setGEmail(null)
    g.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID, scope: GCAL_SCOPE + ' https://www.googleapis.com/auth/userinfo.email', prompt: 'consent',
      callback: async (resp: any) => {
        setGConnecting(false)
        if (resp.error) { setGMsg({ type: 'err', text: `Erro: ${resp.error}` }); return }
        storeToken(uid, resp.access_token, resp.expires_in || 3600)
        setGToken(resp.access_token)
        try {
          await gcalRequest('/calendars/primary', 'GET', resp.access_token)
          const info = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${resp.access_token}` } }).then(r => r.json())
          localStorage.setItem(gEmailKey(uid), info.email || ''); localStorage.setItem(gConnectedKey(uid), '1')
          setGEmail(info.email || ''); setGMsg({ type: 'ok', text: `✅ Google Calendar conectado: ${info.email}` })
        } catch (e: any) { clearToken(uid); setGToken(null); setGEmail(null); setGMsg({ type: 'err', text: `Erro ao verificar: ${e.message}` }) }
      },
    }).requestAccessToken()
  }

  function disconnectGoogle() { clearToken(uid); setGToken(null); setGEmail(null); setGMsg({ type: 'ok', text: 'Google Calendar desconectado.' }) }

  async function importFromGoogle() {
    const token = gToken || getStoredToken(uid)
    if (!token) { setGMsg({ type: 'err', text: 'Google Calendar não conectado.' }); return }
    setGSyncing(true); setGMsg(null)
    try {
      const now = new Date().toISOString()
      const future = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString()
      const data = await gcalRequest(`/calendars/primary/events?timeMin=${encodeURIComponent(now)}&timeMax=${encodeURIComponent(future)}&singleEvents=true&orderBy=startTime&maxResults=50`, 'GET', token)
      const existingIds = new Set(events.map(e => e.google_event_id).filter(Boolean))
      let imported = 0
      for (const item of data?.items || []) {
        if (item.status === 'cancelled' || existingIds.has(item.id)) continue
        const startDate = item.start?.date || item.start?.dateTime?.slice(0, 10)
        if (!startDate) continue
        const { error } = await supabase.from('calendar_events').insert({
          title: item.summary || 'Sem título', type: 'meeting', date: startDate,
          time: item.start?.dateTime ? item.start.dateTime.slice(11, 16) : null,
          end_date: item.end?.date || item.end?.dateTime?.slice(0, 10),
          end_time: item.end?.dateTime ? item.end.dateTime.slice(11, 16) : null,
          location: item.location || null, description: item.description || null,
          status: 'scheduled', google_event_id: item.id, user_id: uid, sync_google: true,
        })
        if (!error) imported++
      }
      setGMsg({ type: 'ok', text: `${imported} evento(s) importado(s) do Google Calendar.` }); load()
    } catch (e: any) {
      if (e.message?.includes('insufficient') || e.message?.includes('scope')) {
        clearToken(uid); setGToken(null); setGEmail(null)
        setGMsg({ type: 'err', text: '⚠️ Reconecte o Google Calendar para autorizar o escopo de Calendar.' })
      } else { setGMsg({ type: 'err', text: `Erro ao importar: ${e.message}` }) }
    }
    setGSyncing(false)
  }

  const gConnected = !!(gToken || getStoredToken(uid))

  function exportAll() {
    const TYPE_LABEL: Record<string, string> = { hearing: 'Audiência', deadline: 'Prazo', meeting: 'Reunião', task: 'Tarefa' }
    const STATUS_LABEL: Record<string, string> = { scheduled: 'Agendado', completed: 'Realizado', cancelled: 'Cancelado' }
    const STATUS_BADGE: Record<string, string> = { scheduled: 'blue', completed: 'green', cancelled: 'gray' }
    const TYPE_BADGE: Record<string, string> = { hearing: 'purple', deadline: 'red', meeting: 'blue', task: 'amber' }
    const byType = (type: string) => events.filter(e => e.type === type).length
    const csvContent = [
      'Título,Tipo,Data,Hora,Cliente,Local,Status',
      ...events.map(e =>
        `"${e.title}","${TYPE_LABEL[e.type || 'meeting'] ?? e.type ?? '—'}","${e.date ?? '—'}","${e.time ?? '—'}","${e.client_name || '—'}","${e.location || '—'}","${STATUS_LABEL[e.status || 'scheduled'] ?? ''}"`
      ),
    ].join('\n')
    openExportWindow({
      title: 'Relatório de Agenda',
      filename: 'agenda',
      stats: [
        { value: events.length, label: 'Total de eventos', accent: '#2563eb' },
        { value: byType('hearing'), label: 'Audiências', accent: '#7c3aed' },
        { value: byType('deadline'), label: 'Prazos', accent: '#dc2626' },
        { value: byType('meeting'), label: 'Reuniões', accent: '#16a34a' },
      ],
      columns: ['Título', 'Tipo', 'Data', 'Hora', 'Cliente', 'Local', 'Status'],
      rows: events.map(e => [
        { text: e.title, bold: true },
        { text: TYPE_LABEL[e.type || 'meeting'] ?? e.type ?? '—', badge: TYPE_BADGE[e.type || 'meeting'] ?? 'blue' },
        { text: e.date ? formatDate(e.date) : '—' },
        { text: e.time ?? '—' },
        { text: e.client_name ?? '—' },
        { text: e.location ?? '—' },
        { text: STATUS_LABEL[e.status || 'scheduled'] ?? e.status ?? '—', badge: STATUS_BADGE[e.status || 'scheduled'] ?? 'blue' },
      ]),
      csvContent,
    })
  }

  // ─── Render helpers ────────────────────────────────────────────────────────
  function EventPill({ ev, compact = false }: { ev: CalendarEvent; compact?: boolean }) {
    return (
      <button
        onClick={e => { e.stopPropagation(); setSelectedEvent(ev) }}
        className={cn('w-full text-left text-xs px-1.5 py-0.5 rounded border truncate hover:opacity-80 transition-opacity flex items-center gap-1', TYPE_COLORS[ev.type || 'meeting'])}
      >
        {ev.google_event_id && <GIcon className="w-2 h-2 flex-shrink-0" />}
        {!compact && ev.time && <span className="font-semibold flex-shrink-0">{ev.time.slice(0, 5)}</span>}
        <span className="truncate">{ev.title}</span>
      </button>
    )
  }

  // ─── Views ────────────────────────────────────────────────────────────────
  function MonthView() {
    return (
      <Card className="overflow-hidden flex flex-col" style={{ minHeight: 520 }}>
        <div className="grid grid-cols-7 border-b border-gray-100 dark:border-dark-700">
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
            <div key={d} className="py-2 text-center text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 flex-1">
          {Array.from({ length: startDay }).map((_, i) => (
            <div key={`e-${i}`} className="min-h-[100px] border-b border-r border-gray-100 dark:border-dark-700 bg-gray-50/40 dark:bg-dark-800/20" />
          ))}
          {days.map(day => {
            const dayEvents = applyFilters(eventsOnDay(day))
            const isCurrentDay = isToday(day)
            const isOtherMonth = !isSameMonth(day, currentDate)
            return (
              <div
                key={day.toISOString()}
                onClick={() => openNew(day)}
                className={cn(
                  'min-h-[100px] border-b border-r border-gray-100 dark:border-dark-700 p-1.5 cursor-pointer transition-colors',
                  isOtherMonth ? 'bg-gray-50/40 dark:bg-dark-800/20' : 'hover:bg-primary-50/30 dark:hover:bg-dark-700/20',
                )}
              >
                <div className={cn(
                  'w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium mb-1 mx-auto',
                  isCurrentDay ? 'bg-primary-600 text-white font-bold' : 'text-gray-700 dark:text-gray-300',
                )}>
                  {format(day, 'd')}
                </div>
                <div className="space-y-0.5">
                  {dayEvents.slice(0, 3).map(e => <EventPill key={e.id} ev={e} />)}
                  {dayEvents.length > 3 && (
                    <button
                      onClick={e => { e.stopPropagation(); setOverflowDay(day) }}
                      className="text-[10px] text-primary-600 dark:text-primary-400 hover:underline font-medium pl-1 text-left"
                    >
                      +{dayEvents.length - 3} mais
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </Card>
    )
  }

  function WeekView() {
    return (
      <Card className="overflow-hidden flex flex-col" style={{ minHeight: 520 }}>
        <div className="grid grid-cols-7 border-b border-gray-100 dark:border-dark-700">
          {weekDays.map(day => {
            const isCurrentDay = isToday(day)
            return (
              <div key={day.toISOString()} className="py-2.5 text-center border-r border-gray-100 dark:border-dark-700 last:border-0">
                <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                  {format(day, 'EEE', { locale: ptBR })}
                </p>
                <div className={cn(
                  'w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold mx-auto mt-0.5',
                  isCurrentDay ? 'bg-primary-600 text-white' : 'text-gray-700 dark:text-gray-300',
                )}>
                  {format(day, 'd')}
                </div>
              </div>
            )
          })}
        </div>
        <div className="grid grid-cols-7 flex-1">
          {weekDays.map(day => {
            const dayEvents = applyFilters(eventsOnDay(day))
              .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
            const isCurrentDay = isToday(day)
            return (
              <div
                key={day.toISOString()}
                onClick={() => openNew(day)}
                className={cn(
                  'border-r border-gray-100 dark:border-dark-700 last:border-0 p-2 cursor-pointer transition-colors min-h-[400px]',
                  isCurrentDay ? 'bg-primary-50/30 dark:bg-primary-900/10' : 'hover:bg-gray-50/50 dark:hover:bg-dark-700/20',
                )}
              >
                {dayEvents.length === 0 ? (
                  <div className="flex items-center justify-center h-12 opacity-0 hover:opacity-100 transition-opacity">
                    <Plus className="w-4 h-4 text-gray-300 dark:text-gray-600" />
                  </div>
                ) : (
                  <div className="space-y-1">
                    {dayEvents.map(e => (
                      <button
                        key={e.id}
                        onClick={ev => { ev.stopPropagation(); setSelectedEvent(e) }}
                        className={cn('w-full text-left rounded-lg p-2 border hover:opacity-80 transition-opacity', TYPE_COLORS[e.type || 'meeting'])}
                      >
                        {e.time && <p className="text-[10px] font-bold">{e.time.slice(0, 5)}</p>}
                        <p className="text-xs font-medium leading-tight truncate">{e.title}</p>
                        {e.client_name && <p className="text-[10px] opacity-70 truncate">{e.client_name}</p>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Card>
    )
  }

  function DayView() {
    const dayEvents = applyFilters(eventsOnDay(currentDate))
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
    const isCurrentDay = isToday(currentDate)

    // Time slots 7h–22h
    const hours = Array.from({ length: 16 }, (_, i) => i + 7)
    const timedEvents = dayEvents.filter(e => e.time)
    const allDayEvents = dayEvents.filter(e => !e.time)

    function eventsForHour(hour: number) {
      return timedEvents.filter(e => {
        const h = parseInt(e.time!.slice(0, 2))
        return h === hour
      })
    }

    return (
      <Card className="overflow-hidden flex flex-col" style={{ minHeight: 520 }}>
        {/* Day header */}
        <div className={cn('px-5 py-4 border-b border-gray-100 dark:border-dark-700 flex items-center justify-between', isCurrentDay && 'bg-primary-50/30 dark:bg-primary-900/10')}>
          <div>
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
              {format(currentDate, 'EEEE', { locale: ptBR })}
            </p>
            <h3 className={cn('text-2xl font-bold', isCurrentDay ? 'text-primary-600 dark:text-primary-400' : 'text-gray-900 dark:text-white')}>
              {format(currentDate, "d 'de' MMMM yyyy", { locale: ptBR })}
            </h3>
          </div>
          <Button size="sm" onClick={() => openNew(currentDate)}>
            <Plus className="w-3.5 h-3.5" /> Novo evento
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* All-day events */}
          {allDayEvents.length > 0 && (
            <div className="px-4 py-2 border-b border-gray-100 dark:border-dark-700 bg-gray-50/50 dark:bg-dark-800/30">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Dia inteiro</p>
              <div className="space-y-1">
                {allDayEvents.map(e => (
                  <button
                    key={e.id} onClick={() => setSelectedEvent(e)}
                    className={cn('w-full text-left text-xs font-medium px-3 py-1.5 rounded-lg border', TYPE_COLORS[e.type || 'meeting'])}
                  >
                    {e.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Time slots */}
          {dayEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
              <Calendar className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">Nenhum evento neste dia</p>
              <button onClick={() => openNew(currentDate)} className="mt-3 text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium">
                + Adicionar evento
              </button>
            </div>
          ) : (
            <div>
              {hours.map(hour => {
                const hourEvents = eventsForHour(hour)
                const isCurrentHour = isCurrentDay && new Date().getHours() === hour
                return (
                  <div
                    key={hour}
                    onClick={() => openNew(currentDate)}
                    className={cn(
                      'flex border-b border-gray-50 dark:border-dark-700/50 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-dark-700/20 transition-colors min-h-[52px]',
                      isCurrentHour && 'bg-primary-50/20 dark:bg-primary-900/5',
                    )}
                  >
                    <div className="w-14 flex-shrink-0 pt-2 pr-3 text-right">
                      <span className={cn('text-xs', isCurrentHour ? 'text-primary-600 font-bold' : 'text-gray-400 dark:text-gray-500')}>
                        {String(hour).padStart(2, '0')}:00
                      </span>
                    </div>
                    <div className="flex-1 py-1.5 pr-3 space-y-1">
                      {hourEvents.map(e => (
                        <button
                          key={e.id}
                          onClick={ev => { ev.stopPropagation(); setSelectedEvent(e) }}
                          className={cn('w-full text-left rounded-lg px-3 py-2 border hover:opacity-80 transition-opacity', TYPE_COLORS[e.type || 'meeting'])}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold">{e.time?.slice(0, 5)}{e.end_time && ` – ${e.end_time.slice(0, 5)}`}</span>
                            {e.google_event_id && <GIcon className="w-3 h-3" />}
                          </div>
                          <p className="text-xs font-semibold">{e.title}</p>
                          {e.client_name && <p className="text-[10px] opacity-75">{e.client_name}</p>}
                          {e.location && <p className="text-[10px] opacity-75 flex items-center gap-1"><MapPin className="w-2.5 h-2.5" />{e.location}</p>}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Card>
    )
  }

  function ListView() {
    // Group events by date
    const grouped = listEvents.reduce<Record<string, CalendarEvent[]>>((acc, e) => {
      acc[e.date] = acc[e.date] || []
      acc[e.date].push(e)
      return acc
    }, {})

    return (
      <div className="space-y-4">
        {listEvents.length === 0 ? (
          <EmptyState icon={Calendar} title="Nenhum evento" description="Não há eventos com os filtros selecionados." />
        ) : (
          Object.entries(grouped).map(([date, dayEvts]) => {
            const parsedDate = parseISO(date)
            const isCurrentDay = isToday(parsedDate)
            return (
              <div key={date}>
                <div className={cn('flex items-center gap-3 mb-2')}>
                  <div className={cn('text-xs font-bold px-2.5 py-1 rounded-full', isCurrentDay ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-dark-700 text-gray-600 dark:text-gray-300')}>
                    {isCurrentDay ? 'Hoje' : format(parsedDate, "EEE, d 'de' MMM", { locale: ptBR })}
                  </div>
                  <div className="flex-1 h-px bg-gray-100 dark:bg-dark-700" />
                </div>
                <div className="space-y-2">
                  {dayEvts.map(e => {
                    const Icon = TYPE_ICONS[e.type || 'meeting'] || Calendar
                    return (
                      <Card
                        key={e.id}
                        className="p-4 flex items-start gap-3 hover:shadow-md cursor-pointer transition-all border-l-4"
                        style={{ borderLeftColor: e.type === 'hearing' ? '#ef4444' : e.type === 'deadline' ? '#f97316' : e.type === 'task' ? '#22c55e' : '#3b82f6' }}
                        onClick={() => setSelectedEvent(e)}
                      >
                        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5', TYPE_COLORS[e.type || 'meeting'])}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-gray-900 dark:text-white text-sm">{e.title}</p>
                            <Badge className={cn('text-[10px]', TYPE_COLORS[e.type || 'meeting'])}>{TYPE_LABELS[e.type || 'meeting']}</Badge>
                            {e.status === 'completed' && <Badge className="text-[10px] bg-green-100 text-green-700 border-green-200">Realizado</Badge>}
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                            {e.time && (
                              <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                                <Clock className="w-3 h-3" />{e.time.slice(0, 5)}{e.end_time && ` – ${e.end_time.slice(0, 5)}`}
                              </span>
                            )}
                            {e.client_name && <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400"><User className="w-3 h-3" />{e.client_name}</span>}
                            {e.location && <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400"><MapPin className="w-3 h-3" />{e.location}</span>}
                            {e.process_number && <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400"><Scale className="w-3 h-3" />{e.process_number}</span>}
                          </div>
                        </div>
                        {e.google_event_id && <GIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                      </Card>
                    )
                  })}
                </div>
              </div>
            )
          })
        )}
      </div>
    )
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <Layout
      title="Agenda"
      actions={
        <Button onClick={() => openNew()}><Plus className="w-4 h-4" /> Novo evento</Button>
      }
    >
      {gMsg && (
        <div className={cn('mb-4 flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border', gMsg.type === 'ok' ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800' : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800')}>
          {gMsg.type === 'ok' ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          {gMsg.text}
          <button onClick={() => setGMsg(null)} className="ml-auto opacity-60 hover:opacity-100 text-lg leading-none">×</button>
        </div>
      )}

      {!loading && (
        <div className="flex gap-5 min-h-0">

          {/* ── Left sidebar ── */}
          <div className="w-[220px] flex-shrink-0 space-y-4">

            {/* Quick add */}
            <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 p-3 space-y-1.5">
              <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1 mb-2">Adicionar</p>
              {([
                { type: 'hearing',  label: 'Audiência', icon: Gavel,    color: 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20' },
                { type: 'deadline', label: 'Prazo',     icon: Target,   color: 'text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20' },
                { type: 'meeting',  label: 'Reunião',   icon: Users,    color: 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20' },
                { type: 'task',     label: 'Tarefa',    icon: CheckCircle, color: 'text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20' },
              ] as const).map(item => (
                <button
                  key={item.type}
                  onClick={() => openNew(new Date(), item.type)}
                  className={cn('w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors', item.color)}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  {item.label}
                </button>
              ))}
              <button
                onClick={exportAll}
                className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-dark-600 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Exportar agenda
              </button>
            </div>

            {/* Google Calendar */}
            <div className={cn(
              'rounded-xl border p-3 space-y-3',
              gConnected
                ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
                : 'bg-white dark:bg-dark-800 border-gray-200 dark:border-dark-700'
            )}>
              <div className="flex items-center gap-2 px-0.5">
                <GIcon className="w-4 h-4 flex-shrink-0" />
                <p className="text-[10px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Google Calendar</p>
              </div>

              {gConnected ? (
                <>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-green-600 dark:text-green-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-green-700 dark:text-green-400">Conectado</p>
                      {gEmail && <p className="text-[10px] text-green-600 dark:text-green-500 truncate">{gEmail}</p>}
                    </div>
                  </div>
                  <button
                    onClick={importFromGoogle}
                    disabled={gSyncing}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
                  >
                    {gSyncing ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    {gSyncing ? 'Importando...' : 'Importar eventos'}
                  </button>
                  <button
                    onClick={disconnectGoogle}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-dark-600 text-gray-500 dark:text-gray-400 hover:text-red-500 hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 text-xs font-medium transition-colors"
                  >
                    <Link2Off className="w-3.5 h-3.5" />
                    Desconectar
                  </button>
                </>
              ) : (
                <>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    Sincronize eventos com seu Google Calendar e importe compromissos.
                  </p>
                  <button
                    onClick={connectGoogle}
                    disabled={gConnecting}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border-2 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50 text-xs font-semibold transition-colors"
                  >
                    {gConnecting ? (
                      <Loader className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <GIcon className="w-3.5 h-3.5" />
                    )}
                    {gConnecting ? 'Conectando...' : 'Conectar Google Calendar'}
                  </button>
                </>
              )}
            </div>

            {/* Filtros */}
            <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 p-3 space-y-2.5">
              <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1">Filtros</p>

              <Select value={filterType} onChange={e => setFilterType(e.target.value)} label="">
                <option value="">Todos os tipos</option>
                <option value="hearing">Audiências</option>
                <option value="deadline">Prazos</option>
                <option value="meeting">Reuniões</option>
                <option value="task">Tarefas</option>
              </Select>

              <label className="flex items-center gap-2 cursor-pointer px-1 py-0.5">
                <input type="checkbox" checked={filterShowConcluded} onChange={e => setFilterShowConcluded(e.target.checked)} className="w-4 h-4 accent-primary-600 rounded" />
                <span className="text-xs text-gray-600 dark:text-gray-400">Mostrar realizados</span>
              </label>
            </div>

            {/* Próximos eventos */}
            <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 p-3">
              <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1 mb-2.5">Próximos</p>
              {upcomingEvents.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">Nenhum evento futuro</p>
              ) : (
                <div className="space-y-2">
                  {upcomingEvents.map(e => {
                    const parsedDate = parseISO(e.date)
                    const isCurrentDay = isToday(parsedDate)
                    return (
                      <button
                        key={e.id}
                        onClick={() => setSelectedEvent(e)}
                        className="w-full text-left group"
                      >
                        <div className="flex items-start gap-2">
                          <span className={cn('w-2 h-2 rounded-full mt-1.5 flex-shrink-0', TYPE_DOT[e.type || 'meeting'])} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">{e.title}</p>
                            <p className="text-[10px] text-gray-400 dark:text-gray-500">
                              {isCurrentDay ? 'Hoje' : format(parsedDate, "d 'de' MMM", { locale: ptBR })}
                              {e.time && ` · ${e.time.slice(0, 5)}`}
                            </p>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Main ── */}
          <div className="flex-1 min-w-0 space-y-3">

            {/* Toolbar */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* Nav */}
              <div className="flex items-center gap-1">
                <button onClick={goBack} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-700 text-gray-600 dark:text-gray-300">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button onClick={goForward} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-700 text-gray-600 dark:text-gray-300">
                  <ChevronRight className="w-5 h-5" />
                </button>
                <button onClick={goToday} className="ml-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 dark:border-dark-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
                  Hoje
                </button>
              </div>

              {/* Period label */}
              <h2 className="text-base font-semibold text-gray-900 dark:text-white capitalize flex-1">
                {periodLabel()}
              </h2>

              {/* Busca */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  className="pl-8 pr-7 py-1.5 text-xs border border-gray-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 w-48"
                  placeholder="Buscar evento..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* View toggle */}
              <div className="flex rounded-lg border border-gray-200 dark:border-dark-600 overflow-hidden bg-white dark:bg-dark-800">
                {([
                  { key: 'month', label: 'Mês',    icon: LayoutGrid },
                  { key: 'week',  label: 'Semana', icon: CalendarDays },
                  { key: 'day',   label: 'Dia',    icon: Calendar },
                  { key: 'list',  label: 'Lista',  icon: List },
                ] as const).map((v, i) => (
                  <button
                    key={v.key}
                    onClick={() => setView(v.key)}
                    title={v.label}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors',
                      i > 0 && 'border-l border-gray-200 dark:border-dark-600',
                      view === v.key
                        ? 'bg-primary-600 text-white'
                        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-dark-700',
                    )}
                  >
                    <v.icon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{v.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* View content */}
            {view === 'month' && <MonthView />}
            {view === 'week'  && <WeekView />}
            {view === 'day'   && <DayView />}
            {view === 'list'  && <ListView />}
          </div>
        </div>
      )}

      {/* ═══ FORM MODAL ═══ */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Editar Evento' : 'Novo Evento'} size="md">
        <div className="space-y-4">
          {/* Type selector (visual pills) */}
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Tipo de evento</p>
            <div className="grid grid-cols-4 gap-2">
              {([
                { type: 'hearing',  label: 'Audiência', icon: Gavel },
                { type: 'deadline', label: 'Prazo',     icon: Target },
                { type: 'meeting',  label: 'Reunião',   icon: Users },
                { type: 'task',     label: 'Tarefa',    icon: CheckCircle },
              ] as const).map(item => (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, type: item.type }))}
                  className={cn(
                    'flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2 text-xs font-semibold transition-all',
                    form.type === item.type
                      ? TYPE_COLORS[item.type].replace('border-', 'border-2 border-') + ' shadow-sm'
                      : 'border-gray-200 dark:border-dark-600 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-dark-500',
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <Input label="Título *" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder={form.type === 'hearing' ? 'Ex: Audiência de instrução - Vara Cível 3ª' : form.type === 'deadline' ? 'Ex: Prazo recursal - Apelação' : 'Título do evento'} />

          <div className="grid grid-cols-2 gap-4">
            <Input label="Data início *" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            <Input label="Hora início" type="time" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Data fim" type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
            <Input label="Hora fim" type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select label="Status" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as any }))}>
              <option value="scheduled">Agendado</option>
              <option value="completed">Realizado</option>
              <option value="cancelled">Cancelado</option>
            </Select>
            <Select label="Processo" value={form.process_id} onChange={e => setForm(f => ({ ...f, process_id: e.target.value }))}>
              <option value="">Nenhum</option>
              {processes.map(p => <option key={p.id} value={p.id}>{p.number} — {p.title}</option>)}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input label="Cliente" value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} placeholder="Nome do cliente" />
            <Input label="Local" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder={form.type === 'hearing' ? 'Ex: Vara Cível 3ª' : 'Local do evento'} />
          </div>

          <Textarea label="Observações" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Detalhes adicionais..." />

          {/* Google sync */}
          <div className={cn('flex items-center gap-3 p-3 rounded-xl border', gConnected ? 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/10' : 'border-gray-200 dark:border-dark-600 bg-gray-50 dark:bg-dark-700/30')}>
            <label className="flex items-center gap-2.5 cursor-pointer flex-1">
              <input type="checkbox" checked={form.sync_google} disabled={!gConnected} onChange={e => setForm(f => ({ ...f, sync_google: e.target.checked }))} className="w-4 h-4 accent-blue-600" />
              <div>
                <div className="flex items-center gap-1.5">
                  <GIcon className="w-4 h-4" />
                  <span className="text-sm font-medium text-gray-900 dark:text-white">Sincronizar com Google Calendar</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{gConnected ? `Conta: ${gEmail || 'conectado'}` : 'Conecte sua conta Google para sincronizar'}</p>
              </div>
            </label>
            {!gConnected && (
              <button type="button" onClick={() => { setModalOpen(false); connectGoogle() }} className="text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline whitespace-nowrap">
                Conectar →
              </button>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
          <Button onClick={save} loading={saving} disabled={!form.title.trim() || !form.date}>
            {saving ? 'Salvando...' : editId ? 'Salvar alterações' : 'Criar evento'}
          </Button>
        </div>
      </Modal>

      {/* ═══ VIEW MODAL ═══ */}
      <Modal open={!!selectedEvent} onClose={() => setSelectedEvent(null)} title="Detalhes do Evento" size="sm">
        {selectedEvent && (() => {
          const Icon = TYPE_ICONS[selectedEvent.type || 'meeting'] || Calendar
          return (
            <div className="space-y-4">
              {/* Header */}
              <div className={cn('flex items-start gap-3 p-3 rounded-xl border', TYPE_COLORS[selectedEvent.type || 'meeting'])}>
                <div className="mt-0.5"><Icon className="w-5 h-5" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">{TYPE_LABELS[selectedEvent.type || 'meeting']}</p>
                  <h3 className="font-bold text-base leading-tight mt-0.5">{selectedEvent.title}</h3>
                </div>
                {selectedEvent.google_event_id && <GIcon className="w-5 h-5 flex-shrink-0" />}
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-0.5">
                  <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase">Data</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{formatDate(selectedEvent.date)}</p>
                </div>
                {selectedEvent.time && (
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase">Horário</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {selectedEvent.time.slice(0, 5)}{selectedEvent.end_time && ` – ${selectedEvent.end_time.slice(0, 5)}`}
                    </p>
                  </div>
                )}
                {selectedEvent.client_name && (
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase">Cliente</p>
                    <p className="text-sm text-gray-900 dark:text-white">{selectedEvent.client_name}</p>
                  </div>
                )}
                {selectedEvent.location && (
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase">Local</p>
                    <p className="text-sm text-gray-900 dark:text-white">{selectedEvent.location}</p>
                  </div>
                )}
                {selectedEvent.process_number && (
                  <div className="col-span-2 space-y-0.5">
                    <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase">Processo</p>
                    <p className="text-sm font-mono text-gray-900 dark:text-white">{selectedEvent.process_number}</p>
                  </div>
                )}
              </div>

              {selectedEvent.description && (
                <div className="space-y-0.5">
                  <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase">Observações</p>
                  <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap bg-gray-50 dark:bg-dark-700/50 rounded-lg p-3">{selectedEvent.description}</p>
                </div>
              )}

              {selectedEvent.google_event_id && (
                <a
                  href={`https://calendar.google.com/calendar/event?eid=${btoa(selectedEvent.google_event_id + ' primary')}`}
                  target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Abrir no Google Calendar
                </a>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-dark-700">
                {isTaskEvent(selectedEvent) ? (
                  <>
                    <div className="flex-1 text-xs text-gray-400 dark:text-gray-500">
                      Tarefa cadastrada em <span className="font-medium text-gray-600 dark:text-gray-300">/Tarefas</span>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => { setSelectedEvent(null); navigate('/tarefas') }}>
                      <ArrowRight className="w-3.5 h-3.5" /> Ver tarefas
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setSelectedEvent(null)}>Fechar</Button>
                  </>
                ) : (
                  <>
                    <Button variant="danger" size="sm" onClick={() => deleteEvent(selectedEvent.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                    {selectedEvent.status !== 'completed' && (
                      <Button variant="secondary" size="sm" onClick={() => markDone(selectedEvent.id)}>
                        <CheckCircle className="w-3.5 h-3.5" /> Marcar como realizado
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => { setSelectedEvent(null); openEdit(selectedEvent) }} className="ml-auto">
                      Editar
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setSelectedEvent(null)}>Fechar</Button>
                  </>
                )}
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* ═══ DAY OVERFLOW MODAL ═══ */}
      {overflowDay && (() => {
        const dayEvts = applyFilters(eventsOnDay(overflowDay))
          .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
        const title = format(overflowDay, "EEEE, d 'de' MMMM", { locale: ptBR })
        return (
          <Modal
            open={!!overflowDay}
            onClose={() => setOverflowDay(null)}
            title={title.charAt(0).toUpperCase() + title.slice(1)}
            size="md"
          >
            <div className="space-y-2 -mx-6 -mb-6">
              <p className="px-6 pb-2 text-xs text-gray-400">{dayEvts.length} compromisso{dayEvts.length !== 1 ? 's' : ''}</p>
              <div className="divide-y divide-gray-100 dark:divide-dark-700 max-h-[420px] overflow-y-auto">
                {dayEvts.map(ev => {
                  const Icon = TYPE_ICONS[ev.type || 'meeting'] || Calendar
                  const colorClass = TYPE_COLORS[ev.type || 'meeting']
                  return (
                    <button
                      key={ev.id}
                      onClick={() => { setOverflowDay(null); setSelectedEvent(ev) }}
                      className="w-full flex items-start gap-3 px-6 py-3 hover:bg-gray-50 dark:hover:bg-dark-700/40 transition-colors text-left"
                    >
                      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5', colorClass)}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{ev.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {ev.time && (
                            <span className="text-[11px] text-gray-400 flex items-center gap-0.5">
                              <Clock className="w-3 h-3" />
                              {ev.time.slice(0, 5)}{ev.end_time && ` – ${ev.end_time.slice(0, 5)}`}
                            </span>
                          )}
                          {ev.client_name && (
                            <span className="text-[11px] text-gray-400 flex items-center gap-0.5">
                              <User className="w-3 h-3" />
                              {ev.client_name}
                            </span>
                          )}
                        </div>
                        {ev.location && (
                          <p className="text-[11px] text-gray-400 flex items-center gap-0.5 mt-0.5">
                            <MapPin className="w-3 h-3" />{ev.location}
                          </p>
                        )}
                      </div>
                      <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0', colorClass)}>
                        {TYPE_LABELS[ev.type || 'meeting']}
                      </span>
                    </button>
                  )
                })}
              </div>
              <div className="px-6 py-3 border-t border-gray-100 dark:border-dark-700 flex justify-between items-center">
                <button
                  onClick={() => { setOverflowDay(null); openNew(overflowDay) }}
                  className="text-xs text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Novo compromisso neste dia
                </button>
                <Button variant="ghost" size="sm" onClick={() => setOverflowDay(null)}>Fechar</Button>
              </div>
            </div>
          </Modal>
        )
      })()}

      {/* ═══ GOOGLE SETUP MODAL ═══ */}
      <Modal open={setupModal} onClose={() => setSetupModal(false)} title="Como configurar o Google Calendar" size="md">
        <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
          {[
            { step: '1', title: 'Acesse o Google Cloud Console', desc: 'Abra console.cloud.google.com e crie ou selecione um projeto.', link: 'https://console.cloud.google.com/', linkText: 'Abrir Console →' },
            { step: '2', title: 'Ative a Calendar API', desc: '"APIs e Serviços" → "Biblioteca" → pesquise "Google Calendar API" → Ativar.' },
            { step: '3', title: 'Crie credenciais OAuth 2.0', desc: '"Credenciais" → "Criar" → "ID do Cliente OAuth" → "Aplicativo da Web". Em origens JavaScript autorizadas adicione:', code: 'https://lawfy-saas.vercel.app\nhttp://localhost:5173' },
            { step: '4', title: 'Copie o Client ID', desc: 'Copie o ID gerado (formato: XXXXX.apps.googleusercontent.com).' },
            { step: '5', title: 'Configure no .env e no Vercel', desc: 'No arquivo .env local e em Settings → Environment Variables no Vercel, adicione:', code: 'VITE_GOOGLE_CLIENT_ID = seu_client_id_aqui' },
            { step: '6', title: 'Novo deploy', desc: 'Faça um novo deploy no Vercel para aplicar a variável. No sidebar da Agenda aparecerá o botão de conexão.' },
          ].map(s => (
            <div key={s.step} className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">{s.step}</div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">{s.title}</p>
                <p className="text-gray-500 dark:text-gray-400 mt-0.5 text-xs">{s.desc}</p>
                {s.code && <code className="block mt-1 px-3 py-1.5 bg-gray-100 dark:bg-dark-700 rounded-lg text-xs font-mono">{s.code}</code>}
                {s.link && <a href={s.link} target="_blank" rel="noreferrer" className="text-primary-600 dark:text-primary-400 hover:underline text-xs flex items-center gap-1 mt-1">{s.linkText} <ExternalLink className="w-3 h-3" /></a>}
              </div>
            </div>
          ))}
          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => setSetupModal(false)}>Fechar</Button>
          </div>
        </div>
      </Modal>
    </Layout>
  )
}
