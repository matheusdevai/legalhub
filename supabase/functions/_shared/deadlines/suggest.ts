// Sugestão do prazo a partir do texto da intimação (especificação, fase 5).
// Só por regras, sem IA: acha o ato (contestação, réplica, embargos…) e o prazo
// escrito no texto ("no prazo de 15 (quinze) dias"). É SEMPRE sugestão — a
// tela mostra o trecho que justificou cada campo e quem cadastra confere.
// Na dúvida, a confiança cai e a tela oferece pedir uma segunda leitura à IA.

import type { Regime, Unit } from './engine.ts'

export type Confidence = 'alta' | 'media' | 'baixa'

export interface TextSuggestion {
  actType: string | null
  amount: number | null
  unit: Unit | null
  confidence: Confidence
  /** Trechos do texto que justificam a sugestão. */
  evidence: string[]
  /** Pontos que a pessoa precisa conferir (prazo em horas, prazo em dobro, divergência…). */
  notes: string[]
}

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

const UNITS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19,
}
const TENS: Record<string, number> = { vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, noventa: 90 }

/** "quinze" → 15, "trinta e cinco" → 35. Só o que aparece em prazo processual. */
export function wordsToNumber(words: string): number | null {
  const w = fold(words).trim().replace(/\s+/g, ' ')
  if (/^\d+$/.test(w)) return Number(w)
  if (w in UNITS) return UNITS[w]
  if (w in TENS) return TENS[w]
  const m = w.match(/^(\w+) e (\w+)$/)
  if (m && m[1] in TENS && m[2] in UNITS && UNITS[m[2]] < 10) return TENS[m[1]] + UNITS[m[2]]
  return null
}

interface ActRule { re: RegExp; act: string; days?: number | ((r?: Regime) => number | undefined); basis?: string }

// Ordem importa: o mais específico primeiro ("contrarrazões" antes de "razões",
// "embargos de declaração" antes de "embargos").
const ACTS: ActRule[] = [
  { re: /embargos de declaracao|embargos declaratorios/, act: 'Embargos de declaração', days: 5, basis: 'CPC, art. 1.023; CLT, art. 897-A; Lei 9.099, art. 49' },
  { re: /contrarraz(oes|oar)|contra-raz(oes|oar)/, act: 'Contrarrazões', days: r => (r === 'trabalhista' ? 8 : r === 'juizado' ? 10 : 15), basis: 'CPC, art. 1.003, § 5º; CLT, art. 900; Lei 9.099, art. 42, § 2º' },
  { re: /recurso inominado/, act: 'Recurso inominado', days: 10, basis: 'Lei 9.099/1995, art. 42' },
  { re: /recurso ordinario/, act: 'Recurso ordinário', days: r => (r === 'trabalhista' ? 8 : 15), basis: 'CLT, art. 895; CPC, art. 1.003, § 5º' },
  { re: /recurso de revista/, act: 'Recurso de revista', days: 8, basis: 'CLT, art. 896' },
  { re: /agravo de instrumento/, act: 'Agravo de instrumento', days: r => (r === 'trabalhista' ? 8 : 15), basis: 'CPC, art. 1.003, § 5º; CLT, art. 897' },
  { re: /agravo interno/, act: 'Agravo interno', days: 15, basis: 'CPC, art. 1.070' },
  { re: /apelacao|apelar/, act: 'Apelação', days: 15, basis: 'CPC, art. 1.003, § 5º' },
  { re: /replica|impugnacao a contestacao|sobre a contestacao/, act: 'Réplica', days: 15, basis: 'CPC, arts. 350 e 351' },
  { re: /contestacao|contestar|apresentar defesa/, act: 'Contestação', days: 15, basis: 'CPC, art. 335' },
  { re: /emenda(r)? (a|da) (peticao )?inicial|emendar a inicial/, act: 'Emenda à inicial', days: 15, basis: 'CPC, art. 321' },
  { re: /pagamento voluntario|efetuar o pagamento|pagar o debito|cumprimento de sentenca/, act: 'Pagamento (cumprimento de sentença)', days: 15, basis: 'CPC, art. 523' },
  { re: /impugnacao ao cumprimento|impugnar o cumprimento/, act: 'Impugnação ao cumprimento de sentença', days: 15, basis: 'CPC, art. 525' },
  { re: /quesitos|assistente tecnico/, act: 'Quesitos e assistente técnico', days: 15, basis: 'CPC, art. 465, § 1º' },
  { re: /laudo pericial|sobre o laudo/, act: 'Manifestação sobre o laudo', days: 15, basis: 'CPC, art. 477, § 1º' },
  { re: /especifica(r|cao de) provas/, act: 'Especificação de provas' },
  { re: /alegacoes finais|memoriais/, act: 'Alegações finais / memoriais' },
  { re: /manifest(ar|e-se|acao)|dizer sobre|falar sobre/, act: 'Manifestação', days: 5, basis: 'CPC, art. 218, § 3º (sem prazo fixado: 5 dias)' },
]

