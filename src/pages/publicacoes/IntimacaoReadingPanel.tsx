import { ArrowLeft, CheckCircle2, Clock, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn, formatDate } from '@/lib/utils'

export interface IntimacaoReadingData {
  id: string
  numero_processo: string
  partes: string
  tribunal: string
  orgao: string
  publicacao: string
  conteudo: string
  teor: string
  temTeorCompleto: boolean
  link: string | null
  fonte: string | null
  complementos: { codigo: number; nome: string; valor: string }[]
  responsavel: string
  situacao: 'Pendente' | 'Lida' | 'Cumprida'
}

const SITUACAO_STYLE: Record<string, string> = {
  Pendente: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800',
  Lida:     'bg-gray-100 text-gray-500 border-gray-200 dark:bg-dark-700 dark:text-gray-400 dark:border-dark-600',
  Cumprida: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800',
}

const FONTE_LABELS: Record<string, string> = {
  pje: 'PJe (DJEN)',
  cnj: 'CNJ (DataJud)',
}

// `link` vem de uma API externa (DJEN) sem garantia de esquema — nunca renderizar
// como href sem validar, ou um valor tipo "javascript:..." viraria um link clicável
// (XSS). Só http(s) é aceito; qualquer outra coisa é tratada como ausente.
export function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

interface Props {
  item: IntimacaoReadingData | null
  prazoCriadoEm: string | null
  onBack: () => void
  onMarkStatus: (situacao: 'Lida' | 'Cumprida') => void
  onCriarPrazo: () => void
  onVerTarefa: () => void
}

export function IntimacaoReadingPanel({ item, prazoCriadoEm, onBack, onMarkStatus, onCriarPrazo, onVerTarefa }: Props) {
  if (!item) {
    return (
      <div className="h-full min-h-[320px] flex flex-col items-center justify-center text-center px-8 py-16 text-gray-400 dark:text-gray-500">
        <p className="text-sm">Selecione uma intimação na lista para ler o conteúdo completo.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <button
        type="button"
        onClick={onBack}
        className="lg:hidden flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 px-4 pt-3 pb-1 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Voltar à lista
      </button>

      <div className="px-5 pt-4 pb-3 border-b border-gray-100 dark:border-dark-700 space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">{item.partes}</h3>
          <span className={cn('inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border flex-shrink-0', SITUACAO_STYLE[item.situacao])}>
            {item.situacao}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
          <span className="font-mono text-gray-600 dark:text-gray-300">{item.numero_processo}</span>
          <span>{item.orgao && item.orgao !== item.tribunal ? `${item.tribunal} — ${item.orgao}` : item.tribunal}</span>
          <span>Publicado em {item.publicacao ? formatDate(item.publicacao) : '—'}</span>
          {item.responsavel && <span>Responsável: {item.responsavel}</span>}
          {item.fonte && (
            <span className="uppercase tracking-wide text-[10px] font-semibold text-gray-400 dark:text-gray-500">
              via {FONTE_LABELS[item.fonte] || item.fonte}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {item.temTeorCompleto ? (
          <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{item.teor}</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-500 dark:text-gray-400 italic">
              Texto completo não disponível para esta fonte — mostrando os dados estruturados retornados pelo tribunal.
            </p>
            <p className="text-sm text-gray-700 dark:text-gray-200 font-medium">{item.conteudo}</p>
            {item.complementos.length > 0 && (
              <dl className="space-y-1.5 text-xs border-t border-gray-100 dark:border-dark-700 pt-3">
                {item.complementos.map(c => (
                  <div key={c.codigo} className="flex gap-2">
                    <dt className="text-gray-400 dark:text-gray-500 flex-shrink-0">{c.nome}:</dt>
                    <dd className="text-gray-600 dark:text-gray-300">{c.valor}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        )}
        {item.link && isSafeHttpUrl(item.link) && (
          <a
            href={item.link}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 mt-4 text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Ver publicação original no Diário
          </a>
        )}
      </div>

      <div className="px-5 py-3 border-t border-gray-100 dark:border-dark-700 space-y-2.5">
        {prazoCriadoEm ? (
          <button
            type="button"
            onClick={onVerTarefa}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 text-sm font-semibold hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
          >
            <Clock className="w-4 h-4" /> Prazo criado para {formatDate(prazoCriadoEm)} — ver em Atividades
          </button>
        ) : (
          <Button variant="primary" className="w-full justify-center" onClick={onCriarPrazo}>
            <Clock className="w-4 h-4 mr-1.5" /> Criar tarefa de prazo
          </Button>
        )}
        <div className="flex items-center gap-2">
          {item.situacao !== 'Lida' && (
            <button
              type="button"
              onClick={() => onMarkStatus('Lida')}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-dark-600 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Marcar como lida
            </button>
          )}
          {item.situacao !== 'Cumprida' && (
            <button
              type="button"
              onClick={() => onMarkStatus('Cumprida')}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-dark-600 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Marcar como cumprida
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
