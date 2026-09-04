// Validação do anexo (PDF/imagem) enviado pelo frontend — TS puro, sem
// imports de Deno, pra poder ser importado tanto pelo index.ts (Deno) quanto
// por testes rodados via Vitest (Node). Nunca confia no que o cliente validou:
// tipo e tamanho são revalidados aqui, no servidor.

export const ALLOWED_ATTACHMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024

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
