import { usePageLoadingState } from '@/contexts/PageLoadingContext'
import { useEffect, useState } from 'react'
import { Users, Building2, Megaphone, Ticket, Plus, Trash2, Search, X } from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Card, Badge, Button, Modal, Input, Select, Textarea, StatsCard, EmptyState } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { Tenant, Profile, SystemAnnouncement, SupportTicket } from '@/types'
import { formatDate, ROLE_LABELS } from '@/lib/utils'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { withErrorFeedback } from '@/lib/errorFeedback'
import { useAuth } from '@/contexts/AuthContext'

const EMPTY_ANNOUNCEMENT = {
  title: '', message: '', type: 'info', category: 'novidade' as 'novidade' | 'aviso',
  link: '', link_label: '', audience: 'all', requires_feature: '', published_at: '',
}

export function AdminPage() {
  const { profile } = useAuth()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [users, setUsers] = useState<Profile[]>([])
  const [announcements, setAnnouncements] = useState<SystemAnnouncement[]>([])
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loading, setLoading] = usePageLoadingState()
  const [tab, setTab] = useState<'overview' | 'tenants' | 'users' | 'announcements' | 'tickets'>('overview')
  const [announcementModal, setAnnouncementModal] = useState(false)
  const [announcementForm, setAnnouncementForm] = useState(EMPTY_ANNOUNCEMENT)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  async function load() {
    setLoading(true)
    const [{ data: t }, { data: u }, { data: a }, { data: tk }] = await Promise.all([
      supabase.from('tenants').select('*').order('name'),
      supabase.from('profiles').select('*').order('name'),
      supabase.from('system_announcements').select('*').order('created_at', { ascending: false }),
      supabase.from('support_tickets').select('*').order('created_at', { ascending: false }),
    ])
    setTenants(t || [])
    setUsers(u || [])
    setAnnouncements(a || [])
    setTickets(tk || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function saveAnnouncement() {
    if (!announcementForm.title || !announcementForm.message) return
    setSaving(true)
    const f = announcementForm
    const { error } = await withErrorFeedback(supabase.from('system_announcements').insert({
      title: f.title.trim(), message: f.message.trim(), type: f.type, category: f.category,
      link: f.link.trim() || null, link_label: f.link_label.trim() || null,
      audience_roles: f.audience === 'admins' ? ['admin', 'super_admin'] : null,
      requires_feature: f.requires_feature || null,
      published_at: f.published_at ? new Date(f.published_at).toISOString() : new Date().toISOString(),
      created_by: profile?.user_id || null,
    }), 'Erro ao publicar')
    setSaving(false)
    if (error) return
    setAnnouncementModal(false)
    setAnnouncementForm(EMPTY_ANNOUNCEMENT)
    load()
  }

  // Encerra (deixa de aparecer para todos) em vez de apagar — o histórico de leitura fica.
  async function deleteAnnouncement(id: string) {
    if (!(await confirmDialog('Encerrar esta publicação? Ela deixa de aparecer para os usuários.'))) return
    const { error } = await withErrorFeedback(supabase.from('system_announcements').update({ expires_at: new Date().toISOString() }).eq('id', id), 'Erro ao encerrar publicação')
    if (error) return
    load()
  }

  async function updateTicketStatus(id: string, status: string) {
    const { error } = await withErrorFeedback(supabase.from('support_tickets').update({ status }).eq('id', id), 'Erro ao atualizar status do chamado')
    if (error) return
    load()
  }

  const TABS = [
    { key: 'overview', label: 'Visão Geral' },
    { key: 'tenants', label: `Escritórios (${tenants.length})` },
    { key: 'users', label: `Usuários (${users.length})` },
    { key: 'announcements', label: `Novidades e avisos (${announcements.length})` },
    { key: 'tickets', label: `Suporte (${tickets.filter(t => t.status === 'open').length} abertos)` },
  ]

  const q = search.trim().toLowerCase()
  const filteredTenants = q ? tenants.filter(t => t.name?.toLowerCase().includes(q) || t.slug?.toLowerCase().includes(q)) : tenants
  const filteredUsers = q ? users.filter(u => (u.name || u.display_name || '').toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)) : users
  const filteredAnnouncements = q ? announcements.filter(a => a.title?.toLowerCase().includes(q) || a.message?.toLowerCase().includes(q)) : announcements
  const filteredTickets = q ? tickets.filter(t => t.user_name?.toLowerCase().includes(q) || t.user_email?.toLowerCase().includes(q) || t.subject?.toLowerCase().includes(q)) : tickets

  return (
    <Layout
      title="Painel Administrativo"
      actions={
        tab === 'announcements'
          ? <Button onClick={() => setAnnouncementModal(true)}><Plus className="w-4 h-4" /> Publicar novidade</Button>
          : undefined
      }
    >
      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit flex-wrap">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab !== 'overview' && (
        <div className="relative mb-4 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
            placeholder="Buscar..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {!loading && (
        <>
          {tab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatsCard label="Escritórios" value={tenants.length} icon={Building2} color="blue" />
                <StatsCard label="Usuários" value={users.length} icon={Users} color="purple" />
                <StatsCard label="Avisos Ativos" value={announcements.length} icon={Megaphone} color="orange" />
                <StatsCard label="Tickets Abertos" value={tickets.filter(t => t.status === 'open').length} icon={Ticket} color="red" />
              </div>
            </div>
          )}

          {tab === 'tenants' && (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left">
                      <th className="px-4 py-3 font-medium text-gray-500">Escritório</th>
                      <th className="px-4 py-3 font-medium text-gray-500">Slug</th>
                      <th className="px-4 py-3 font-medium text-gray-500">Plano</th>
                      <th className="px-4 py-3 font-medium text-gray-500">Cadastro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTenants.map(t => (
                      <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{t.name}</td>
                        <td className="px-4 py-3 text-gray-500 font-mono text-xs">{t.slug}</td>
                        <td className="px-4 py-3">
                          <Badge className="bg-purple-100 text-purple-700 capitalize">{t.plan || 'starter'}</Badge>
                        </td>
                        <td className="px-4 py-3 text-gray-500">{formatDate(t.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {tab === 'users' && (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left">
                      <th className="px-4 py-3 font-medium text-gray-500">Usuário</th>
                      <th className="px-4 py-3 font-medium text-gray-500">Email</th>
                      <th className="px-4 py-3 font-medium text-gray-500">Função</th>
                      <th className="px-4 py-3 font-medium text-gray-500">Plano</th>
                      <th className="px-4 py-3 font-medium text-gray-500">Cadastro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map(u => (
                      <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold">
                              {(u.name || u.display_name || '?')[0]?.toUpperCase()}
                            </div>
                            <span className="font-medium text-gray-900">{u.name || u.display_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{u.email || '—'}</td>
                        <td className="px-4 py-3">
                          <Badge className={u.role === 'super_admin' ? 'bg-red-100 text-red-700' : u.role === 'admin' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}>
                            {ROLE_LABELS[u.role || 'lawyer']}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={u.subscription_status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>
                            {u.subscription_status || 'inactive'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-gray-500">{formatDate(u.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {tab === 'announcements' && (
            <div className="space-y-3">
              {filteredAnnouncements.length === 0 ? (
                <Card className="p-4"><EmptyState icon={Megaphone} title={q ? 'Nenhum aviso encontrado' : 'Nenhum aviso criado'} /></Card>
              ) : filteredAnnouncements.map(a => (
                <Card key={a.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={a.type === 'warning' ? 'bg-yellow-100 text-yellow-700' : a.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}>
                          {a.type}
                        </Badge>
                        <Badge className={a.category === 'aviso' ? 'bg-amber-100 text-amber-800' : 'bg-primary-50 text-primary-700'}>
                          {a.category === 'aviso' ? 'Aviso' : 'Novidade'}
                        </Badge>
                        <span className="font-semibold text-gray-900">{a.title}</span>
                        {a.expires_at && new Date(a.expires_at) <= new Date() && <Badge className="bg-gray-100 text-gray-500">encerrada</Badge>}
                      </div>
                      <p className="text-sm text-gray-600 whitespace-pre-line">{a.message}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {formatDate(a.published_at || a.created_at, 'dd/MM/yyyy HH:mm')}
                        {a.link && <> · leva para <span className="font-mono">{a.link}</span></>}
                        {a.audience_roles?.length ? <> · só {a.audience_roles.join(', ')}</> : null}
                        {a.requires_feature && <> · só com {a.requires_feature} ligado</>}
                      </p>
                    </div>
                    {!(a.expires_at && new Date(a.expires_at) <= new Date()) && (
                      <button onClick={() => deleteAnnouncement(a.id)} title="Encerrar" className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {tab === 'tickets' && (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left">
                      <th className="px-4 py-3 font-medium text-gray-500">Usuário</th>
                      <th className="px-4 py-3 font-medium text-gray-500">Assunto</th>
                      <th className="px-4 py-3 font-medium text-gray-500">Status</th>
                      <th className="px-4 py-3 font-medium text-gray-500">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTickets.map(t => (
                      <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{t.user_name || '—'}</p>
                          <p className="text-xs text-gray-400">{t.user_email}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{t.subject || '—'}</td>
                        <td className="px-4 py-3">
                          <select
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white"
                            value={t.status || 'open'}
                            onChange={e => updateTicketStatus(t.id, e.target.value)}
                          >
                            <option value="open">Aberto</option>
                            <option value="in_progress">Em andamento</option>
                            <option value="resolved">Resolvido</option>
                            <option value="closed">Fechado</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-gray-500">{formatDate(t.created_at, 'dd/MM/yyyy HH:mm')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      <Modal open={announcementModal} onClose={() => setAnnouncementModal(false)} title="Publicar novidade ou aviso" size="md">
        <div className="space-y-4">
          <p className="text-xs text-gray-500">Aparece numa janela para a equipe dos escritórios ao entrar (uma vez por pessoa) e fica no botão "Novidades" do topo.</p>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Categoria" value={announcementForm.category} onChange={e => setAnnouncementForm({ ...announcementForm, category: e.target.value as 'novidade' | 'aviso' })}>
              <option value="novidade">Novidade (funcionalidade)</option>
              <option value="aviso">Aviso (comunicado)</option>
            </Select>
            <Select label="Para quem" value={announcementForm.audience} onChange={e => setAnnouncementForm({ ...announcementForm, audience: e.target.value })}>
              <option value="all">Toda a equipe</option>
              <option value="admins">Só administradores</option>
            </Select>
          </div>
          <Input label="Título" value={announcementForm.title} onChange={e => setAnnouncementForm({ ...announcementForm, title: e.target.value })} />
          <Textarea label="Mensagem" value={announcementForm.message} onChange={e => setAnnouncementForm({ ...announcementForm, message: e.target.value })} rows={4} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Link (rota do app)" placeholder="/processos" value={announcementForm.link} onChange={e => setAnnouncementForm({ ...announcementForm, link: e.target.value })} />
            <Input label="Texto do botão" placeholder="Ver agora" value={announcementForm.link_label} onChange={e => setAnnouncementForm({ ...announcementForm, link_label: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Só para escritórios com" value={announcementForm.requires_feature} onChange={e => setAnnouncementForm({ ...announcementForm, requires_feature: e.target.value })}>
              <option value="">Todos os escritórios</option>
              <option value="prazos">Controle de Prazos ligado</option>
            </Select>
            <Input label="Publicar em (opcional)" type="datetime-local" value={announcementForm.published_at} onChange={e => setAnnouncementForm({ ...announcementForm, published_at: e.target.value })} />
          </div>
          <Select label="Tom" value={announcementForm.type} onChange={e => setAnnouncementForm({ ...announcementForm, type: e.target.value })}>
            <option value="info">Informação</option>
            <option value="success">Sucesso</option>
            <option value="warning">Atenção</option>
            <option value="error">Problema</option>
          </Select>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={() => setAnnouncementModal(false)}>Cancelar</Button>
          <Button onClick={saveAnnouncement} loading={saving}>{announcementForm.published_at ? 'Agendar' : 'Publicar agora'}</Button>
        </div>
      </Modal>
    </Layout>
  )
}
