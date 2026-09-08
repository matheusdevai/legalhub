import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Bot, Send, User, AlertTriangle, Loader2, Check, X, Pencil } from 'lucide-react'
import { Card, Input, Select } from '@/components/ui'
import { cn, formatDate, PRIORITY_LABELS } from '@/lib/utils'
import {
  askAssistant, parseSlashCommand, confirmAssistantAction, cancelAssistantAction,
  type SlashCommand, type ProposedAction,
} from '@/lib/assistantChat'

// Chat interno do LegalHub Assistente (milestone 2 leitura + milestone 3
// escrita). Conversa só na sessão atual (não persiste entre reloads) —
// persistência de histórico fica pra uma fatia futura. Cada pergunta é
// logada no backend (ai_assistant_logs) pela própria Edge Function.
//
// Milestone 3: quando a resposta traz uma `proposed_action`, a mensagem
// ganha um card de confirmação inline (ActionCard) com Confirmar/Editar/
// Cancelar. Nada é gravado no banco pelo chat em si — só o clique explícito
// em "Confirmar" dispara a chamada separada (confirmAssistantAction) que
// grava de fato a tarefa/lembrete.

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'error'
  text: string
  proposedAction?: ProposedAction
  actionStatus?: 'pending' | 'confirmed' | 'cancelled'
}

const ACTION_TITLE: Record<ProposedAction['type'], string> = {
  criar_tarefa: 'Nova tarefa',
  criar_lembrete: 'Novo lembrete',
}

