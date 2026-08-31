import { describe, it, expect } from 'vitest'
import { normalizeGrupoAcao } from './areaUtils'

const GRUPOS_ACAO = ['Cível', 'Criminal', 'Trabalhista', 'Tributário', 'Administrativo', 'Família', 'Previdenciário', 'Empresarial', 'Imobiliário', 'Outro']

describe('normalizeGrupoAcao', () => {
  it('passa direto quando já é um valor canônico exato', () => {
    expect(normalizeGrupoAcao('Previdenciário', GRUPOS_ACAO)).toBe('Previdenciário')
    expect(normalizeGrupoAcao('Cível', GRUPOS_ACAO)).toBe('Cível')
  })

  it('remove o prefixo "Direito " e resolve para o valor canônico', () => {
    expect(normalizeGrupoAcao('Direito Previdenciário', GRUPOS_ACAO)).toBe('Previdenciário')
    expect(normalizeGrupoAcao('Direito Trabalhista', GRUPOS_ACAO)).toBe('Trabalhista')
    expect(normalizeGrupoAcao('Direito Criminal', GRUPOS_ACAO)).toBe('Criminal')
  })

  it('remove prefixos "Direito do/da/de " e resolve para o valor canônico', () => {
    expect(normalizeGrupoAcao('Direito de Família', GRUPOS_ACAO)).toBe('Família')
    expect(normalizeGrupoAcao('Direito do Trabalho', GRUPOS_ACAO)).not.toBe('')
  })

  it('é case-insensitive tanto no prefixo quanto no valor', () => {
    expect(normalizeGrupoAcao('direito previdenciário', GRUPOS_ACAO)).toBe('Previdenciário')
    expect(normalizeGrupoAcao('DIREITO TRIBUTÁRIO', GRUPOS_ACAO)).toBe('Tributário')
    expect(normalizeGrupoAcao('previdenciário', GRUPOS_ACAO)).toBe('Previdenciário')
  })

  it('mantém o valor original quando não encontra correspondência', () => {
    expect(normalizeGrupoAcao('Consumidor', GRUPOS_ACAO)).toBe('Consumidor')
    expect(normalizeGrupoAcao('Direito do Trabalho', GRUPOS_ACAO)).toBe('Direito do Trabalho')
    expect(normalizeGrupoAcao('Área totalmente inventada', GRUPOS_ACAO)).toBe('Área totalmente inventada')
  })

  it('lida com null/undefined/vazio sem quebrar', () => {
    expect(normalizeGrupoAcao(null, GRUPOS_ACAO)).toBe('')
    expect(normalizeGrupoAcao(undefined, GRUPOS_ACAO)).toBe('')
    expect(normalizeGrupoAcao('   ', GRUPOS_ACAO)).toBe('')
  })
})
