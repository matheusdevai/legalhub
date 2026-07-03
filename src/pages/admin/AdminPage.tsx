import { usePageLoadingState } from '@/contexts/PageLoadingContext'
import { useEffect, useState } from 'react'
import { Shield, Users, Building2, Megaphone, Ticket, Plus, Trash2 } from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Card, Badge, Button, Modal, Input, Select, Textarea, Spinner, StatsCard } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { Tenant, Profile, SystemAnnouncement, SupportTicket } from '@/types'
import { formatDate, ROLE_LABELS } from '@/lib/utils'

export function AdminPage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [users, setUsers] = useState<Profile[]>([])
  const [announcements, setAnnouncements] = useState<SystemAnnouncement[]>([])
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loading, setLoading] = usePageLoadingState()
  const [tab, setTab] = useState<'overview' | 'tenants' | 'users' | 'announcements' | 'tickets'>('overview')
  const [announcementModal, setAnnouncementModal] = useState(false)
  const [announcementForm, setAnnouncementForm] = useState({ title: '', message: '', type: 'info' })
  const [saving, setSaving] = useState(false)

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
    await supabase.from('system_announcements').insert(announcementForm)
    setSaving(false)
    setAnnouncementModal(false)
    setAnnouncementForm({ title: '', message: '', type: 'info' })
    load()
  }

  async function deleteAnnouncement(id: string) {
    if (!confirm('Excluir este anúncio?')) return
    await supabase.from('system_announcements').delete().eq('id', id)
    load()
  }

  async function updateTicketStatus(id: string, status: string) {
    await supabase.from('support_tickets').update({ status }).eq('id', id)
    load()
  }

  const TABS = [
    { key: 'overview', label: 'Visão Geral' },
    { key: 'tenants', label: `Escritórios (${tenants.length})` },
    { key: 'users', label: `Usuários (${users.length})` },
    { key: 'announcements', label: `Avisos (${announcements.length})` },
    { key: 'tickets', label: `Suporte (${tickets.filter(t => t.status === 'open').length} abertos)` },
  ]

  return (
    <Layout
      title="Painel Administrativo"
      actions={
        tab === 'announcements'
          ? <Button onClick={() => setAnnouncementModal(true)}><Plus className="w-4 h-4" /> Novo Aviso</Button>
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
                    {tenants.map(t => (
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
                    {users.map(u => (
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
              {announcements.length === 0 ? (
                <Card className="p-8 text-center text-gray-400">Nenhum aviso criado</Card>
              ) : announcements.map(a => (
                <Card key={a.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={a.type === 'warning' ? 'bg-yellow-100 text-yellow-700' : a.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}>
                          {a.type}
                        </Badge>
                        <span className="font-semibold text-gray-900">{a.title}</span>
                      </div>
                      <p className="text-sm text-gray-600">{a.message}</p>
                      <p className="text-xs text-gray-400 mt-1">{formatDate(a.created_at, 'dd/MM/yyyy HH:mm')}</p>
                    </div>
                    <button onClick={() => deleteAnnouncement(a.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
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
                    {tickets.map(t => (
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

      <Modal open={announcementModal} onClose={() => setAnnouncementModal(false)} title="Novo Aviso do Sistema" size="md">
        <div className="space-y-4">
          <Input label="Título" value={announcementForm.title} onChange={e => setAnnouncementForm({ ...announcementForm, title: e.target.value })} />
          <Select label="Tipo" value={announcementForm.type} onChange={e => setAnnouncementForm({ ...announcementForm, type: e.target.value })}>
            <option value="info">Informação</option>
            <option value="warning">Aviso</option>
            <option value="error">Erro</option>
            <option value="success">Sucesso</option>
          </Select>
          <Textarea label="Mensagem" value={announcementForm.message} onChange={e => setAnnouncementForm({ ...announcementForm, message: e.target.value })} rows={4} />
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={() => setAnnouncementModal(false)}>Cancelar</Button>
          <Button onClick={saveAnnouncement} loading={saving}>Publicar</Button>
        </div>
      </Modal>
    </Layout>
  )
}
