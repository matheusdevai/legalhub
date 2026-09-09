import { describe, it, expect } from 'vitest'
import { normalizePhone, phoneNumbersMatch, findMatchingClientId } from './phoneMatch'

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

describe('phoneNumbersMatch', () => {
  it('casa números com/sem DDI 55', () => {
    expect(phoneNumbersMatch('5511912345678', '(11) 91234-5678')).toBe(true)
  })

  it('casa números com/sem o 9º dígito do celular (mesmos últimos 9 dígitos)', () => {
    // "91234-5678" (9 dígitos) é a parte estável comparada — variações no
    // prefixo (DDI/DDD/9º dígito ausente) não devem quebrar o match.
    expect(phoneNumbersMatch('11912345678', '912345678')).toBe(true)
  })

  it('casa número formatado com número puro vindo do webhook (wa_id)', () => {
    expect(phoneNumbersMatch('5511987654321', '(11) 98765-4321')).toBe(true)
  })

  it('não casa números diferentes', () => {
    expect(phoneNumbersMatch('5511912345678', '5511999998888')).toBe(false)
  })

  it('não casa quando algum lado é curto demais (evita falso-positivo em dado incompleto)', () => {
    expect(phoneNumbersMatch('1234', '5511912341234')).toBe(false)
    expect(phoneNumbersMatch('5511912341234', '1234')).toBe(false)
  })

  it('não casa null/undefined', () => {
    expect(phoneNumbersMatch(null, '5511912345678')).toBe(false)
    expect(phoneNumbersMatch('5511912345678', undefined)).toBe(false)
  })
})

describe('findMatchingClientId', () => {
  const clients = [
    { id: 'c1', phone: '(11) 91234-5678' },
    { id: 'c2', phone: '(21) 98888-7777' },
    { id: 'c3', phone: null },
  ]

  it('encontra o client cujo telefone bate com o remetente', () => {
    expect(findMatchingClientId('5511912345678', clients)).toBe('c1')
  })

  it('retorna null quando nenhum client bate', () => {
    expect(findMatchingClientId('5599900001111', clients)).toBe(null)
  })

  it('ignora clients com phone null sem quebrar', () => {
    expect(findMatchingClientId('5521988887777', clients)).toBe('c2')
  })
})
