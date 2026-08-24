import { describe, it, expect } from 'vitest'
import { isEbookEligible, EBOOK_PROMO_START, EBOOK_PROMO_END } from './promoUtils'

describe('isEbookEligible', () => {
  it('retorna false quando não há data de cadastro', () => {
    expect(isEbookEligible(null)).toBe(false)
    expect(isEbookEligible(undefined)).toBe(false)
  })

  it('retorna false para data inválida', () => {
    expect(isEbookEligible('data-invalida')).toBe(false)
  })

  it('retorna true para cadastro dentro da janela da promoção', () => {
    expect(isEbookEligible('2026-09-15T12:00:00.000Z')).toBe(true)
  })

  it('inclui o início da janela e exclui o fim', () => {
    expect(isEbookEligible(EBOOK_PROMO_START)).toBe(true)
    expect(isEbookEligible(EBOOK_PROMO_END)).toBe(false)
  })

  it('retorna false para cadastro antes ou depois da janela', () => {
    expect(isEbookEligible('2026-08-22T23:59:59.000Z')).toBe(false)
    expect(isEbookEligible('2026-12-01T00:00:00.000Z')).toBe(false)
  })
})
