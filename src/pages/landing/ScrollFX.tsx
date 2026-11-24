import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { prefersReducedMotion } from './useReveal'

/** Executa `fn` no máximo uma vez por quadro enquanto a página rola/redimensiona. */
function useRafScroll(fn: () => void) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    let raf = 0
    const run = () => { raf = 0; ref.current() }
    const on = () => { if (!raf) raf = requestAnimationFrame(run) }
    run()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => {
      window.removeEventListener('scroll', on)
      window.removeEventListener('resize', on)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])
}

/** Barra fina no topo que acompanha quanto da página já foi lida. */
export function ScrollProgress() {
  const bar = useRef<HTMLDivElement>(null)
  useRafScroll(() => {
    const el = bar.current
    if (!el) return
    const max = document.documentElement.scrollHeight - window.innerHeight
    const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
    el.style.transform = `scaleX(${p})`
  })
  return (
    <div aria-hidden className="fixed top-0 inset-x-0 h-[3px] z-[70] pointer-events-none">
      <div ref={bar} className="h-full origin-left bg-[#1677FF]" style={{ transform: 'scaleX(0)', boxShadow: '0 0 12px rgba(22,119,255,0.7)' }} />
    </div>
  )
}

/**
 * Parallax do topo: conforme a página rola, o bloco de texto sobe mais devagar e
 * esmaece, e o painel logo abaixo chega "por cima". Só transform/opacity.
 */
export function useHeroParallax<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useRafScroll(() => {
    const el = ref.current
    if (!el || prefersReducedMotion()) return
    const y = Math.min(window.scrollY, 700)
    el.style.transform = `translate3d(0, ${y * 0.22}px, 0) scale(${1 - y / 5000})`
    el.style.opacity = String(Math.max(0, 1 - y / 520))
  })
  return ref
}

export interface DotSection { id: string; label: string }

/** Pontos de navegação fixos na lateral (telas largas): mostram onde você está. */
export function SectionDots({ sections }: { sections: DotSection[] }) {
  const [active, setActive] = useState(0)
  useRafScroll(() => {
    const mid = window.innerHeight * 0.4
    let idx = 0
    sections.forEach((s, i) => {
      const el = document.getElementById(s.id)
      if (el && el.getBoundingClientRect().top <= mid) idx = i
    })
    setActive(prev => (prev === idx ? prev : idx))
  })
  return (
    <nav aria-label="Seções da página" className="hidden xl:flex fixed right-5 top-1/2 -translate-y-1/2 z-40 flex-col gap-3">
      {sections.map((s, i) => (
        <a key={s.id} href={`#${s.id}`} aria-label={s.label} aria-current={i === active ? 'true' : undefined} className="group relative flex items-center justify-end">
          <span className="absolute right-6 whitespace-nowrap rounded-full bg-[#0b1220]/95 border border-white/10 px-2.5 py-1 text-[11px] font-medium text-white opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 group-focus-visible:opacity-100 transition-all pointer-events-none">{s.label}</span>
          <span className={cn('block rounded-full transition-all duration-300', i === active ? 'w-2.5 h-2.5 bg-[#1677FF]' : 'w-2 h-2 bg-slate-400/50 group-hover:bg-slate-300')}
            style={i === active ? { boxShadow: '0 0 0 4px rgba(22,119,255,0.2)' } : undefined} />
        </a>
      ))}
    </nav>
  )
}
