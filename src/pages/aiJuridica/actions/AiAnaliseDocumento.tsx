import { useState } from 'react'
import { Sparkles, AlertCircle } from 'lucide-react'
import { Button, Textarea } from '@/components/ui'
import { runAiGeneration } from '@/lib/aiJuridica'
import type { Process } from '@/types'

// Fase 2 (builder A): esta é a única das 6 ações que provavelmente precisa de
// upload/seleção de um documento (bucket `documents`, ver CLAUDE.md) além do
// texto colado — hoje só manda um campo de texto livre como placeholder.
// Editar SÓ este arquivo.
interface Props {
  processo: Process | null
}

export function AiAnaliseDocumento({ processo }: Props) {
  const [documentoTexto, setDocumentoTexto] = useState('')
  const [output, setOutput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function gerar() {
    setLoading(true)
    setError('')
    try {
      const result = await runAiGeneration({
        tipo: 'analise_documento',
        processo_id: processo?.id ?? null,
        // TODO(fase 2): trocar por upload real de documento (bucket `documents`) em vez de texto colado
        input_context: {
          processo_numero: processo?.number ?? null,
          documento_texto: documentoTexto,
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
        Análise de documento (contrato, laudo, decisão) via IA.
      </p>
      <Textarea
        label="Texto do documento (placeholder — fase 2 troca por upload)"
        value={documentoTexto}
        onChange={e => setDocumentoTexto(e.target.value)}
        rows={6}
        placeholder="Cole aqui o texto do documento a ser analisado."
      />
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
