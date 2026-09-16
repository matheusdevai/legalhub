import { ReactNode } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { GRUPOS_ACAO } from '@/lib/utils'
import { inferGrupoETipoAcao } from '@/lib/areaUtils'

// Campos comuns ao modal de "Criar novo processo" (ProcessesPage) e ao passo
// "Novo processo" da conclusão de atividade (TasksPage) — extraído pra manter
// os dois fluxos com a mesma ordem/agrupamento de campos e o mesmo estilo
// visual, em vez de duas cópias que podem divergir com o tempo.

export const TIPOS_ACAO: Record<string, string[]> = {
  'Cível': ['Alíquota zero', 'Contratos bancários', 'Indenização por danos morais', 'Revisão contratual', 'Cobrança', 'Outro'],
  'Consumidor': ['Vício do produto/serviço', 'Cobrança indevida', 'Publicidade enganosa', 'Prática abusiva', 'Outro'],
  'Criminal': ['Pena privativa de liberdade', 'Habeas corpus', 'Tráfico de drogas', 'Furto', 'Roubo', 'Outro'],
  'Trabalhista': ['Rescisão indireta', 'Horas extras', 'Assédio moral', 'FGTS', 'Outro'],
  'Tributário': ['Execução fiscal', 'Mandado de segurança', 'Restituição de tributos', 'Outro'],
  'Administrativo': ['Cargo - vereador', 'Licitação', 'Concurso público', 'Outro'],
  'Família': ['Divórcio', 'Guarda', 'Alimentos', 'Inventário', 'Outro'],
  'Previdenciário': [
    'Aposentadoria por Idade', 'Aposentadoria por Tempo de Contribuição', 'Aposentadoria por Invalidez',
    'Aposentadoria Especial', 'Aposentadoria da Pessoa com Deficiência', 'Auxílio-Doença', 'Auxílio-Acidente',
    'BPC/LOAS', 'Pensão por Morte', 'Auxílio-Reclusão', 'Salário-Maternidade', 'Revisão de Benefício', 'Outro',
  ],
  'Empresarial': ['Recuperação judicial', 'Dissolução societária', 'Outro'],
  'Imobiliário': ['Usucapião', 'Despejo', 'Compra e venda', 'Outro'],
  'Outro': ['Outro'],
}
export const FASES = ['NEGOCIAÇÃO', 'CONHECIMENTO', 'RECURSAL', 'EXECUÇÃO', 'ENCERRADO']
export const CONTINGENCIAMENTOS = ['Remoto', 'Possível', 'Provável', 'Quase certo']

// Parte contrária padrão para ações do grupo Previdenciário — pré-preenchida mas
// sempre editável, já que a esmagadora maioria dessas ações é contra o INSS.
export const INSS_COUNTERPARTY = 'INSTITUTO NACIONAL DE SEGURIDADE SOCIAL - INSS'

export interface ProcessFormFieldsValues {
  client_id: string
  client_name: string
  area: string
  colaborador_id: string
  counterparty: string
  description: string
  grupo_acao: string
  type: string
  modalidade: string
  fase: string
  etapa: string
  number: string
  numero_protocolo: string
  processo_originario: string
  pasta_caso: string
  data_requerimento: string
  valor_causa: string
  valor_honorarios: string
  percentual_honorarios: string
  contingenciamento: string
}

interface ProcessFormFieldsProps {
  values: ProcessFormFieldsValues
  onChange: (patch: Partial<ProcessFormFieldsValues>) => void
  clients: { id: string; name: string; colaborador_id?: string | null; area_direito?: string | null; beneficio_previdenciario?: string | null; modalidade?: string | null }[]
  colaboradores: { id: string; nome: string }[]
  /** Campos extras exclusivos de um dos fluxos, renderizados logo após "Data do requerimento" e antes de "Valor da causa" */
  afterDataRequerimento?: ReactNode
}

