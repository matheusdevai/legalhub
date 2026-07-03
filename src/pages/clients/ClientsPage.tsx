import { usePageLoadingState } from '@/contexts/PageLoadingContext'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Plus, Search, Users, Phone, Mail, Trash2, Download,
  UserCheck, Briefcase, MapPin, Scale, Calendar, Edit3,
  FileText, X, CheckCircle2, Clock, CheckSquare, ChevronDown,
  AlertCircle, Info,
} from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Button, Card, Badge, Modal, Input, Select, Textarea, EmptyState, Spinner } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { Client, Colaborador, Process, Profile } from '@/types'
import { formatDate, formatPhone, formatCPFCNPJ, formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { openExportWindow } from '@/lib/exportUtils'

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  inactive: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  prospect: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
}
const STATUS_LABELS: Record<string, string> = { active: 'Ativo', inactive: 'Inativo', prospect: 'Prospect' }
const STATUS_DOT: Record<string, string> = { active: 'bg-green-500', inactive: 'bg-gray-400', prospect: 'bg-blue-500' }

type ClientForm = {
  type: 'pf' | 'pj'; name: string; cpf_cnpj: string; email: string; phone: string;
  address: string; status: string; notes: string; assunto: string; cidade: string;
  colaborador_id: string; assigned_lawyer: string; assigned_lawyer_uid: string;
  entry_date: string; modalidade: string; area_direito: string;
  colaborador_pago: boolean; colaborador_pago_data: string; colaborador_pago_valor: string;
  processo_pago: boolean; processo_pago_valor: string; processo_pago_data: string; processo_categoria: string;
  // extra fields
  origem: string; pais: string; rg: string; birth_date: string; marital_status: string;
  profession: string; gender: string; nationality: string; celular: string;
  cep: string; state: string; bairro: string; pis_pasep: string; ctps: string;
  cid: string; nome_mae: string; avatar_url: string;
}
const EMPTY_CLIENT: ClientForm = {
  type: 'pf', name: '', cpf_cnpj: '', email: '', phone: '',
  address: '', status: 'active', notes: '', assunto: '', cidade: '', colaborador_id: '',
  assigned_lawyer: '', assigned_lawyer_uid: '', entry_date: '', modalidade: '', area_direito: '',
  colaborador_pago: false, colaborador_pago_data: '', colaborador_pago_valor: '',
  processo_pago: false, processo_pago_valor: '', processo_pago_data: '', processo_categoria: 'fees',
  origem: '', pais: 'BRASIL', rg: '', birth_date: '', marital_status: '',
  profession: '', gender: '', nationality: '', celular: '',
  cep: '', state: '', bairro: '', pis_pasep: '', ctps: '', cid: '', nome_mae: '', avatar_url: '',
}

function validateCPF(digits: string): boolean {
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false
  let sum = 0, rem = 0
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i)
  rem = (sum * 10) % 11
  if (rem >= 10) rem = 0
  if (rem !== parseInt(digits[9])) return false
  sum = 0
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i)
  rem = (sum * 10) % 11
  if (rem >= 10) rem = 0
  return rem === parseInt(digits[10])
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mt-2 mb-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-primary-600 dark:text-primary-400 whitespace-nowrap">{children}</span>
      <div className="flex-1 h-px bg-gradient-to-r from-primary-200 dark:from-primary-800 to-transparent" />
    </div>
  )
}

function DetailField({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold mb-1 flex items-center gap-1">
        <Icon className="w-3 h-3" /> {label}
      </p>
      <p className="text-sm text-gray-900 dark:text-white">{value || '—'}</p>
    </div>
  )
}

const TYPE_BADGE = (type: string) => type === 'pf'
  ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
  : 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400'

