// Lógica pura da demonstração "Toque você mesmo" da landing pública
// (src/pages/landing/DemoSandbox.tsx). Sem login, sem banco, sem rede: tudo
// roda no navegador, em estado local, com DADOS FICTÍCIOS.
//
// Usa o MESMO código do sistema — nada é reimplementado aqui:
//   - prazo: calculateDeadline() do motor do Controle de Prazos, com o marco
//     'djen' (disponibilização → publicação no 1º dia útil seguinte), como faz
//     src/lib/intimacaoPrazo.ts; o calendário passa por calendarForProcess();
//   - triagem: suggestFromText() (só regras, sem IA);
//   - financeiro: buildCashFlow() da aba Fluxo de Caixa (modo Previsto, com as
//     recorrências projetadas pela mesma aritmética da Planilha).
//
// O que muda em relação ao sistema real é só a ORIGEM do calendário: lá cada
// dia sem expediente vem do ato oficial do tribunal (court_calendar, com fonte);
// aqui é um calendário de exemplo. Por isso a tela sempre avisa que é
// demonstração e que o cálculo real exige conferência do advogado.

import {
  addDays, calculateDeadline, isValidDate, movableCourtDates,
  type DeadlineResult, type MemoryDay, type Regime, type Unit,
} from '@/lib/deadlines/engine'
import { calendarForProcess, type CourtCalendarRow } from '@/lib/deadlines/courtCalendar'
import { suggestFromText, type Confidence, type TextSuggestion } from '@/lib/deadlines/suggest'
import { suggestRegime } from '@/lib/intimacaoPrazo'
import { buildCashFlow } from '@/lib/cashFlow'
import type { Financial } from '@/types'

// ── (a) Calculadora de prazo ────────────────────────────────────────────────

export const DEMO_COURTS = [
  { value: 'tjpb', label: 'TJPB', hint: 'Justiça Estadual' },
  { value: 'trt13', label: 'TRT da 13ª Região', hint: 'Justiça do Trabalho' },
  { value: 'trf5', label: 'TRF da 5ª Região', hint: 'Justiça Federal' },
] as const

export type DemoCourt = (typeof DEMO_COURTS)[number]['value']

export const DEMO_REGIMES: { value: Regime; label: string }[] = [
  { value: 'civel', label: 'Cível (CPC)' },
  { value: 'juizado', label: 'Juizado Especial' },
  { value: 'trabalhista', label: 'Trabalhista (CLT)' },
  { value: 'penal', label: 'Penal (CPP) — em validação' },
]

export const UNIT_LABELS: Record<Unit, string> = {
  dias_uteis: 'dias úteis', dias_corridos: 'dias corridos', meses: 'meses', anos: 'anos',
}

/** Regime sugerido pelo tribunal — mesma regra da tela Intimações (sempre editável). */
export function demoRegimeFor(court: DemoCourt): Regime {
  return suggestRegime({ court }).regime
}

/** Unidade padrão do regime: o penal corre em dias corridos (CPP, art. 798); os demais, em dias úteis. */
export function demoUnitFor(regime: Regime): Unit {
  return regime === 'penal' ? 'dias_corridos' : 'dias_uteis'
}

export const DEMO_CALENDAR_SOURCE = 'Calendário de exemplo da demonstração — no LegalHub, cada dia vem do ato oficial do tribunal'
const JF_LAW = 'Lei 5.010/1966, art. 62'

/**
 * Calendário forense de EXEMPLO, no formato de `court_calendar`: datas móveis
 * (Carnaval, Quarta-feira de Cinzas com expediente alterado, Semana Santa,
 * Corpus Christi) para os três tribunais e, na Justiça Federal, os feriados da
 * Lei 5.010/1966. Os feriados nacionais e o recesso já vêm embutidos no motor.
 */
