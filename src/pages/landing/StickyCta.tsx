import { useEffect, useState } from 'react'
import { ArrowRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TRIAL_DAYS } from './landingData'

const DISMISS_KEY = 'lh_sticky_cta_dismissed'

function readDismissed(): boolean {
  try { return sessionStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
}

/**
 * CTA fixo e discreto que aparece depois do hero: barra inteira no celular,
 * pílula no canto no desktop (com X para fechar na sessão). Some quando o
 * rodapé entra na tela, para não cobrir os links legais. A oferta de lançamento fica só na PromoCountdownBar do topo (mesma regra de promoUtils).
 */
export function StickyCta({ show, onCta }: { show: boolean; onCta: () => void }) {
  const [footerVisible, setFooterVisible] = useState(false)
  const [dismissed, setDismissed] = useState(readDismissed)

  useEffect(() => {
    const footer = document.querySelector('footer')
    if (!footer || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(([e]) => setFooterVisible(e.isIntersecting))
    obs.observe(footer)
    return () => obs.disconnect()
  }, [])

  const visible = show && !footerVisible

  function dismiss() {
    setDismissed(true)
    try { sessionStorage.setItem(DISMISS_KEY, '1') } catch { /* sem storage: fecha só nesta página */ }
  }

  return (
    <>
      {/* Celular: barra na base */}
      <div
        className={cn('sm:hidden fixed bottom-0 inset-x-0 z-40 px-4 pb-3 pt-3 transition-transform duration-300 motion-reduce:transition-none', visible ? 'translate-y-0' : 'translate-y-full')}
        style={{ background: 'linear-gradient(to top, rgba(2,7,17,0.96) 70%, rgba(2,7,17,0))' }}
        aria-hidden={!visible}
      >
        <button
          onClick={onCta}
          tabIndex={visible ? 0 : -1}
          className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white bg-[#0B5CFF] active:scale-[0.98] transition-transform"
        >
          Começar {TRIAL_DAYS} dias grátis <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Desktop: pílula discreta no canto */}
      {!dismissed && (
        <div
          className={cn('hidden sm:flex fixed bottom-3 right-3 z-40 items-center gap-3 pl-3.5 pr-1 py-1 rounded-full border border-white/10 bg-[#0b1220]/95 backdrop-blur-md transition-[opacity,transform] duration-300 motion-reduce:transition-none',
            visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none')}
          style={{ boxShadow: '0 18px 40px -16px rgba(0,0,0,0.7)' }}
          aria-hidden={!visible}
        >
          <span className="text-xs leading-tight">
            <span className="block font-semibold text-white">{TRIAL_DAYS} dias grátis, sem cartão</span>
          </span>
          <button onClick={onCta} tabIndex={visible ? 0 : -1}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold text-white bg-[#0B5CFF] hover:brightness-110 active:scale-[0.97] transition">
            Começar <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button onClick={dismiss} tabIndex={visible ? 0 : -1} aria-label="Fechar"
            className="w-7 h-7 rounded-full flex items-center justify-center text-[#A7B0C0] hover:text-white hover:bg-white/[0.08] transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </>
  )
}
