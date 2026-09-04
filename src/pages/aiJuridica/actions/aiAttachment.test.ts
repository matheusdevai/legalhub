import { describe, expect, it } from 'vitest'
import { AI_ATTACHMENT_MAX_BYTES, fileToAiAttachment, validateAiAttachmentFile } from './aiAttachment'

describe('validateAiAttachmentFile', () => {
  it.each(['application/pdf', 'image/jpeg', 'image/png'])('aceita o tipo permitido %s dentro do limite de tamanho', (type) => {
    expect(validateAiAttachmentFile({ type, size: 1024 })).toBeNull()
  })

  it('rejeita tipo não suportado', () => {
    expect(validateAiAttachmentFile({ type: 'application/msword', size: 1024 }))
      .toBe('Tipo de arquivo não suportado. Anexe um PDF, JPEG ou PNG.')
  })

  it('rejeita arquivo maior que 15MB', () => {
    expect(validateAiAttachmentFile({ type: 'application/pdf', size: AI_ATTACHMENT_MAX_BYTES + 1 }))
      .toBe('Arquivo muito grande (máx. 15MB).')
  })

  it('aceita arquivo exatamente no limite de 15MB', () => {
    expect(validateAiAttachmentFile({ type: 'application/pdf', size: AI_ATTACHMENT_MAX_BYTES })).toBeNull()
  })
})

describe('fileToAiAttachment', () => {
  it('converte um File para base64 e preserva mime_type/filename', async () => {
    const file = new File(['conteúdo de teste'], 'peticao.pdf', { type: 'application/pdf' })
    const attachment = await fileToAiAttachment(file)

    expect(attachment.filename).toBe('peticao.pdf')
    expect(attachment.mime_type).toBe('application/pdf')
    expect(attachment.data_base64.length).toBeGreaterThan(0)
    // data_base64 não deve carregar o prefixo "data:...;base64," do FileReader
    expect(attachment.data_base64.startsWith('data:')).toBe(false)
  })
})
