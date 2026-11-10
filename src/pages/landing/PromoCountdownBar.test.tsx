import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PromoCountdownBar } from './PromoCountdownBar'
import { PLANS, PROMO_LAST_DAY, PROMO_MONTHLY_PRICE } from './landingData'

const ACTIVE = new Date('2026-11-10T12:00:00.000Z')

describe('PromoCountdownBar', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(ACTIVE)
    sessionStorage.clear()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('fala só do plano Básico, com nome e preço vindos de PLANS, sem prometer 3 meses nem "qualquer plano"', () => {
    const { container } = render(<PromoCountdownBar onCta={() => {}} />)
    const basico = PLANS.find(p => p.id === 'basico')!
    expect(PROMO_MONTHLY_PRICE).toBe(basico.price)
    const text = container.textContent ?? ''
    expect(text).toContain(`Plano ${basico.name} por R$ ${basico.price},00/mês`)
    expect(text).toContain(`assine até ${PROMO_LAST_DAY}`)
    expect(text).not.toMatch(/qualquer plano|3 primeiros meses|3 meses|Pro|Enterprise|e-book/i)
    const timer = screen.getByRole('timer')
    expect(timer.getAttribute('aria-live')).toBe('off')
    // 10/11 12:00Z → 23/11 00:00Z = 12 dias e 12 horas
    expect(timer.getAttribute('aria-label')).toContain('12 dias, 12 horas, 0 minutos e 0 segundos')
  })

  it('anda a cada segundo', () => {
    render(<PromoCountdownBar onCta={() => {}} />)
    act(() => { vi.advanceTimersByTime(3000) })
    expect(screen.getByRole('timer').getAttribute('aria-label')).toContain('12 dias, 11 horas, 59 minutos e 57 segundos')
  })

  it('chama o CTA de cadastro', () => {
    const onCta = vi.fn()
    render(<PromoCountdownBar onCta={onCta} />)
    fireEvent.click(screen.getByRole('button', { name: /Garantir a oferta/i }))
    expect(onCta).toHaveBeenCalledTimes(1)
  })

  it('some sozinha quando o prazo chega ao fim, sem 00:00 preso, e para de agendar', () => {
    vi.setSystemTime(new Date('2026-11-22T23:59:58.000Z'))
    const { container } = render(<PromoCountdownBar onCta={() => {}} />)
    expect(screen.getByRole('timer')).toBeTruthy()
    act(() => { vi.advanceTimersByTime(2000) })
    expect(container.firstChild).toBeNull()
    expect(screen.queryByRole('timer')).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
    expect(document.documentElement.style.getPropertyValue('--promo-bar-h')).toBe('0px')
  })

  it('não aparece se a promoção já expirou ao carregar', () => {
    vi.setSystemTime(new Date('2026-12-01T00:00:00.000Z'))
    const { container } = render(<PromoCountdownBar onCta={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('não aparece antes da promoção começar', () => {
    vi.setSystemTime(new Date('2026-08-01T00:00:00.000Z'))
    const { container } = render(<PromoCountdownBar onCta={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('o visitante pode fechar e a escolha vale na sessão', () => {
    const { container, unmount } = render(<PromoCountdownBar onCta={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Fechar aviso/i }))
    expect(container.firstChild).toBeNull()
    unmount()
    const again = render(<PromoCountdownBar onCta={() => {}} />)
    expect(again.container.firstChild).toBeNull()
  })

  it('limpa o intervalo ao desmontar', () => {
    const before = vi.getTimerCount()
    const { unmount } = render(<PromoCountdownBar onCta={() => {}} />)
    expect(vi.getTimerCount()).toBeGreaterThan(before)
    unmount()
    expect(vi.getTimerCount()).toBe(before)
  })
})
