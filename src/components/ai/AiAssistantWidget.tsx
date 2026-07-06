import { useEffect, useRef, useState } from 'react'
import { Sparkles, X, Send, ChevronDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

const SUGESTOES = [
  'Como está o desempenho do escritório hoje?',
  'Quais processos vencem essa semana?',
  'Tem alguma tarefa atrasada?',
  'Como está o financeiro?',
]

export function AiAssistantWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  async function send(text: string) {
    const content = text.trim()
    if (!content || loading) return
    setError('')
    const next = [...messages, { role: 'user' as const, content }]
    setMessages(next)
    setInput('')
    setLoading(true)
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('ai-assistant', {
        body: { messages: next },
      })
      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)
      setMessages([...next, { role: 'assistant', content: data.reply || '...' }])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao consultar o assistente. Tente novamente.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {open && (
        <div className="fixed bottom-[164px] right-6 z-50 w-[360px] bg-white dark:bg-dark-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-dark-700 flex flex-col overflow-hidden animate-scale-in">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-700 via-violet-600 to-purple-600 px-4 py-3.5 flex items-center gap-3 flex-shrink-0">
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
              <Sparkles className="text-white" style={{ width: 18, height: 18 }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white leading-tight">Copiloto Lawfy</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                <p className="text-[11px] text-indigo-100 leading-none">IA premium · dados em tempo real</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/60 hover:text-white transition-colors p-0.5">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div ref={scrollRef} className="flex flex-col p-4 gap-3 overflow-y-auto" style={{ maxHeight: 440, minHeight: 220 }}>
            {messages.length === 0 && (
              <>
                <div className="flex gap-2">
                  <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Sparkles className="text-indigo-600 dark:text-indigo-400" style={{ width: 12, height: 12 }} />
                  </div>
                  <div className="bg-slate-100 dark:bg-dark-700 rounded-2xl rounded-tl-sm px-3 py-2 text-sm text-gray-700 dark:text-gray-300 max-w-[85%]">
                    Olá! Sou o Copiloto Lawfy. Posso analisar clientes, processos, tarefas, agenda e financeiro para ajudar o escritório a render mais. O que você quer saber?
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {SUGESTOES.map(s => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="text-xs px-2.5 py-1.5 rounded-full border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </>
            )}

            {messages.map((m, i) => (
              <div key={i} className={cn('flex gap-2', m.role === 'user' && 'justify-end')}>
                {m.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Sparkles className="text-indigo-600 dark:text-indigo-400" style={{ width: 12, height: 12 }} />
                  </div>
                )}
                <div
                  className={cn(
                    'rounded-2xl px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap leading-relaxed',
                    m.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-tr-sm'
                      : 'bg-slate-100 dark:bg-dark-700 text-gray-700 dark:text-gray-300 rounded-tl-sm',
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Sparkles className="text-indigo-600 dark:text-indigo-400" style={{ width: 12, height: 12 }} />
                </div>
                <div className="bg-slate-100 dark:bg-dark-700 rounded-2xl rounded-tl-sm px-3 py-2.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" />
                </div>
              </div>
            )}

            {error && (
              <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-xl border border-red-100 dark:border-red-900/30">
                {error}
              </p>
            )}
          </div>

          {/* Input */}
          <div className="flex-shrink-0 border-t border-gray-100 dark:border-dark-700 p-3 flex items-center gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') send(input) }}
              placeholder="Pergunte sobre o escritório..."
              disabled={loading}
              className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-white dark:bg-dark-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-800 focus:border-indigo-400 transition-all disabled:opacity-50"
            />
            <button
              onClick={() => send(input)}
              disabled={loading || !input.trim()}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 transition-colors flex-shrink-0"
            >
              <Send style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          'fixed bottom-[100px] right-6 z-50 w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-200',
          open
            ? 'bg-gray-600 dark:bg-dark-600 scale-95'
            : 'bg-gradient-to-br from-indigo-600 to-purple-600 hover:scale-105 shadow-button-lg',
        )}
        title="Copiloto Lawfy"
      >
        {open ? <ChevronDown className="w-5 h-5 text-white" /> : <Sparkles className="w-6 h-6 text-white" />}
        {!open && <span className="absolute inset-0 rounded-full bg-indigo-500 opacity-30 animate-ping" />}
      </button>
    </>
  )
}
