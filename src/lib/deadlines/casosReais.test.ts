import { describe, expect, it } from 'vitest'
import { calculateDeadline } from './engine'
import { CASOS_REAIS, MINIMO_CASOS_FASE_1 } from './casosReais'

describe('bateria de casos reais (conferidos por advogado)', () => {
  for (const c of CASOS_REAIS) {
    it(`${c.id} — ${c.descricao}`, () => {
      const r = calculateDeadline({ ...c.input, calendar: [...(c.input.calendar ?? []), ...(c.calendar ?? [])] })
      expect(r.fatalDate, c.justificativa).toBe(c.fatalEsperada)
    })
  }

  if (CASOS_REAIS.length < MINIMO_CASOS_FASE_1) {
    it.todo(`Fase 1 só libera com ${MINIMO_CASOS_FASE_1} casos reais — hoje: ${CASOS_REAIS.length}`)
  }
})
