import { describe, it, expect } from 'vitest'
import { normalizePhone, phoneMatchConfidence, findMatchingClient } from './phoneMatch'

describe('normalizePhone', () => {
  it('remove tudo que não é dígito', () => {
    expect(normalizePhone('(11) 91234-5678')).toBe('11912345678')
    expect(normalizePhone('+55 11 91234-5678')).toBe('5511912345678')
  })

  it('trata null/undefined/vazio como string vazia', () => {
    expect(normalizePhone(null)).toBe('')
    expect(normalizePhone(undefined)).toBe('')
    expect(normalizePhone('')).toBe('')
  })
})

describe('phoneMatchConfidence', () => {
  it('EXACT: mesmos últimos 11 dígitos (DDD + número), com DDI diferente', () => {
    // "5511912345678" (com DDI 55) vs "11912345678" (sem DDI) — mesmo número
    // real, só um formato tem o DDI a mais. DDD (11) e número são idênticos.
    expect(phoneMatchConfidence('5511912345678', '11912345678')).toBe('exact')
  })

  it('EXACT: mesmo número formatado com máscara', () => {
    expect(phoneMatchConfidence('5511987654321', '(11) 98765-4321')).toBe('exact')
  })

  it('PARTIAL: mesmos últimos 9 dígitos, mas DDD diferente (o caso que motivou o campo de confiança)', () => {
    // Cliente A: (11) 91234-5678 — Cliente B: (21) 91234-5678. Os últimos 9
    // dígitos ("912345678") são iguais, mas são pessoas/números diferentes.
    expect(phoneMatchConfidence('11912345678', '21912345678')).toBe('partial')
  })

  it('PARTIAL: mesmos últimos 9 dígitos, mas um dos números é curto demais pra ter DDD', () => {
    expect(phoneMatchConfidence('912345678', '11912345678')).toBe('partial')
  })

  it('null: últimos 9 dígitos diferentes (não é match nenhum)', () => {
    expect(phoneMatchConfidence('5511912345678', '5511999998888')).toBe(null)
  })

  it('null: número curto demais pra sequer comparar os últimos 9 dígitos', () => {
    expect(phoneMatchConfidence('1234', '5511912341234')).toBe(null)
  })

  it('null: null/undefined em qualquer lado', () => {
    expect(phoneMatchConfidence(null, '5511912345678')).toBe(null)
    expect(phoneMatchConfidence('5511912345678', undefined)).toBe(null)
  })
})

describe('findMatchingClient', () => {
  it('retorna confidence "exact" quando o DDD também bate', () => {
    const clients = [{ id: 'c1', phone: '(11) 91234-5678' }]
    expect(findMatchingClient('5511912345678', clients)).toEqual({ clientId: 'c1', confidence: 'exact' })
  })

  it('retorna confidence "partial" quando só o final bate (DDD diferente do único candidato)', () => {
    const clients = [{ id: 'c1', phone: '(21) 91234-5678' }]
    expect(findMatchingClient('5511912345678', clients)).toEqual({ clientId: 'c1', confidence: 'partial' })
  })

  it('prioriza um match "exact" mesmo que outro cliente de DDD diferente também bata no final (bug relatado no review)', () => {
    const clients = [
      { id: 'client-ddd-21', phone: '(21) 91234-5678' },
      { id: 'client-ddd-11', phone: '(11) 91234-5678' },
    ]
    // Remetente é de fato o (11) — o "partial" contra o (21) NUNCA deve
    // vencer um "exact" existente, mesmo aparecendo primeiro na lista.
    expect(findMatchingClient('5511912345678', clients)).toEqual({ clientId: 'client-ddd-11', confidence: 'exact' })
  })

  it('retorna clientId null e confidence null quando nenhum client bate', () => {
    expect(findMatchingClient('5599900001111', [{ id: 'c1', phone: '(11) 91234-5678' }])).toEqual({ clientId: null, confidence: null })
  })

  it('ignora clients com phone null sem quebrar', () => {
    const clients = [{ id: 'c1', phone: null }, { id: 'c2', phone: '(21) 98888-7777' }]
    expect(findMatchingClient('5521988887777', clients)).toEqual({ clientId: 'c2', confidence: 'exact' })
  })
})