export function demoCalendarRows(years: number[]): CourtCalendarRow[] {
  const rows: CourtCalendarRow[] = []
  const add = (court: string, date: string, kind: CourtCalendarRow['kind'], label: string, source = DEMO_CALENDAR_SOURCE) =>
    rows.push({ scope: 'court', court, county: null, date_from: date, date_to: date, kind, label, source_ref: source, version: 1 })
  for (const y of years) {
    const m = movableCourtDates(y)
    for (const { value: court } of DEMO_COURTS) {
      const jf = court === 'trf5'
      add(court, m.carnavalSegunda, 'no_court', 'Carnaval', jf ? JF_LAW : undefined)
      add(court, m.carnavalTerca, 'no_court', 'Carnaval', jf ? JF_LAW : undefined)
      add(court, m.quartaDeCinzas, 'altered_hours', 'Quarta-feira de Cinzas (expediente a partir das 14h)')
      if (jf) add(court, m.quartaSanta, 'no_court', 'Semana Santa', JF_LAW)
      add(court, m.quintaSanta, 'no_court', 'Semana Santa', jf ? JF_LAW : undefined)
      add(court, m.sextaSanta, 'no_court', 'Sexta-feira da Paixão', jf ? JF_LAW : undefined)
      add(court, m.corpusChristi, 'no_court', 'Corpus Christi')
      if (jf) {
        add(court, `${y}-08-11`, 'no_court', 'Dia da criação dos cursos jurídicos', JF_LAW)
        add(court, `${y}-11-01`, 'no_court', 'Dia de Todos os Santos', JF_LAW)
        add(court, `${y}-12-08`, 'no_court', 'Dia da Justiça', JF_LAW)
      }
    }
  }
  return rows
}

export interface DemoDeadlineInput {
  court: DemoCourt
  regime: Regime
  /** Data da disponibilização no DJEN ('YYYY-MM-DD'). */
  disponibilizacao: string
  amount: number
  doubled: boolean
}

export interface DemoDeadline {
  result: DeadlineResult | null
  error: string
  /** Dias que entraram na contagem (1, 2, 3…). */
  countedDays: number
  /** Dias pulados entre a disponibilização e o vencimento (fins de semana, feriados, recesso). */
  skippedDays: number
  /** Dias de calendário entre a disponibilização e o prazo fatal. */
  calendarSpan: number
}

const spanBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)

/** Prazo a partir da disponibilização no DJEN — o mesmo cálculo da tela Intimações. */
export function computeDemoDeadline(i: DemoDeadlineInput): DemoDeadline {
  const empty = { result: null, countedDays: 0, skippedDays: 0, calendarSpan: 0 }
  if (!isValidDate(i.disponibilizacao)) return { ...empty, error: 'Informe uma data válida.' }
  if (!Number.isInteger(i.amount) || i.amount < 1 || i.amount > 120) return { ...empty, error: 'Use um prazo entre 1 e 120 dias.' }
  const y = Number(i.disponibilizacao.slice(0, 4))
  const calendar = calendarForProcess(demoCalendarRows([y - 1, y, y + 1, y + 2]), { court: i.court })
  try {
    const result = calculateDeadline({
      regime: i.regime, startEvent: 'djen', eventDate: i.disponibilizacao, amount: i.amount,
      unit: demoUnitFor(i.regime), doubled: i.doubled, calendar,
    })
    return {
      result, error: '',
      countedDays: result.memory.filter(d => d.kind === 'conta').length,
      skippedDays: new Set(result.memory.filter(d => d.kind === 'nao_conta').map(d => d.date)).size,
      calendarSpan: spanBetween(i.disponibilizacao, result.fatalDate),
    }
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : 'Não foi possível calcular o prazo.' }
  }
}

export type DemoDayTone = 'marco' | 'conta' | 'pula' | 'fatal' | 'interno'

export interface DemoTimelineDay {
  date: string
  tone: DemoDayTone
  /** Número do dia na contagem, quando conta. */
  n?: number
  note: string
}

/**
 * A memória de cálculo do motor como uma fita de dias, do evento ao fatal, sem
 * repetir datas (o motor registra a prorrogação e o vencimento à parte).
 */
