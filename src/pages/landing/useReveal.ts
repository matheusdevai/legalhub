import { useEffect, useRef, useState, type RefObject } from 'react'

// Hooks de movimento da landing. Regra geral: todo efeito respeita
// prefers-reduced-motion e só trabalha quando o elemento está na tela.

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)'

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.(REDUCED_QUERY).matches
}

/** Acompanha a preferência "reduzir movimento" do sistema (muda ao vivo). */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion)
  useEffect(() => {
    const mq = window.matchMedia?.(REDUCED_QUERY)
    if (!mq) return
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])
  return reduced
}

/** Aparelho com mouse de verdade (hover) — no toque, hover vira "visível na tela". */
export function canHover(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches
}

interface InViewOptions {
  threshold?: number
  rootMargin?: string
  /** Para de observar depois da primeira vez (revelações). */
  once?: boolean
}

/** `true` enquanto o elemento está na viewport (ou para sempre após a 1ª vez, com `once`). */
export function useInView<T extends Element>(ref: RefObject<T>, { threshold = 0, rootMargin = '0px', once = false }: InViewOptions = {}): boolean {
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') { setInView(true); return }
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true)
        if (once) obs.disconnect()
      } else if (!once) setInView(false)
    }, { threshold, rootMargin })
    obs.observe(el)
    return () => obs.disconnect()
  }, [ref, threshold, rootMargin, once])
  return inView
}

/**
 * Revelação de entrada: devolve o `ref` e se já pode aparecer. Com "reduzir
 * movimento" aparece de imediato. Dispara um pouco antes de entrar (margem
 * inferior negativa = só quando ~8% já está na tela), uma vez só.
 */
export function useReveal<T extends Element = HTMLDivElement>(threshold = 0.12) {
  const ref = useRef<T>(null)
  const reduced = usePrefersReducedMotion()
  const inView = useInView(ref, { threshold, rootMargin: '0px 0px -8% 0px', once: true })
  return { ref, visible: reduced || inView, reduced }
}

/** Duração da entrada (ms). */
export const REVEAL_MS = 560

/** Estilo de entrada (fade + 14px) com atraso escalonado. Só transform/opacity: CLS zero. */
export function revealStyle(visible: boolean, delay = 0, reduced = false): React.CSSProperties {
  if (reduced) return {}
  // Visível: não fixa `transform` — o elemento volta ao transform das próprias
  // classes (ex.: lg:-translate-y-2 do plano recomendado), com transição.
  return {
    opacity: visible ? 1 : 0,
    transform: visible ? undefined : 'translate3d(0, 14px, 0)',
    transition: `opacity ${REVEAL_MS - 40}ms cubic-bezier(0.33, 1, 0.68, 1), transform ${REVEAL_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
    transitionDelay: `${delay}ms`,
    willChange: visible ? undefined : 'opacity, transform',
  }
}

/** Passo do escalonamento (stagger) entre itens irmãos de uma revelação. */
export const STAGGER_MS = 70

/** Pausa quando a aba fica oculta — usado pelos loops (canvas, contadores). */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden')
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])
  return visible
}
