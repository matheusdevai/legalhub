// Validação do anexo (PDF/imagem) enviado pelo frontend — TS puro, sem
// imports de Deno, pra poder ser importado tanto pelo index.ts (Deno) quanto
// por testes rodados via Vitest (Node). Nunca confia no que o cliente validou:
// tipo e tamanho são revalidados aqui, no servidor.

export const ALLOWED_ATTACHMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024
export const MAX_ATTACHMENT_COUNT = 5
// Teto agregado pro conjunto de anexos de uma análise — mais baixo que
// MAX_ATTACHMENT_COUNT * MAX_ATTACHMENT_BYTES (75MB) de propósito: são
// "poucos documentos de análise" na mesma chamada ao Gemini, não uma
// transferência em lote, e o payload já dobra de tamanho em base64.
export const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024

export interface AttachmentInput {
  mime_type?: string
  data_base64?: string
  filename?: string
}

/**
 * Tamanho real em bytes de uma string base64, sem decodificar/alocar o
 * buffer inteiro (o payload já pode ter ~20MB só de texto base64 pra um
 * arquivo de 15MB — decodificar tudo só pra medir seria desperdício).
 */
export function base64ByteLength(base64: string): number {
  const clean = base64.replace(/\s/g, '')
  if (!clean) return 0
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0
  return Math.floor((clean.length * 3) / 4) - padding
}

/** Retorna a mensagem de erro (pt-BR, segura pra devolver ao cliente) ou null se válido. */
export function validateAttachment(attachment: AttachmentInput | null | undefined): string | null {
  if (!attachment) return null
  if (!attachment.mime_type || !attachment.data_base64) {
    return 'Anexo inválido.'
  }
  if (!ALLOWED_ATTACHMENT_MIME_TYPES.includes(attachment.mime_type as typeof ALLOWED_ATTACHMENT_MIME_TYPES[number])) {
    return 'Tipo de arquivo não suportado. Anexe um PDF, JPEG ou PNG.'
  }
  if (base64ByteLength(attachment.data_base64) > MAX_ATTACHMENT_BYTES) {
    return 'Arquivo muito grande (máx. 15MB).'
  }
  return null
}

/**
 * Valida uma lista de anexos (múltiplos documentos por card, mesma análise) —
 * checa a quantidade e revalida cada item com validateAttachment() acima.
 * Nunca confia no que o cliente já validou.
 */
export function validateAttachments(attachments: (AttachmentInput | null | undefined)[] | null | undefined): string | null {
  if (!attachments || attachments.length === 0) return null
  if (attachments.length > MAX_ATTACHMENT_COUNT) {
    return `Você pode anexar no máximo ${MAX_ATTACHMENT_COUNT} documentos por análise.`
  }
  let totalBytes = 0
  for (const attachment of attachments) {
    const error = validateAttachment(attachment)
    if (error) return error
    totalBytes += base64ByteLength(attachment?.data_base64 || '')
  }
  if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
    return `O total dos documentos anexados excede o limite de ${Math.floor(MAX_TOTAL_ATTACHMENT_BYTES / (1024 * 1024))}MB por análise.`
  }
  return null
}
