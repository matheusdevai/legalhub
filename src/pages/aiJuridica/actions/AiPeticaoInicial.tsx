import { useState } from 'react'
import { Sparkles, AlertCircle } from 'lucide-react'
import { Button, Textarea } from '@/components/ui'
import { runAiGeneration } from '@/lib/aiJuridica'
import type { Process } from '@/types'

// Fase 2 (builder B): substituir o input_context abaixo pelos campos reais
// (fatos, pedidos, valor da causa, etc.) e enriquecer a exibição do
// resultado. Editar SÓ este arquivo — os outros 5 componentes de ação vivem
// em arquivos separados nesta mesma pasta.
interface Props {
  processo: Process | null
}

export function AiPeticaoInicial({ processo }: Props) {
  const [output, setOutput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function gerar() {
    setLoading(true)
    setError('')
    try {
      const result = await runAiGeneration({
        tipo: 'peticao_inicial',
        processo_id: processo?.id ?? null,
        // TODO(fase 2): trocar pelo contexto real (fatos, pedidos, valor da causa, etc.)
        input_context: {
          processo_numero: processo?.number ?? null,
          cliente: processo?.client_name ?? null,
          area: processo?.area ?? null,
        },
      })
      setOutput(result.output_text)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar petição.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Geração de petição inicial via IA.
      </p>
      <Button variant="primary" onClick={gerar} loading={loading}>
        <Sparkles className="w-4 h-4" /> Gerar petição inicial
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
