// ============================================================================
// Núcleo puro da sincronização de processos por OAB — sem imports, roda igual
// nas Edge Functions (Deno) e nos testes (Vitest, via src/lib/oabSync.ts).
//
// Fatos verificados nas APIs reais (05/11/2026), que guiam as regras abaixo:
// - DJEN (comunicaapi.pje.jus.br): filtra por numeroOab + ufOab, e `ufOab` é a
//   UF da INSCRIÇÃO (não do tribunal). 34461/PB traz TRT2, TRT3, TRT9, TJPE…;
//   34461/PE traz 0. Quem atua noutro estado com inscrição suplementar (outro
//   número/UF) só aparece consultando essa inscrição. Sem `ufOab` a API devolve
//   advogados de outros estados com o mesmo número — nunca consultar sem UF.
// - DataJud (api-publica.datajud.cnj.jus.br): o índice público NÃO tem `partes`
//   nem advogados (LGPD) — busca por OAB é impossível, só por número do processo.
// ============================================================================

export const UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA',
  'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
] as const

export interface OabInscricao { numero: string; uf: string }

/** Só os dígitos, sem zeros à esquerda (o DJEN trata "034461" e "34461" igual). */
export function normalizeOabNumber(n: unknown): string {
  const d = String(n ?? '').replace(/\D/g, '').replace(/^0+/, '')
  return d
}

/**
 * Inscrição principal + suplementares, normalizadas e sem repetição. Ignora
 * linha sem número ou com UF inválida (consultar o DJEN sem UF válida traria
 * advogados de outros estados).
 */
export function normalizeInscricoes(primary: { numero?: unknown; uf?: unknown } | null | undefined, extras: unknown): OabInscricao[] {
  const out: OabInscricao[] = []
  const seen = new Set<string>()
  const push = (numero: unknown, uf: unknown) => {
    const n = normalizeOabNumber(numero)
    const u = String(uf ?? '').trim().toUpperCase()
    if (!n || !(UFS as readonly string[]).includes(u)) return
    const k = `${n}/${u}`
    if (seen.has(k)) return
    seen.add(k)
    out.push({ numero: n, uf: u })
  }
  if (primary) push(primary.numero, primary.uf)
  if (Array.isArray(extras)) for (const e of extras) if (e && typeof e === 'object') push((e as any).numero, (e as any).uf)
  return out
}

// ── Número CNJ (NNNNNNN-DD.AAAA.J.TR.OOOO) ─────────────────────────────────

export function cnjDigits(n: unknown): string {
  return String(n ?? '').replace(/\D/g, '')
}

