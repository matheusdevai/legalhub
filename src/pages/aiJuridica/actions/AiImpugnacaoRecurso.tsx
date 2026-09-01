import { useState } from 'react'
import { Sparkles, AlertCircle } from 'lucide-react'
import { Button, Textarea } from '@/components/ui'
import { runAiGeneration } from '@/lib/aiJuridica'
import type { Process } from '@/types'

// Fase 2 (builder B): substituir o input_context abaixo pelo texto da
// decisão/sentença recorrida e demais campos reais. Editar SÓ este arquivo.
interface Props {
  processo: Process | null
}

export function AiImpugnacaoRecurso({ processo }: Props) {
  const [decisaoTexto, setDecisaoTexto] = useState('')
  const [output, setOutput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function gerar() {
    setLoading(true)
    setError('')
    try {
      const result = await runAiGeneration({
        tipo: 'impugnacao_recurso',
        processo_id: processo?.id ?? null,
        // TODO(fase 2): trocar pelo contexto real (decisão recorrida, fundamentos, etc.)
        input_context: {
          processo_numero: processo?.number ?? null,
          decisao_texto: decisaoTexto,
        },
      })
      setOutput(result.output_text)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar impugnação/recurso.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Geração de impugnação ou recurso via IA.
      </p>
      <Textarea
        label="Texto da decisão recorrida (placeholder)"
        value={decisaoTexto}
        onChange={e => setDecisaoTexto(e.target.value)}
        rows={5}
        placeholder="Cole aqui o texto da decisão/sentença a ser impugnada."
      />
      <Button variant="primary" onClick={gerar} loading={loading}>
        <Sparkles className="w-4 h-4" /> Gerar impugnação/recurso
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
