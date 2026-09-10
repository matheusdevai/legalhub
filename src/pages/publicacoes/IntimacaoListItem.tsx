import { Clock } from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'

export interface IntimacaoListItemData {
  id: string
  partes: string
  conteudo: string
  tribunal: string
  publicacao: string
  situacao: 'Pendente' | 'Lida' | 'Cumprida'
}

const SITUACAO_DOT: Record<string, string> = {
  Pendente: 'bg-amber-500',
  Lida: 'bg-gray-400 dark:bg-gray-500',
  Cumprida: 'bg-emerald-500',
}

interface Props {
  item: IntimacaoListItemData
  active: boolean
  temPrazoCriado: boolean
  onSelect: () => void
}

export function IntimacaoListItem({ item, active, temPrazoCriado, onSelect }: Props) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full text-left px-4 py-3 border-b border-gray-100 dark:border-dark-700/60 border-l-2 transition-colors',
        active
          ? 'bg-primary-50 dark:bg-primary-900/20 border-l-primary-600'
          : 'border-l-transparent hover:bg-gray-50 dark:hover:bg-dark-700/40',
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400 truncate">
          <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', SITUACAO_DOT[item.situacao])} />
          {item.tribunal}
        </span>
        <span className="text-[11px] text-gray-400 dark:text-gray-500 whitespace-nowrap flex-shrink-0">
          {item.publicacao ? formatDate(item.publicacao) : '—'}
        </span>
      </div>
      <p className={cn(
        'text-sm leading-snug truncate',
        active ? 'font-semibold text-primary-800 dark:text-primary-300' : 'font-medium text-gray-900 dark:text-white',
      )}>
        {item.partes}
      </p>
      <div className="flex items-center gap-1.5 mt-0.5">
        <p className="text-xs text-gray-400 dark:text-gray-500 truncate flex-1">{item.conteudo}</p>
        {temPrazoCriado && <Clock className="w-3 h-3 text-primary-500 flex-shrink-0" />}
      </div>
    </button>
  )
}
