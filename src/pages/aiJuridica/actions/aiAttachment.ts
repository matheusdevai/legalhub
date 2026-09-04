// Anexo de arquivo (PDF ou imagem) pra IA analisar direto — Gemini aceita
// inlineData nativamente, sem precisar extrair texto no cliente. Efêmero:
// vai só nessa chamada de geração, nunca é salvo em bucket/tabela de documentos.

export interface AiAttachment {
  mime_type: string
  data_base64: string
  filename: string
}

export const AI_ATTACHMENT_ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const
export const AI_ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024

/** Validação client-side (UX). A Edge Function revalida tipo e tamanho no servidor. */
export function validateAiAttachmentFile(file: { type: string; size: number }): string | null {
  if (!AI_ATTACHMENT_ALLOWED_TYPES.includes(file.type as typeof AI_ATTACHMENT_ALLOWED_TYPES[number])) {
    return 'Tipo de arquivo não suportado. Anexe um PDF, JPEG ou PNG.'
  }
  if (file.size > AI_ATTACHMENT_MAX_BYTES) {
    return 'Arquivo muito grande (máx. 15MB).'
  }
  return null
}

export function fileToAiAttachment(file: File): Promise<AiAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'))
    reader.onload = () => {
      const result = reader.result
      const base64 = typeof result === 'string' ? result.split(',')[1] ?? '' : ''
      resolve({ mime_type: file.type, data_base64: base64, filename: file.name })
    }
    reader.readAsDataURL(file)
  })
}
