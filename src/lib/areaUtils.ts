const DIREITO_PREFIX_RE = /^direito\s+(do\s+|da\s+|de\s+)?/i

function foldAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// area_direito do cliente é texto livre (datalist, não select fechado) — ex: "Direito
// Previdenciário" em vez do valor canônico "Previdenciário". Sem essa normalização,
// TIPOS_ACAO[grupo] não bate com nenhuma chave e o dropdown de tipo de ação fica vazio.
export function normalizeGrupoAcao(rawArea: string | null | undefined, gruposCanonicos: string[]): string {
  const raw = (rawArea || '').trim()
  if (!raw) return raw
  const semPrefixo = raw.toLowerCase().replace(DIREITO_PREFIX_RE, '').trim()
  const alvo = foldAccents(semPrefixo)
  const match = gruposCanonicos.find(g => foldAccents(g.toLowerCase()) === alvo)
  return match || raw
}

export interface ClientAreaInfo {
  area_direito?: string | null
  beneficio_previdenciario?: string | null
}

// Herança de grupo de ação/tipo de ação a partir do cadastro do cliente — usada tanto
// ao concluir uma tarefa ("Protocolar processo") quanto ao criar processo direto pelo
// select de cliente em ProcessFormFields, pra manter o mesmo prefill nos dois fluxos.
export function inferGrupoETipoAcao(
  client: ClientAreaInfo | null | undefined,
  gruposCanonicos: string[],
  tiposPorGrupo: Record<string, string[]>
): { grupoAcao: string; tipoAcao: string; tipoInformadoSemMatch: string } {
  const rawArea = client?.area_direito?.trim() || ''
  const grupoAcao = rawArea ? normalizeGrupoAcao(rawArea, gruposCanonicos) : ''
  const rawTipo = client?.beneficio_previdenciario?.trim() || ''
  const normalize = (v: string) => foldAccents(v.trim().toLowerCase())
  const matchOption = (value: string, options: string[]) => {
    const v = value.trim()
    return (v && options.find(o => normalize(o) === normalize(v))) || ''
  }
  const tipoMatch = grupoAcao && rawTipo ? matchOption(rawTipo, tiposPorGrupo[grupoAcao] || []) : ''
  const tipoAcao = grupoAcao ? (tipoMatch || (tiposPorGrupo[grupoAcao] ? '' : rawTipo)) : ''
  // Se o benefício digitado no cadastro não bateu com nenhuma opção fixa do grupo, não
  // descarta a informação — devolve pra quem chamou decidir o que fazer com ela (ex:
  // anexar como nota), sem forçar uma seleção errada no tipo de ação.
  const tipoInformadoSemMatch = rawTipo && grupoAcao && tiposPorGrupo[grupoAcao] && !tipoMatch ? rawTipo : ''
  return { grupoAcao, tipoAcao, tipoInformadoSemMatch }
}
