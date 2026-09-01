import { useState } from 'react'
import { Sparkles, AlertCircle, Copy, Check, RotateCcw, ClipboardCheck } from 'lucide-react'
import { Button, Textarea, Input, Select } from '@/components/ui'
import { runAiGeneration } from '@/lib/aiJuridica'
import { useAuth } from '@/contexts/AuthContext'
import { formatDate } from '@/lib/utils'
import type { Process } from '@/types'

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
  const [copied, setCopied] = useState(false)

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

  async function copiar() {
    await navigator.clipboard.writeText(output)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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

      {error && (
        <div className="flex items-start justify-between gap-3 p-3 rounded-xl bg-red-50 dark:bg-red-900/15 border border-red-100 dark:border-red-800/20">
          <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {error}
          </div>
          <button onClick={gerar} className="flex items-center gap-1 text-xs font-semibold text-red-600 dark:text-red-400 hover:underline flex-shrink-0">
            <RotateCcw className="w-3 h-3" /> Tentar novamente
          </button>
        </div>
      )}

      {output && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Minuta gerada (editável)</label>
            <div className="flex items-center gap-3">
              {generatedAt && <span className="text-xs text-slate-400">Gerado às {formatDate(generatedAt, 'HH:mm')}</span>}
              <button onClick={copiar} className="flex items-center gap-1.5 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline">
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
          </div>
          <Textarea value={output} onChange={e => setOutput(e.target.value)} rows={16} className="font-mono text-xs leading-relaxed" />
          <p className="text-xs text-slate-400 dark:text-slate-500 italic">
            Minuta gerada por IA — revise e adapte antes de protocolar.
          </p>
        </div>
      )}
    </div>
  )
}