export function ProcessFormFields({ values, onChange, clients, colaboradores, afterDataRequerimento }: ProcessFormFieldsProps) {
  return (
    <>
      {/* Partes envolvidas */}
      <div>
        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Adicionar partes envolvidas *</label>
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-gray-200 dark:bg-dark-600 flex items-center justify-center flex-shrink-0">
            <svg className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
          </div>
          <select
            value={values.client_id}
            onChange={e => {
              const clientId = e.target.value
              const selected = clients.find(c => c.id === clientId)
              // Mesma herança do cadastro do cliente aplicada ao concluir a tarefa
              // "Protocolar processo" (requestComplete em TasksPage) — mantém o prefill
              // igual nos dois fluxos de criação de processo.
              const { grupoAcao, tipoAcao } = inferGrupoETipoAcao(selected, GRUPOS_ACAO, TIPOS_ACAO)
              onChange({
                client_id: clientId,
                client_name: selected?.name || '',
                colaborador_id: selected?.colaborador_id || values.colaborador_id || '',
                area: selected?.area_direito || values.area,
                grupo_acao: grupoAcao || values.grupo_acao,
                type: grupoAcao ? tipoAcao : values.type,
                modalidade: selected?.modalidade || values.modalidade,
              })
            }}
            className="w-full pl-10 pr-9 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 appearance-none"
          >
            <option value="">Nome do cliente</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Responsável */}
      <div>
        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Responsável</label>
        <div className="relative">
          <select
            value={values.colaborador_id}
            onChange={e => onChange({ colaborador_id: e.target.value })}
            className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 font-medium focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 appearance-none"
          >
            <option value="">Sem responsável</option>
            {colaboradores.map(col => <option key={col.id} value={col.id}>{col.nome.toUpperCase()}</option>)}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Parte contrária */}
      <div>
        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Parte contrária</label>
        <input
          value={values.counterparty}
          onChange={e => onChange({ counterparty: e.target.value })}
          placeholder="Nome da parte contrária"
          className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400"
        />
      </div>

      {/* Anotações gerais */}
      <div>
        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Anotações gerais</label>
        <textarea
          value={values.description}
          onChange={e => onChange({ description: e.target.value })}
          placeholder="Anotações, tags, fatos e fundamentos"
          rows={3}
          className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 resize-none"
        />
      </div>

      {/* Grupo de ação */}
      <div>
        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Grupo de ação *</label>
        <div className="relative">
          <select
            value={values.grupo_acao}
            onChange={e => onChange({ grupo_acao: e.target.value, type: '' })}
            className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 appearance-none"
          >
            <option value="">Selecione o grupo de ação</option>
            {values.grupo_acao && !GRUPOS_ACAO.includes(values.grupo_acao) && (
              <option value={values.grupo_acao}>{values.grupo_acao} (do cadastro do cliente)</option>
            )}
            {GRUPOS_ACAO.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Tipo de ação */}
      <div>
        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Tipo de ação *</label>
        <div className="relative">
          <select
            value={values.type}
            onChange={e => {
              const type = e.target.value
              const patch: Partial<ProcessFormFieldsValues> = { type }
              // Ação previdenciária quase sempre é contra o INSS — pré-preenche mas
              // nunca sobrescreve se o usuário já tiver preenchido outra parte contrária.
              if (type && values.grupo_acao === 'Previdenciário' && !values.counterparty.trim()) {
                patch.counterparty = INSS_COUNTERPARTY
              }
              onChange(patch)
            }}
            className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 appearance-none"
          >
            <option value="">Selecione o tipo de ação</option>
            {values.type && !(TIPOS_ACAO[values.grupo_acao] || []).includes(values.type) && (
              <option value={values.type}>{values.type} (do cadastro do cliente)</option>
            )}
            {(TIPOS_ACAO[values.grupo_acao] || []).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Modalidade */}
      <div>
        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Modalidade</label>
        <div className="relative">
          <select
            value={values.modalidade}
            onChange={e => onChange({ modalidade: e.target.value })}
            className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 appearance-none"
          >
            <option value="">Selecione</option>
            <option value="judicial">Judicial</option>
            <option value="administrativo">Administrativo</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Fase */}
      <div>
        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Fase *</label>
        <div className="relative">
          <select
            value={values.fase}
            onChange={e => onChange({ fase: e.target.value })}
            className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 font-medium focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 appearance-none"
          >
            {FASES.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Etapa */}
      <div>
        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Etapa *</label>
        <div className="relative">
          <input
            value={values.etapa}
            onChange={e => onChange({ etapa: e.target.value })}
            className="w-full px-4 pr-9 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 font-medium focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400"
          />
          {values.etapa && (
            <button onClick={() => onChange({ etapa: '' })} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Número do processo CNJ */}
      <div>
        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Número do processo (CNJ)</label>
        <input
          value={values.number}
          onChange={e => onChange({ number: e.target.value })}
          placeholder="9999999-99.9999.9.99.9999"
          className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 font-mono"
        />
      </div>

      {/* Número do protocolo */}
      <div>
        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Número do protocolo/requerimento</label>
        <input
          value={values.numero_protocolo}
          onChange={e => onChange({ numero_protocolo: e.target.value })}
          placeholder="123456789-0"
          className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400"
        />
      </div>

      {/* Processo originário */}
      <div>
        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Processo originário</label>
        <input
          value={values.processo_originario}
          onChange={e => onChange({ processo_originario: e.target.value })}
          placeholder="9999999-99.9999.9.99.9999"
          className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 font-mono"
        />
      </div>

      {/* Pasta/Caso */}
      <div>
        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Pasta/Caso</label>
        <input
          value={values.pasta_caso}
          onChange={e => onChange({ pasta_caso: e.target.value })}
          placeholder="Identificação da pasta"
          className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400"
        />
      </div>

      {/* Data do requerimento */}
      <div>
        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Data do requerimento</label>
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <input
            type="date"
            value={values.data_requerimento}
            onChange={e => onChange({ data_requerimento: e.target.value })}
            className="w-full pl-10 pr-4 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400"
          />
        </div>
      </div>

      {afterDataRequerimento}

      {/* Valor da causa */}
      <div>
        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Valor da causa</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
          <input
            value={values.valor_causa}
            onChange={e => onChange({ valor_causa: e.target.value })}
            placeholder="999.999,99"
            className="w-full pl-8 pr-4 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400"
          />
        </div>
      </div>

      {/* Valor dos honorários */}
      <div>
        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Valor dos honorários</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
          <input
            value={values.valor_honorarios}
            onChange={e => onChange({ valor_honorarios: e.target.value })}
            placeholder="999.999,99"
            className="w-full pl-8 pr-4 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400"
          />
        </div>
      </div>

      {/* Percentual de honorários */}
      <div>
        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Percentual de honorários (%)</label>
        <input
          value={values.percentual_honorarios}
          onChange={e => onChange({ percentual_honorarios: e.target.value })}
          placeholder="99%"
          className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400"
        />
      </div>

      {/* Contingenciamento */}
      <div>
        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Contingenciamento</label>
        <div className="relative">
          <select
            value={values.contingenciamento}
            onChange={e => onChange({ contingenciamento: e.target.value })}
            className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 appearance-none"
          >
            <option value="">Selecione o contingenciamento</option>
            {CONTINGENCIAMENTOS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
      </div>
    </>
  )
}
