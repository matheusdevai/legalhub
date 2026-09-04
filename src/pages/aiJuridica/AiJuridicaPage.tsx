import { useEffect, useState } from 'react'
import {
  Sparkles, AlertCircle, FileSearch, Gavel, FileText,
  ScrollText, ClipboardCheck, ShieldAlert, Scale,
} from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Card, Select, Spinner, EmptyState } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import type { Process } from '@/types'
import type { AiTipo } from '@/lib/aiJuridica'
import { AiAnaliseProcessoAdministrativo } from './actions/AiAnaliseProcessoAdministrativo'
import { AiAnaliseProcessoJudicial } from './actions/AiAnaliseProcessoJudicial'
import { AiAnaliseDocumento } from './actions/AiAnaliseDocumento'
import { AiPeticaoInicial } from './actions/AiPeticaoInicial'
import { AiCumprimentoDespacho } from './actions/AiCumprimentoDespacho'
import { AiImpugnacaoRecurso } from './actions/AiImpugnacaoRecurso'
import { AiParecerJuridico } from './actions/AiParecerJuridico'

// Shell da IA Jurídica (fundação, fase 1/4). Cada aba abaixo é um componente
// próprio em ./actions/*.tsx — fase 2 (dois builders, 3 ações cada) edita só
// o arquivo da sua ação, sem colidir. Ver FOUNDATION_CONTRACT.md na raiz do
// work dir da missão para o guia completo.
const TABS: { id: AiTipo; label: string; icon: React.ElementType }[] = [
  { id: 'analise_processo_administrativo', label: 'Análise (Administrativo)', icon: FileSearch },
  { id: 'analise_processo_judicial', label: 'Análise (Judicial)', icon: Gavel },
  { id: 'analise_documento', label: 'Análise de Documento', icon: FileText },
  { id: 'peticao_inicial', label: 'Petição Inicial', icon: ScrollText },
  { id: 'cumprimento_despacho', label: 'Cumprimento de Despacho', icon: ClipboardCheck },
  { id: 'impugnacao_recurso', label: 'Impugnação/Recurso', icon: ShieldAlert },
  { id: 'parecer_juridico', label: 'Parecer Jurídico', icon: Scale },
]

export function AiJuridicaPage() {
  const { profile } = useAuth()
  const [processos, setProcessos] = useState<Process[]>([])
  const [loadingProcessos, setLoadingProcessos] = useState(true)
  const [errorProcessos, setErrorProcessos] = useState('')
  const [selectedProcessoId, setSelectedProcessoId] = useState<string>('')
  const [activeTab, setActiveTab] = useState<AiTipo>(TABS[0].id)

  useEffect(() => {
    if (!profile?.tenant_id) return
    loadProcessos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.tenant_id])

  async function loadProcessos() {
    setLoadingProcessos(true)
    setErrorProcessos('')
    const { data, error } = await supabase
      .from('processes')
      .select('*')
      .is('deleted_at', null)
      .order('number', { ascending: true })
    if (error) {
      setErrorProcessos('Não foi possível carregar os processos. Tente novamente.')
    } else {
      setProcessos((data || []) as Process[])
    }
    setLoadingProcessos(false)
  }

  const selectedProcesso = processos.find(p => p.id === selectedProcessoId) ?? null

  return (
    <Layout title="Excelência">
      <div className="space-y-4 animate-fade-in">
        {/* Header */}
        <Card className="p-5 bg-gradient-to-r from-indigo-700 via-violet-600 to-purple-600 border-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <Sparkles className="text-white w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Excelência</h1>
              <p className="text-sm text-white/75">
                Análises, petições e peças processuais geradas com apoio de inteligência artificial.
              </p>
            </div>
          </div>
        </Card>

        {/* Seletor de processo (opcional — nem toda ação depende de um processo já cadastrado) */}
        <Card className="p-4">
          {loadingProcessos ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 py-2">
              <Spinner className="w-4 h-4" /> Carregando processos…
            </div>
          ) : errorProcessos ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {errorProcessos}
              </div>
              <button onClick={loadProcessos} className="text-sm font-semibold text-primary-600 hover:underline flex-shrink-0">
                Tentar novamente
              </button>
            </div>
          ) : processos.length === 0 ? (
            <EmptyState
              icon={FileSearch}
              title="Nenhum processo cadastrado"
              description="Você ainda pode usar as ferramentas abaixo sem vincular a um processo específico."
            />
          ) : (
            <Select
              label="Processo (opcional)"
              value={selectedProcessoId}
              onChange={e => setSelectedProcessoId(e.target.value)}
            >
              <option value="">Nenhum processo selecionado</option>
              {processos.map(p => (
                <option key={p.id} value={p.id}>
                  {p.number} — {p.client_name || p.title}
                </option>
              ))}
            </Select>
          )}
        </Card>

        {/* Abas de ação */}
        <div className="flex gap-1 border-b border-slate-200 dark:border-dark-700 overflow-x-auto">
          {TABS.map(t => {
            const Icon = t.icon
            const active = activeTab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={cn(
                  'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap',
                  active
                    ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                )}
              >
                <Icon className="w-4 h-4" /> {t.label}
              </button>
            )
          })}
        </div>

        <Card className="p-5">
          {activeTab === 'analise_processo_administrativo' && <AiAnaliseProcessoAdministrativo processo={selectedProcesso} />}
          {activeTab === 'analise_processo_judicial' && <AiAnaliseProcessoJudicial processo={selectedProcesso} />}
          {activeTab === 'analise_documento' && <AiAnaliseDocumento processo={selectedProcesso} />}
          {activeTab === 'peticao_inicial' && <AiPeticaoInicial processo={selectedProcesso} />}
          {activeTab === 'cumprimento_despacho' && <AiCumprimentoDespacho processo={selectedProcesso} />}
          {activeTab === 'impugnacao_recurso' && <AiImpugnacaoRecurso processo={selectedProcesso} />}
          {activeTab === 'parecer_juridico' && <AiParecerJuridico processo={selectedProcesso} />}
        </Card>
      </div>
    </Layout>
  )
}
