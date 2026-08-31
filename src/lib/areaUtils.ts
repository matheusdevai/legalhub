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
