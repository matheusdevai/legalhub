import { useState } from 'react'
import { Sparkles, ClipboardCheck } from 'lucide-react'
import { Button, Textarea, Input, Select } from '@/components/ui'
import { runAiGeneration } from '@/lib/aiJuridica'
import { useAuth } from '@/contexts/AuthContext'
import type { Process } from '@/types'
import { AiErrorBox, AiResultOutput } from './aiSharedUi'

interface Props {
  processo: Process | null
}

const PROVIDENCIAS = [
  { value: 'juntada_documentos', label: 'Juntada de documentos' },
  { value: 'manifestacao_laudo', label: 'Manifestação sobre laudo pericial' },
  { value: 'cumprimento_geral', label: 'Cumprimento geral da determinação' },
  { value: 'outro', label: 'Outra providência' },
]

export function AiCumprimentoDespacho({ processo }: Props) {
  const { profile } = useAuth()
  const [despachoTexto, setDespachoTexto] = useState('')
  const [providencia, setProvidencia] = useState('cumprimento_geral')
  const [detalhes, setDetalhes] = useState('')
  const [documentosJuntados, setDocumentosJuntados] = useState('')
  const [prazoInfo, setPrazoInfo] = useState('')
  const [output, setOutput] = useState('')
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const podeGerar = despachoTexto.trim().length > 0

  async function gerar() {
    setLoading(true)
    setError('')
    try {
      const result = await runAiGeneration({
        tipo: 'cumprimento_despacho',
        processo_id: processo?.id ?? null,
        input_context: {
          processo_numero: processo?.number ?? null,
          despacho_texto: despachoTexto,
          providencia,
          detalhes,
          documentos_juntados: documentosJuntados,
          prazo_info: prazoInfo,
          advogado_nome: profile?.display_name || profile?.name || null,
          advogado_oab: profile?.oab_number ? `${profile.oab_number}${profile.oab_seccional ? `/${profile.oab_seccional}` : ''}` : null,
        },
      })
      setOutput(result.output_text)
      setGeneratedAt(new Date())
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar cumprimento de despacho.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2">
        <ClipboardCheck className="w-4 h-4 text-primary-600 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Cole o despacho/decisão do juízo e indique a providência necessária para gerar a
          petição de cumprimento correspondente.
        </p>
      </div>

      <fieldset disabled={loading} className="space-y-3 disabled:opacity-60">
        <Textarea
          label="Texto do despacho / decisão"
          value={despachoTexto}
          onChange={e => setDespachoTexto(e.target.value)}
          rows={5}
          placeholder="Cole aqui o texto do despacho a ser cumprido."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select label="Providência requerida" value={providencia} onChange={e => setProvidencia(e.target.value)}>
            {PROVIDENCIAS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </Select>
          <Input label="Prazo informado (opcional)" value={prazoInfo} onChange={e => setPrazoInfo(e.target.value)} placeholder="Ex.: 5 dias úteis" />
        </div>
        {providencia === 'juntada_documentos' && (
          <Input
            label="Documentos a juntar"
            value={documentosJuntados}
            onChange={e => setDocumentosJuntados(e.target.value)}
            placeholder="Ex.: comprovante de residência, procuração atualizada"
          />
        )}
        <Textarea
          label="Detalhes adicionais (opcional)"
          value={detalhes}
          onChange={e => setDetalhes(e.target.value)}
          rows={3}
          placeholder="Qualquer informação adicional relevante para o cumprimento."
        />
      </fieldset>

      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={gerar} loading={loading} disabled={!podeGerar}>
          <Sparkles className="w-4 h-4" /> Gerar cumprimento
        </Button>
        {!podeGerar && !loading && (
          <span className="text-xs text-slate-400">Cole o texto do despacho para gerar.</span>
        )}
      </div>

      {error && <AiErrorBox message={error} onRetry={gerar} />}

      {(output || generatedAt) && (
        <AiResultOutput output={output} onChange={setOutput} generatedAt={generatedAt} />
      )}
    </div>
  )
}
