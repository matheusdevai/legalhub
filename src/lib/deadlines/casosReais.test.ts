import { describe, expect, it } from 'vitest'
import { calculateDeadline } from './engine'
import { CASOS_REAIS, MINIMO_CASOS_FASE_1, MINIMO_CASOS_PENAL } from './casosReais'

describe('bateria de casos reais (conferidos por advogado)', () => {
  for (const c of CASOS_REAIS) {
    it(`${c.id} — ${c.descricao}`, () => {
      const r = calculateDeadline({ ...c.input, calendar: [...(c.input.calendar ?? []), ...(c.calendar ?? [])] })
      expect(r.fatalDate, c.justificativa).toBe(c.fatalEsperada)
    })
  }

  const civis = CASOS_REAIS.filter(c => c.input.regime !== 'penal').length
  const penais = CASOS_REAIS.length - civis
  if (civis < MINIMO_CASOS_FASE_1) {
    it.todo(`Fase 1 só libera com ${MINIMO_CASOS_FASE_1} casos reais — hoje: ${civis}`)
  }
  if (penais < MINIMO_CASOS_PENAL) {
    it.todo(`Regime penal só sai de "em validação" com ${MINIMO_CASOS_PENAL} casos penais reais — hoje: ${penais}`)
  }
})
