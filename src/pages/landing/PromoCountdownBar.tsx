import { useEffect, useRef, useState } from 'react'
import { ArrowRight, X } from 'lucide-react'
import { timeLeft, type TimeLeft } from '@/lib/countdown'
import { EBOOK_PROMO_END, isLaunchPromoActive } from '@/lib/promoUtils'
import { PLANS, PROMO_LAST_DAY } from './landingData'

/** Variável CSS (no <html>) com a altura atual da barra — 0px quando ela não está na tela. */
export const PROMO_BAR_HEIGHT_VAR = '--promo-bar-h'
const DISMISS_KEY = 'lh_promo_bar_dismissed'
// A barra fala só do plano Básico: é o único em que o checkout cumpre R$ 149/mês
// hoje (Pro/Enterprise não têm cupom de lançamento). Nome e preço vêm de PLANS.
const BASIC_PLAN = PLANS.find(p => p.id === 'basico') ?? PLANS[0]

function readDismissed(): boolean {
  try { return sessionStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
}

/**
 * Relógio da oferta: reavalia a cada segundo e para de agendar quando a
 * promoção deixa de valer. A data de fim vem de `EBOOK_PROMO_END` (mesma
 * usada pelo checkout) — nunca de outra constante.
 */
export function usePromoCountdown(running = true): { active: boolean; left: TimeLeft } {
  const [now, setNow] = useState(() => Date.now())
  const active = isLaunchPromoActive(new Date(now))

  useEffect(() => {
    if (!active || !running) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active, running])

  return { active, left: timeLeft(EBOOK_PROMO_END, now) }
}

const pad = (n: number) => String(n).padStart(2, '0')

function Unit({ value, label }: { value: number; label: string }) {
  return (
    <span className="flex flex-col items-center leading-none">
      <span className="min-w-[2ch] rounded-md bg-white/[0.07] px-1.5 py-1 text-center text-sm font-bold tabular-nums text-white">{pad(value)}</span>
      <span className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#A7B0C0]">{label}</span>
    </span>
  )
}

function Colon() {
  return <span aria-hidden className="pb-3 text-xs font-bold text-[#A7B0C0]/60">:</span>
}

/**
 * Faixa fixa no topo da landing com a contagem regressiva da promoção de
 * lançamento. Some sozinha ao fim da janela (ou se o visitante fechar).
 * Enquanto visível, publica a própria altura em `--promo-bar-h` no <html> para
 * o header fixo e o início da página se deslocarem sem ficar atrás dela.
 */
export function PromoCountdownBar({ onCta }: { onCta: () => void }) {
  const [dismissed, setDismissed] = useState(readDismissed)
  const { active, left } = usePromoCountdown(!dismissed)
  const ref = useRef<HTMLDivElement>(null)
  const visible = active && !left.expired && !dismissed

  useEffect(() => {
    const root = document.documentElement
    const el = ref.current
    if (!visible || !el) {
      root.style.setProperty(PROMO_BAR_HEIGHT_VAR, '0px')
      return
    }
    const publish = () => root.style.setProperty(PROMO_BAR_HEIGHT_VAR, `${el.offsetHeight}px`)
    publish()
    let ro: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(publish)
      ro.observe(el)
    } else {
      window.addEventListener('resize', publish)
    }
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', publish)
      root.style.setProperty(PROMO_BAR_HEIGHT_VAR, '0px')
    }
  }, [visible])

  if (!visible) return null

  function dismiss() {
    try { sessionStorage.setItem(DISMISS_KEY, '1') } catch { /* sem storage: só some nesta visita */ }
    setDismissed(true)
  }

  const price = `R$ ${BASIC_PLAN.price},00`

  return (
    <div
      ref={ref}
      data-testid="promo-countdown-bar"
      className="fixed top-0 inset-x-0 z-[60] border-b border-white/[0.08] bg-[#0b1220]"
    >
      <div className="mx-auto flex min-h-[56px] max-w-7xl items-center gap-2 px-3 py-1 sm:min-h-[52px] sm:gap-5 sm:px-8 sm:py-1.5">
        <div className="min-w-0 flex-1 sm:flex-none">
          <p className="flex items-center gap-2 whitespace-nowrap text-[11px] font-bold tracking-[0.02em] text-[#1677FF] sm:uppercase sm:tracking-[0.14em]">
            <span className="relative hidden h-1.5 w-1.5 flex-shrink-0 sm:flex" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#1677FF] opacity-75 motion-reduce:hidden" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#1677FF]" />
            </span>
            <span className="sm:hidden">Plano {BASIC_PLAN.name}</span>
            <span className="hidden sm:inline">Oferta de lançamento</span>
          </p>
          <p className="mt-0.5 whitespace-nowrap text-[13px] font-semibold leading-tight tracking-[-0.01em] text-white sm:text-sm">
            <span className="sm:hidden">{price}/mês</span>
            <span className="hidden sm:inline">Plano {BASIC_PLAN.name} por {price}/mês</span>
            <span className="hidden text-[#A7B0C0] lg:inline"> · assine até {PROMO_LAST_DAY}</span>
          </p>
        </div>

        <p className="sr-only">
          Oferta de lançamento: plano {BASIC_PLAN.name} por {price} por mês. Assinando até {PROMO_LAST_DAY}.
        </p>

        <div
          role="timer"
          aria-live="off"
          aria-label={`Tempo restante da oferta: ${left.days} dias, ${left.hours} horas, ${left.minutes} minutos e ${left.seconds} segundos`}
          className="hidden flex-shrink-0 items-start gap-1 sm:ml-auto sm:flex"
        >
          <Unit value={left.days} label="Dias" /><Colon />
          <Unit value={left.hours} label="Horas" /><Colon />
          <Unit value={left.minutes} label="Min" /><Colon />
          <Unit value={left.seconds} label="Seg" />
        </div>

        {/* Mobile: relógio em texto corrido (12d 07h 14m 25s), fonte ≥ 11px; fora da árvore de acessibilidade — o timer acima é o único */}
        <p aria-hidden className="ml-auto flex-shrink-0 whitespace-nowrap text-xs font-bold tabular-nums text-white sm:hidden">
          {left.days}<span className="font-semibold text-[#A7B0C0]">d</span>{' '}
          {pad(left.hours)}<span className="font-semibold text-[#A7B0C0]">h</span>{' '}
          {pad(left.minutes)}<span className="font-semibold text-[#A7B0C0]">m</span>{' '}
          {pad(left.seconds)}<span className="font-semibold text-[#A7B0C0]">s</span>
        </p>

        <button
          onClick={onCta}
          className="hidden h-10 flex-shrink-0 items-center gap-1.5 rounded-full bg-[#0B5CFF] px-4 text-xs font-semibold text-white transition-all hover:brightness-110 active:scale-[0.97] sm:flex"
        >
          Garantir a oferta <ArrowRight className="h-3.5 w-3.5" />
        </button>

        <button
          onClick={onCta}
          aria-label={`Assinar o plano ${BASIC_PLAN.name} por ${price} por mês`}
          className="flex h-10 flex-shrink-0 items-center rounded-full bg-[#0B5CFF] px-3 text-xs font-semibold text-white active:scale-[0.97] sm:hidden"
        >
          Assinar
        </button>

        <button
          onClick={dismiss}
          aria-label="Fechar aviso da oferta"
          className="-mr-2 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[#A7B0C0] transition-colors hover:bg-white/[0.08] hover:text-white sm:-mr-1"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
