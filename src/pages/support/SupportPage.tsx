import { usePageLoadingState } from '@/contexts/PageLoadingContext'
import { useEffect, useState } from 'react'
import {
  HelpCircle, Plus, Send, MessageSquare, Clock, CheckCircle2,
  ChevronRight, BookOpen, Video, Zap, ExternalLink, Search,
  AlertCircle, X, ArrowLeft,
} from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Button, Card, Badge, Modal, Input, Textarea, Spinner } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { SupportTicket } from '@/types'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

const STATUS_META: Record<string, { label: string; badge: string; icon: any }> = {
  open:        { label: 'Aberto',       badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',     icon: Clock },
  in_progress: { label: 'Em andamento', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: MessageSquare },
  resolved:    { label: 'Resolvido',    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', icon: CheckCircle2 },
  closed:      { label: 'Fechado',      badge: 'bg-gray-100 text-gray-500 dark:bg-dark-700 dark:text-gray-400',         icon: X },
}

const FAQ_ITEMS = [
  { q: 'Como adicionar um novo usuário ao sistema?', a: 'Acesse Usuários no menu lateral e clique em "+ Novo Usuário". Preencha email, senha e função. O usuário receberá acesso imediatamente.' },
  { q: 'Como integrar o Google Agenda?', a: 'Vá em Agenda > Conectar Google. Você precisará de uma conta Google e autorizar o acesso. Após conectado, os eventos são sincronizados automaticamente.' },
  { q: 'Como exportar relatórios?', a: 'Na tela de Relatórios, use o botão "Exportar" no canto superior direito. Você pode exportar em formato .txt ou usar a função de impressão do navegador para PDF.' },
  { q: 'Como monitorar publicações do Diário de Justiça?', a: 'Acesse Publicações no menu lateral. Clique em "Monitorar Parte" e adicione o CPF/CNPJ ou nome da parte. O sistema verificará diariamente as publicações.' },
  { q: 'Como criar um modelo de documento?', a: 'Acesse Documentos > Novo Documento. Selecione o tipo "Modelo" e use variáveis como [NOME_CLIENTE], [NUMERO_PROCESSO] que serão substituídas automaticamente.' },
]

export function SupportPage() {
  const { profile, user } = useAuth()
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loading, setLoading] = usePageLoadingState()
  const [view, setView] = useState<'home' | 'tickets' | 'faq'>('home')
  const [modalOpen, setModalOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [category, setCategory] = useState('question')
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false })
    setTickets(data || [])
    setLoading(false)
  }

  useEffect(() => { if (user) load() }, [user])

  async function createTicket() {
    if (!subject.trim() || !message.trim()) return
    setSaving(true)
    const { data: ticket } = await supabase.from('support_tickets').insert({
      user_id: user?.id,
      user_email: profile?.email,
      user_name: profile?.name || profile?.display_name,
      subject,
      status: 'open',
    }).select().single()

    if (ticket) {
      await supabase.from('support_messages').insert({
        ticket_id: ticket.id,
        sender_id: user?.id,
        sender_name: profile?.name || profile?.display_name || 'Usuário',
        sender_role: 'user',
        content: message,
      })
    }

    setSaving(false)
    setModalOpen(false)
    setSubject('')
    setMessage('')
    load()
  }

  const filteredFaq = FAQ_ITEMS.filter(item =>
    !search || item.q.toLowerCase().includes(search.toLowerCase()) || item.a.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <Layout title="Suporte" subtitle="Central de ajuda e atendimento">
      <div className="max-w-4xl space-y-5">

        {view === 'home' && (
          <>
            {/* Hero */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-sidebar-900 via-sidebar-800 to-primary-900 text-white p-6 sm:p-8 shadow-xl border border-white/5">
              <div className="absolute -right-8 -top-8 w-48 h-48 bg-primary-600/10 rounded-full blur-3xl" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-3">
                  <HelpCircle className="w-5 h-5 text-white/60" />
                  <p className="text-sm font-medium text-white/60">Central de Suporte LegalHub</p>
                </div>
                <h2 className="text-2xl font-bold mb-2">Como podemos ajudar?</h2>
                <p className="text-white/50 text-sm mb-6">Nossa equipe está disponível de segunda a sexta, das 9h às 18h.</p>
                <div className="relative max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    className="w-full pl-9 pr-4 py-2.5 text-sm bg-white text-gray-900 rounded-xl placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-300"
                    placeholder="Buscar na central de ajuda..."
                    value={search}
                    onChange={e => { setSearch(e.target.value); if (e.target.value) setView('faq') }}
                  />
                </div>
              </div>
            </div>

            {/* Quick actions */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                {
                  icon: Plus, label: 'Abrir Ticket',
                  desc: 'Fale com nossa equipe', color: 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 border-primary-200 dark:border-primary-800',
                  action: () => setModalOpen(true),
                },
                {
                  icon: BookOpen, label: 'FAQ',
                  desc: 'Perguntas frequentes', color: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800',
                  action: () => setView('faq'),
                },
                {
                  icon: MessageSquare, label: 'Meus Tickets',
                  desc: `${tickets.length} ticket${tickets.length !== 1 ? 's' : ''}`, color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800',
                  action: () => setView('tickets'),
                },
              ].map((item, i) => {
                const Icon = item.icon
                return (
                  <button key={i} onClick={item.action} className="group flex items-center gap-4 p-5 bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-2xl hover:shadow-md hover:border-primary-200 dark:hover:border-primary-800 transition-all text-left">
                    <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 border', item.color)}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{item.label}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{item.desc}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-primary-500 transition-colors flex-shrink-0" />
                  </button>
                )
              })}
            </div>

            {/* FAQ preview */}
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-dark-700">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-amber-500" />
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Perguntas Frequentes</h3>
                </div>
                <button onClick={() => setView('faq')} className="text-xs text-primary-600 dark:text-primary-400 font-medium hover:underline">Ver todas</button>
              </div>
              <div className="divide-y divide-gray-50 dark:divide-dark-700">
                {FAQ_ITEMS.slice(0, 3).map((item, i) => (
                  <button
                    key={i}
                    onClick={() => { setView('faq'); setExpandedFaq(i) }}
                    className="w-full flex items-center gap-3 px-6 py-4 text-left hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0" />
                    <p className="text-sm text-gray-700 dark:text-gray-300 flex-1">{item.q}</p>
                    <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </button>
                ))}
              </div>
            </Card>

            {/* Status / recent tickets */}
            {tickets.length > 0 && (
              <Card className="overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-dark-700">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Tickets Recentes</h3>
                  <button onClick={() => setView('tickets')} className="text-xs text-primary-600 dark:text-primary-400 font-medium hover:underline">Ver todos</button>
                </div>
                <div className="divide-y divide-gray-50 dark:divide-dark-700">
                  {tickets.slice(0, 3).map(t => {
                    const meta = STATUS_META[t.status || 'open']
                    const Icon = meta.icon
                    return (
                      <div key={t.id} className="flex items-center gap-3 px-6 py-4">
                        <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{t.subject}</p>
                          <p className="text-xs text-gray-400">{formatDate(t.created_at, 'dd/MM/yyyy HH:mm')}</p>
                        </div>
                        <Badge className={meta.badge}>{meta.label}</Badge>
                      </div>
                    )
                  })}
                </div>
              </Card>
            )}
          </>
        )}

        {view === 'tickets' && (
          <>
            <div className="flex items-center gap-3">
              <button onClick={() => setView('home')} className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
                <ArrowLeft className="w-4 h-4" /> Voltar
              </button>
              <div className="h-4 w-px bg-gray-200 dark:bg-dark-600" />
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Meus Tickets</h2>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => setModalOpen(true)}><Plus className="w-4 h-4" /> Abrir Ticket</Button>
            </div>

            {!loading && (tickets.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-dark-700 flex items-center justify-center mx-auto mb-4">
                  <MessageSquare className="w-7 h-7 text-gray-400" />
                </div>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Nenhum ticket ainda</p>
                <p className="text-xs text-gray-400 mt-1">Abra um ticket se precisar de ajuda com o sistema.</p>
                <Button className="mt-4" onClick={() => setModalOpen(true)}>Abrir Primeiro Ticket</Button>
              </div>
            ) : (
              <div className="space-y-2">
                {tickets.map(t => {
                  const meta = STATUS_META[t.status || 'open']
                  const Icon = meta.icon
                  return (
                    <Card key={t.id} className="p-4 hover:shadow-md transition-all cursor-pointer">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center flex-shrink-0">
                          <Icon className="w-4 h-4 text-primary-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{t.subject}</p>
                            <Badge className={meta.badge}>{meta.label}</Badge>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(t.created_at, 'dd/MM/yyyy HH:mm')}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                      </div>
                    </Card>
                  )
                })}
              </div>
            ))}
          </>
        )}

        {view === 'faq' && (
          <>
            <div className="flex items-center gap-3">
              <button onClick={() => setView('home')} className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
                <ArrowLeft className="w-4 h-4" /> Voltar
              </button>
              <div className="h-4 w-px bg-gray-200 dark:bg-dark-600" />
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Perguntas Frequentes</h2>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-white dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                placeholder="Buscar nas perguntas..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              {filteredFaq.map((item, i) => (
                <Card key={i} className="overflow-hidden">
                  <button
                    className="w-full flex items-center gap-3 px-5 py-4 text-left"
                    onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm font-medium text-gray-900 dark:text-white flex-1">{item.q}</p>
                    <ChevronRight className={cn('w-4 h-4 text-gray-400 transition-transform flex-shrink-0', expandedFaq === i && 'rotate-90')} />
                  </button>
                  {expandedFaq === i && (
                    <div className="px-5 pb-5 text-sm text-gray-600 dark:text-gray-400 border-t border-gray-50 dark:border-dark-700 pt-4 ml-4.5">
                      {item.a}
                    </div>
                  )}
                </Card>
              ))}
            </div>

            {filteredFaq.length === 0 && (
              <div className="text-center py-10">
                <p className="text-sm text-gray-500 dark:text-gray-400">Nenhuma pergunta encontrada.</p>
                <Button className="mt-4" onClick={() => setModalOpen(true)}>Abrir Ticket de Suporte</Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* New ticket modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Abrir Ticket de Suporte" size="md">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
            <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700 dark:text-blue-400">Nossa equipe responde em até 24 horas úteis. Para urgências, mencione no assunto.</p>
          </div>
          <Input label="Assunto *" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Ex: Não consigo criar processos" />
          <Textarea label="Descrição detalhada *" value={message} onChange={e => setMessage(e.target.value)} rows={5} placeholder="Descreva o problema com o máximo de detalhes possível. Inclua os passos que levaram ao problema..." />
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
          <Button onClick={createTicket} loading={saving} disabled={!subject.trim() || !message.trim()}>
            <Send className="w-4 h-4" /> Enviar Ticket
          </Button>
        </div>
      </Modal>
    </Layout>
  )
}
