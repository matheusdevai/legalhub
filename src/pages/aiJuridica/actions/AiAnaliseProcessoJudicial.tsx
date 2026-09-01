import { useState } from 'react'
import { Sparkles, AlertCircle } from 'lucide-react'
import { Button, Textarea } from '@/components/ui'
import { runAiGeneration } from '@/lib/aiJuridica'
import type { Process } from '@/types'

// Fase 2 (builder A): substituir o input_context abaixo pelos campos reais
// necessários para essa análise (ex: movimentos, fase, vara, prazos) e
// enriquecer a exibição do resultado. Editar SÓ este arquivo.
interface Props {
  processo: Process | null
}

export function AiAnaliseProcessoJudicial({ processo }: Props) {
  const [output, setOutput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function gerar() {
    setLoading(true)
    setError('')
    try {
      const result = await runAiGeneration({
        tipo: 'analise_processo_judicial',
        processo_id: processo?.id ?? null,
        // TODO(fase 2): trocar pelo contexto real (nº processo, vara, movimentos, etc.)
        input_context: {
          processo_numero: processo?.number ?? null,
          processo_titulo: processo?.title ?? null,
          vara: processo?.court ?? null,
        },
      })
      setOutput(result.output_text)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar análise.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Análise de processo judicial (andamentos, riscos, próximos passos) via IA.
      </p>
      <Button variant="primary" onClick={gerar} loading={loading}>
        <Sparkles className="w-4 h-4" /> Gerar análise
      </Button>
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}
      <Textarea
        label="Resultado (editável)"
        value={output}
        onChange={e => setOutput(e.target.value)}
        rows={14}
        placeholder="O resultado gerado pela IA aparecerá aqui."
      />
    </div>
  )
}
