import type { Client, Profile, Tenant } from '@/types'
import { formatCPFCNPJ, formatDate, formatPhone } from '@/lib/utils'

export interface TemplateMergeContext {
  client: Pick<Client, 'name' | 'cpf_cnpj' | 'email' | 'phone' | 'celular' | 'address' | 'cidade' | 'state' | 'bairro' | 'cep' | 'area_direito' | 'nationality' | 'marital_status' | 'profession' | 'rg'>
  tenant?: Pick<Tenant, 'name'> | null
  profile?: Pick<Profile, 'name' | 'oab_number'> | null
  processNumber?: string | null
}

function fullAddress(client: TemplateMergeContext['client']): string {
  const parts = [client.address, client.bairro, client.cidade, client.state].filter(Boolean)
  return parts.join(', ')
}

// Mesmos códigos do <select> de Estado civil em ClientsPage.tsx — manter em sync.
const MARITAL_STATUS_LABELS: Record<string, string> = {
  solteiro: 'Solteiro(a)',
  casado: 'Casado(a)',
  divorciado: 'Divorciado(a)',
  viuvo: 'Viúvo(a)',
  uniao_estavel: 'União Estável',
}

/** Placeholders resolvidos por mergeTemplateVariables(). Mantido em sync com o texto de ajuda do Textarea em DocumentsPage. */
export const TEMPLATE_PLACEHOLDERS = [
  '[NOME_CLIENTE]', '[CPF_CNPJ]', '[ENDERECO]', '[CIDADE]', '[EMAIL]', '[TELEFONE]',
  '[AREA_DIREITO]', '[DATA]', '[NOME_ESCRITORIO]', '[NOME_ADVOGADO]', '[OAB]',
  '[NUMERO_PROCESSO]', '[NACIONALIDADE]', '[ESTADO_CIVIL]', '[PROFISSAO]', '[RG]',
] as const

export function mergeTemplateVariables(content: string, ctx: TemplateMergeContext): string {
  const { client, tenant, profile, processNumber } = ctx
  const phone = client.phone || client.celular
  const replacements: Record<string, string> = {
    '[NOME_CLIENTE]': client.name || '',
    // formatCPFCNPJ/formatPhone retornam '—' para valor ausente (pensado pra UI) — aqui queremos vazio
    '[CPF_CNPJ]': client.cpf_cnpj ? formatCPFCNPJ(client.cpf_cnpj) : '',
    '[ENDERECO]': fullAddress(client),
    '[CIDADE]': client.cidade || '',
    '[EMAIL]': client.email || '',
    '[TELEFONE]': phone ? formatPhone(phone) : '',
    '[AREA_DIREITO]': client.area_direito || '',
    '[DATA]': formatDate(new Date()),
    '[NOME_ESCRITORIO]': tenant?.name || '',
    '[NOME_ADVOGADO]': profile?.name || '',
    '[OAB]': profile?.oab_number || '',
    '[NACIONALIDADE]': client.nationality || '',
    '[ESTADO_CIVIL]': (client.marital_status && MARITAL_STATUS_LABELS[client.marital_status]) || '',
    '[PROFISSAO]': client.profession || '',
    '[RG]': client.rg || '',
  }
  // Diferente dos demais: sem processo vinculado ainda (ex. Procuração gerada no
  // cadastro do cliente, antes de existir processo), o placeholder fica visível de
  // propósito no texto impresso, como aviso pra preencher manualmente depois — não
  // vira string vazia como os outros.
  if (processNumber) replacements['[NUMERO_PROCESSO]'] = processNumber

  let merged = content
  for (const [placeholder, value] of Object.entries(replacements)) {
    merged = merged.split(placeholder).join(value)
  }
  return merged
}
