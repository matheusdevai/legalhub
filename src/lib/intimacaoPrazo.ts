// Prazo a partir de uma intimação da tela Intimações (PublicacoesPage).
//
// Antes a tela somava N dias úteis à data de DISPONIBILIZAÇÃO com
// prazoUtils.computePrazo — sem feriados, sem recesso, sem a regra da
// publicação no dia útil seguinte e com a mesma regra para todo tipo de
// processo. Agora usa o mesmo motor do Controle de Prazos
// (_shared/deadlines/engine.ts) com:
//   - marco = disponibilização no DJEN (Lei 11.419/2006, art. 4º, §§ 3º e 4º;
//     CPC, art. 224, §§ 2º e 3º): publicação no 1º dia útil seguinte, contagem
//     a partir do dia útil seguinte à publicação;
//   - regime sugerido pelo tribunal/órgão (trabalhista, juizado, penal, cível),
//     sempre editável — a sugestão nunca substitui a conferência do advogado;
//   - calendário do tribunal/comarca cadastrado em court_calendar.
import { calculateDeadline, type CalendarEntry, type DeadlineResult, type Regime, type Unit } from '@/lib/deadlines/engine'
import { brDate, courtFromCnjNumber } from '@/lib/oabSync'

/** Dia (YYYY-MM-DD) do movimento no fuso de Brasília — data pura fica como está. */
export function intimacaoDate(dataHora: string | null | undefined): string | null {
  const s = (dataHora || '').trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const t = Date.parse(s)
  if (Number.isNaN(t)) return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null
  // "2026-10-20T01:00:00Z" é 19/10 às 22h em Brasília: slice(0, 10) daria o dia errado.
  return brDate(new Date(t))
}

/** Tribunal da intimação: o que o DJEN informou ou, na falta, o do número CNJ. */
export function courtOfIntimacao(tribunal: string | null | undefined, processNumber: string | null | undefined): string | null {
  const t = (tribunal || '').trim().toLowerCase()
  return t || courtFromCnjNumber(processNumber)
}

const has = (s: string, re: RegExp) => re.test(s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase())

export interface RegimeSuggestion { regime: Regime; reason: string }

/**
 * Regime de contagem sugerido. Ordem: trabalho (pelo tribunal) → penal (pelo
 * órgão/classe) → juizado → cível. Não existe regra única: CLT conta em dias
 * úteis com suspensão no recesso (art. 775 e 775-A); CPP em dias corridos
 * (art. 798); juizados cíveis em dias úteis (Lei 9.099/95, art. 12-A).
 */
export function suggestRegime(input: { court?: string | null; organ?: string | null; classe?: string | null }): RegimeSuggestion {
  const court = (input.court || '').toLowerCase()
  const text = `${input.organ || ''} ${input.classe || ''}`
  if (court.startsWith('trt') || court === 'tst') return { regime: 'trabalhista', reason: 'Justiça do Trabalho (CLT, arts. 775 e 775-A)' }
  if (has(text, /\b(criminal|crime|crimes|juri|execucao penal|execucoes penais|violencia domestica|acao penal|inquerito|habeas corpus)\b/)) {
    return { regime: 'penal', reason: 'Órgão/classe criminal (CPP, art. 798) — regime penal ainda em validação' }
  }
  if (has(text, /juizado/)) {
    return {
      regime: 'juizado',
      reason: has(text, /federal/) ? 'Juizado Especial Federal (Lei 10.259/2001) — sem prazo em dobro para a Fazenda (art. 9º)' : 'Juizado Especial (Lei 9.099/95, art. 12-A — dias úteis)',
    }
  }
  return { regime: 'civel', reason: 'Regra geral do CPC (dias úteis, art. 219)' }
}

/**
 * Comarca/município pelo nome do órgão ("4ª Vara do Trabalho de João Pessoa",
 * "Juizado Especial Cível da Comarca de Campina Grande") — usada só para achar
 * feriados municipais cadastrados. Sem acerto, nenhum feriado local entra: o
 * prazo fica mais cedo (o lado seguro).
 */
