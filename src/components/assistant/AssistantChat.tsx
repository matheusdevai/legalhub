import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Bot, Send, User, AlertTriangle, Loader2 } from 'lucide-react'
import { Card } from '@/components/ui'
import { cn } from '@/lib/utils'
import { askAssistant, parseSlashCommand, type SlashCommand } from '@/lib/assistantChat'

// Chat interno do LegalHub Assistente (milestone 2). Conversa só na sessão
// atual (não persiste entre reloads) — persistência de histórico fica pra
// uma fatia futura. Cada pergunta é logada no backend (ai_assistant_logs)
// pela própria Edge Function, então nada aqui grava no banco diretamente.

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'error'
  text: string
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
      setMessages(prev => [...prev, { id: uid(), role: 'assistant', text: result.answer }])
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
            <div className={cn(
              'max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed',
              m.role === 'user' && 'bg-primary-600 text-white rounded-tr-sm',
              m.role === 'assistant' && 'bg-slate-100 dark:bg-dark-700 text-slate-800 dark:text-slate-100 rounded-tl-sm',
              m.role === 'error' && 'bg-red-50 dark:bg-red-900/15 text-red-700 dark:text-red-300 rounded-tl-sm',
            )}>
              {m.text}
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