export function demoTimeline(result: DeadlineResult): DemoTimelineDay[] {
  const byDate = new Map<string, DemoTimelineDay>()
  const toneOf = (d: MemoryDay): DemoDayTone =>
    d.kind === 'conta' ? 'conta' : d.kind === 'nao_conta' ? 'pula' : d.kind === 'vencimento' || d.kind === 'prorrogacao' ? 'fatal' : 'marco'
  for (const d of result.memory) {
    const prev = byDate.get(d.date)
    const next: DemoTimelineDay = { date: d.date, tone: toneOf(d), n: d.n ?? prev?.n, note: d.note }
    // O vencimento sobrepõe o "conta" do mesmo dia, mantendo o número da contagem.
    if (!prev || next.tone === 'fatal' || (prev.tone === 'pula' && next.tone !== 'pula')) byDate.set(d.date, next)
  }
  if (result.internalDate !== result.fatalDate) {
    const d = byDate.get(result.internalDate)
    if (d) byDate.set(d.date, { ...d, tone: 'interno', note: `Prazo interno do escritório${d.n ? ` (dia ${d.n})` : ''}` })
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/** 'YYYY-MM-DD' → '16/12/2026'. */
export const brDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`

const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
export const weekdayShort = (d: string) => WEEKDAYS_SHORT[new Date(`${d}T00:00:00Z`).getUTCDay()]

/**
 * Data inicial sugerida para a demonstração: uma terça-feira de dezembro do
 * ano corrente — o prazo atravessa o recesso forense, que é onde o cálculo à
 * mão mais erra.
 */
export function demoDefaultDate(today: string): string {
  const y = Number(today.slice(0, 4))
  let d = `${y}-12-08`
  while (new Date(`${d}T00:00:00Z`).getUTCDay() !== 2) d = addDays(d, 1)
  return d
}

// ── (b) Triagem de intimação ────────────────────────────────────────────────

/** Intimações FICTÍCIAS (partes, números e órgãos inventados) para clicar e testar. */
export const DEMO_INTIMACOES: { id: string; label: string; court: DemoCourt; regime: Regime; text: string }[] = [
  {
    id: 'replica',
    label: 'Réplica — vara cível',
    court: 'tjpb',
    regime: 'civel',
    text: 'Processo nº 0000000-00.2026.8.15.0000 (exemplo) — 9ª Vara Cível da Capital. Autor: Fulano de Tal. Réu: Empresa Exemplo Ltda. '
      + 'Fica a parte autora intimada, por seu advogado, para, no prazo de 15 (quinze) dias, apresentar réplica à contestação de ID 0000.',
  },
  {
    id: 'contrarrazoes',
    label: 'Contrarrazões — trabalhista',
    court: 'trt13',
    regime: 'trabalhista',
    text: 'Processo nº 0000000-00.2026.5.13.0000 (exemplo) — Vara do Trabalho de Exemplo. Reclamante: Beltrano da Silva. '
      + 'Reclamado: Município de Exemplo (Fazenda Pública). Intime-se o reclamado para, querendo, apresentar contrarrazões ao recurso ordinário interposto pelo reclamante.',
  },
]

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  alta: 'Leitura clara',
  media: 'Leitura razoável — confira',
  baixa: 'Leitura incerta — leia o texto',
}

export interface DemoTriage {
  suggestion: TextSuggestion
  /** "15 dias úteis", ou null se o texto não permitiu sugerir um prazo. */
  prazoLabel: string | null
  confidenceLabel: string
  /** Dá para mandar a sugestão direto à calculadora: prazo em dias e leitura não incerta (incerta não preenche, como no sistema). */
  canCalculate: boolean
}

export function triageIntimacao(text: string, regime?: Regime): DemoTriage {
  const suggestion = suggestFromText(text, { regime })
  const { amount, unit } = suggestion
  return {
    suggestion,
    prazoLabel: amount !== null ? `${amount} ${unit ? UNIT_LABELS[unit] : 'dias úteis'}` : null,
    confidenceLabel: CONFIDENCE_LABELS[suggestion.confidence],
    canCalculate: suggestion.confidence !== 'baixa' && amount !== null && amount <= 120 && (unit === null || unit === 'dias_uteis' || unit === 'dias_corridos'),
  }
}

/** O texto cita Fazenda Pública/MP/Defensoria/prazo em dobro — a calculadora já abre com "em dobro" marcado para conferir. */
export const mentionsDoubled = (s: TextSuggestion) => s.notes.some(n => n.includes('em dobro'))

// ── (c) Fluxo financeiro ────────────────────────────────────────────────────

export interface DemoFinanceItem {
  id: string
  label: string
  type: 'receivable' | 'payable'
  category: string
  amount: number
  /** Mensal: repete todo mês a partir de `month`. Avulso: cai só em `month`. */
  recurring: boolean
  /** 0 = janeiro. */
  month: number
  enabled: boolean
}

/** Lançamentos FICTÍCIOS de um escritório pequeno (valores ilustrativos). */
export const DEMO_FINANCE_ITEMS: DemoFinanceItem[] = [
  { id: 'mensalistas', label: 'Honorários mensais (clientes fixos)', type: 'receivable', category: 'honorarios', amount: 9000, recurring: true, month: 0, enabled: true },
  { id: 'exito', label: 'Honorários de êxito (acordo)', type: 'receivable', category: 'exito', amount: 18000, recurring: false, month: 5, enabled: true },
  { id: 'aluguel', label: 'Aluguel e condomínio', type: 'payable', category: 'aluguel', amount: 3200, recurring: true, month: 0, enabled: true },
  { id: 'equipe', label: 'Equipe (estagiário + secretária)', type: 'payable', category: 'pessoal', amount: 5400, recurring: true, month: 0, enabled: true },
  { id: 'impostos', label: 'Impostos (Simples Nacional)', type: 'payable', category: 'impostos', amount: 1100, recurring: true, month: 0, enabled: true },
  { id: 'pericia', label: 'Perícia contábil adiantada', type: 'payable', category: 'custas', amount: 7500, recurring: false, month: 2, enabled: true },
]

export const DEMO_OPENING_BALANCE = 4000

const blankFinancial: Omit<Financial, 'id' | 'type' | 'category' | 'description' | 'amount' | 'due_date'> = {
  tenant_id: 'demo', paid_date: null, status: 'pending', client_id: null, client_name: null, process_id: null,
  process_number: null, notes: null, created_at: null, deleted_at: null, account_id: null, installment_group_id: null,
  installment_number: null, installment_total: null, recurring: false, recurrence_interval: null,
  recurrence_end_date: null, generated_from_id: null, reconciled: null, reconciled_in_id: null,
}

const iso = (year: number, month: number, day = 10) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

/**
 * Converte os lançamentos da demonstração em `Financial` — mensais viram
 * modelos recorrentes (como na aba Recorrentes) e o saldo inicial vira um
 * recebimento pago em 31/12 do ano anterior (é como o Fluxo de Caixa calcula
 * o saldo de abertura).
 */
export function buildDemoFinancials(items: DemoFinanceItem[], openingBalance: number, year: number): Financial[] {
  const out: Financial[] = []
  if (openingBalance) {
    out.push({
      ...blankFinancial, id: 'demo-saldo', type: openingBalance > 0 ? 'receivable' : 'payable', category: 'saldo',
      description: 'Saldo em caixa', amount: Math.abs(openingBalance), due_date: `${year - 1}-12-31`,
      paid_date: `${year - 1}-12-31`, status: 'paid',
    })
  }
  for (const it of items) {
    if (!it.enabled || !(it.amount > 0)) continue
    out.push({
      ...blankFinancial, id: `demo-${it.id}`, type: it.type, category: it.category, description: it.label,
      amount: it.amount, due_date: iso(year, it.month),
      recurring: it.recurring, recurrence_interval: it.recurring ? 'monthly' : null,
    })
  }
  return out
}

export const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export interface DemoCashFlowMonth {
  month: number
  label: string
  income: number
  expense: number
  result: number
  balance: number
}

export interface DemoCashFlow {
  opening: number
  months: DemoCashFlowMonth[]
  totalIncome: number
  totalExpense: number
  totalResult: number
  closing: number
  /** Meses em que o saldo acumulado fica negativo (mesmo alerta da aba Fluxo de Caixa). */
  negativeMonths: number[]
  /** Menor saldo do ano e o mês em que acontece. */
  lowest: { month: number; balance: number }
}

/** Fluxo de caixa previsto do ano — o mesmo `buildCashFlow` do Financeiro, em modo Previsto. */
export function demoCashFlow(items: DemoFinanceItem[], openingBalance: number, year: number): DemoCashFlow {
  const cf = buildCashFlow(buildDemoFinancials(items, openingBalance, year), year, 'forecast')
  const months = cf.results.map((result, m) => ({
    month: m, label: MONTHS_SHORT[m], income: cf.incomeTotals[m], expense: cf.expenseTotals[m], result, balance: cf.balances[m],
  }))
  const lowest = months.reduce((lo, m) => (m.balance < lo.balance ? { month: m.month, balance: m.balance } : lo), { month: 0, balance: months[0].balance })
  return {
    opening: cf.opening, months, totalIncome: cf.totalIncome, totalExpense: cf.totalExpense, totalResult: cf.totalResult,
    closing: cf.balances[11], negativeMonths: months.filter(m => m.balance < 0).map(m => m.month), lowest,
  }
}

/** Teto "redondo" para o eixo do gráfico (1, 2, 2,5 ou 5 × 10^n), nunca menor que o maior valor. */
export function niceCeil(value: number): number {
  const v = Math.abs(value)
  if (v === 0) return 1
  const pow = 10 ** Math.floor(Math.log10(v))
  for (const step of [1, 2, 2.5, 5, 10]) if (step * pow >= v) return step * pow
  return 10 * pow
}

export function formatBRL(n: number, opts: { compact?: boolean } = {}): string {
  if (opts.compact && Math.abs(n) >= 1000) {
    return `${n < 0 ? '−' : ''}R$ ${(Math.abs(n) / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  }
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}
