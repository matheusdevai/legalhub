import { useState } from 'react'
import { Sparkles, Scale } from 'lucide-react'
import { Button, Card, Input, Textarea } from '@/components/ui'
import { runAiGeneration } from '@/lib/aiJuridica'
import type { Process } from '@/types'
import { AiErrorBox, AiResultOutput } from './aiSharedUi'

interface Props {
  processo: Process | null
}

export function AiParecerJuridico({ processo }: Props) {
  const [consulente, setConsulente] = useState('')
  const [questaoJuridica, setQuestaoJuridica] = useState('')
  const [fatosRelevantes, setFatosRelevantes] = useState('')
  const [posicaoDesejada, setPosicaoDesejada] = useState('')
  const [output, setOutput] = useState('')
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const podeGerar = questaoJuridica.trim().length > 0

  async function gerar() {
    setLoading(true)
    setError('')
    try {
      const result = await runAiGeneration({
        tipo: 'parecer_juridico',
        processo_id: processo?.id ?? null,
        input_context: {
          consulente: consulente || processo?.client_name || null,
          questao_juridica: questaoJuridica,
          fatos_relevantes: fatosRelevantes,
          posicao_desejada: posicaoDesejada,
          processo_numero: processo?.number ?? null,
          processo_titulo: processo?.title ?? null,
          cliente_nome: processo?.client_name ?? null,
          area: processo?.area ?? null,
          tipo_acao: processo?.type ?? null,
          descricao: processo?.description ?? null,
        },
      })
      setOutput(result.output_text)
      setGeneratedAt(new Date())
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar parecer jurídico.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <Scale className="w-4 h-4 text-primary-600 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Parecer jurídico via IA: fundamentação jurídica aplicável, institutos jurídicos
          relevantes, análise de viabilidade e recomendação estratégica sobre uma questão
          jurídica específica.
        </p>
      </div>

      {processo && (
        <Card className="p-4 bg-slate-50 dark:bg-dark-700/40 border-slate-100 dark:border-dark-700">
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
            Processo vinculado
          </p>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {processo.number} — {processo.client_name || processo.title}
          </p>
        </Card>
      )}

      <fieldset disabled={loading} className="space-y-3 disabled:opacity-60">
        <Input
          label="Consulente (opcional)"
          value={consulente}
          onChange={e => setConsulente(e.target.value)}
          placeholder={processo?.client_name || 'Nome do cliente/consulente'}
        />
        <Textarea
          label="Questão jurídica a ser respondida"
          value={questaoJuridica}
          onChange={e => setQuestaoJuridica(e.target.value)}
          rows={3}
          placeholder="Descreva a pergunta ou dúvida jurídica que o parecer deve responder."
        />
        <Textarea
          label="Fatos relevantes (opcional)"
          value={fatosRelevantes}
          onChange={e => setFatosRelevantes(e.target.value)}
          rows={4}
          placeholder="Contexto fático relevante para a análise, se ainda não coberto pelo processo vinculado."
        />
        <Textarea
          label="Posição/resultado desejado (opcional)"
          value={posicaoDesejada}
          onChange={e => setPosicaoDesejada(e.target.value)}
          rows={2}
          placeholder="O que o consulente pretende obter ou evitar."
        />
      </fieldset>

      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={gerar} loading={loading} disabled={!podeGerar}>
          <Sparkles className="w-4 h-4" /> Gerar parecer
        </Button>
        {!podeGerar && !loading && (
          <span className="text-xs text-slate-400">Descreva a questão jurídica para gerar.</span>
        )}
      </div>

      {error && <AiErrorBox message={error} onRetry={gerar} />}

      {(output || generatedAt) && (
        <AiResultOutput output={output} onChange={setOutput} generatedAt={generatedAt} />
      )}
    </div>
  )
}
