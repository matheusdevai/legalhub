export interface IbgeMunicipio {
  id: number
  nome: string
}

const cache: Record<string, string[]> = {}

// ─── Cidades por estado (API pública do IBGE) ──────────────────────────────────
// Usada para popular o campo Cidade a partir do Estado selecionado em Clientes.
// Cacheada em memória por UF para não repetir a chamada de rede a cada troca de estado.
export async function fetchCitiesByState(uf: string): Promise<string[]> {
  if (!uf) return []
  if (cache[uf]) return cache[uf]
  const res = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`)
  if (!res.ok) throw new Error(`Falha ao buscar cidades de ${uf}`)
  const data = (await res.json()) as IbgeMunicipio[]
  const names = data.map(m => m.nome).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  cache[uf] = names
  return names
}