export function countyFromOrgan(organ: string | null | undefined): string | null {
  const words = (organ || '').trim().split(/\s+/).filter(Boolean)
  // Candidatos: o que vem depois de cada "de/da/do", da esquerda para a direita;
  // vale o primeiro que não começa por palavra descritiva do órgão
  // ("Vara do Trabalho de Catolé do Rocha" → "Catolé do Rocha").
  for (let i = 0; i < words.length - 1; i++) {
    if (!/^(de|da|do)$/i.test(words[i])) continue
    const first = words[i + 1].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    if (NOT_A_PLACE.has(first) || !/^[A-ZÀ-Ý]/.test(words[i + 1])) continue
    return words.slice(i + 1).join(' ').replace(/[,;.]+$/, '') || null
  }
  return null
}

const NOT_A_PLACE = new Set([
  'trabalho', 'familia', 'fazenda', 'sucessoes', 'registros', 'registro', 'direito', 'justica', 'infancia',
  'violencia', 'comarca', 'capital', 'execucoes', 'execucao', 'juizado', 'vara', 'tribunal', 'secao', 'subsecao',
  'turma', 'camara', 'gabinete', 'desembargador', 'desembargadora', 'relator', 'relatora', 'presidencia', 'orgao',
])

export interface IntimacaoPrazoInput {
  disponibilizacao: string
  regime: Regime
  amount: number
  unit: Unit
  doubled: boolean
  applyRecess: boolean
  internalMarginDays: number
  calendar: CalendarEntry[]
}

export function calcIntimacaoPrazo(i: IntimacaoPrazoInput): { result: DeadlineResult | null; error: string } {
  try {
    return {
      result: calculateDeadline({
        regime: i.regime, startEvent: 'djen', eventDate: i.disponibilizacao, amount: i.amount, unit: i.unit,
        doubled: i.doubled, applyRecess: i.applyRecess, internalMarginDays: i.internalMarginDays, calendar: i.calendar,
      }),
      error: '',
    }
  } catch (e) {
    return { result: null, error: e instanceof Error ? e.message : 'Não foi possível calcular o prazo.' }
  }
}

const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`
const UNIT_LABEL: Record<Unit, string> = { dias_uteis: 'dias úteis', dias_corridos: 'dias corridos', meses: 'meses', anos: 'anos' }

/** Texto da tarefa: deixa registrado como a data foi calculada. */
export function intimacaoTaskDescription(p: {
  tribunal: string; result: DeadlineResult; regimeLabel: string; amount: number; unit: Unit; doubled: boolean; doubledReason?: string
}): string {
  const r = p.result
  return [
    `Gerado a partir da intimação de ${p.tribunal} disponibilizada no DJEN em ${br(r.memory[0]?.date || r.referenceDate)}.`,
    `Publicação: ${br(r.referenceDate)} · início da contagem: ${br(r.startDate)}.`,
    `Prazo: ${p.amount} ${UNIT_LABEL[p.unit]}${p.doubled ? ` em dobro${p.doubledReason ? ` (${p.doubledReason})` : ''}` : ''} · regime: ${p.regimeLabel}.`,
    `Prazo FATAL: ${br(r.fatalDate)} · prazo interno: ${br(r.internalDate)}.`,
    ...r.warnings.map(w => `Atenção: ${w}`),
    `Cálculo automático (regras ${r.rulesVersion}) com feriados nacionais e o calendário cadastrado do tribunal — confira com a fonte oficial antes de protocolar.`,
  ].join('\n')
}

/** Chave estável da intimação (sobrevive a reordenação de movimentos). */
export function intimacaoRef(processId: string, mov: { idComunicacao?: unknown; hash?: unknown }, index: number): string {
  if (mov.idComunicacao != null && mov.idComunicacao !== '') return `djen:${mov.idComunicacao}`
  if (mov.hash) return `djen:h:${mov.hash}`
  return `mov:${processId}:${index}`
}

/**
 * Quem pode atribuir uma tarefa a quem. Admin/advogado (e super_admin)
 * distribuem para qualquer pessoa da equipe; estagiário e financeiro só para si
 * mesmos — mesma hierarquia de TasksPage, onde advogado/estagiário só enxergam
 * as próprias tarefas. Portal do cliente nunca.
 */
export function canAssignTaskTo(actorRole: string | null | undefined, actorId: string | null | undefined, targetId: string | null | undefined): boolean {
  if (!actorRole || actorRole === 'client') return false
  if (['admin', 'lawyer', 'super_admin'].includes(actorRole)) return true
  return !!actorId && actorId === targetId
}
