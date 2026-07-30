import { useEffect, useState } from 'react'
import { Briefcase, DollarSign, FileText, LogOut, Download } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cn, formatDate, formatCurrency } from '@/lib/utils'
import { Process, Financial } from '@/types'
import { Spinner, EmptyState, Badge } from '@/components/ui'

type Tab = 'processos' | 'financeiro' | 'documentos'

interface PortalDocument {
  id: string
  title: string
  file_url: string | null
  file_name: string | null
  created_at: string
}

const PROCESS_STATUS_LABELS: Record<string, string> = {
  active: 'Ativo', suspended: 'Suspenso', archived: 'Arquivado', won: 'Ganho', lost: 'Perdido', returned: 'Devolvido',
}
const FINANCIAL_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente', paid: 'Pago', overdue: 'Vencido', cancelled: 'Cancelado',
}

export function ClientPortalPage() {
  const { profile, signOut } = useAuth()
  const [tab, setTab] = useState<Tab>('processos')
  const [loading, setLoading] = useState(true)
  const [processes, setProcesses] = useState<Process[]>([])
  const [financials, setFinancials] = useState<Financial[]>([])
  const [documents, setDocuments] = useState<PortalDocument[]>([])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [{ data: p }, { data: f }, { data: d }] = await Promise.all([
        supabase.from('processes').select('*').is('deleted_at', null).order('created_at', { ascending: false }),
        supabase.from('financials').select('*').is('deleted_at', null).order('due_date', { ascending: false }),
        supabase.from('documents').select('id, title, file_url, file_name, created_at').is('deleted_at', null).order('created_at', { ascending: false }),
      ])
      setProcesses((p || []) as Process[])
      setFinancials((f || []) as Financial[])
      setDocuments((d || []) as PortalDocument[])
      setLoading(false)
    }
    load()
  }, [])

  const TABS: { id: Tab; label: string; icon: any }[] = [
    { id: 'processos', label: 'Meus Processos', icon: Briefcase },
    { id: 'financeiro', label: 'Financeiro', icon: DollarSign },
    { id: 'documentos', label: 'Documentos', icon: FileText },
  ]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-900">
      {/* Header */}
      <header className="bg-white dark:bg-dark-800 border-b border-gray-200 dark:border-dark-700">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold">Portal do Cliente</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white">{profile?.name || profile?.display_name}</p>
          </div>
          <button
            onClick={() => signOut()}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
          >
            <LogOut className="w-4 h-4" /> Sair
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-6">
        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 dark:border-dark-700 mb-6">
          {TABS.map(t => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                  tab === t.id
                    ? 'border-primary-600 text-primary-700 dark:text-primary-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                )}
              >
                <Icon className="w-4 h-4" /> {t.label}
              </button>
            )
          })}
        </div>

        {loading ? (
          <div className="py-16 flex justify-center"><Spinner className="w-6 h-6" /></div>
        ) : (
          <>
            {tab === 'processos' && (
              processes.length === 0 ? (
                <EmptyState icon={Briefcase} title="Nenhum processo" description="Você ainda não possui processos cadastrados." />
              ) : (
                <div className="space-y-3">
                  {processes.map(p => (
                    <div key={p.id} className="bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 dark:text-white truncate">{p.title}</p>
                          <p className="text-xs font-mono text-gray-400 mt-0.5">{p.number}</p>
                        </div>
                        <Badge>{PROCESS_STATUS_LABELS[p.status || 'active'] || p.status}</Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-500 dark:text-gray-400">
                        {p.court && <p><strong className="text-gray-600 dark:text-gray-300">Tribunal:</strong> {p.court}</p>}
                        {p.area && <p><strong className="text-gray-600 dark:text-gray-300">Área:</strong> {p.area}</p>}
                        {p.next_hearing && <p><strong className="text-gray-600 dark:text-gray-300">Próxima audiência:</strong> {formatDate(p.next_hearing)}</p>}
                        {p.next_deadline && <p><strong className="text-gray-600 dark:text-gray-300">Próximo prazo:</strong> {formatDate(p.next_deadline)}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {tab === 'financeiro' && (
              financials.length === 0 ? (
                <EmptyState icon={DollarSign} title="Nenhum lançamento" description="Não há lançamentos financeiros para exibir." />
              ) : (
                <div className="bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-dark-700 text-left text-xs text-gray-400 uppercase">
                        <th className="px-4 py-3">Descrição</th>
                        <th className="px-4 py-3">Vencimento</th>
                        <th className="px-4 py-3">Valor</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {financials.map(f => (
                        <tr key={f.id} className="border-b border-gray-50 dark:border-dark-700 last:border-0">
                          <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{f.description}</td>
                          <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{f.due_date ? formatDate(f.due_date) : '—'}</td>
                          <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{formatCurrency(f.amount)}</td>
                          <td className="px-4 py-3"><Badge>{FINANCIAL_STATUS_LABELS[f.status || 'pending'] || f.status}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {tab === 'documentos' && (
              documents.length === 0 ? (
                <EmptyState icon={FileText} title="Nenhum documento" description="Ainda não há documentos compartilhados com você." />
              ) : (
                <div className="space-y-2">
                  {documents.map(d => (
                    <div key={d.id} className="flex items-center justify-between gap-3 bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-xl p-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{d.title}</p>
                          <p className="text-xs text-gray-400">{formatDate(d.created_at)}</p>
                        </div>
                      </div>
                      {d.file_url && (
                        <a href={d.file_url} target="_blank" rel="noopener noreferrer"
                          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary-700 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 rounded-lg hover:bg-primary-100 transition-colors">
                          <Download className="w-3.5 h-3.5" /> Baixar
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )
            )}
          </>
        )}
      </div>
    </div>
  )
}