function VerticalBarChart({ title, data }: { title: string; data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map(d => d.value), 1)
  const ticks = [0, Math.round(max * 0.25), Math.round(max * 0.5), Math.round(max * 0.75), max]
  return (
    <Card className="p-4 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-gray-800 dark:text-white">{title}</p>
        <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
        </button>
      </div>
      {data.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-8 text-gray-300 dark:text-gray-600">
          <div className="w-px h-16 bg-current" />
        </div>
      ) : (
        <div className="flex gap-3 items-end h-36">
          {/* Y-axis ticks */}
          <div className="flex flex-col justify-between h-full text-right pr-1 flex-shrink-0">
            {[...ticks].reverse().map(t => (
              <span key={t} className="text-[10px] text-gray-400 leading-none">{t}</span>
            ))}
          </div>
          {/* Bars */}
          <div className="flex-1 flex items-end gap-2 h-full">
            {data.slice(0, 5).map(item => (
              <div key={item.label} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                <div
                  className="w-full bg-primary-500 dark:bg-primary-600 rounded-sm transition-all duration-500 min-h-[2px]"
                  style={{ height: `${Math.max((item.value / max) * 100, 2)}%` }}
                />
                <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate w-full text-center">{item.label.length > 10 ? item.label.slice(0, 8) + '…' : item.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

export function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [systemUsers, setSystemUsers] = useState<Profile[]>([])
  const [clientProcesses, setClientProcesses] = useState<Record<string, Process[]>>({})
  const [cityOptions, setCityOptions] = useState<string[]>([])
  const [areaOptions, setAreaOptions] = useState<string[]>([])
  const [loading, setLoading] = usePageLoadingState()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 15
  const [modalOpen, setModalOpen] = useState(false)
  const [viewClient, setViewClient] = useState<Client | null>(null)
  const [form, setForm] = useState(EMPTY_CLIENT)
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [activeProcessFilter, setActiveProcessFilter] = useState<'all' | 'with' | 'without'>('all')
  const [avatarPreview, setAvatarPreview] = useState<string>('')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [cepLoading, setCepLoading] = useState(false)
  const [cepError, setCepError] = useState('')
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [savedClientId, setSavedClientId] = useState<string | null>(null)
  const [savedClientName, setSavedClientName] = useState('')
  type TaskFormType = {
    title: string; description: string; due_date: string
    priority: string; type: string; assigned_to: string; assigned_name: string
  }
  const EMPTY_TASK_FORM: TaskFormType = {
    title: '', description: '', due_date: '', priority: 'medium',
    type: 'custom', assigned_to: '', assigned_name: '',
  }
  const [taskForm, setTaskForm] = useState<TaskFormType>(EMPTY_TASK_FORM)

  function closeTaskModal() {
    setTaskModalOpen(false)
    setSavedClientId(null)
    setSavedClientName('')
    setTaskForm(EMPTY_TASK_FORM)
  }

  async function saveTask() {
    if (!taskForm.title.trim()) return
    setSaving(true)
    await supabase.from('tasks').insert({
      title: taskForm.title,
      description: taskForm.description || null,
      due_date: taskForm.due_date || null,
      priority: taskForm.priority || 'medium',
      type: taskForm.type || 'custom',
      status: 'pending',
      assigned_to: taskForm.assigned_to || null,
      assigned_name: taskForm.assigned_name || null,
    })
    setSaving(false)
    closeTaskModal()
  }
  const [cpfLoading, setCpfLoading] = useState(false)
  const [cpfError, setCpfError] = useState('')
  const [cpfNote, setCpfNote] = useState('')
  const [cpfSuggestion, setCpfSuggestion] = useState<{ label: string; sub: string; fields: Partial<typeof EMPTY_CLIENT> } | null>(null)

  async function lookupCpfCnpj(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 14)
    let formatted = digits
    if (digits.length <= 11) {
      formatted = digits
        .replace(/^(\d{3})(\d)/, '$1.$2')
        .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4')
    } else {
      formatted = digits
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4')
        .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5')
    }
    setForm(f => ({ ...f, cpf_cnpj: formatted }))
    setCpfSuggestion(null)
    setCpfError('')
    setCpfNote('')

    if (digits.length === 11 && !validateCPF(digits)) {
      setCpfError('CPF inválido — verifique os dígitos')
      return
    }

    // Checa duplicidade (CPF ou CNPJ) contra contatos já cadastrados, ignorando o próprio registro em edição
    if (digits.length === 11 || digits.length === 14) {
      const existing = clients.find(c => c.cpf_cnpj?.replace(/\D/g, '') === digits && !c.deleted_at && c.id !== editId)
      if (existing) {
        setCpfSuggestion({
          label: existing.name,
          sub: `Já existe um contato cadastrado com este ${digits.length === 11 ? 'CPF' : 'CNPJ'} — clique para preencher com os dados existentes`,
          fields: {
            name: existing.name,
            email: existing.email || '',
            phone: existing.phone || '',
            celular: (existing as any).celular || '',
            address: existing.address || '',
            bairro: (existing as any).bairro || '',
            cidade: existing.cidade || '',
            state: (existing as any).state || '',
            cep: (existing as any).cep || '',
            notes: existing.notes || '',
            type: existing.type,
            area_direito: existing.area_direito || '',
            modalidade: existing.modalidade || '',
            birth_date: (existing as any).birth_date || '',
            gender: (existing as any).gender || '',
            profession: (existing as any).profession || '',
            marital_status: (existing as any).marital_status || '',
            nationality: (existing as any).nationality || '',
            origem: (existing as any).origem || '',
          },
        })
        return
      }
    }

    if (digits.length === 11) {
      setCpfNote('CPF válido — a Receita Federal não disponibiliza dados pessoais via API pública (LGPD). Preencha os campos abaixo.')
      return
    }

    if (digits.length === 14) {
      setCpfLoading(true)
      try {
        const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`)
        if (!res.ok) { setCpfError('CNPJ não encontrado na Receita Federal'); return }
        const data = await res.json()
        const rawPhone = (data.ddd_telefone_1 || '').replace(/\D/g, '')
        const phone = rawPhone.length >= 10
          ? rawPhone.replace(/^(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3')
          : rawPhone
        const cepFmt = (data.cep || '').replace(/\D/g, '').replace(/^(\d{5})(\d{3})$/, '$1-$2')
        const addressFull = [data.logradouro, data.numero].filter(Boolean).join(', ')
        setForm(f => ({
          ...f,
          type: 'pj',
          name: data.razao_social || data.nome_fantasia || f.name,
          email: data.email || f.email,
          phone: phone || f.phone,
          address: addressFull || f.address,
          bairro: data.bairro || f.bairro,
          cidade: data.municipio || f.cidade,
          state: data.uf || f.state,
          cep: cepFmt || f.cep,
        }))
        setCpfNote(`Dados preenchidos automaticamente — ${data.razao_social || data.nome_fantasia || 'empresa'} (${data.municipio || ''}${data.uf ? '/' + data.uf : ''})`)
      } catch {
        setCpfError('Erro ao consultar CNPJ')
      } finally {
        setCpfLoading(false)
      }
    }
  }

  async function lookupCep(raw: string) {
    const digits = raw.replace(/\D/g, '')
    const formatted = digits.length > 5 ? digits.slice(0, 5) + '-' + digits.slice(5, 8) : digits
    setForm(f => ({ ...f, cep: formatted }))
    setCepError('')
    if (digits.length !== 8) return
    setCepLoading(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
      const data = await res.json()
      if (data.erro) { setCepError('CEP não encontrado'); return }
      setForm(f => ({
        ...f,
        cep: formatted,
        address: data.logradouro || f.address,
        bairro: data.bairro || f.bairro,
        cidade: data.localidade || f.cidade,
        state: data.uf || f.state,
      }))
    } catch {
      setCepError('Erro ao consultar CEP')
    } finally {
      setCepLoading(false)
    }
  }

  async function uploadAvatar(file: File): Promise<string | null> {
    setUploadingAvatar(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `clients/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
      if (error) return null
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      return data.publicUrl
    } finally {
      setUploadingAvatar(false)
    }
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const preview = URL.createObjectURL(file)
    setAvatarPreview(preview)
    uploadAvatar(file).then(url => {
      if (url) setForm(f => ({ ...f, avatar_url: url }))
    })
  }
  const location = useLocation()
  useEffect(() => {
    if ((location.state as any)?.openNew) { openNew(); window.history.replaceState({}, '') }
  }, [location.state])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false)
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false)
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function load() {
    setLoading(true)
    const [{ data: c }, { data: col }, { data: proc }, { data: usr }] = await Promise.all([
      supabase.from('clients').select('*').is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('colaboradores').select('*').eq('ativo', true).order('nome'),
      supabase.from('processes').select('id,client_id,client_name,number,title,status,modalidade,counterparty,data_protocolo,created_at').is('deleted_at', null),
      supabase.from('profiles').select('id,user_id,name,display_name,role').order('name'),
    ])
    setClients(c || [])
    setColaboradores(col || [])
    const allGroupIds = new Set(['sem-parceiro', ...(col || []).map((x: Colaborador) => x.id)])
    setExpandedGroups(allGroupIds)
    setSystemUsers((usr || []) as Profile[])
    const procMap: Record<string, Process[]> = {}
    const clientsByName: Record<string, string> = {}
    for (const cl of (c || [])) {
      if (cl.name) clientsByName[cl.name.trim().toLowerCase()] = cl.id
    }
    for (const p of (proc || [])) {
      let targetId = p.client_id
      if (!targetId && p.client_name) {
        targetId = clientsByName[p.client_name.trim().toLowerCase()] || null
      }
      if (targetId) {
        if (!procMap[targetId]) procMap[targetId] = []
        procMap[targetId].push(p as Process)
      }
    }
    setClientProcesses(procMap)
    const cities = Array.from(new Set((c || []).map((cl: any) => cl.cidade).filter(Boolean))).sort() as string[]
    setCityOptions(cities)
    const DEFAULT_AREAS = ['Previdenciário', 'Cível', 'Consumidor', 'Trabalhista', 'Tributário', 'Criminal']
    const dbAreas = Array.from(new Set((c || []).map((cl: any) => cl.area_direito).filter(Boolean))) as string[]
    setAreaOptions(Array.from(new Set([...DEFAULT_AREAS, ...dbAreas])).sort())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const stats = useMemo(() => {
    const total = clients.length
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
    const thisMonth = clients.filter(c => c.created_at && c.created_at >= monthStart).length
    const prevMonth = clients.filter(c => c.created_at && c.created_at >= prevMonthStart && c.created_at < monthStart).length
    const withProcesses = clients.filter(c => (clientProcesses[c.id]?.length || 0) > 0).length
    const withoutProcesses = total - withProcesses
    return { total, thisMonth, prevMonth, withProcesses, withoutProcesses }
  }, [clients, clientProcesses])

  const charts = useMemo(() => {
    const ORIGEM_LABELS: Record<string, string> = {
      indicacao: 'Indicação', site: 'Site', redes_sociais: 'Redes Sociais',
      google: 'Google', email: 'E-mail', telefone: 'Telefone',
      escritorio: 'Escritório', outro: 'Outro',
    }
    const origenCount: Record<string, number> = {}
    for (const c of clients) {
      const key = ORIGEM_LABELS[(c as any).origem] || (c as any).origem || 'Não informado'
      origenCount[key] = (origenCount[key] || 0) + 1
    }
    const topOrigens = Object.entries(origenCount)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)

    const faixaCount: Record<string, number> = {}
    for (const c of clients) {
      const bd = (c as any).birth_date
      if (bd) {
        const age = new Date().getFullYear() - new Date(bd).getFullYear()
        const key = age < 18 ? '< 18' : age < 30 ? '18-29' : age < 45 ? '30-44' : age < 60 ? '45-59' : '60+'
        faixaCount[key] = (faixaCount[key] || 0) + 1
      }
    }
    const faixaEtaria = ['< 18', '18-29', '30-44', '45-59', '60+']
      .map(label => ({ label, value: faixaCount[label] || 0 }))

    const profCount: Record<string, number> = {}
    for (const c of clients) {
      const key = (c as any).profession
      if (key) profCount[key] = (profCount[key] || 0) + 1
    }
    const topProfissoes = Object.entries(profCount)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)

    return { topOrigens, faixaEtaria, topProfissoes }
  }, [clients])

  const [typeFilter, setTypeFilter] = useState('')
  const [areaFilter, setAreaFilter] = useState('')
  const [cidadeFilter, setCidadeFilter] = useState('')
  const [sortField, setSortField] = useState<'name' | 'created_at' | 'cidade'>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [filterOpen, setFilterOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)
  const sortRef = useRef<HTMLDivElement>(null)
  const exportRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const result = clients.filter(c => {
      const q = search.toLowerCase()
      const matchSearch = !search || c.name.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) || c.cpf_cnpj?.includes(search) ||
        c.phone?.includes(search) || c.cidade?.toLowerCase().includes(q)
      const matchStatus = !statusFilter || c.status === statusFilter
      const matchType = !typeFilter || c.type === typeFilter
      const matchArea = !areaFilter || c.area_direito === areaFilter
      const matchCidade = !cidadeFilter || c.cidade === cidadeFilter
      const hasProc = (clientProcesses[c.id]?.length || 0) > 0
      const matchProc = activeProcessFilter === 'all' || (activeProcessFilter === 'with' ? hasProc : !hasProc)
      return matchSearch && matchStatus && matchType && matchArea && matchCidade && matchProc
    })
    return [...result].sort((a, b) => {
      let va = '', vb = ''
      if (sortField === 'name') { va = a.name.toLowerCase(); vb = b.name.toLowerCase() }
      else if (sortField === 'created_at') { va = a.created_at || ''; vb = b.created_at || '' }
      else if (sortField === 'cidade') { va = (a.cidade || '').toLowerCase(); vb = (b.cidade || '').toLowerCase() }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [clients, search, statusFilter, typeFilter, areaFilter, cidadeFilter, activeProcessFilter, clientProcesses, sortField, sortDir])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageClients = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const clientGroups = useMemo(() => {
    const groups = [
      ...colaboradores.map(col => ({
        id: col.id,
        name: col.nome,
        items: filtered.filter(c => c.colaborador_id === col.id),
      })),
      {
        id: 'sem-parceiro',
        name: 'Sem parceiro',
        items: filtered.filter(c => !c.colaborador_id),
      },
    ].filter(g => g.items.length > 0)
    return groups
  }, [filtered, colaboradores])

  function openNew() { setEditId(null); setForm(EMPTY_CLIENT); setAvatarPreview(''); setModalOpen(true) }
  function openEdit(c: Client) {
    setEditId(c.id)
    const matchedUser = systemUsers.find(u => (u.name || u.display_name) === c.assigned_lawyer)
    setForm({
      type: c.type, name: c.name, cpf_cnpj: c.cpf_cnpj || '',
      email: c.email || '', phone: c.phone || '', address: c.address || '',
      status: (c.status as any) || 'active', notes: c.notes || '',
      assunto: c.assunto || '', cidade: c.cidade || '',
      colaborador_id: c.colaborador_id || '', assigned_lawyer: c.assigned_lawyer || '',
      assigned_lawyer_uid: matchedUser?.user_id || '', entry_date: c.entry_date || '',
      modalidade: c.modalidade || '', area_direito: c.area_direito || '',
      colaborador_pago: c.colaborador_pago ?? false,
      colaborador_pago_data: c.colaborador_pago_data || '',
      colaborador_pago_valor: c.colaborador_pago_valor != null ? String(c.colaborador_pago_valor) : '',
      processo_pago: false, processo_pago_valor: '', processo_pago_data: '', processo_categoria: 'fees',
      avatar_url: (c as any).avatar_url || '',
      origem: (c as any).origem || '', pais: (c as any).pais || 'BRASIL',
      rg: (c as any).rg || '', birth_date: (c as any).birth_date || '',
      marital_status: (c as any).marital_status || '', profession: (c as any).profession || '',
      gender: (c as any).gender || '', nationality: (c as any).nationality || '',
      celular: (c as any).celular || '', cep: (c as any).cep || '',
      state: (c as any).state || '', bairro: (c as any).bairro || '',
      pis_pasep: (c as any).pis_pasep || '', ctps: (c as any).ctps || '',
      cid: (c as any).cid || '', nome_mae: (c as any).nome_mae || '',
    })
    setAvatarPreview((c as any).avatar_url || '')
    setModalOpen(true)
  }

  async function save() {
    if (!form.name.trim()) return
    setSaving(true)
    const {
      assigned_lawyer_uid, celular: _cel,
      processo_pago: _pp, processo_pago_valor: _ppv,
      processo_pago_data: _ppd, processo_categoria: _pc,
      ...rest
    } = form
    // merge celular into phone if phone is empty
    const phoneFinal = form.phone || form.celular || null
    const valorNum = form.colaborador_pago && form.colaborador_pago_valor ? parseFloat(form.colaborador_pago_valor) : null
    const payload = {
      ...rest,
      phone: phoneFinal,
      celular: form.celular || null,
      colaborador_id: form.colaborador_id || null,
      assigned_lawyer: form.assigned_lawyer || null,
      entry_date: form.entry_date || null,
      birth_date: form.birth_date || null,
      modalidade: form.modalidade || null,
      area_direito: form.area_direito || null,
      colaborador_pago: form.colaborador_pago,
      colaborador_pago_data: form.colaborador_pago && form.colaborador_pago_data ? form.colaborador_pago_data : null,
      colaborador_pago_valor: valorNum,
    }

    let clientId = editId
    if (editId) {
      const { error: updateError } = await supabase.from('clients').update(payload).eq('id', editId)
      if (updateError) {
        alert('Erro ao atualizar contato: ' + updateError.message)
        setSaving(false)
        return
      }
    } else {
      const { data: inserted, error: insertError } = await supabase.from('clients').insert(payload).select('id').single()
      if (insertError) {
        alert('Erro ao salvar contato: ' + insertError.message)
        setSaving(false)
        return
      }
      clientId = inserted?.id || null
    }

    if (clientId && form.colaborador_pago && valorNum && valorNum > 0) {
      const col = colaboradores.find(c => c.id === form.colaborador_id)
      const descricao = `Comissão — ${form.name}${col ? ` (${col.nome})` : ''}`
      const { data: existing } = await supabase
        .from('financials').select('id').eq('client_id', clientId).eq('category', 'comissao')
        .is('deleted_at', null).maybeSingle()
      if (existing) {
        await supabase.from('financials').update({
          description: descricao, amount: valorNum,
          paid_date: form.colaborador_pago_data || null, due_date: form.colaborador_pago_data || null,
          status: 'paid', client_name: form.name,
        }).eq('id', existing.id)
      } else {
        await supabase.from('financials').insert({
          type: 'payable', category: 'comissao', description: descricao,
          amount: valorNum, client_id: clientId, client_name: form.name,
          paid_date: form.colaborador_pago_data || null, due_date: form.colaborador_pago_data || null,
          status: 'paid', notes: col ? `Colaborador: ${col.nome}` : null,
        })
      }
    }

    if (clientId && !editId && form.processo_pago) {
      const valorPago = parseFloat(form.processo_pago_valor)
      if (valorPago > 0) {
        const catLabel: Record<string, string> = { fees: 'Honorários', costs: 'Custas', other: 'Outros' }
        await supabase.from('financials').insert({
          type: 'receivable',
          category: form.processo_categoria || 'fees',
          description: `${catLabel[form.processo_categoria] || 'Honorários'} — ${form.name}`,
          amount: valorPago,
          client_id: clientId,
          client_name: form.name,
          paid_date: form.processo_pago_data || null,
          due_date: form.processo_pago_data || null,
          status: 'paid',
          notes: 'Registrado automaticamente no cadastro do contato',
        })
      }
    }

    setSaving(false)
    if (editId) {
      setModalOpen(false)
      setPage(0)
      load()
    } else if (clientId) {
      const areaDesc = form.area_direito ? ` | Área: ${form.area_direito}` : ''
      const modDesc = form.modalidade ? ` | Modalidade: ${form.modalidade === 'judicial' ? 'Judicial' : 'Administrativo'}` : ''
      setSavedClientId(clientId)
      setSavedClientName(form.name)
      setTaskForm({
        title: `Protocolar processo de ${form.name}`,
        description: `client_id:${clientId} | Cadastrado em ${new Date().toLocaleDateString('pt-BR')}${areaDesc}${modDesc}. Verificar documentação e protocolar o processo.`,
        priority: 'medium', type: 'custom',
        due_date: '',
        assigned_to: form.assigned_lawyer_uid || '',
        assigned_name: form.assigned_lawyer || '',
      })
      setModalOpen(false)
      setPage(0)
      load()
      setTaskModalOpen(true)
    } else {
      setModalOpen(false)
      setPage(0)
      load()
    }
  }

  async function deleteClient(id: string) {
    if (!confirm('Deseja excluir este contato?')) return
    await supabase.from('clients').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    load()
  }

  function toggleGroup(id: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  /** scope: 'all' agrupa todos os parceiros; 'sem-parceiro' ou um colaborador_id exporta só aquele recorte */
  function exportAll(scope: string = 'all') {
    const scoped = scope === 'all'
      ? filtered
      : scope === 'sem-parceiro'
      ? filtered.filter(c => !c.colaborador_id)
      : filtered.filter(c => c.colaborador_id === scope)

    const activeCount = scoped.filter(c => c.status === 'active').length
    const pfCount = scoped.filter(c => c.type === 'pf').length
    const pjCount = scoped.filter(c => c.type === 'pj').length

    function clientRow(c: typeof filtered[0]) {
      return [
        { text: c.name, sub: formatCPFCNPJ(c.cpf_cnpj || '') || undefined, bold: true },
        { text: c.type === 'pf' ? 'PF' : 'PJ', badge: (c.type === 'pf' ? 'purple' : 'cyan') as any },
        { text: formatPhone(c.phone || '') || '—' },
        { text: c.email || '—' },
        { text: c.cidade || '—' },
        { text: STATUS_LABELS[c.status || 'active'], badge: (c.status === 'active' ? 'green' : c.status === 'inactive' ? 'gray' : 'blue') as any },
        { text: String(clientProcesses[c.id]?.length ?? 0), badge: ((clientProcesses[c.id]?.length ?? 0) > 0 ? 'blue' : 'gray') as any },
        { text: formatDate(c.created_at) },
      ]
    }

    const columns = ['Nome', 'Tipo', 'Telefone', 'Email', 'Cidade', 'Status', 'Processos', 'Cadastro']

    if (scope !== 'all') {
      const parceiroNome = scope === 'sem-parceiro' ? 'Sem parceiro' : (colaboradores.find(c => c.id === scope)?.nome || 'Parceiro')
      const csvLines = ['Nome,Tipo,CPF/CNPJ,Telefone,Email,Cidade,Status,Processos,Cadastro']
      for (const c of scoped) {
        const status = STATUS_LABELS[c.status || 'active'] ?? ''
        const proc = clientProcesses[c.id]?.length ?? 0
        csvLines.push(`"${c.name}","${c.type === 'pf' ? 'Pessoa Física' : 'Pessoa Jurídica'}","${formatCPFCNPJ(c.cpf_cnpj || '') || '—'}","${formatPhone(c.phone || '') || '—'}","${c.email || '—'}","${c.cidade || '—'}","${status}","${proc}","${formatDate(c.created_at)}"`)
      }
      openExportWindow({
        title: 'Relatório de Contatos',
        subtitle: `Parceiro: ${parceiroNome}`,
        filename: `contatos-${parceiroNome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`,
        stats: [
          { value: scoped.length, label: 'Total de contatos', accent: '#2563eb' },
          { value: activeCount, label: 'Ativos', accent: '#16a34a' },
          { value: pfCount, label: 'Pessoa Física', accent: '#7c3aed' },
          { value: pjCount, label: 'Pessoa Jurídica', accent: '#0e7490' },
        ],
        columns,
        rows: scoped.map(clientRow),
        csvContent: csvLines.join('\n'),
      })
      return
    }

    // Grupos por parceiro
    const parceiroGroups = [
      ...colaboradores.map(col => ({
        label: col.nome,
        rows: filtered.filter(c => c.colaborador_id === col.id).map(clientRow),
      })),
      {
        label: 'Sem parceiro',
        rows: filtered.filter(c => !c.colaborador_id).map(clientRow),
      },
    ].filter(g => g.rows.length > 0)

    // CSV com seções por parceiro
    const csvLines = ['Parceiro,Nome,Tipo,CPF/CNPJ,Telefone,Email,Cidade,Status,Processos,Cadastro']
    for (const g of parceiroGroups) {
      const clients = g.label === 'Sem parceiro'
        ? filtered.filter(c => !c.colaborador_id)
        : filtered.filter(c => colaboradores.find(col => col.nome === g.label && col.id === c.colaborador_id))
      for (const c of clients) {
        const status = STATUS_LABELS[c.status || 'active'] ?? ''
        const proc = clientProcesses[c.id]?.length ?? 0
        csvLines.push(`"${g.label}","${c.name}","${c.type === 'pf' ? 'Pessoa Física' : 'Pessoa Jurídica'}","${formatCPFCNPJ(c.cpf_cnpj || '') || '—'}","${formatPhone(c.phone || '') || '—'}","${c.email || '—'}","${c.cidade || '—'}","${status}","${proc}","${formatDate(c.created_at)}"`)
      }
    }

    openExportWindow({
      title: 'Relatório de Contatos',
      subtitle: 'Agrupado por parceiro',
      filename: 'contatos-por-parceiro',
      stats: [
        { value: filtered.length, label: 'Total de contatos', accent: '#2563eb' },
        { value: activeCount, label: 'Ativos', accent: '#16a34a' },
        { value: pfCount, label: 'Pessoa Física', accent: '#7c3aed' },
        { value: pjCount, label: 'Pessoa Jurídica', accent: '#0e7490' },
      ],
      columns,
      rows: [],
      groups: parceiroGroups,
      csvContent: csvLines.join('\n'),
    })
  }

  const [tableCollapsed, setTableCollapsed] = useState(false)
  const [viewMode, setViewMode] = useState<'table' | 'byColaborador'>('table')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  function toggleExpandRow(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setExpandedRows(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  const activeFilterCount = [
    statusFilter, typeFilter, areaFilter, cidadeFilter,
    activeProcessFilter !== 'all' ? activeProcessFilter : '',
  ].filter(Boolean).length

  const sortLabel: Record<string, string> = {
    'created_at-desc': 'Mais recentes', 'created_at-asc': 'Mais antigos',
    'name-asc': 'Nome A→Z', 'name-desc': 'Nome Z→A',
    'cidade-asc': 'Cidade A→Z', 'cidade-desc': 'Cidade Z→A',
  }

  return (
    <Layout>
      {/* ── Stats row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        {/* Contatos cadastrados */}
        <Card className="p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1">Contatos cadastrados</p>
          <div className="flex items-end gap-3">
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
            <span className="mb-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              → {stats.prevMonth > 0 ? `+${stats.prevMonth}` : '0'}%
            </span>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            no mês anterior: +{stats.prevMonth}
          </p>
        </Card>

        {/* Com processo ativo */}
        <Card
          className={cn('p-4 cursor-pointer transition-all', activeProcessFilter === 'with' && 'ring-2 ring-primary-500')}
          onClick={() => setActiveProcessFilter(f => f === 'with' ? 'all' : 'with')}
        >
          <div className="flex items-start justify-between">
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1">Com processo ativo</p>
            <svg className="w-4 h-4 text-gray-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.withProcesses}</p>
          <span className="mt-1 text-xs text-primary-600 dark:text-primary-400">Mostrar contatos</span>
        </Card>

        {/* Sem processo ativo */}
        <Card
          className={cn('p-4 cursor-pointer transition-all', activeProcessFilter === 'without' && 'ring-2 ring-primary-500')}
          onClick={() => setActiveProcessFilter(f => f === 'without' ? 'all' : 'without')}
        >
          <div className="flex items-start justify-between">
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1">Sem processo ativo</p>
            <svg className="w-4 h-4 text-gray-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.withoutProcesses}</p>
          <span className="mt-1 text-xs text-primary-600 dark:text-primary-400">Mostrar contatos</span>
        </Card>
      </div>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <VerticalBarChart title="Top Origens" data={charts.topOrigens} />
        <VerticalBarChart title="Faixa etária" data={charts.faixaEtaria} />
        <VerticalBarChart title="Top Profissões" data={charts.topProfissoes} />
      </div>

      {/* ── Table section ── */}
      <Card className="overflow-hidden">
        {/* Section header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-dark-700">
          <button
            className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white text-sm hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            onClick={() => setTableCollapsed(v => !v)}
          >
            Contatos
            <svg className={cn('w-4 h-4 transition-transform', tableCollapsed && 'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
          </button>
        </div>

        {!tableCollapsed && (
          <>
            {/* Toolbar */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-dark-700 flex-wrap">
              <Button onClick={openNew} className="h-8 text-xs px-3 gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Novo contato
              </Button>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  className="pl-8 pr-7 py-1.5 text-xs border border-gray-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 w-52"
                  placeholder="Buscar contato..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(0) }}
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Filtrar */}
              <div className="relative" ref={filterRef}>
                <button
                  onClick={() => { setFilterOpen(v => !v); setSortOpen(false) }}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors',
                    filterOpen || activeFilterCount > 0
                      ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 border-primary-300 dark:border-primary-700'
                      : 'text-gray-600 dark:text-gray-300 border-gray-200 dark:border-dark-600 hover:bg-gray-50 dark:hover:bg-dark-700'
                  )}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" /></svg>
                  Filtrar
                  {activeFilterCount > 0 && (
                    <span className="ml-0.5 w-4 h-4 rounded-full bg-primary-600 text-white text-[10px] font-bold flex items-center justify-center">{activeFilterCount}</span>
                  )}
                </button>
                {filterOpen && (
                  <div className="absolute left-0 top-full mt-1.5 w-72 bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-600 rounded-xl shadow-modal z-50 p-4 space-y-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider">Filtros</p>
                      {activeFilterCount > 0 && (
                        <button
                          onClick={() => { setStatusFilter(''); setTypeFilter(''); setAreaFilter(''); setCidadeFilter(''); setActiveProcessFilter('all'); setPage(0) }}
                          className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium"
                        >Limpar tudo</button>
                      )}
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Status</label>
                      <div className="flex flex-wrap gap-1.5">
                        {[{ v: '', l: 'Todos' }, { v: 'active', l: 'Ativo' }, { v: 'inactive', l: 'Inativo' }, { v: 'prospect', l: 'Prospect' }].map(opt => (
                          <button key={opt.v} onClick={() => { setStatusFilter(opt.v); setPage(0) }}
                            className={cn('px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors',
                              statusFilter === opt.v ? 'bg-primary-600 text-white border-primary-600' : 'border-gray-200 dark:border-dark-600 text-gray-600 dark:text-gray-300 hover:border-primary-400 hover:text-primary-600')}>
                            {opt.l}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Tipo</label>
                      <div className="flex gap-1.5">
                        {[{ v: '', l: 'Todos' }, { v: 'pf', l: 'Pessoa Física' }, { v: 'pj', l: 'Pessoa Jurídica' }].map(opt => (
                          <button key={opt.v} onClick={() => { setTypeFilter(opt.v); setPage(0) }}
                            className={cn('px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors',
                              typeFilter === opt.v ? 'bg-primary-600 text-white border-primary-600' : 'border-gray-200 dark:border-dark-600 text-gray-600 dark:text-gray-300 hover:border-primary-400 hover:text-primary-600')}>
                            {opt.l}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Processos</label>
                      <div className="flex gap-1.5">
                        {[{ v: 'all' as const, l: 'Todos' }, { v: 'with' as const, l: 'Com processo' }, { v: 'without' as const, l: 'Sem processo' }].map(opt => (
                          <button key={opt.v} onClick={() => { setActiveProcessFilter(opt.v); setPage(0) }}
                            className={cn('px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors',
                              activeProcessFilter === opt.v ? 'bg-primary-600 text-white border-primary-600' : 'border-gray-200 dark:border-dark-600 text-gray-600 dark:text-gray-300 hover:border-primary-400 hover:text-primary-600')}>
                            {opt.l}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Área do Direito</label>
                      <select
                        value={areaFilter}
                        onChange={e => { setAreaFilter(e.target.value); setPage(0) }}
                        className="w-full px-2.5 py-1.5 text-xs border border-gray-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                      >
                        <option value="">Todas</option>
                        {areaOptions.map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Cidade</label>
                      <select
                        value={cidadeFilter}
                        onChange={e => { setCidadeFilter(e.target.value); setPage(0) }}
                        className="w-full px-2.5 py-1.5 text-xs border border-gray-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                      >
                        <option value="">Todas</option>
                        {cityOptions.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Ordenar */}
              <div className="relative" ref={sortRef}>
                <button
                  onClick={() => { setSortOpen(v => !v); setFilterOpen(false) }}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors',
                    sortOpen
                      ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 border-primary-300 dark:border-primary-700'
                      : 'text-gray-600 dark:text-gray-300 border-gray-200 dark:border-dark-600 hover:bg-gray-50 dark:hover:bg-dark-700'
                  )}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M6 12h12M9 17h6" /></svg>
                  Ordenar
                  {(sortField !== 'created_at' || sortDir !== 'desc') && (
                    <span className="ml-0.5 w-1.5 h-1.5 rounded-full bg-primary-600" />
                  )}
                </button>
                {sortOpen && (
                  <div className="absolute left-0 top-full mt-1.5 w-56 bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-600 rounded-xl shadow-modal z-50 p-2 space-y-0.5">
                    <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-2 py-1.5">Ordenar por</p>
                    {([
                      { field: 'created_at' as const, dir: 'desc' as const, label: 'Mais recentes primeiro' },
                      { field: 'created_at' as const, dir: 'asc' as const, label: 'Mais antigos primeiro' },
                      { field: 'name' as const, dir: 'asc' as const, label: 'Nome A → Z' },
                      { field: 'name' as const, dir: 'desc' as const, label: 'Nome Z → A' },
                      { field: 'cidade' as const, dir: 'asc' as const, label: 'Cidade A → Z' },
                      { field: 'cidade' as const, dir: 'desc' as const, label: 'Cidade Z → A' },
                    ]).map(opt => (
                      <button
                        key={`${opt.field}-${opt.dir}`}
                        onClick={() => { setSortField(opt.field); setSortDir(opt.dir); setSortOpen(false); setPage(0) }}
                        className={cn(
                          'w-full text-left px-3 py-2 text-xs rounded-lg transition-colors flex items-center justify-between',
                          sortField === opt.field && sortDir === opt.dir
                            ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 font-semibold'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700'
                        )}
                      >
                        {opt.label}
                        {sortField === opt.field && sortDir === opt.dir && (
                          <svg className="w-3.5 h-3.5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        )}
                      </button>
                    ))}
                    <div className="pt-1 mt-1 border-t border-gray-100 dark:border-dark-700 px-2">
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">
                        Atual: <span className="font-semibold text-gray-600 dark:text-gray-300">{sortLabel[`${sortField}-${sortDir}`]}</span>
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="relative" ref={exportRef}>
                <button
                  onClick={() => { setExportOpen(v => !v); setSortOpen(false); setFilterOpen(false) }}
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
                    <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-2 py-1.5">Exportar contatos</p>
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
                  onClick={() => { setViewMode('byColaborador'); setExpandedGroups(new Set(clientGroups.map(g => g.id))) }}
                  className={cn('px-3 py-1.5 text-xs font-medium border-l border-gray-200 dark:border-dark-600 transition-colors',
                    viewMode === 'byColaborador'
                      ? 'bg-primary-600 text-white border-l-primary-700'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-dark-700'
                  )}
                >
                  Por parceiro
                </button>
              </div>

              <button className="ml-1 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 border border-gray-200 dark:border-dark-600 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>
              </button>
            </div>

            {!loading && (filtered.length === 0 ? (
              <EmptyState icon={Users} title="Nenhum contato encontrado" />
            ) : viewMode === 'table' ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-dark-700/40 border-b border-gray-100 dark:border-dark-700">
                        <th className="w-10 px-3 py-2.5" />
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          <span className="flex items-center gap-1 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
                            Nome do Cliente
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
                          </span>
                        </th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Celular</th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Cidade</th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Data do Cadastro</th>
                        <th className="w-16 px-4 py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-dark-700/50">
                      {pageClients.map(c => {
                        const isExpanded = expandedRows.has(c.id)
                        const procs = clientProcesses[c.id] || []
                        return (
                          <Fragment key={c.id}>
                            <tr
                              className="hover:bg-primary-50/40 dark:hover:bg-primary-900/10 transition-colors cursor-pointer group"
                              onClick={() => setViewClient(c)}
                            >
                              <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                                <button
                                  onClick={e => toggleExpandRow(c.id, e)}
                                  className={cn(
                                    'w-5 h-5 rounded border flex items-center justify-center transition-colors text-xs font-bold',
                                    isExpanded
                                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                                      : 'border-gray-300 dark:border-dark-500 text-gray-400 hover:border-primary-400 hover:text-primary-600'
                                  )}
                                >{isExpanded ? '−' : '+'}</button>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2.5">
                                  <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs flex-shrink-0 overflow-hidden',
                                    c.type === 'pf' ? 'bg-gradient-to-br from-primary-500 to-primary-700' : 'bg-gradient-to-br from-primary-400 to-primary-600')}>
                                    {(c as any).avatar_url
                                      ? <img src={(c as any).avatar_url} alt={c.name} className="w-full h-full object-cover" />
                                      : c.name[0]?.toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-medium text-gray-900 dark:text-white truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">{c.name}</p>
                                    {procs.length > 0 && (
                                      <p className="text-[10px] text-gray-400 dark:text-gray-500">{procs.length} processo{procs.length !== 1 ? 's' : ''}</p>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                {c.phone
                                  ? <span className="text-xs text-gray-600 dark:text-gray-300">{formatPhone(c.phone)}</span>
                                  : <span className="text-xs text-gray-400">N/A</span>}
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-xs text-gray-600 dark:text-gray-300">{c.cidade || 'N/A'}</span>
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                                {formatDate(c.created_at)}
                              </td>
                              <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-600 text-gray-400 hover:text-primary-600 transition-colors">
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button onClick={() => deleteClient(c.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr className="bg-primary-50/30 dark:bg-primary-900/5">
                                <td colSpan={6} className="p-0">
                                  <div className="border-t border-primary-100 dark:border-primary-800/40">
                                    {/* Sub-header */}
                                    <div className="grid grid-cols-[1fr_200px_220px_100px] gap-0 px-10 py-2 bg-gray-50/80 dark:bg-dark-700/40 border-b border-gray-100 dark:border-dark-700">
                                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Tipo de ação</span>
                                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Pessoas envolvidas</span>
                                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Número do processo</span>
                                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Data</span>
                                    </div>
                                    {/* Process rows */}
                                    {procs.length === 0 ? (
                                      <div className="px-10 py-3 text-xs text-gray-400 dark:text-gray-500 italic">
                                        Nenhum processo vinculado a este contato
                                      </div>
                                    ) : procs.map(p => (
                                      <div key={p.id} className="grid grid-cols-[1fr_200px_220px_100px] gap-0 px-10 py-2.5 border-b border-gray-100/60 dark:border-dark-700/40 hover:bg-primary-50/40 dark:hover:bg-primary-900/10 transition-colors last:border-b-0">
                                        <span className="text-xs text-gray-800 dark:text-gray-200 truncate pr-4">{p.title || '—'}</span>
                                        <span className="text-xs text-gray-600 dark:text-gray-300 truncate pr-4">{(p as any).counterparty || '—'}</span>
                                        <span className="text-xs font-mono text-gray-600 dark:text-gray-300 truncate pr-4">{p.number || '—'}</span>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">{formatDate((p as any).data_protocolo || p.created_at, 'dd MMM yyyy')}</span>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-gray-100 dark:border-dark-700 bg-gray-50/50 dark:bg-dark-700/20">
                    <p className="text-xs text-gray-400">
                      {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} de {filtered.length}
                    </p>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setPage(p => p - 1)} disabled={page === 0}
                        className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 dark:border-dark-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-700 disabled:opacity-40">
                        ← Anterior
                      </button>
                      {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                        const p = totalPages <= 5 ? i : Math.max(0, Math.min(page - 2, totalPages - 5)) + i
                        return (
                          <button key={p} onClick={() => setPage(p)}
                            className={cn('w-7 h-7 text-xs rounded-lg font-semibold transition-colors',
                              p === page ? 'bg-primary-600 text-white' : 'border border-gray-200 dark:border-dark-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-700'
                            )}>{p + 1}</button>
                        )
                      })}
                      <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}
                        className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 dark:border-dark-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-700 disabled:opacity-40">
                        Próximo →
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* Vista agrupada por parceiro */
              <div className="divide-y divide-gray-100 dark:divide-dark-700/50">
                {clientGroups.map(group => {
                  const isExpanded = expandedGroups.has(group.id)
                  const groupPageClients = group.items.slice(0, 50)
                  return (
                    <div key={group.id}>
                      {/* Cabeçalho do grupo */}
                      <button
                        onClick={() => toggleGroup(group.id)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 bg-slate-50/80 dark:bg-dark-700/30 hover:bg-primary-50/40 dark:hover:bg-primary-900/10 transition-colors text-left"
                      >
                        <ChevronDown className={cn('w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform', !isExpanded && '-rotate-90')} />
                        <UserCheck className="w-4 h-4 text-primary-500 dark:text-primary-400 flex-shrink-0" />
                        <span className="flex-1 text-xs font-bold text-gray-800 dark:text-gray-100">{group.name}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400">
                          {group.items.length} contato{group.items.length !== 1 ? 's' : ''}
                        </span>
                      </button>

                      {/* Linhas do grupo */}
                      {isExpanded && (
                        <table className="w-full text-sm">
                          <tbody className="divide-y divide-gray-50 dark:divide-dark-700/50">
                            {groupPageClients.map(c => (
                              <tr
                                key={c.id}
                                className="hover:bg-primary-50/40 dark:hover:bg-primary-900/10 transition-colors cursor-pointer group"
                                onClick={() => setViewClient(c)}
                              >
                                <td className="w-10 px-3 py-3" onClick={e => e.stopPropagation()}>
                                  <button className="w-5 h-5 rounded border border-gray-300 dark:border-dark-500 flex items-center justify-center text-gray-400 hover:border-primary-400 hover:text-primary-600 transition-colors text-xs font-bold">+</button>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2.5">
                                    <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs flex-shrink-0 overflow-hidden',
                                      c.type === 'pf' ? 'bg-gradient-to-br from-primary-500 to-primary-700' : 'bg-gradient-to-br from-primary-400 to-primary-600')}>
                                      {(c as any).avatar_url
                                        ? <img src={(c as any).avatar_url} alt={c.name} className="w-full h-full object-cover" />
                                        : c.name[0]?.toUpperCase()}
                                    </div>
                                    <p className="font-medium text-gray-900 dark:text-white truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">{c.name}</p>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  {c.phone
                                    ? <span className="text-xs text-gray-600 dark:text-gray-300">{formatPhone(c.phone)}</span>
                                    : <span className="text-xs text-gray-400">N/A</span>}
                                </td>
                                <td className="px-4 py-3">
                                  <span className="text-xs text-gray-600 dark:text-gray-300">{c.cidade || 'N/A'}</span>
                                </td>
                                <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{formatDate(c.created_at)}</td>
                                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-600 text-gray-400 hover:text-primary-600 transition-colors">
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => deleteClient(c.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </>
        )}
      </Card>

      {/* ══ MODAL CADASTRO ══ */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="" size="lg">
        {/* Step indicator — Etapa 1 de 2 */}
        {!editId && (
          <div className="-mx-6 -mt-6 px-6 py-3 bg-gradient-to-r from-primary-50/80 to-white dark:from-primary-900/10 dark:to-dark-800 border-b border-gray-100 dark:border-dark-700">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-full bg-primary-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold text-white">1</span>
                </div>
                <span className="text-xs font-semibold text-primary-700 dark:text-primary-400">Dados do contato</span>
              </div>
              <div className="flex-1 h-px bg-gray-200 dark:bg-dark-600" />
              <svg className="w-2.5 h-2.5 text-gray-300 dark:text-dark-500 flex-shrink-0" fill="currentColor" viewBox="0 0 6 10"><path d="M0 0l6 5-6 5V0z"/></svg>
              <div className="flex items-center gap-1.5 opacity-40">
                <div className="w-5 h-5 rounded-full border-2 border-gray-300 dark:border-dark-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold text-gray-400">2</span>
                </div>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Nova tarefa</span>
              </div>
            </div>
          </div>
        )}
        {/* Header strip */}
        <div className={cn('-mx-6 px-6 pt-5 pb-4 border-b border-gray-100 dark:border-dark-700', editId && '-mt-6')}>
          {/* Avatar upload */}
          <div className="flex justify-center mb-4">
            <div className="relative group">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="w-20 h-20 rounded-full bg-gray-200 dark:bg-dark-600 flex items-center justify-center overflow-hidden border-2 border-dashed border-gray-300 dark:border-dark-500 hover:border-primary-400 transition-colors"
              >
                {avatarPreview || form.avatar_url ? (
                  <img src={avatarPreview || form.avatar_url} alt="Foto" className="w-full h-full object-cover" />
                ) : (
                  <svg className="w-12 h-12 text-gray-400 dark:text-gray-500" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                  </svg>
                )}
                {uploadingAvatar && (
                  <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </button>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary-600 flex items-center justify-center shadow cursor-pointer"
                onClick={() => avatarInputRef.current?.click()}>
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </div>
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white text-center mb-4">
            {editId ? 'Editar contato' : 'Criar novo contato'}
          </h2>

          {/* Top fields */}
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">CPF/CNPJ</label>
              <div className="relative">
                <input
                  className={cn(
                    'w-full px-3 py-2.5 pr-9 text-sm border rounded-lg bg-gray-50 dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 transition-colors',
                    cpfError
                      ? 'border-red-300 dark:border-red-600 focus:ring-red-100 focus:border-red-500'
                      : cpfSuggestion
                      ? 'border-amber-300 dark:border-amber-600 focus:ring-amber-100 focus:border-amber-500'
                      : 'border-gray-200 dark:border-dark-600 focus:ring-primary-100 focus:border-primary-500'
                  )}
                  placeholder={form.type === 'pf' ? '999.999.999-99' : '99.999.999/0001-99'}
                  value={form.cpf_cnpj}
                  maxLength={18}
                  onChange={e => lookupCpfCnpj(e.target.value)}
                />
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                  {cpfLoading
                    ? <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                    : cpfError
                    ? <AlertCircle className="w-4 h-4 text-red-500" />
                    : cpfSuggestion
                    ? <AlertCircle className="w-4 h-4 text-amber-500" />
                    : cpfNote
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    : null}
                </div>
              </div>
              {cpfError && <p className="text-xs text-red-500 mt-1">{cpfError}</p>}
              {cpfNote && !cpfError && (
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 flex items-center gap-1">
                  <Info className="w-3 h-3 flex-shrink-0" />
                  {cpfNote}
                </p>
              )}
              {cpfSuggestion && (
                <div className="mt-2 flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-xl">
                  <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 truncate">Contato já cadastrado: {cpfSuggestion.label}</p>
                    <p className="text-[11px] text-amber-700/80 dark:text-amber-500 mt-0.5">{cpfSuggestion.sub}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setForm(f => ({ ...f, ...cpfSuggestion.fields })); setCpfSuggestion(null) }}
                    className="flex-shrink-0 px-2.5 py-1.5 text-[11px] font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors"
                  >
                    Usar dados
                  </button>
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Nome*</label>
              <input
                className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                placeholder="Nome completo"
                value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Origem da pessoa*</label>
              <select
                className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                value={form.origem} onChange={e => setForm({ ...form, origem: e.target.value })}
              >
                <option value="">Selecione a origem</option>
                <option value="indicacao">Indicação</option>
                <option value="site">Site</option>
                <option value="redes_sociais">Redes Sociais</option>
                <option value="google">Google</option>
                <option value="email">E-mail</option>
                <option value="telefone">Telefone</option>
                <option value="escritorio">Escritório</option>
                <option value="outro">Outro</option>
              </select>
            </div>
            {form.origem === 'indicacao' && (
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
                  Parceiro que indicou
                </label>
                <select
                  className="w-full px-3 py-2.5 text-sm border border-amber-300 dark:border-amber-600 rounded-lg bg-amber-50 dark:bg-amber-900/10 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-500"
                  value={form.colaborador_id}
                  onChange={e => setForm({ ...form, colaborador_id: e.target.value })}
                >
                  <option value="">Selecione o parceiro</option>
                  {colaboradores.map(col => (
                    <option key={col.id} value={col.id}>
                      {col.nome}{col.cargo ? ` — ${col.cargo === 'parceiro' ? 'Parceiro' : col.cargo === 'advogado' ? 'Advogado' : col.cargo}` : ''}
                    </option>
                  ))}
                </select>
                {!form.colaborador_id && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Selecione quem indicou para registrar a indicação no parceiro
                  </p>
                )}
              </div>
            )}
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Anotações gerais</label>
              <input
                className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                placeholder="Anotações, senhas e outros"
                value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* PF / PJ toggle */}
        <div className="flex rounded-lg border border-gray-200 dark:border-dark-600 overflow-hidden my-4">
          <button
            onClick={() => setForm({ ...form, type: 'pf' })}
            className={cn('flex-1 py-2.5 text-sm font-semibold transition-colors',
              form.type === 'pf' ? 'bg-white dark:bg-dark-700 text-gray-900 dark:text-white shadow-sm' : 'bg-gray-50 dark:bg-dark-800 text-gray-400'
            )}
          >Pessoa física</button>
          <button
            onClick={() => setForm({ ...form, type: 'pj' })}
            className={cn('flex-1 py-2.5 text-sm font-semibold transition-colors',
              form.type === 'pj' ? 'bg-white dark:bg-dark-700 text-gray-900 dark:text-white shadow-sm' : 'bg-gray-50 dark:bg-dark-800 text-gray-400'
            )}
          >Pessoa jurídica</button>
        </div>

        {/* Scrollable extra fields */}
        <div className="space-y-3 pb-2">
          {/* País */}
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">País</label>
            <div className="relative">
              <input
                className="w-full px-3 py-2.5 pr-8 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                value={form.pais} onChange={e => setForm({ ...form, pais: e.target.value })}
              />
              {form.pais && (
                <button onClick={() => setForm({ ...form, pais: '' })}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {form.type === 'pf' && (
            <>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">RG</label>
                <input className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                  placeholder="Número" value={form.rg} onChange={e => setForm({ ...form, rg: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Data de nascimento</label>
                <input type="date"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                  value={form.birth_date} onChange={e => setForm({ ...form, birth_date: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Estado civil</label>
                <select className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                  value={form.marital_status} onChange={e => setForm({ ...form, marital_status: e.target.value })}>
                  <option value="">Selecione o estado civil</option>
                  <option value="solteiro">Solteiro(a)</option>
                  <option value="casado">Casado(a)</option>
                  <option value="divorciado">Divorciado(a)</option>
                  <option value="viuvo">Viúvo(a)</option>
                  <option value="uniao_estavel">União Estável</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Profissão</label>
                <input className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                  placeholder="Atividade da pessoa" value={form.profession} onChange={e => setForm({ ...form, profession: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Sexo</label>
                <select className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                  value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}>
                  <option value="">Selecione o gênero</option>
                  <option value="masculino">Masculino</option>
                  <option value="feminino">Feminino</option>
                  <option value="outro">Outro</option>
                  <option value="nao_informado">Prefiro não informar</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Nacionalidade</label>
                <input className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                  placeholder="Nacionalidade da pessoa" value={form.nationality} onChange={e => setForm({ ...form, nationality: e.target.value })} />
              </div>
            </>
          )}

          {/* Contato */}
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Celular</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                placeholder="(99) 99999-9999" value={form.celular} onChange={e => setForm({ ...form, celular: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Telefone</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                placeholder="(99) 99999-9999" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">E-mail</label>
            <input type="email" className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
              placeholder="exemplo@email.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          </div>

          {/* Endereço */}
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">CEP</label>
            <div className="relative">
              <input
                className={cn(
                  'w-full px-3 py-2.5 pr-9 text-sm border rounded-lg bg-gray-50 dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 transition-colors',
                  cepError
                    ? 'border-red-300 dark:border-red-600 focus:ring-red-100 focus:border-red-500'
                    : 'border-gray-200 dark:border-dark-600 focus:ring-primary-100 focus:border-primary-500'
                )}
                placeholder="99999-999"
                value={form.cep}
                maxLength={9}
                onChange={e => lookupCep(e.target.value)}
              />
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                {cepLoading ? (
                  <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                ) : form.cep.replace(/\D/g, '').length === 8 && !cepError ? (
                  <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : null}
              </div>
            </div>
            {cepError && <p className="text-xs text-red-500 mt-1">{cepError}</p>}
          </div>
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Estado</label>
            <select className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
              value={form.state} onChange={e => setForm({ ...form, state: e.target.value })}>
              <option value="">Selecione o estado</option>
              {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Cidade</label>
            <input list="city-options"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
              placeholder="Selecione a cidade" value={form.cidade} onChange={e => setForm({ ...form, cidade: e.target.value })} />
            <datalist id="city-options">{cityOptions.map(c => <option key={c} value={c} />)}</datalist>
          </div>
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Endereço</label>
            <input className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
              placeholder="Rua Exemplo, 123" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Bairro</label>
            <input className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
              placeholder="Bairro do endereço" value={form.bairro} onChange={e => setForm({ ...form, bairro: e.target.value })} />
          </div>

          {form.type === 'pf' && (
            <>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">PIS/PASEP</label>
                <input className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                  placeholder="999.9999.999-9" value={form.pis_pasep} onChange={e => setForm({ ...form, pis_pasep: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">CTPS</label>
                <input className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                  placeholder="Número da carteira de trabalho digital" value={form.ctps} onChange={e => setForm({ ...form, ctps: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">CID</label>
                <input className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                  placeholder="Número do CID" value={form.cid} onChange={e => setForm({ ...form, cid: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Nome da mãe</label>
                <input className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                  placeholder="Nome completo da mãe" value={form.nome_mae} onChange={e => setForm({ ...form, nome_mae: e.target.value })} />
              </div>
            </>
          )}

          {/* Campos jurídicos */}
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Área do Direito</label>
            <input list="area-options"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
              placeholder="Selecione ou digite" value={form.area_direito} onChange={e => setForm({ ...form, area_direito: e.target.value })} />
            <datalist id="area-options">{areaOptions.map(a => <option key={a} value={a} />)}</datalist>
          </div>
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Modalidade</label>
            <select className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
              value={form.modalidade} onChange={e => setForm({ ...form, modalidade: e.target.value })}>
              <option value="">Selecione</option>
              <option value="judicial">Judicial</option>
              <option value="administrativo">Administrativo</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Data de Entrada</label>
            <div className="relative">
              <input type="date"
                className="w-full px-3 py-2.5 pr-8 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                value={form.entry_date} onChange={e => setForm({ ...form, entry_date: e.target.value })} />
              {form.entry_date && (
                <button type="button" onClick={() => setForm({ ...form, entry_date: '' })}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">Deixe em branco se não souber a data</p>
          </div>
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Advogado Responsável</label>
            <select className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
              value={form.assigned_lawyer_uid}
              onChange={e => {
                const user = systemUsers.find(u => u.user_id === e.target.value)
                setForm({ ...form, assigned_lawyer_uid: e.target.value, assigned_lawyer: user ? (user.name || user.display_name || '') : '' })
              }}>
              <option value="">Sem responsável</option>
              {systemUsers.map(u => (
                <option key={u.user_id} value={u.user_id}>
                  {u.name || u.display_name} — {u.role === 'admin' ? 'Administrador' : u.role === 'lawyer' ? 'Advogado' : u.role === 'intern' ? 'Estagiário' : u.role === 'financial' ? 'Financeiro' : u.role}
                </option>
              ))}
            </select>
          </div>

          {form.colaborador_id && (
            <div className="rounded-xl border border-gray-200 dark:border-dark-600 p-4 bg-gray-50 dark:bg-dark-700/30">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <div
                  onClick={() => setForm(f => ({ ...f, colaborador_pago: !f.colaborador_pago }))}
                  className={cn('relative w-11 h-6 rounded-full transition-colors flex-shrink-0', form.colaborador_pago ? 'bg-green-500' : 'bg-gray-300 dark:bg-dark-500')}
                >
                  <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform', form.colaborador_pago && 'translate-x-5')} />
                </div>
                <p className={cn('text-sm font-semibold', form.colaborador_pago ? 'text-green-700 dark:text-green-400' : 'text-gray-700 dark:text-gray-300')}>
                  {form.colaborador_pago ? 'Colaborador pago' : 'Colaborador ainda não pago'}
                </p>
              </label>
              {form.colaborador_pago && (
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-dark-600 grid grid-cols-2 gap-3">
                  <Input label="Data do Pagamento" type="date" value={form.colaborador_pago_data} onChange={e => setForm({ ...form, colaborador_pago_data: e.target.value })} />
                  <Input label="Valor (R$)" type="number" step="0.01" min="0" placeholder="0,00" value={form.colaborador_pago_valor} onChange={e => setForm({ ...form, colaborador_pago_valor: e.target.value })} />
                </div>
              )}
            </div>
          )}

          {/* ── Honorários / Processo já foi pago ── */}
          {!editId && (
            <div className="rounded-xl border border-gray-200 dark:border-dark-600 p-4 bg-gray-50 dark:bg-dark-700/30">
              <label
                className="flex items-center gap-3 cursor-pointer select-none"
                onClick={() => setForm(f => ({ ...f, processo_pago: !f.processo_pago }))}
              >
                <div className={cn('relative w-11 h-6 rounded-full transition-colors flex-shrink-0', form.processo_pago ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-dark-500')}>
                  <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform', form.processo_pago && 'translate-x-5')} />
                </div>
                <div>
                  <p className={cn('text-sm font-semibold', form.processo_pago ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-700 dark:text-gray-300')}>
                    {form.processo_pago ? 'Processo já foi pago' : 'Processo ainda não pago'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">Ao ativar, registra automaticamente no Financeiro</p>
                </div>
              </label>
              {form.processo_pago && (
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-dark-600 space-y-3">
                  <div>
                    <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Categoria</label>
                    <select
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                      value={form.processo_categoria}
                      onChange={e => setForm({ ...form, processo_categoria: e.target.value })}
                    >
                      <option value="fees">Honorários</option>
                      <option value="costs">Custas</option>
                      <option value="other">Outros</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Valor (R$)" type="number" step="0.01" min="0" placeholder="0,00"
                      value={form.processo_pago_valor}
                      onChange={e => setForm({ ...form, processo_pago_valor: e.target.value })} />
                    <Input label="Data do Pagamento" type="date"
                      value={form.processo_pago_data}
                      onChange={e => setForm({ ...form, processo_pago_data: e.target.value })} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 -mx-6 px-6 pt-4 border-t border-gray-100 dark:border-dark-700">
          <button
            onClick={save}
            disabled={saving || !form.name.trim()}
            className="w-full py-3 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-semibold text-sm transition-colors"
          >
            {saving ? 'Salvando...' : editId ? 'Salvar alterações' : 'Salvar e continuar →'}
          </button>
        </div>
      </Modal>

      {/* ══ MODAL VISUALIZAÇÃO ══ */}
      <Modal open={!!viewClient} onClose={() => setViewClient(null)} title="" size="lg">
        {viewClient && (() => {
          const procs = clientProcesses[viewClient.id] || []
          const col = colaboradores.find(x => x.id === viewClient.colaborador_id)
          return (
            <div className="-mx-6 -mt-6">
              <div className="relative overflow-hidden rounded-t-2xl bg-gradient-to-br from-primary-700 via-primary-600 to-primary-500 text-white px-6 py-6">
                <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
                <div className="relative flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center text-2xl font-bold flex-shrink-0 overflow-hidden">
                    {(viewClient as any).avatar_url
                      ? <img src={(viewClient as any).avatar_url} alt={viewClient.name} className="w-full h-full object-cover" />
                      : viewClient.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-bold">{viewClient.name}</h3>
                    {viewClient.cpf_cnpj && <p className="text-xs text-white/75 font-mono mt-0.5">{formatCPFCNPJ(viewClient.cpf_cnpj)}</p>}
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      <Badge className="bg-white/20 text-white border border-white/30">{viewClient.type === 'pf' ? 'Pessoa Física' : 'Pessoa Jurídica'}</Badge>
                      <Badge className={STATUS_COLORS[viewClient.status || 'active']}>{STATUS_LABELS[viewClient.status || 'active']}</Badge>
                      {col && <Badge className="bg-white/20 text-white border border-white/30"><UserCheck className="w-3 h-3 mr-1" />{col.nome}</Badge>}
                    </div>
                  </div>
                </div>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <DetailField icon={Phone} label="Telefone" value={viewClient.phone ? <a href={`tel:${viewClient.phone}`} className="text-primary-600 hover:underline">{formatPhone(viewClient.phone)}</a> : null} />
                  <DetailField icon={Mail} label="Email" value={viewClient.email ? <a href={`mailto:${viewClient.email}`} className="text-primary-600 hover:underline">{viewClient.email}</a> : null} />
                  <DetailField icon={MapPin} label="Cidade" value={viewClient.cidade} />
                  <DetailField icon={Scale} label="Área do Direito" value={viewClient.area_direito} />
                  <DetailField icon={Calendar} label="Data de Entrada" value={viewClient.entry_date ? formatDate(viewClient.entry_date) : null} />
                  <DetailField icon={Calendar} label="Cadastrado em" value={formatDate(viewClient.created_at)} />
                  <DetailField icon={FileText} label="Total Faturado" value={<span className="font-semibold text-green-600 dark:text-green-400">{formatCurrency(viewClient.total_billed ?? 0)}</span>} />
                  {viewClient.modalidade && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Modalidade</p>
                      <Badge className={viewClient.modalidade === 'judicial' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}>
                        {viewClient.modalidade === 'judicial' ? 'Judicial' : 'Administrativo'}
                      </Badge>
                    </div>
                  )}
                </div>
                {viewClient.colaborador_id && col && (
                  <div className="pt-3 border-t border-gray-100 dark:border-dark-700">
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold mb-2">Pagamento ao Colaborador</p>
                    <div className={cn('flex items-center gap-3 rounded-xl px-4 py-3 border', viewClient.colaborador_pago ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800')}>
                      {viewClient.colaborador_pago
                        ? <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                        : <Clock className="w-5 h-5 text-orange-500 flex-shrink-0" />}
                      <div>
                        <p className={cn('text-sm font-semibold', viewClient.colaborador_pago ? 'text-green-700 dark:text-green-400' : 'text-orange-600 dark:text-orange-400')}>
                          {viewClient.colaborador_pago ? `${col.nome} — Pago` : `${col.nome} — Pagamento pendente`}
                        </p>
                        {viewClient.colaborador_pago && viewClient.colaborador_pago_data && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">Pago em {formatDate(viewClient.colaborador_pago_data)}</p>
                        )}
                        {viewClient.colaborador_pago && viewClient.colaborador_pago_valor != null && (
                          <p className="text-xs font-semibold text-green-600 dark:text-green-400">{formatCurrency(viewClient.colaborador_pago_valor)}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {viewClient.address && <div className="pt-3 border-t border-gray-100 dark:border-dark-700"><p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Endereço</p><p className="text-sm text-gray-900 dark:text-white">{viewClient.address}</p></div>}
                {viewClient.notes && <div className="pt-3 border-t border-gray-100 dark:border-dark-700"><p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Observações</p><p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">{viewClient.notes}</p></div>}
                {procs.length > 0 && (
                  <div className="pt-3 border-t border-gray-100 dark:border-dark-700">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2"><Briefcase className="w-4 h-4 text-primary-600" />Processos ({procs.length})</p>
                    <div className="space-y-1.5">
                      {procs.map(p => (
                        <div key={p.id} className="flex items-center gap-3 bg-white dark:bg-dark-800 rounded-lg border border-gray-200 dark:border-dark-600 px-3 py-2 overflow-hidden">
                          <div className={cn('w-1 self-stretch rounded-full flex-shrink-0', p.modalidade === 'judicial' ? 'bg-purple-500' : 'bg-blue-500')} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{p.title}</p>
                            <p className="text-[11px] font-mono text-gray-400">{p.number}</p>
                          </div>
                          <Badge className={p.modalidade === 'judicial' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}>
                            {p.modalidade === 'judicial' ? 'Judicial' : 'Admin.'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-3 border-t border-gray-100 dark:border-dark-700">
                  <Button variant="outline" size="sm" onClick={() => { const vc = viewClient; setViewClient(null); openEdit(vc) }}><Edit3 className="w-3.5 h-3.5" />Editar</Button>
                  <Button size="sm" onClick={() => setViewClient(null)}>Fechar</Button>
                </div>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* ══ MODAL TAREFA — Etapa 2 ══ */}
      <Modal open={taskModalOpen} onClose={closeTaskModal} title="" size="md">
        {/* Step indicator — Etapa 2 de 2 */}
        <div className="-mx-6 -mt-6 px-6 py-3 bg-gradient-to-r from-primary-50/80 to-white dark:from-primary-900/10 dark:to-dark-800 border-b border-gray-100 dark:border-dark-700">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 opacity-50">
              <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-3 h-3 text-white" />
              </div>
              <span className="text-xs font-medium text-gray-400 line-through">Dados do contato</span>
            </div>
            <div className="flex-1 h-px bg-primary-300 dark:bg-primary-700" />
            <svg className="w-2.5 h-2.5 text-primary-400 flex-shrink-0" fill="currentColor" viewBox="0 0 6 10"><path d="M0 0l6 5-6 5V0z"/></svg>
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full bg-primary-600 flex items-center justify-center flex-shrink-0">
                <span className="text-[10px] font-bold text-white">2</span>
              </div>
              <span className="text-xs font-semibold text-primary-700 dark:text-primary-400">Nova tarefa</span>
            </div>
          </div>
        </div>

        {/* Header */}
        <div className="-mx-6 px-6 pt-5 pb-4 border-b border-gray-100 dark:border-dark-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
              <CheckSquare className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white">Criar tarefa</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Para: <span className="font-semibold text-primary-600 dark:text-primary-400">{savedClientName}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="space-y-3 mt-4">
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Título da tarefa *</label>
            <input
              className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
              placeholder="Ex: Protocolar processo, Enviar documentos..."
              value={taskForm.title}
              onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Descrição</label>
            <textarea
              rows={3}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 resize-none"
              placeholder="Detalhes da tarefa..."
              value={taskForm.description}
              onChange={e => setTaskForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Data de entrega</label>
              <input
                type="date"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                value={taskForm.due_date}
                onChange={e => setTaskForm(f => ({ ...f, due_date: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Prioridade</label>
              <select
                className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                value={taskForm.priority}
                onChange={e => setTaskForm(f => ({ ...f, priority: e.target.value }))}
              >
                <option value="low">Baixa</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
                <option value="urgent">Urgente</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Tipo</label>
            <select
              className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
              value={taskForm.type}
              onChange={e => setTaskForm(f => ({ ...f, type: e.target.value }))}
            >
              <option value="custom">Personalizado</option>
              <option value="deadline">Prazo</option>
              <option value="hearing">Audiência</option>
              <option value="document">Documento</option>
              <option value="meeting">Reunião</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Responsável</label>
            <select
              className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
              value={taskForm.assigned_to}
              onChange={e => {
                const u = systemUsers.find(u => u.user_id === e.target.value)
                setTaskForm(f => ({ ...f, assigned_to: e.target.value, assigned_name: u ? (u.name || u.display_name || '') : '' }))
              }}
            >
              <option value="">Sem responsável</option>
              {systemUsers.map(u => (
                <option key={u.user_id} value={u.user_id}>
                  {u.name || u.display_name} — {u.role === 'admin' ? 'Administrador' : u.role === 'lawyer' ? 'Advogado' : u.role === 'intern' ? 'Estagiário' : u.role === 'financial' ? 'Financeiro' : u.role}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Buttons */}
        <div className="mt-5 -mx-6 px-6 pt-4 border-t border-gray-100 dark:border-dark-700 space-y-2">
          <button
            onClick={saveTask}
            disabled={saving || !taskForm.title.trim()}
            className="w-full py-3 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
          >
            <CheckSquare className="w-4 h-4" />
            {saving ? 'Salvando...' : 'Criar tarefa'}
          </button>
          <button
            onClick={closeTaskModal}
            className="w-full py-2.5 rounded-xl text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors"
          >
            Pular esta etapa
          </button>
        </div>
      </Modal>
    </Layout>
  )
}
