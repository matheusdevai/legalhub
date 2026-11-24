import { useEffect, useRef, useState } from 'react'

/** Ganchos e peças de movimento da landing (HeroMockup, ProfileTour).
 *  Tudo respeita prefers-reduced-motion: com ele ligado, nada se move —
 *  números aparecem no valor final e as animações viram estados estáticos. */

function matches(query: string) {
  return typeof window !== 'undefined' && !!window.matchMedia?.(query).matches
}

export function useMediaQuery(query: string) {
  const [value, setValue] = useState(() => matches(query))
  useEffect(() => {
    const mq = window.matchMedia?.(query)
    if (!mq) return
    const onChange = () => setValue(mq.matches)
    onChange()
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [query])
  return value
}

export function usePrefersReducedMotion() {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}

/** true enquanto o elemento está na tela (ou, com `once`, a partir da 1ª vez que aparece). */
export function useInView<T extends Element>(ref: React.RefObject<T>, { once = false, threshold = 0.2 } = {}) {
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') { setInView(true); return }
    const obs = new IntersectionObserver(([entry]) => {
      setInView(entry.isIntersecting)
      if (entry.isIntersecting && once) obs.disconnect()
    }, { threshold })
    obs.observe(el)
    return () => obs.disconnect()
  }, [ref, once, threshold])
  return inView
}

export const formatInt = (n: number) => Math.round(n).toLocaleString('pt-BR')
export const formatBRL = (n: number) =>
  Math.round(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

/**
 * Número que conta do valor anterior até `value` (easeOutQuart). Escreve direto
 * no DOM a cada quadro, sem re-render do React. Antes de `start` mostra o valor
 * inicial (0); com movimento reduzido mostra o final de uma vez.
 * O texto animado é decorativo: quem precisa do valor para leitor de tela
 * deve renderizar o número final em `sr-only` ao lado (ver ProfileTour).
 */
export function CountUp({ value, start = true, duration = 1100, format = formatInt, className }: {
  value: number
  start?: boolean
  duration?: number
  format?: (n: number) => string
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const current = useRef(0)
  const formatRef = useRef(format)
  formatRef.current = format
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const fmt = formatRef.current
    if (!start) { el.textContent = fmt(current.current); return }
    if (reduced || duration <= 0) { current.current = value; el.textContent = fmt(value); return }
    const from = current.current
    if (from === value) { el.textContent = fmt(value); return }
    const t0 = performance.now()
    let raf = requestAnimationFrame(function tick(t) {
      const k = Math.min(1, (t - t0) / duration)
      const eased = 1 - Math.pow(1 - k, 4)
      current.current = from + (value - from) * eased
      el.textContent = fmt(current.current)
      if (k < 1) raf = requestAnimationFrame(tick)
      else current.current = value
    })
    return () => cancelAnimationFrame(raf)
  }, [value, start, duration, reduced])

  return <span ref={ref} className={className}>{format(0)}</span>
}