// "prazo de 15 (quinze) dias", "no prazo de quinze dias", "em 5 dias úteis", "prazo comum de 10 dias corridos"
const PERIOD = /(?:prazo(?: comum| sucessivo| legal)? de|no prazo de|em|dentro de)\s+(\d{1,3}|[a-z]+(?: e [a-z]+)?)\s*(?:\(([a-z ]+)\))?\s*(dias?|horas?|meses|mes|anos?)(\s+(?:uteis|corridos))?/g

function snippet(text: string, index: number, len: number) {
  const start = Math.max(0, index - 40), end = Math.min(text.length, index + len + 40)
  return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${end < text.length ? '…' : ''}`
}

export function suggestFromText(text: string | null | undefined, opts: { regime?: Regime } = {}): TextSuggestion {
  const out: TextSuggestion = { actType: null, amount: null, unit: null, confidence: 'baixa', evidence: [], notes: [] }
  if (!text?.trim()) { out.notes.push('Sem texto da intimação para ler.'); return out }
  // fold() mantém o comprimento (só tira acentos e baixa a caixa), então os índices valem no texto original.
  const raw = text
  const t = fold(raw)

  // 1) Ato
  let rule: ActRule | undefined
  for (const r of ACTS) {
    const m = r.re.exec(t)
    if (m) { rule = r; out.actType = r.act; out.evidence.push(snippet(raw, m.index, m[0].length)); break }
  }

  // 2) Prazo escrito no texto
  const periods: { amount: number; unit: Unit | 'horas'; at: number; len: number }[] = []
  for (const m of t.matchAll(PERIOD)) {
    const n = wordsToNumber(m[1]) ?? (m[2] ? wordsToNumber(m[2]) : null)
    if (!n || n > 365) continue
    const u = m[3].startsWith('hora') ? 'horas' : m[3].startsWith('mes') ? 'meses' : m[3].startsWith('ano') ? 'anos'
      : m[4]?.includes('corridos') ? 'dias_corridos' : 'dias_uteis'
    periods.push({ amount: n, unit: u, at: m.index ?? 0, len: m[0].length })
  }
  const distinct = [...new Map(periods.map(p => [`${p.amount}|${p.unit}`, p])).values()]

  if (distinct.some(p => p.unit === 'horas')) {
    out.notes.push('O texto fala em prazo em horas, que o cálculo ainda não faz. Calcule à mão e ajuste a data.')
  }
  const dayPeriods = distinct.filter(p => p.unit !== 'horas')
  if (dayPeriods.length === 1) {
    const p = dayPeriods[0]
    out.amount = p.amount
    out.unit = p.unit as Unit
    out.evidence.push(snippet(raw, p.at, p.len))
  } else if (dayPeriods.length > 1) {
    out.notes.push(`O texto cita mais de um prazo (${dayPeriods.map(p => `${p.amount} ${p.unit === 'dias_corridos' ? 'dias corridos' : p.unit === 'meses' ? 'meses' : p.unit === 'anos' ? 'anos' : 'dias'}`).join(', ')}). Confira qual vale para o seu cliente.`)
  }

  // 3) Prazo legal do ato, quando o texto não traz um
  const legal = typeof rule?.days === 'function' ? rule.days(opts.regime) : rule?.days
  if (out.amount === null && legal && dayPeriods.length === 0) {
    out.amount = legal
    out.notes.push(`Prazo não escrito na intimação: sugerido o prazo legal (${rule!.basis}).`)
  } else if (out.amount !== null && legal && out.amount !== legal && out.unit === 'dias_uteis') {
    out.notes.push(`O prazo escrito (${out.amount} dias) é diferente do prazo legal de ${out.actType?.toLowerCase()} (${legal} dias, ${rule!.basis}). Vale o que o juiz fixou, se for o caso — confira.`)
  }

  // 4) Pontos de atenção
  if (/em dobro|fazenda publica|defensoria publica|ministerio publico|litisconsortes com (diferentes )?procuradores/.test(t)) {
    out.notes.push('O texto menciona Fazenda Pública, Defensoria, Ministério Público ou prazo em dobro: confira se o prazo é contado em dobro (CPC, arts. 180, 183, 186 e 229).')
  }

  // 5) Confiança
  const conflicts = dayPeriods.length > 1 || distinct.some(p => p.unit === 'horas')
  if (conflicts || (!out.actType && out.amount === null)) out.confidence = 'baixa'
  else if (out.actType && out.amount !== null && dayPeriods.length === 1 && (!legal || legal === out.amount)) out.confidence = 'alta'
  else if (out.actType || out.amount !== null) out.confidence = 'media'
  if (!out.actType && !conflicts && out.amount !== null) out.notes.push('Não identifiquei o tipo de ato: informe o que precisa ser feito.')
  return out
}

// ── Segunda leitura pela IA (só nos casos ambíguos, a pedido de quem cadastra) ──

export const AI_SUGGESTION_PROMPT = `Você ajuda um escritório de advocacia brasileiro a controlar prazos processuais.
Leia a intimação abaixo e responda SOMENTE com um objeto JSON, sem texto antes ou depois, neste formato:
{"ato": string | null, "prazo": number | null, "unidade": "dias_uteis" | "dias_corridos" | "meses" | "anos" | "horas" | null, "trecho": string | null, "observacoes": string[]}
Regras:
- "ato": o que a parte intimada precisa fazer (ex.: "Contestação", "Réplica", "Embargos de declaração", "Manifestação sobre o laudo"). null se a intimação não exige nenhum ato.
- "prazo" e "unidade": o prazo ESCRITO na intimação. Se não houver prazo escrito, use null — não invente o prazo legal.
- "trecho": copie literalmente a frase da intimação que fixa o ato e o prazo.
- "observacoes": dúvidas que o advogado precisa conferir (prazo em dobro, prazos diferentes para cada parte, prazo em horas, ato sem prazo fixado).
- Não calcule datas. Na dúvida, devolva null e explique em "observacoes".

Intimação:
"""
{{TEXTO}}
"""`

/** Converte a resposta da IA numa sugestão — nunca com confiança alta, e só com campos válidos. */
export function parseAiSuggestion(raw: string, sourceText: string): TextSuggestion {
  const out: TextSuggestion = { actType: null, amount: null, unit: null, confidence: 'baixa', evidence: [], notes: [] }
  const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
  let data: Record<string, unknown>
  try { data = JSON.parse(json) } catch { out.notes.push('A IA não devolveu uma resposta legível. Leia a intimação e preencha à mão.'); return out }

  if (typeof data.ato === 'string' && data.ato.trim()) out.actType = data.ato.trim().slice(0, 120)
  const unidade = data.unidade
  if (unidade === 'horas') out.notes.push('A IA leu um prazo em horas, que o cálculo ainda não faz. Calcule à mão e ajuste a data.')
  else if (typeof data.prazo === 'number' && Number.isInteger(data.prazo) && data.prazo > 0 && data.prazo <= 365
    && (unidade === 'dias_uteis' || unidade === 'dias_corridos' || unidade === 'meses' || unidade === 'anos')) {
    out.amount = data.prazo
    out.unit = unidade
  }
  // O trecho só vale como evidência se estiver de fato no texto (a IA não pode "citar" o que não existe).
  if (typeof data.trecho === 'string' && data.trecho.trim()) {
    const quoted = data.trecho.trim()
    if (fold(sourceText).replace(/\s+/g, ' ').includes(fold(quoted).replace(/\s+/g, ' '))) out.evidence.push(quoted)
    else out.notes.push('O trecho citado pela IA não aparece literalmente na intimação — confira com atenção.')
  }
  if (Array.isArray(data.observacoes)) {
    for (const o of data.observacoes.slice(0, 5)) if (typeof o === 'string' && o.trim()) out.notes.push(o.trim().slice(0, 300))
  }
  out.confidence = out.actType && out.amount !== null && out.evidence.length ? 'media' : 'baixa'
  out.notes.unshift('Leitura feita pela IA: confira com a intimação antes de salvar.')
  return out
}
