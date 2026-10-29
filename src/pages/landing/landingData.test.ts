import { describe, expect, it } from 'vitest'
import { PLANS, TOUR, recommendedPlanFor, tourVideo } from './landingData'

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
