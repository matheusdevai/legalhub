import { useState } from 'react'
import { MessageCircle, X, Send, CheckCircle2, ChevronDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

export function SupportChatWidget() {
  const { profile } = useAuth()
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  function openWidget() {
    if (sent) { setSent(false); setSubject(''); setMessage(''); setError('') }
    setOpen(v => !v)
  }

  async function submit() {
    if (!subject.trim() || !message.trim()) return
    setSending(true)
    setError('')
    try {
      const { error: dbErr } = await supabase.from('support_tickets').insert({
        tenant_id: profile?.tenant_id ?? null,
        user_id: profile?.user_id ?? null,
        user_email: profile?.email ?? null,
        user_name: profile?.name || profile?.display_name || null,
        subject: subject.trim(),
        message: message.trim(),
        status: 'open',
      })
      if (dbErr) throw dbErr

      // Fire-and-forget — widget shows success regardless of email result
      supabase.functions.invoke('send-support-email', {
        body: {
          from_name: profile?.name || profile?.display_name,
          from_email: profile?.email,
          subject: subject.trim(),
          message: message.trim(),
          tenant_name: profile?.tenant_id,
        },
      }).catch(() => { /* silent */ })

      setSent(true)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar. Tente novamente.'
      setError(msg)
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-[88px] right-6 z-50 w-[340px] bg-white dark:bg-dark-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-dark-700 flex flex-col overflow-hidden animate-scale-in">

          {/* Header */}
          <div className="bg-gradient-to-r from-primary-800 to-primary-500 px-4 py-3.5 flex items-center gap-3 flex-shrink-0">
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
              <MessageCircle className="w-4.5 h-4.5 text-white" style={{ width: 18, height: 18 }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white leading-tight">Suporte LegalHub</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                <p className="text-[11px] text-primary-200 leading-none">Resposta em até 24h</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-white/60 hover:text-white transition-colors p-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex flex-col p-4 gap-3 overflow-y-auto" style={{ maxHeight: 420 }}>

            {/* Bot messages */}
            <div className="flex gap-2">
              <div className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                <MessageCircle className="text-primary-600 dark:text-primary-400" style={{ width: 12, height: 12 }} />
              </div>
              <div className="bg-slate-100 dark:bg-dark-700 rounded-2xl rounded-tl-sm px-3 py-2 text-sm text-gray-700 dark:text-gray-300 max-w-[85%]">
                Olá! 👋 Sou o suporte do LegalHub.
              </div>
            </div>
            <div className="flex gap-2">
              <div className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                <MessageCircle className="text-primary-600 dark:text-primary-400" style={{ width: 12, height: 12 }} />
              </div>
              <div className="bg-slate-100 dark:bg-dark-700 rounded-2xl rounded-tl-sm px-3 py-2 text-sm text-gray-700 dark:text-gray-300 max-w-[85%]">
                Descreva seu problema e nossa equipe entrará em contato pelo seu e-mail.
              </div>
            </div>

            {sent ? (
              /* Success state */
              <div className="flex flex-col items-center py-6 gap-3">
                <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Chamado aberto!</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                    Nossa equipe analisará sua solicitação e<br />entrará em contato em breve.
                  </p>
                </div>
                <button
                  onClick={() => { setSent(false); setSubject(''); setMessage(''); setError('') }}
                  className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                >
                  Abrir outro chamado
                </button>
              </div>
            ) : (
              /* Form */
              <div className="space-y-3 mt-1">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                    Assunto *
                  </label>
                  <input
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    placeholder="Ex: Problema ao cadastrar processo"
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-white dark:bg-dark-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-200 dark:focus:ring-primary-800 focus:border-primary-400 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                    Mensagem *
                  </label>
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Descreva com detalhes o que está acontecendo..."
                    rows={4}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-dark-600 rounded-xl bg-white dark:bg-dark-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-200 dark:focus:ring-primary-800 focus:border-primary-400 transition-all resize-none"
                  />
                </div>
                {error && (
                  <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-xl border border-red-100 dark:border-red-900/30">
                    {error}
                  </p>
                )}
                <button
                  onClick={submit}
                  disabled={sending || !subject.trim() || !message.trim()}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 shadow-button"
                >
                  {sending
                    ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Enviando...</>
                    : <><Send style={{ width: 14, height: 14 }} />Enviar chamado</>}
                </button>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 border-t border-gray-100 dark:border-dark-700 px-4 py-2 text-center">
            <p className="text-[10px] text-gray-400 dark:text-gray-600">Powered by LegalHub · Suporte técnico</p>
          </div>
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={openWidget}
        className={cn(
          'fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-200',
          open
            ? 'bg-gray-600 dark:bg-dark-600 scale-95'
            : 'bg-primary-600 hover:bg-primary-700 hover:scale-105 shadow-button-lg',
        )}
        title="Abrir suporte"
      >
        {open
          ? <ChevronDown className="w-5 h-5 text-white" />
          : <MessageCircle className="w-6 h-6 text-white" />}

        {/* Pulse ring — only when closed */}
        {!open && (
          <span className="absolute inset-0 rounded-full bg-primary-500 opacity-30 animate-ping" />
        )}
      </button>
    </>
  )
}
