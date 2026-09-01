import { useEffect, useState } from 'react'
import { Sparkles, Gavel } from 'lucide-react'
import { Button, Card, EmptyState } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { runAiGeneration } from '@/lib/aiJuridica'
import { formatDate } from '@/lib/utils'
import type { Process } from '@/types'
import { AiErrorBox, AiResultOutput } from './aiSharedUi'

interface Props {
  processo: Process | null
}

export function AiAnaliseProcessoJudicial({ processo }: Props) {
  const [output, setOutput] = useState('')
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setOutput('')
    setGeneratedAt(null)
    setError('')
  }, [processo?.id])

  async function gerar() {
    if (!processo) return
    setLoading(true)
    setError('')
    try {
      const { data: tarefas } = await supabase
        .from('tasks')
        .select('title, due_date, priority, type')
        .eq('process_id', processo.id)
        .is('deleted_at', null)
        .in('status', ['pending', 'in_progress'])
        .order('due_date', { ascending: true })
        .limit(10)

      const result = await runAiGeneration({
        tipo: 'analise_processo_judicial',
        processo_id: processo.id,
        input_context: {
          processo_numero: processo.number,
          processo_titulo: processo.title,
          cliente_nome: processo.client_name,
          area: processo.area,
          tipo_acao: processo.type,
          status: processo.status,
          prioridade: processo.priority,
          advogado_responsavel: processo.assigned_lawyer,
          orgao_ou_vara: processo.court,
          juiz: processo.judge,
          parte_contraria: processo.counterparty,
          data_protocolo: processo.data_protocolo,
          proximo_prazo: processo.next_deadline,
          proxima_audiencia: processo.next_hearing,
          descricao: processo.description,
          ultimos_andamentos: processo.movimentos ?? [],
          tarefas_pendentes: (tarefas ?? []).map(t => ({
            titulo: t.title,
            prazo: t.due_date,
            prioridade: t.priority,
            tipo: t.type,
          })),
        },
      })
      setOutput(result.output_text)
      setGeneratedAt(new Date())
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar análise.')
    } finally {
      setLoading(false)
    }
  }

  if (!processo) {
    return (
      <EmptyState
        icon={Gavel}
        title="Selecione um processo"
        description="Escolha um processo judicial no seletor acima para gerar a análise por IA."
      />
    )
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 bg-slate-50 dark:bg-dark-700/40 border-slate-100 dark:border-dark-700">
        <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
          Processo selecionado
        </p>
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {processo.number} — {processo.client_name || processo.title}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {processo.area || 'Área não informada'} · {processo.court || 'Vara não informada'}
          {processo.next_hearing && <> · Próxima audiência: {formatDate(processo.next_hearing)}</>}
          {processo.next_deadline && <> · Próximo prazo: {formatDate(processo.next_deadline)}</>}
        </p>
      </Card>

      <p className="text-sm text-slate-500 dark:text-slate-400">
        Análise de processo judicial via IA: status atual, riscos/prazos críticos, próximos passos
        recomendados e pontos de atenção.
      </p>

      <Button variant="primary" onClick={gerar} loading={loading}>
        <Sparkles className="w-4 h-4" /> Analisar processo
      </Button>

      {error && <AiErrorBox message={error} onRetry={gerar} />}

      {(output || generatedAt) && (
        <AiResultOutput output={output} onChange={setOutput} generatedAt={generatedAt} />
      )}
    </div>
  )
}
