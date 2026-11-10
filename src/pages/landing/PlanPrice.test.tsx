import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PlanPrice } from './PlanPrice'
import { PLANS, PROMO_LAST_DAY, PROMO_MONTHLY_PRICE } from './landingData'

const byId = (id: string) => PLANS.find(p => p.id === id)!

describe('PlanPrice (cartões de plano)', () => {
  for (const id of ['pro', 'enterprise']) {
    it(`${id}: mostra o preço normal, sem preço riscado, selo OFF, R$ 149 promocional nem "3 primeiros meses" (mesmo com a promoção ativa)`, () => {
      const plan = byId(id)
      const { container } = render(<PlanPrice plan={plan} promoActive />)
      const text = container.textContent ?? ''
      expect(text).toContain(String(plan.price))
      expect(text).not.toContain(String(PROMO_MONTHLY_PRICE))
      expect(text).not.toMatch(/OFF|3 primeiros meses|promocional|lançamento/i)
      expect(container.querySelector('.line-through')).toBeNull()
    })
  }

  it('básico: mantém R$ 149 e a linha da oferta de lançamento enquanto a promoção está ativa', () => {
    const { container } = render(<PlanPrice plan={byId('basico')} promoActive />)
    const text = container.textContent ?? ''
    expect(text).toContain('149')
    expect(text).toContain(`Oferta de lançamento até ${PROMO_LAST_DAY}`)
    expect(text).not.toMatch(/OFF|3 primeiros meses|promocional/i)
    expect(container.querySelector('.line-through')).toBeNull()
  })

  it('com a promoção encerrada, nenhum plano mostra linha de oferta', () => {
    for (const plan of PLANS) {
      const { container, unmount } = render(<PlanPrice plan={plan} promoActive={false} />)
      expect(container.textContent).toBe(`R$${plan.price}/mês`)
      unmount()
    }
  })
})