function ActionCard({ message, onUpdate }: { message: ChatMessage; onUpdate: (patch: Partial<ChatMessage>) => void }) {
  const action = message.proposedAction!
  const status = message.actionStatus || 'pending'
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(action.title)
  const [dueDate, setDueDate] = useState(action.due_date || '')
  const [priority, setPriority] = useState(action.priority)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (status === 'confirmed') {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <Check className="w-3.5 h-3.5" /> {action.type === 'criar_lembrete' ? 'Lembrete criado.' : 'Tarefa criada.'}
      </div>
    )
  }
  if (status === 'cancelled') {
    return (
      <div className="mt-2 text-xs font-medium text-slate-400 dark:text-slate-500">Ação cancelada.</div>
    )
  }

  async function handleConfirm() {
    if (!title.trim() || submitting) return
    setSubmitting(true)
    setError('')
    try {
      await confirmAssistantAction({
        log_id: action.log_id,
        type: action.type,
        title: title.trim(),
        description: action.description,
        due_date: dueDate || null,
        priority,
        assigned_to: action.assigned_to,
      })
      onUpdate({ actionStatus: 'confirmed' })
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
      onUpdate({ actionStatus: 'cancelled' })
    } catch (err: any) {
      setError(err?.message || 'Não foi possível cancelar. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-2 max-w-[85%] rounded-xl border border-primary-100 dark:border-primary-900/30 bg-primary-50/60 dark:bg-primary-900/10 p-3 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-primary-600 dark:text-primary-400">{ACTION_TITLE[action.type]}</p>

      {editing ? (
        <div className="space-y-2">
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título" />
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            {action.type === 'criar_tarefa' && (
              <Select value={priority} onChange={e => setPriority(e.target.value as ProposedAction['priority'])}>
                <option value="low">Baixa</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
                <option value="urgent">Urgente</option>
              </Select>
            )}
          </div>
        </div>
      ) : (
        <div className="text-xs text-slate-600 dark:text-slate-300 space-y-0.5">
          <p className="font-semibold text-slate-800 dark:text-slate-100">{title}</p>
          <p>{dueDate ? `Vencimento: ${formatDate(dueDate)}` : 'Sem data definida'}</p>
          <p>Responsável: {action.assigned_name || 'Você'}</p>
          {action.type === 'criar_tarefa' && <p>Prioridade: {PRIORITY_LABELS[priority]}</p>}
        </div>
      )}

      {action.note && <p className="text-[11px] text-amber-600 dark:text-amber-400">{action.note}</p>}
      {error && <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex items-center gap-1.5 pt-1">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={submitting || !title.trim()}
          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white transition-colors"
        >
          <Check className="w-3.5 h-3.5" /> Confirmar
        </button>
        <button
          type="button"
          onClick={() => setEditing(e => !e)}
          disabled={submitting}
          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-dark-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-dark-700 disabled:opacity-50 transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" /> {editing ? 'Concluir edição' : 'Editar'}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={submitting}
          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/15 disabled:opacity-50 transition-colors"
        >
          <X className="w-3.5 h-3.5" /> Cancelar
        </button>
      </div>
    </div>
  )
}

const SUGGESTIONS = [
  'Como está meu dia?',
  'Quais são meus prazos?',
  'Mostre minhas pendências',
  'O que é urgente?',
]

const SLASH_HINTS: Array<{ command: SlashCommand; label: string }> = [
  { command: 'hoje', label: '/hoje' },
  { command: 'prazos', label: '/prazos' },
  { command: 'urgente', label: '/urgente' },
  { command: 'pendencias', label: '/pendencias' },
  { command: 'clientes', label: '/clientes' },
  { command: 'processos', label: '/processos' },
  { command: 'tarefas', label: '/tarefas' },
  { command: 'agenda', label: '/agenda' },
  { command: 'documentos', label: '/documentos' },
  { command: 'resumo', label: '/resumo' },
]

function uid(): string {
  return Math.random().toString(36).slice(2)
}

export function AssistantChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [showSlashHints, setShowSlashHints] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  async function send(rawText: string) {
    const text = rawText.trim()
    if (!text || sending) return

    const slash = parseSlashCommand(text)
    setMessages(prev => [...prev, { id: uid(), role: 'user', text }])
    setInput('')
    setShowSlashHints(false)
    setSending(true)
    try {
      const result = slash
        ? await askAssistant({ slashCommand: slash })
        : await askAssistant({ message: text })
      setMessages(prev => [...prev, {
        id: uid(),
        role: 'assistant',
        text: result.answer,
        proposedAction: result.proposed_action || undefined,
        actionStatus: result.proposed_action ? 'pending' : undefined,
      }])
    } catch (err: any) {
      setMessages(prev => [...prev, { id: uid(), role: 'error', text: err?.message || 'Não foi possível obter uma resposta. Tente novamente.' }])
    } finally {
      setSending(false)
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    send(input)
  }

  function handleInputChange(value: string) {
    setInput(value)
    setShowSlashHints(value.trim() === '/')
  }

  function updateMessage(id: string, patch: Partial<ChatMessage>) {
    setMessages(prev => prev.map(m => (m.id === id ? { ...m, ...patch } : m)))
  }

  return (
    <Card className="p-0 overflow-hidden flex flex-col h-[520px]">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100 dark:border-dark-600">
        <div className="w-8 h-8 rounded-xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center flex-shrink-0">
          <Bot className="w-4 h-4 text-primary-600 dark:text-primary-400" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">LegalHub Assistente</h2>
          <p className="text-xs text-slate-400">Pergunte sobre seus prazos, tarefas, agenda, processos e clientes</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-3 py-6">
            <Bot className="w-8 h-8 text-slate-300 dark:text-slate-600" />
            <p className="text-sm text-slate-400 max-w-xs">
              Faça uma pergunta em linguagem natural ou use um comando de barra (digite <span className="font-mono">/</span>).
            </p>
          </div>
        )}
        {messages.map(m => (
          <div key={m.id} className={cn('flex gap-2', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            {m.role !== 'user' && (
              <div className={cn(
                'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5',
                m.role === 'error' ? 'bg-red-50 dark:bg-red-900/20' : 'bg-primary-50 dark:bg-primary-900/20',
              )}>
                {m.role === 'error'
                  ? <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                  : <Bot className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400" />}
              </div>
            )}
            <div className="min-w-0">
              <div className={cn(
                'max-w-full rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed',
                m.role === 'user' && 'bg-primary-600 text-white rounded-tr-sm',
                m.role === 'assistant' && 'bg-slate-100 dark:bg-dark-700 text-slate-800 dark:text-slate-100 rounded-tl-sm',
                m.role === 'error' && 'bg-red-50 dark:bg-red-900/15 text-red-700 dark:text-red-300 rounded-tl-sm',
              )}>
                {m.text}
              </div>
              {m.proposedAction && <ActionCard message={m} onUpdate={patch => updateMessage(m.id, patch)} />}
            </div>
            {m.role === 'user' && (
              <div className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-dark-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                <User className="w-3.5 h-3.5 text-slate-500 dark:text-slate-300" />
              </div>
            )}
          </div>
        ))}
        {sending && (
          <div className="flex gap-2 justify-start">
            <div className="w-7 h-7 rounded-lg bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center flex-shrink-0">
              <Bot className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400" />
            </div>
            <div className="rounded-2xl rounded-tl-sm px-3.5 py-2.5 bg-slate-100 dark:bg-dark-700">
              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
            </div>
          </div>
        )}
      </div>

      {messages.length === 0 && (
        <div className="px-5 pb-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => send(s)}
              className="text-xs font-medium px-3 py-1.5 rounded-full border border-slate-200 dark:border-dark-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-dark-700 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="relative border-t border-slate-100 dark:border-dark-600 p-3">
        {showSlashHints && (
          <div className="absolute bottom-full left-3 right-3 mb-1.5 bg-white dark:bg-dark-700 border border-slate-200 dark:border-dark-600 rounded-xl shadow-card p-1.5 flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
            {SLASH_HINTS.map(h => (
              <button
                key={h.command}
                type="button"
                onClick={() => send(h.label)}
                className="text-xs font-mono font-medium px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-dark-600 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
              >
                {h.label}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            value={input}
            onChange={e => handleInputChange(e.target.value)}
            placeholder="Pergunte ao LegalHub Assistente..."
            disabled={sending}
            className={cn(
              'flex-1 px-3.5 py-2.5 text-sm border rounded-xl outline-none transition-all',
              'border-slate-200 bg-white text-slate-900 placeholder-slate-400',
              'dark:border-dark-600 dark:bg-dark-800 dark:text-slate-100 dark:placeholder-slate-500',
              'focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-900/30',
            )}
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="w-10 h-10 flex-shrink-0 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors"
            aria-label="Enviar"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </Card>
  )
}