export function formatCnj(n: unknown): string {
  const d = cnjDigits(n)
  if (d.length !== 20) return String(n ?? '')
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d[13]}.${d.slice(14, 16)}.${d.slice(16)}`
}

/** Código TR da Justiça Estadual/Eleitoral → UF (Res. CNJ 65/2008, ordem alfabética do nome do estado). */
const TR_UF: Record<string, string> = {
  '01': 'ac', '02': 'al', '03': 'ap', '04': 'am', '05': 'ba', '06': 'ce', '07': 'df', '08': 'es', '09': 'go',
  '10': 'ma', '11': 'mt', '12': 'ms', '13': 'mg', '14': 'pa', '15': 'pb', '16': 'pr', '17': 'pe', '18': 'pi',
  '19': 'rj', '20': 'rn', '21': 'rs', '22': 'ro', '23': 'rr', '24': 'sc', '25': 'se', '26': 'sp', '27': 'to',
}

/**
 * Tribunal pelo número CNJ, na sigla minúscula usada em court_calendar.court e
 * nos índices do DataJud ('tjpb', 'trt13', 'trf5', 'tst'…). null se não der para saber.
 */
export function courtFromCnjNumber(n: unknown): string | null {
  const d = cnjDigits(n)
  if (d.length !== 20) return null
  const j = d[13]
  const tr = d.slice(14, 16)
  const trN = parseInt(tr, 10)
  switch (j) {
    case '1': return 'stf'
    case '3': return 'stj'
    case '4': return trN >= 1 && trN <= 6 ? `trf${trN}` : null
    case '5': return tr === '00' ? 'tst' : (trN >= 1 && trN <= 24 ? `trt${trN}` : null)
    case '6': return TR_UF[tr] ? `tre-${TR_UF[tr]}` : null
    case '7': return 'stm'
    case '8': return TR_UF[tr] ? (tr === '07' ? 'tjdft' : `tj${TR_UF[tr]}`) : null
    case '9': return ({ '13': 'tjmmg', '21': 'tjmrs', '26': 'tjmsp' } as Record<string, string>)[tr] ?? null
    default: return null
  }
}

// ── DJEN → movimento gravado em processes.movimentos ───────────────────────

export interface DjenItem {
  id?: number | string
  hash?: string
  data_disponibilizacao?: string
  datadisponibilizacao?: string
  siglaTribunal?: string
  tipoComunicacao?: string
  tipoDocumento?: string
  nomeOrgao?: string
  nomeClasse?: string
  texto?: string
  numero_processo?: string
  numeroprocessocommascara?: string
  link?: string
  meio?: string
  ativo?: boolean
  data_cancelamento?: string | null
  destinatarios?: { nome?: string; polo?: string }[]
}

export interface PjeMovimento {
  fonte: 'pje'
  idComunicacao: string | number | null
  hash: string | null
  nome: string
  tipoDocumento: string | null
  dataHora: string | null
  tribunal: string | null
  orgao: string | null
  classe: string | null
  /** 'D' = Diário de Justiça Eletrônico Nacional (marco: disponibilização, Lei 11.419/2006, art. 4º). */
  meio: string | null
  teor: string | null
  link: string | null
  cancelada?: boolean
}

export function djenItemToMovimento(item: DjenItem): PjeMovimento {
  const cancelled = item.ativo === false || !!item.data_cancelamento
  return {
    fonte: 'pje',
    idComunicacao: item.id ?? item.hash ?? null,
    hash: item.hash ?? null,
    nome: item.tipoComunicacao || item.tipoDocumento || 'Intimação',
    tipoDocumento: item.tipoDocumento || null,
    dataHora: item.data_disponibilizacao || item.datadisponibilizacao || null,
    tribunal: item.siglaTribunal ? item.siglaTribunal.toLowerCase() : null,
    orgao: item.nomeOrgao || null,
    classe: item.nomeClasse || null,
    meio: item.meio || null,
    teor: item.texto || null,
    link: item.link || null,
    ...(cancelled ? { cancelada: true } : {}),
  }
}

/** Agrupa as comunicações pelo número do processo (só dígitos); ignora as sem número. */
export function groupDjenItemsByProcess(items: DjenItem[]): Map<string, DjenItem[]> {
  const out = new Map<string, DjenItem[]>()
  for (const it of items) {
    const n = cnjDigits(it.numero_processo || it.numeroprocessocommascara)
    if (!n) continue
    const list = out.get(n)
    if (list) list.push(it); else out.set(n, [it])
  }
  return out
}

function partyName(items: DjenItem[], polo: 'A' | 'P'): string | null {
  for (const it of items) {
    const p = (it.destinatarios || []).find(d => (d.polo || '').toUpperCase() === polo && d.nome)
    if (p?.nome) return p.nome.trim()
  }
  return null
}

/**
 * Título de um processo novo vindo do DJEN: classe + partes ("A x P"). O DJEN
 * não diz qual parte o advogado representa — por isso não preenchemos o
 * cliente (antes era o 1º destinatário, que muitas vezes era a parte
 * contrária ou o perito).
 */
export function titleFromDjen(items: DjenItem[]): string {
  const classe = (items.find(i => i.nomeClasse)?.nomeClasse || '').trim().toLocaleUpperCase('pt-BR')
  const a = partyName(items, 'A')
  const p = partyName(items, 'P')
  const partes = a && p ? `${a} x ${p}` : (a || p || '')
  const base = classe || items[0]?.tipoComunicacao || 'Processo'
  return partes ? `${base} — ${partes}` : base
}

// ── Mescla de movimentos (nunca apaga o que já existe) ─────────────────────

export function movimentoKey(m: any): string | null {
  if (!m || typeof m !== 'object') return null
  if (m.fonte === 'pje') {
    if (m.idComunicacao != null) return `pje:${m.idComunicacao}`
    if (m.hash) return `pje:h:${m.hash}`
    return null
  }
  // Andamentos do DataJud: código + data/hora + nome identificam o movimento.
  if (m.codigo != null || m.dataHora) return `dj:${m.codigo ?? ''}|${m.dataHora ?? ''}|${m.nome ?? ''}`
  return null
}

/**
 * Junta movimentos novos aos existentes sem perder nenhum e sem repetir.
 * Antes, o sync do CNJ SUBSTITUÍA o array inteiro e apagava as intimações do
 * DJEN (com o texto integral) gravadas pelo sync do PJe.
 */
export function mergeMovimentos(existing: unknown, incoming: unknown[]): { merged: any[]; added: number } {
  const base: any[] = Array.isArray(existing) ? existing.slice() : []
  const keys = new Set(base.map(movimentoKey).filter(Boolean) as string[])
  let added = 0
  for (const m of incoming) {
    const k = movimentoKey(m)
    if (k && keys.has(k)) continue
    if (k) keys.add(k)
    base.push(m)
    added++
  }
  return { merged: base, added }
}

// ── Escolha do processo existente ──────────────────────────────────────────

export interface ExistingProcess {
  id: string
  client_id?: string | null
  cnj_source?: boolean | null
  created_at?: string | null
}

/**
 * Quando há mais de um processo com o mesmo número no escritório, as
 * intimações vão para o "de verdade": com cliente, cadastrado à mão, o mais antigo.
 */
export function pickExistingProcess<T extends ExistingProcess>(rows: T[]): T | null {
  if (rows.length === 0) return null
  return rows.slice().sort((a, b) => {
    const ca = a.client_id ? 0 : 1, cb = b.client_id ? 0 : 1
    if (ca !== cb) return ca - cb
    const ma = a.cnj_source ? 1 : 0, mb = b.cnj_source ? 1 : 0
    if (ma !== mb) return ma - mb
    return String(a.created_at || '').localeCompare(String(b.created_at || ''))
  })[0]
}

// ── Datas no fuso de Brasília ──────────────────────────────────────────────

/** 'YYYY-MM-DD' no fuso de Brasília (toISOString() é UTC: depois das 21h já seria amanhã). */
export function brDate(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  return parts
}

/** Janela [início, fim] de `days` dias terminando hoje (Brasília). */
export function syncWindow(now: Date, days: number): { inicio: string; fim: string } {
  const fim = brDate(now)
  const ms = Date.parse(`${fim}T12:00:00Z`) - days * 86_400_000
  return { inicio: new Date(ms).toISOString().slice(0, 10), fim }
}

/** Mensagem de limite do plano vinda do trigger enforce_plan_limit. */
export function isPlanLimitError(msg: string | null | undefined): boolean {
  return /limite do plano/i.test(msg || '')
}

// ── DataJud (complemento por número) ───────────────────────────────────────

/** dataAjuizamento vem como '20250121210838' ou ISO; devolve 'YYYY-MM-DD' ou null. */
export function parseDatajudDate(v: unknown): string | null {
  const s = String(v ?? '').trim()
  if (/^\d{8}/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return null
}

export interface DatajudTarget {
  title: string | null
  area: string | null
  court: string | null
  data_protocolo: string | null
  movimentos: unknown
}

/**
 * O que o DataJud acrescenta a um processo: só preenche campo VAZIO (nunca
 * sobrescreve o que o advogado digitou) e soma andamentos sem apagar as
 * intimações do DJEN. `sources` = um documento por grau (G1, G2…).
 */
export function datajudPatch(row: DatajudTarget, sources: any[]): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  if (sources.length === 0) return patch
  const main = sources.find(s => s?.grau === 'G1') || sources[0]
  if (!row.area && main?.classe?.nome) patch.area = main.classe.nome
  if (!row.court && main?.orgaoJulgador?.nome) patch.court = main.orgaoJulgador.nome
  if (!row.data_protocolo) { const d = parseDatajudDate(main?.dataAjuizamento); if (d) patch.data_protocolo = d }
  const incoming = sources.flatMap(s => Array.isArray(s?.movimentos) ? s.movimentos : [])
  const { merged, added } = mergeMovimentos(row.movimentos, incoming)
  if (added > 0) patch.movimentos = merged
  return patch
}
