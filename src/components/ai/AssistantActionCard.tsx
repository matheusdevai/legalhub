import { useState } from 'react'
import { Check, X, Clock } from 'lucide-react'
import { formatDate, PRIORITY_LABELS } from '@/lib/utils'
import { confirmAssistantAction, cancelAssistantAction, type ProposedAction } from '@/lib/assistantChat'

// Card de confirmação de ação proposta (criar tarefa/lembrete), compartilhado
// entre AiCopilotoTab e AiAssistantWidget — as duas superfícies "compactas"
// que passaram a usar o backend ai-assistant-chat (unificação dos assistentes
// de IA). Versão sem edição inline (diferente do ActionCard de AssistantChat.tsx,
// que tem "Editar"): aqui o espaço é menor e a ação já vem pronta da IA —
// confirmar ou cancelar é suficiente; quem quiser ajustar o título/data pode
// editar a tarefa depois em Tarefas, como qualquer outra.
//
// A tarefa/lembrete só é gravada de fato no clique em "Confirmar" — nunca
// antes disso, mesmo padrão de confirmação atômica do restante do assistente.

export type ActionStatus = 'pending' | 'confirmed' | 'cancelled'

const ACTION_TITLE: Record<ProposedAction['type'], string> = {
  criar_tarefa: 'Nova tarefa',
  criar_lembrete: 'Novo lembrete',
}

interface Props {
  action: ProposedAction
  status: ActionStatus
  onConfirmed: () => void
  onCancelled: () => void
}

export function AssistantActionCard({ action, status, onConfirmed, onCancelled }: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (status === 'confirmed') {
    return (
      <div className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <Check className="w-3.5 h-3.5" /> {action.type === 'criar_lembrete' ? 'Lembrete criado.' : 'Tarefa criada.'}
      </div>
    )
  }
  if (status === 'cancelled') {
    return <div className="mt-1.5 text-xs font-medium text-slate-400 dark:text-slate-500">Ação cancelada.</div>
  }

  async function handleConfirm() {
    if (submitting) return
    setSubmitting(true)
    setError('')
    try {
      await confirmAssistantAction({
        log_id: action.log_id,
        type: action.type,
        title: action.title,
        description: action.description,
        due_date: action.due_date,
        priority: action.priority,
        assigned_to: action.assigned_to,
      })
      onConfirmed()
    } catch (err: any) {
      setError(err?.message || 'Não foi possível confirmar. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCancel() {
    if (submitting) return
    setSubmitting(true)
    setError('')
    try {
      await cancelAssistantAction(action.log_id)
      onCancelled()
    } catch (err: any) {
      setError(err?.message || 'Não foi possível cancelar. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-1.5 max-w-[90%] rounded-xl border border-primary-100 dark:border-primary-900/30 bg-primary-50/60 dark:bg-primary-900/10 p-2.5 space-y-1.5">
      <p className="text-[9px] font-bold uppercase tracking-wide text-primary-600 dark:text-primary-400">{ACTION_TITLE[action.type]}</p>
      <div className="text-xs text-slate-600 dark:text-slate-300 space-y-0.5">
        <p className="font-semibold text-slate-800 dark:text-slate-100">{action.title}</p>
        <p className="flex items-center gap-1">
          <Clock className="w-3 h-3 flex-shrink-0" />
          {action.due_date ? formatDate(action.due_date) : 'Sem data definida'}
          {action.type === 'criar_tarefa' && ` · ${PRIORITY_LABELS[action.priority]}`}
        </p>
        <p>Responsável: {action.assigned_name || 'Você'}</p>
      </div>
      {action.note && <p className="text-[10px] text-amber-600 dark:text-amber-400">{action.note}</p>}
      {error && <p className="text-[10px] text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex items-center gap-1.5 pt-0.5">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={submitting}
          className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white transition-colors"
        >
          <Check className="w-3 h-3" /> Confirmar
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={submitting}
          className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/15 disabled:opacity-50 transition-colors"
        >
          <X className="w-3 h-3" /> Cancelar
        </button>
      </div>
    </div>
  )
}
