import { useState } from 'react'
import { Sparkles, AlertCircle } from 'lucide-react'
import { Button, Textarea } from '@/components/ui'
import { runAiGeneration } from '@/lib/aiJuridica'
import type { Process } from '@/types'

// Fase 2 (builder B): substituir o input_context abaixo pelo texto do
// despacho e demais campos reais. Editar SÓ este arquivo.
interface Props {
  processo: Process | null
}

export function AiCumprimentoDespacho({ processo }: Props) {
  const [despachoTexto, setDespachoTexto] = useState('')
  const [output, setOutput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function gerar() {
    setLoading(true)
    setError('')
    try {
      const result = await runAiGeneration({
        tipo: 'cumprimento_despacho',
        processo_id: processo?.id ?? null,
        // TODO(fase 2): trocar pelo contexto real (texto do despacho, prazo, etc.)
        input_context: {
          processo_numero: processo?.number ?? null,
          despacho_texto: despachoTexto,
        },
      })
      setOutput(result.output_text)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar cumprimento de despacho.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Geração de petição de cumprimento de despacho via IA.
      </p>
      <Textarea
        label="Texto do despacho (placeholder)"
        value={despachoTexto}
        onChange={e => setDespachoTexto(e.target.value)}
        rows={5}
        placeholder="Cole aqui o texto do despacho a ser cumprido."
      />
      <Button variant="primary" onClick={gerar} loading={loading}>
        <Sparkles className="w-4 h-4" /> Gerar cumprimento
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
