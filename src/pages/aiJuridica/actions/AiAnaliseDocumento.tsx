import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button, Select, Textarea, Input } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { runAiGeneration } from '@/lib/aiJuridica'
import type { Process } from '@/types'
import { AiErrorBox, AiResultOutput } from './aiSharedUi'

interface Props {
  processo: Process | null
}

interface DocumentoOption {
  id: string
  title: string
  content: string | null
}

export function AiAnaliseDocumento({ processo }: Props) {
  const [documentos, setDocumentos] = useState<DocumentoOption[]>([])
  const [selectedDocumentoId, setSelectedDocumentoId] = useState('')
  const [documentoTitulo, setDocumentoTitulo] = useState('')
  const [documentoTexto, setDocumentoTexto] = useState('')
  const [output, setOutput] = useState('')
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadDocumentos()
    setSelectedDocumentoId('')
    setDocumentoTitulo('')
    setDocumentoTexto('')
    setOutput('')
    setGeneratedAt(null)
    setError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processo?.id])

  async function loadDocumentos() {
    let query = supabase
      .from('documents')
      .select('id, title, content')
      .is('deleted_at', null)
      .not('content', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(50)
    if (processo?.id) query = query.eq('process_id', processo.id)
    const { data } = await query
    setDocumentos((data || []) as DocumentoOption[])
  }

  function selecionarDocumento(id: string) {
    setSelectedDocumentoId(id)
    const doc = documentos.find(d => d.id === id)
    setDocumentoTitulo(doc?.title || '')
    setDocumentoTexto(doc?.content || '')
  }

  async function gerar() {
    setLoading(true)
    setError('')
    try {
      const result = await runAiGeneration({
        tipo: 'analise_documento',
        processo_id: processo?.id ?? null,
        input_context: {
          processo_numero: processo?.number ?? null,
          processo_titulo: processo?.title ?? null,
          documento_titulo: documentoTitulo || null,
          documento_texto: documentoTexto,
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

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Análise de documento jurídico (petição, decisão, contrato, notificação) via IA: resumo
        executivo, pontos-chave, implicações jurídicas e riscos identificados.
      </p>

      {documentos.length > 0 && (
        <Select
          label="Selecionar documento já cadastrado (opcional)"
          value={selectedDocumentoId}
          onChange={e => selecionarDocumento(e.target.value)}
        >
          <option value="">Colar texto manualmente</option>
          {documentos.map(d => (
            <option key={d.id} value={d.id}>{d.title}</option>
          ))}
        </Select>
      )}

      <Input
        label="Título do documento (opcional)"
        value={documentoTitulo}
        onChange={e => setDocumentoTitulo(e.target.value)}
        placeholder="Ex: Decisão interlocutória, Contrato de prestação de serviços…"
      />

      <Textarea
        label="Texto do documento"
        value={documentoTexto}
        onChange={e => { setSelectedDocumentoId(''); setDocumentoTexto(e.target.value) }}
        rows={8}
        placeholder="Cole aqui o texto do documento a ser analisado."
      />

      <Button variant="primary" onClick={gerar} loading={loading} disabled={!documentoTexto.trim()}>
        <Sparkles className="w-4 h-4" /> Analisar documento
      </Button>

      {error && <AiErrorBox message={error} onRetry={gerar} />}

      {(output || generatedAt) && (
        <AiResultOutput output={output} onChange={setOutput} generatedAt={generatedAt} />
      )}
    </div>
  )
}
