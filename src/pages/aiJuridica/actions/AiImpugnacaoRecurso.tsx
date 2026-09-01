import { useState } from 'react'
import { Sparkles, AlertCircle, Copy, Check, RotateCcw, ShieldAlert } from 'lucide-react'
import { Button, Textarea, Input, Select } from '@/components/ui'
import { runAiGeneration } from '@/lib/aiJuridica'
import { useAuth } from '@/contexts/AuthContext'
import { formatDate } from '@/lib/utils'
import type { Process } from '@/types'

interface Props {
  processo: Process | null
}

const SUBTIPOS = [
  { value: 'impugnacao_cumprimento_sentenca', label: 'Impugnação ao Cumprimento de Sentença' },
  { value: 'apelacao', label: 'Apelação' },
  { value: 'agravo', label: 'Agravo de Instrumento' },
]

export function AiImpugnacaoRecurso({ processo }: Props) {
  const { profile } = useAuth()
  const [subtipo, setSubtipo] = useState('impugnacao_cumprimento_sentenca')
  const [decisaoTexto, setDecisaoTexto] = useState('')
  const [dataCiencia, setDataCiencia] = useState('')
  const [razoes, setRazoes] = useState('')
  const [preparoInfo, setPreparoInfo] = useState('')
  const [output, setOutput] = useState('')
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const podeGerar = decisaoTexto.trim().length > 0

  async function gerar() {
    setLoading(true)
    setError('')
    try {
      const result = await runAiGeneration({
        tipo: 'impugnacao_recurso',
        processo_id: processo?.id ?? null,
        input_context: {
          processo_numero: processo?.number ?? null,
          subtipo,
          decisao_texto: decisaoTexto,
          data_ciencia: dataCiencia,
          razoes,
          preparo_info: preparoInfo,
          advogado_nome: profile?.display_name || profile?.name || null,
          advogado_oab: profile?.oab_number ? `${profile.oab_number}${profile.oab_seccional ? `/${profile.oab_seccional}` : ''}` : null,
        },
      })
      setOutput(result.output_text)
      setGeneratedAt(new Date())
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar impugnação/recurso.')
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
        <ShieldAlert className="w-4 h-4 text-primary-600 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Escolha o tipo de peça, informe a decisão recorrida e a data de ciência para gerar uma
          minuta com tempestividade, preparo (quando aplicável) e razões de reforma/anulação.
        </p>
      </div>

      <fieldset disabled={loading} className="space-y-3 disabled:opacity-60">
        <Select label="Tipo de peça" value={subtipo} onChange={e => setSubtipo(e.target.value)}>
          {SUBTIPOS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
        <Textarea
          label="Decisão / sentença recorrida (texto ou resumo)"
          value={decisaoTexto}
          onChange={e => setDecisaoTexto(e.target.value)}
          rows={5}
          placeholder="Cole aqui o texto ou um resumo da decisão a ser impugnada/recorrida."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Data de ciência / intimação"
            type="date"
            value={dataCiencia}
            onChange={e => setDataCiencia(e.target.value)}
          />
          {subtipo === 'apelacao' && (
            <Input
              label="Informação sobre o preparo (opcional)"
              value={preparoInfo}
              onChange={e => setPreparoInfo(e.target.value)}
              placeholder="Ex.: comprovante de recolhimento anexo, ou gratuidade da justiça deferida"
            />
          )}
        </div>
        <Textarea
          label="Razões e fundamentos para a reforma/anulação"
          value={razoes}
          onChange={e => setRazoes(e.target.value)}
          rows={4}
          placeholder="Descreva os pontos da decisão com os quais discorda e por quê."
        />
      </fieldset>

      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={gerar} loading={loading} disabled={!podeGerar}>
          <Sparkles className="w-4 h-4" /> Gerar {SUBTIPOS.find(s => s.value === subtipo)?.label.toLowerCase()}
        </Button>
        {!podeGerar && !loading && (
          <span className="text-xs text-slate-400">Informe a decisão recorrida para gerar.</span>
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
