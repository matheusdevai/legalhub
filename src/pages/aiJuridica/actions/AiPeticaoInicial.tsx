import { useState } from 'react'
import { Sparkles, ScrollText } from 'lucide-react'
import { Button, Textarea, Input } from '@/components/ui'
import { runAiGeneration } from '@/lib/aiJuridica'
import { useAuth } from '@/contexts/AuthContext'
import type { Process } from '@/types'
import { AiAttachmentInput, AiErrorBox, AiResultOutput } from './aiSharedUi'
import type { AiAttachment } from './aiAttachment'

interface Props {
  processo: Process | null
}

interface FormState {
  autorNome: string
  autorQualificacao: string
  reuNome: string
  reuQualificacao: string
  juizoComarca: string
  tipoAcao: string
  fatos: string
  fundamentosAdicionais: string
  pedidosEspecificos: string
  valorCausa: string
}

const EMPTY_FORM: FormState = {
  autorNome: '',
  autorQualificacao: '',
  reuNome: '',
  reuQualificacao: '',
  juizoComarca: '',
  tipoAcao: '',
  fatos: '',
  fundamentosAdicionais: '',
  pedidosEspecificos: '',
  valorCausa: '',
}

export function AiPeticaoInicial({ processo }: Props) {
  const { profile } = useAuth()
  const [form, setForm] = useState<FormState>(() => ({
    ...EMPTY_FORM,
    autorNome: processo?.client_name ?? '',
    reuNome: processo?.counterparty ?? '',
    juizoComarca: processo?.court ?? '',
    tipoAcao: processo?.type ?? processo?.area ?? '',
  }))
  const [attachment, setAttachment] = useState<AiAttachment | null>(null)
  const [output, setOutput] = useState('')
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  const podeGerar = form.fatos.trim().length > 0 || !!attachment

  async function gerar() {
    setLoading(true)
    setError('')
    try {
      const result = await runAiGeneration({
        tipo: 'peticao_inicial',
        processo_id: processo?.id ?? null,
        input_context: {
          autor_nome: form.autorNome,
          autor_qualificacao: form.autorQualificacao,
          reu_nome: form.reuNome,
          reu_qualificacao: form.reuQualificacao,
          juizo_comarca: form.juizoComarca,
          tipo_acao: form.tipoAcao,
          fatos: form.fatos,
          fundamentos_adicionais: form.fundamentosAdicionais,
          pedidos_especificos: form.pedidosEspecificos,
          valor_causa: form.valorCausa,
          processo_numero: processo?.number ?? null,
          cliente: processo?.client_name ?? null,
          area: processo?.area ?? null,
          advogado_nome: profile?.display_name || profile?.name || null,
          advogado_oab: profile?.oab_number ? `${profile.oab_number}${profile.oab_seccional ? `/${profile.oab_seccional}` : ''}` : null,
        },
        attachment: attachment ?? undefined,
      })
      setOutput(result.output_text)
      setGeneratedAt(new Date())
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar petição inicial.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2">
        <ScrollText className="w-4 h-4 text-primary-600 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Preencha os dados do caso para gerar uma minuta de petição inicial, com endereçamento,
          qualificação das partes, fatos, fundamentação, pedidos e valor da causa.
        </p>
      </div>

      <fieldset disabled={loading} className="grid grid-cols-1 sm:grid-cols-2 gap-3 disabled:opacity-60">
        <Input label="Autor (nome)" value={form.autorNome} onChange={e => setField('autorNome', e.target.value)} placeholder="Nome completo do autor" />
        <Input label="Réu (nome)" value={form.reuNome} onChange={e => setField('reuNome', e.target.value)} placeholder="Nome completo do réu" />
        <Textarea
          label="Qualificação completa do autor"
          value={form.autorQualificacao}
          onChange={e => setField('autorQualificacao', e.target.value)}
          rows={2}
          placeholder="Nacionalidade, estado civil, profissão, RG, CPF, endereço..."
        />
        <Textarea
          label="Qualificação completa do réu"
          value={form.reuQualificacao}
          onChange={e => setField('reuQualificacao', e.target.value)}
          rows={2}
          placeholder="Nacionalidade/tipo, CPF ou CNPJ, endereço..."
        />
        <Input label="Juízo / comarca competente" value={form.juizoComarca} onChange={e => setField('juizoComarca', e.target.value)} placeholder="Ex.: Comarca de São Paulo/SP" />
        <Input label="Tipo de ação" value={form.tipoAcao} onChange={e => setField('tipoAcao', e.target.value)} placeholder="Ex.: Ação de Cobrança" />
        <Input label="Valor da causa" value={form.valorCausa} onChange={e => setField('valorCausa', e.target.value)} placeholder="Ex.: R$ 10.000,00" />
        <div className="sm:col-span-2">
          <Textarea
            label="Dos fatos"
            value={form.fatos}
            onChange={e => setField('fatos', e.target.value)}
            rows={4}
            placeholder="Descreva os fatos relevantes do caso, em ordem cronológica."
          />
        </div>
        <div className="sm:col-span-2">
          <Textarea
            label="Fundamentos jurídicos a destacar (opcional)"
            value={form.fundamentosAdicionais}
            onChange={e => setField('fundamentosAdicionais', e.target.value)}
            rows={2}
            placeholder="Institutos ou dispositivos que você quer que a IA priorize."
          />
        </div>
        <div className="sm:col-span-2">
          <Textarea
            label="Pedidos específicos adicionais (opcional)"
            value={form.pedidosEspecificos}
            onChange={e => setField('pedidosEspecificos', e.target.value)}
            rows={2}
            placeholder="Pedidos além dos padrão (citação, provas, procedência)."
          />
        </div>
      </fieldset>

      <AiAttachmentInput value={attachment} onChange={setAttachment} disabled={loading} />

      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={gerar} loading={loading} disabled={!podeGerar}>
          <Sparkles className="w-4 h-4" /> Gerar petição inicial
        </Button>
        {!podeGerar && !loading && (
          <span className="text-xs text-slate-400">Preencha ao menos "Dos fatos" ou anexe um arquivo para gerar.</span>
        )}
      </div>

      {error && <AiErrorBox message={error} onRetry={gerar} />}

      {(output || generatedAt) && (
        <AiResultOutput output={output} onChange={setOutput} generatedAt={generatedAt} />
      )}
    </div>
  )
}
