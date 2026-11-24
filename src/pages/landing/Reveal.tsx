import { useEffect, useRef, useState } from 'react'
import { REVEAL_MS, revealStyle, useInView, usePrefersReducedMotion, useReveal } from './useReveal'

/** Revela o conteúdo (fade + 14px) quando entra na viewport; `delay` escalona irmãos. */
export function Reveal({ children, delay = 0, className = '', style, as: Tag = 'div' }: {
  children: React.ReactNode
  delay?: number
  className?: string
  style?: React.CSSProperties
  as?: 'div' | 'li' | 'section' | 'article'
}) {
  const { ref, visible, reduced } = useReveal<HTMLDivElement>()
  // Terminada a entrada, solta o estilo inline: hover/transições das classes do
  // elemento (cards de plano, FAQ) voltam a valer sem briga com a revelação.
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    if (!visible || reduced) return
    const t = setTimeout(() => setSettled(true), delay + REVEAL_MS + 60)
    return () => clearTimeout(t)
  }, [visible, reduced, delay])
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Tag ref={ref as any} className={className} style={settled ? style : { ...revealStyle(visible, delay, reduced), ...style }}>
      {children}
    </Tag>
  )
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

/**
 * Número que conta de 0 até `value` quando aparece na tela (uma vez).
 * Só para números reais da própria página. A largura é reservada pelo valor
 * final (tabular-nums + min-width em ch), então a contagem não mexe no layout;
 * leitores de tela recebem só o valor final.
 */
export function CountUp({ value, duration = 1100, className, format = (n: number) => n.toLocaleString('pt-BR') }: {
  value: number
  duration?: number
  className?: string
  format?: (n: number) => string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const reduced = usePrefersReducedMotion()
  const inView = useInView(ref, { threshold: 0.6, once: true })
  const [shown, setShown] = useState(reduced ? value : 0)

  useEffect(() => {
    if (reduced) { setShown(value); return }
    if (!inView) return
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      setShown(Math.round(easeOutCubic(t) * value))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [inView, reduced, value, duration])

  const final = format(value)
  return (
    <span ref={ref} className={className} style={{ display: 'inline-block', minWidth: `${final.length}ch`, fontVariantNumeric: 'tabular-nums' }}>
      <span aria-hidden>{format(shown)}</span>
      <span className="sr-only">{final}</span>
    </span>
  )
}
