import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Megaphone, Sparkles } from 'lucide-react'
import { Modal } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { fetchDeadlineSettings } from '@/lib/deadlines/api'
import { visibleAnnouncements, unreadAnnouncements, onboardingPending } from '@/lib/announcements'
import { cn, formatDate } from '@/lib/utils'
import type { SystemAnnouncement } from '@/types'

/**
 * Botão "Novidades" do cabeçalho + janela que abre sozinha quando há novidade
 * não lida. Espera a agenda do dia (`blocked`) e o onboarding de quem acabou de
 * chegar, para não empilhar janelas. Ler = gravar em announcement_reads.
 */
export function WhatsNew({ blocked }: { blocked: boolean }) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [all, setAll] = useState<SystemAnnouncement[]>([])
  const [readIds, setReadIds] = useState<Set<string>>(new Set())
  const [features, setFeatures] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'unread' | 'all'>('unread')
  const [autoShown, setAutoShown] = useState(false)

  const userId = profile?.user_id
  const role = profile?.role

  const load = useCallback(async () => {
    if (!userId || !role || role === 'client') return
    const [{ data: anns }, { data: reads }] = await Promise.all([
      supabase.from('system_announcements').select('*').order('published_at', { ascending: false }).limit(40),
      supabase.from('announcement_reads').select('announcement_id').eq('user_id', userId),
    ])
    const list = (anns || []) as SystemAnnouncement[]
    if (list.some(a => a.requires_feature === 'prazos') && profile?.tenant_id) {
      const s = await fetchDeadlineSettings(profile.tenant_id)
      setFeatures(s.enabled ? ['prazos'] : [])
    }
    setAll(list)
    setReadIds(new Set((reads || []).map((r: { announcement_id: string }) => r.announcement_id)))
  }, [userId, role, profile?.tenant_id])

  useEffect(() => { load() }, [load])

  const ctx = useMemo(() => ({ role, features, now: new Date() }), [role, features, all])
  const visible = useMemo(() => visibleAnnouncements(all, ctx), [all, ctx])
  const unread = useMemo(() => unreadAnnouncements(all, readIds, ctx), [all, readIds, ctx])

  let skipped = false
  try { skipped = !!localStorage.getItem('lawfy_onboarding_skipped') } catch { /* sem storage */ }
  const waitOnboarding = onboardingPending(profile, skipped)

  useEffect(() => {
    if (autoShown || blocked || waitOnboarding || unread.length === 0) return
    setMode('unread'); setOpen(true); setAutoShown(true)
  }, [autoShown, blocked, waitOnboarding, unread.length])

  async function markRead(ids: string[]) {
    const fresh = ids.filter(id => !readIds.has(id))
    if (!userId || fresh.length === 0) return
    setReadIds(prev => new Set([...prev, ...fresh]))
    await supabase.from('announcement_reads').upsert(
      fresh.map(id => ({ user_id: userId, announcement_id: id })),
      { onConflict: 'user_id,announcement_id', ignoreDuplicates: true },
    )
  }

  const shown = mode === 'unread' && unread.length > 0 ? unread : visible

  function close() {
    markRead(shown.map(a => a.id))
    setOpen(false)
  }

  function go(a: SystemAnnouncement) {
    markRead(shown.map(x => x.id))
    setOpen(false)
    if (a.link) navigate(a.link)
  }

  if (!role || role === 'client') return null

  return (
    <>
      <button
        onClick={() => { setMode(unread.length ? 'unread' : 'all'); setOpen(true) }}
        className="relative p-2 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-dark-700 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
        title="Novidades do LegalHub" aria-label={unread.length ? `Novidades (${unread.length} não lidas)` : 'Novidades'}
      >
        <Sparkles className="w-4 h-4" />
        {unread.length > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary-600 ring-2 ring-white dark:ring-dark-900" />}
      </button>

      {/* Portal: o cabeçalho tem backdrop-blur, que prende elementos `fixed` dentro dele */}
      {open && createPortal(<Modal open={open} onClose={close} title={mode === 'unread' && unread.length ? 'Novidades para você' : 'Novidades do LegalHub'} size="md">
        {shown.length === 0 ? (
          <p className="px-6 py-8 text-sm text-center text-slate-500">Nenhuma novidade por enquanto.</p>
        ) : (
          <div className="max-h-[65vh] overflow-y-auto divide-y divide-slate-100 dark:divide-dark-700/50">
            {shown.map(a => {
              const isNew = !readIds.has(a.id)
              const aviso = a.category === 'aviso'
              return (
                <article key={a.id} className="px-6 py-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                      aviso ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300')}>
                      {aviso ? <Megaphone className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
                      {aviso ? 'Aviso' : 'Novidade'}
                    </span>
                    <span className="text-[11px] text-slate-400">{formatDate(a.published_at || a.created_at)}</span>
                    {isNew && mode === 'all' && <span className="text-[10px] font-semibold text-primary-600">não lida</span>}
                  </div>
                  <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white leading-snug">{a.title}</h3>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">{a.message}</p>
                  {a.link && (
                    <button onClick={() => go(a)}
                      className="mt-2.5 inline-flex items-center gap-1 text-sm font-semibold text-primary-600 dark:text-primary-400 hover:underline">
                      {a.link_label || 'Ver agora'} <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </article>
              )
            })}
          </div>
        )}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 dark:border-dark-700/50">
          {mode === 'unread' && unread.length > 0 && visible.length > unread.length ? (
            <button onClick={() => { markRead(unread.map(a => a.id)); setMode('all') }} className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
              Ver todas as novidades
            </button>
          ) : <span />}
          <button onClick={close} className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700">
            Entendi
          </button>
        </div>
      </Modal>, document.body)}
    </>
  )
}
