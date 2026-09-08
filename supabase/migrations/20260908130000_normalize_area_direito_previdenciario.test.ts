import { describe, expect, it } from 'vitest'

// Espelha em JS a regex Postgres da migration ao lado (mantida em sync manualmente
// — não há como rodar a migration real num teste Vitest). Serve pra validar a
// tolerância do padrão antes de aplicar em produção: cobre as 4 variantes vistas
// pelo dono ("Direito Previdenciario", "Direito Previdenciário", "Direito
// Providenciaria", "Previdenciário") e outras plausíveis da mesma família, sem
// capturar áreas de fato diferentes (Previdenciário não deve "engolir" Cível,
// Consumidor etc).
const AREA_PREVIDENCIARIO_RE = /^(direito\s+)?pr[eo]vid[eê]nci[aá]ri[ao]s?$/i

function matches(value: string): boolean {
  return AREA_PREVIDENCIARIO_RE.test(value.trim())
}

describe('regex de normalização de area_direito (migration 20260908130000)', () => {
  it('reconhece as 4 variantes reportadas pelo dono', () => {
    expect(matches('Direito Previdenciario')).toBe(true)
    expect(matches('Direito Previdenciário')).toBe(true)
    expect(matches('Direito Providenciaria')).toBe(true)
    expect(matches('Previdenciário')).toBe(true)
  })

  it('reconhece outras variantes plausíveis da mesma família', () => {
    expect(matches('previdenciario')).toBe(true)
    expect(matches('PREVIDENCIÁRIO')).toBe(true)
    expect(matches('direito previdenciaria')).toBe(true)
    expect(matches('Providenciario')).toBe(true)
    expect(matches('Previdenciários')).toBe(true)
    expect(matches('  Previdenciário  ')).toBe(true)
    expect(matches('Direito   Previdenciário')).toBe(true)
  })

  it('NÃO reconhece outras áreas do direito (não deve "engolir" áreas diferentes)', () => {
    expect(matches('Cível')).toBe(false)
    expect(matches('Criminal')).toBe(false)
    expect(matches('Consumidor')).toBe(false)
    expect(matches('Trabalhista')).toBe(false)
    expect(matches('Tributário')).toBe(false)
    expect(matches('Direito Trabalhista')).toBe(false)
    expect(matches('Direito Previdenciário e Trabalhista')).toBe(false)
  })

  it('NÃO reconhece string vazia ou não relacionada', () => {
    expect(matches('')).toBe(false)
    expect(matches('Outro')).toBe(false)
    expect(matches('Área totalmente inventada')).toBe(false)
  })
})
