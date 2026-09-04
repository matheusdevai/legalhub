import { useState } from 'react'
import { Sparkles, ShieldAlert } from 'lucide-react'
import { Button, Textarea, Input, Select } from '@/components/ui'
import { runAiGeneration } from '@/lib/aiJuridica'
import { useAuth } from '@/contexts/AuthContext'
import type { Process } from '@/types'
import { AiAttachmentInput, AiErrorBox, AiResultOutput } from './aiSharedUi'
import type { AiAttachment } from './aiAttachment'

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
  const [attachment, setAttachment] = useState<AiAttachment | null>(null)
  const [output, setOutput] = useState('')
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const podeGerar = decisaoTexto.trim().length > 0 || !!attachment

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
        attachment: attachment ?? undefined,
      })
      setOutput(result.output_text)
      setGeneratedAt(new Date())
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar impugnação/recurso.')
    } finally {
      setLoading(false)
    }
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

      <AiAttachmentInput value={attachment} onChange={setAttachment} disabled={loading} />

      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={gerar} loading={loading} disabled={!podeGerar}>
          <Sparkles className="w-4 h-4" /> Gerar {SUBTIPOS.find(s => s.value === subtipo)?.label.toLowerCase()}
        </Button>
        {!podeGerar && !loading && (
          <span className="text-xs text-slate-400">Informe a decisão recorrida ou anexe um arquivo para gerar.</span>
        )}
      </div>

      {error && <AiErrorBox message={error} onRetry={gerar} />}

      {(output || generatedAt) && (
        <AiResultOutput output={output} onChange={setOutput} generatedAt={generatedAt} />
      )}
    </div>
  )
}
