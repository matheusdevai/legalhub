export interface ClientImportPreviewRow {
  name: string
  type: 'pf' | 'pj'
  cpf_cnpj: string
  phone: string
  email: string
  cidade: string
  area_direito: string
  status: 'active' | 'inactive' | 'prospect'
  duplicate: boolean
}

// ─── Importação de contatos por CSV ─────────────────────────────────────────
// Monta a prévia de importação, marcando como duplicado tanto quem já existe
// no sistema (por CPF/CNPJ) quanto linhas repetidas dentro do próprio arquivo
// importado — ex: um CSV exportado duas vezes e concatenado por engano teria,
// sem essa checagem extra, as duas cópias importadas como clientes distintos.
export function buildClientImportPreview(
  rows: Record<string, string>[],
  existingClients: { cpf_cnpj?: string | null }[]
): ClientImportPreviewRow[] {
  const existingCpfs = new Set(
    existingClients.map(c => (c.cpf_cnpj || '').replace(/\D/g, '')).filter(Boolean)
  )
  const seenInBatch = new Set<string>()
  return rows.map(row => {
    const cpfDigits = (row.cpf_cnpj || row['cpf/cnpj'] || '').replace(/\D/g, '')
    const duplicate = cpfDigits.length > 0 && (existingCpfs.has(cpfDigits) || seenInBatch.has(cpfDigits))
    if (cpfDigits.length > 0) seenInBatch.add(cpfDigits)
    return {
      name: row.nome || row.name || '',
      type: (row.tipo || row.type || 'pf').toLowerCase() === 'pj' ? 'pj' : 'pf',
      cpf_cnpj: row.cpf_cnpj || row['cpf/cnpj'] || '',
      phone: row.telefone || row.phone || row.celular || '',
      email: row.email || '',
      cidade: row.cidade || '',
      area_direito: row.area_direito || row['área do direito'] || '',
      status: ['active', 'inactive', 'prospect'].includes((row.status || '').toLowerCase())
        ? (row.status.toLowerCase() as 'active' | 'inactive' | 'prospect')
        : 'prospect',
      duplicate,
    }
  })
}
