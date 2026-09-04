import { describe, expect, it } from 'vitest'
import { ALLOWED_ATTACHMENT_MIME_TYPES, MAX_ATTACHMENT_BYTES, base64ByteLength, validateAttachment } from './attachmentValidation'

describe('base64ByteLength', () => {
  it('calcula o tamanho real em bytes de uma string base64 sem padding', () => {
    // "abc" em base64 é "YWJj" (4 chars, sem padding) = 3 bytes
    expect(base64ByteLength('YWJj')).toBe(3)
  })

  it('desconta o padding "=" do tamanho', () => {
    // "ab" em base64 é "YWI=" (1 char de padding) = 2 bytes
    expect(base64ByteLength('YWI=')).toBe(2)
  })

  it('desconta o padding "==" do tamanho', () => {
    // "a" em base64 é "YQ==" (2 chars de padding) = 1 byte
    expect(base64ByteLength('YQ==')).toBe(1)
  })

  it('retorna 0 para string vazia', () => {
    expect(base64ByteLength('')).toBe(0)
  })
})

describe('validateAttachment', () => {
  it('retorna null quando não há anexo', () => {
    expect(validateAttachment(null)).toBeNull()
    expect(validateAttachment(undefined)).toBeNull()
  })

  it('retorna null quando o anexo é válido', () => {
    expect(validateAttachment({ mime_type: 'application/pdf', data_base64: 'YWJj', filename: 'doc.pdf' })).toBeNull()
  })

  it.each(ALLOWED_ATTACHMENT_MIME_TYPES)('aceita o mimetype permitido %s', (mimeType) => {
    expect(validateAttachment({ mime_type: mimeType, data_base64: 'YWJj', filename: 'f' })).toBeNull()
  })

  it('rejeita mimetype não permitido', () => {
    expect(validateAttachment({ mime_type: 'application/msword', data_base64: 'YWJj', filename: 'f.doc' }))
      .toBe('Tipo de arquivo não suportado. Anexe um PDF, JPEG ou PNG.')
  })

  it('rejeita quando faltam mime_type ou data_base64', () => {
    expect(validateAttachment({ mime_type: 'application/pdf' })).toBe('Anexo inválido.')
    expect(validateAttachment({ data_base64: 'YWJj' })).toBe('Anexo inválido.')
  })

  it('rejeita arquivo acima de 15MB (calculado a partir do base64, nunca confiando no cliente)', () => {
    // string base64 cujo tamanho decodificado passa de MAX_ATTACHMENT_BYTES
    const oversizedBase64 = 'A'.repeat(Math.ceil((MAX_ATTACHMENT_BYTES + 1024) * 4 / 3))
    expect(validateAttachment({ mime_type: 'image/png', data_base64: oversizedBase64, filename: 'f.png' }))
      .toBe('Arquivo muito grande (máx. 15MB).')
  })

  it('aceita arquivo exatamente no limite', () => {
    const exactBase64 = 'A'.repeat(Math.floor(MAX_ATTACHMENT_BYTES * 4 / 3 / 4) * 4)
    expect(base64ByteLength(exactBase64)).toBeLessThanOrEqual(MAX_ATTACHMENT_BYTES)
    expect(validateAttachment({ mime_type: 'image/jpeg', data_base64: exactBase64, filename: 'f.jpg' })).toBeNull()
  })
})
