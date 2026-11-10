import { describe, expect, it } from 'vitest'
import { LAUNCH_BANNER_BONUS, LAUNCH_BANNER_HEADLINE, LAUNCH_FAQ, LAUNCH_PLAN_ID, PLANS, PROMO_LAST_DAY, PROMO_MONTHLY_PRICE, TOUR, recommendedPlanFor, tourVideo } from './landingData'

describe('recommendedPlanFor', () => {
  it('segue os limites de processos ativos de cada plano', () => {
    expect(recommendedPlanFor(50)).toBe('basico')
    expect(recommendedPlanFor(300)).toBe('basico')
    expect(recommendedPlanFor(301)).toBe('pro')
    expect(recommendedPlanFor(1500)).toBe('pro')
    expect(recommendedPlanFor(1501)).toBe('enterprise')
  })

  it('sempre aponta para um plano que existe na página', () => {
    for (const n of [0, 300, 1000, 5000]) {
      expect(PLANS.some(p => p.id === recommendedPlanFor(n))).toBe(true)
    }
  })
})

describe('TOUR', () => {
  it('cada aba aponta para um vídeo e pôster em /demo com o próprio id', () => {
    for (const item of TOUR) {
      expect(tourVideo(item.id)).toEqual({ src: `/demo/${item.id}.mp4`, poster: `/demo/${item.id}.jpg` })
    }
    expect(new Set(TOUR.map(t => t.id)).size).toBe(TOUR.length)
  })

  it('vídeo (mp4 + webm), legenda e pôster de cada aba existem em public/demo', () => {
    // import.meta.glob só lista os arquivos (não carrega nada)
    const files = Object.keys(import.meta.glob('../../../public/demo/*.{mp4,webm,jpg,vtt}', { query: '?url' }))
      .map(f => f.split('/').pop())
    for (const item of TOUR) {
      for (const ext of ['mp4', 'webm', 'jpg', 'vtt']) {
        expect(files, `${item.id}.${ext}`).toContain(`${item.id}.${ext}`)
      }
    }
  })
})

describe('oferta de lançamento — só plano Básico', () => {
  it('a oferta é do Básico, que já custa o valor promocional', () => {
    expect(LAUNCH_PLAN_ID).toBe('basico')
    expect(PLANS.find(p => p.id === LAUNCH_PLAN_ID)?.price).toBe(PROMO_MONTHLY_PRICE)
  })

  it('faixa da seção Planos cita só o Básico, o preço e a data, sem prometer outros planos nem 3 meses', () => {
    expect(LAUNCH_BANNER_HEADLINE).toBe(`Oferta de lançamento: assine o plano Básico até ${PROMO_LAST_DAY} por R$ ${PROMO_MONTHLY_PRICE},00/mês`)
    for (const text of [LAUNCH_BANNER_HEADLINE, LAUNCH_BANNER_BONUS]) {
      expect(text).not.toMatch(/qualquer plano|independentemente do plano|3 primeiros meses|Pro\b|Enterprise/i)
    }
  })

  it('FAQ da promoção não promete desconto fora do Básico', () => {
    expect(LAUNCH_FAQ.q).toMatch(/promoção de lançamento/i)
    expect(LAUNCH_FAQ.a).toContain('plano Básico')
    expect(LAUNCH_FAQ.a).toContain(`R$ ${PROMO_MONTHLY_PRICE},00/mês`)
    expect(LAUNCH_FAQ.a).toContain(PROMO_LAST_DAY)
    expect(LAUNCH_FAQ.a).toContain('sem desconto de lançamento')
    expect(LAUNCH_FAQ.a).not.toMatch(/qualquer plano|independentemente do plano|3 primeiros meses|nos 3 meses/i)
  })

  it('os preços reais dos planos seguem intocados', () => {
    expect(PLANS.map(p => [p.id, p.price])).toEqual([['basico', 149], ['pro', 349], ['enterprise', 799]])
  })
})
