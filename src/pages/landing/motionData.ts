import type { TourId } from './landingData'

// Dados das seções animadas da landing. Tudo aqui precisa ser verdade:
// motionData.test.ts confere o exemplo de prazo contra o motor real e os nomes
// das tools contra o backend do Assistente.

// ─── Linha do tempo de um prazo ─────────────────────────────────────────────
// Exemplo calculado pelo motor do Controle de Prazos (calculateDeadline:
// regime cível, marco DJEN, 15 dias úteis, margem interna padrão de 2 dias
// úteis). Mudar uma data aqui sem mudar a outra quebra o teste.
export const DEADLINE_EXAMPLE = {
  input: { regime: 'civel', startEvent: 'djen', eventDate: '2026-08-06', amount: 15 } as const,
  businessDays: 15,
  weekendDaysSkipped: 6,
  steps: [
    { key: 'disponibilizacao', date: '2026-08-06', label: 'Disponibilizada no DJEN', detail: 'O LegalHub importa a intimação pela sua OAB' },
    { key: 'publicacao', date: '2026-08-07', label: 'Considera-se publicada', detail: '1º dia útil seguinte à disponibilização' },
    { key: 'inicio', date: '2026-08-10', label: '1º dia contado', detail: 'Sábado e domingo não contam' },
    { key: 'interno', date: '2026-08-26', label: 'Prazo interno', detail: 'Tarefa vence 2 dias úteis antes' },
    { key: 'fatal', date: '2026-08-28', label: 'Prazo fatal', detail: '15º dia útil' },
  ],
}

const WEEKDAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/** "qui · 06/08" a partir de 'AAAA-MM-DD' (UTC, sem fuso para não trocar o dia). */
export function shortDateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${WEEKDAY_SHORT[d.getUTCDay()]} · ${dd}/${mm}`
}

// ─── Bento de funcionalidades ───────────────────────────────────────────────
// Cada bloco toca a gravação real daquela área (public/demo/<video>.mp4).
export interface BentoItem {
  id: string
  video: TourId
  title: string
  description: string
  path: string
  /** Formato na grade de 4 colunas (desktop). */
  span: 'big' | 'wide' | 'tall' | 'one'
}

export const BENTO: BentoItem[] = [
  { id: 'intimacoes', video: 'intimacoes', span: 'big', path: '/publicacoes', title: 'Intimações automáticas', description: 'Sincronização diária com o DJEN pela sua OAB, cobrindo tribunais estaduais e federais.' },
  { id: 'prazos', video: 'prazos', span: 'wide', path: '/prazos', title: 'Cálculo de prazos', description: 'Dias úteis ou corridos, com a tarefa criada e a data na agenda.' },
  { id: 'processos', video: 'processos', span: 'one', path: '/processos', title: 'Processos por fase', description: 'Negociação, conhecimento, recursal, execução. Por cliente e por parceiro.' },
  { id: 'agenda', video: 'agenda', span: 'one', path: '/agenda', title: 'Agenda + Google', description: 'Audiências, prazos e reuniões sincronizados com o Google Agenda.' },
  { id: 'financeiro', video: 'financeiro', span: 'wide', path: '/financeiro', title: 'Financeiro completo', description: 'Contas a pagar e receber, recorrentes, fluxo de caixa e comissões de parceiros.' },
  { id: 'documentos', video: 'documentos', span: 'one', path: '/escritorio-digital', title: 'Escritório Digital', description: 'Documentos organizados por cliente, com integração ao Google Drive.' },
  { id: 'clientes', video: 'clientes', span: 'one', path: '/clientes', title: 'Clientes e Portal do Cliente', description: 'Ficha completa de cada cliente e um portal com login próprio para ele acompanhar o caso.' },
  { id: 'ia', video: 'ia', span: 'wide', path: '/ia-juridica', title: 'IA jurídica', description: 'Análises de processo, petições e recursos a partir dos autos e dos documentos anexados.' },
  { id: 'relatorios', video: 'relatorios', span: 'wide', path: '/relatorios', title: 'Relatórios da equipe', description: 'Tarefas no prazo, em atraso e a produtividade de cada pessoa no mês.' },
]

// ─── Assistente: roteiro da demonstração ────────────────────────────────────
// Espelha o "LegalHub Assistente" (Edge Function ai-assistant-chat): as tools
// de leitura têm estes nomes/argumentos, e a de escrita só PROPÕE — a tarefa
// só é gravada no clique em "Confirmar". Dados fictícios.
export const AI_SCRIPT = {
  question: 'O que vence esta semana e o que está pendente comigo?',
  toolCalls: [
    { name: 'consultar_prazos', args: '{ escopo: "proximos" }', result: '3 prazos nos próximos 7 dias' },
    { name: 'consultar_tarefas', args: '{ status: "pendentes" }', result: '2 tarefas pendentes suas' },
  ],
  answer: [
    'Nos próximos 7 dias há 3 prazos. O mais próximo é a réplica à contestação no processo de Marina Souza, que vence na quinta-feira.',
    'Você tem 2 tarefas pendentes: revisar a minuta da réplica e ligar para o cliente sobre os documentos.',
  ],
  proposalIntro: 'Quer que eu crie uma tarefa para revisar a réplica amanhã?',
  proposal: {
    tool: 'propor_criar_tarefa',
    title: 'Revisar réplica · Marina Souza',
    due: 'Amanhã',
    assignee: 'Você',
    priority: 'Alta',
  },
}

export type CalendarCellKind = 'fora' | 'evento' | 'publicacao' | 'nao_conta' | 'conta'
export interface CalendarCell { date: string; day: number; kind: CalendarCellKind; n?: number; interno?: boolean; fatal?: boolean }

const addIsoDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/**
 * Semanas completas (seg→dom) em volta do exemplo, com o papel de cada dia na
 * contagem. Só fins de semana ficam de fora: o exemplo foi escolhido num
 * período sem feriado nacional (o teste confere com a memória do motor).
 */
export function deadlineCalendar(example = DEADLINE_EXAMPLE): CalendarCell[] {
  const [evento, publicacao, inicio, interno, fatal] = example.steps.map(s => s.date)
  const dow = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay()
  let first = evento
  while (dow(first) !== 1) first = addIsoDays(first, -1)
  let last = fatal
  while (dow(last) !== 0) last = addIsoDays(last, 1)

  const cells: CalendarCell[] = []
  let n = 0
  for (let d = first; d <= last; d = addIsoDays(d, 1)) {
    const day = Number(d.slice(8, 10))
    const weekend = dow(d) === 0 || dow(d) === 6
    let kind: CalendarCellKind = 'fora'
    if (d === evento) kind = 'evento'
    else if (d === publicacao) kind = 'publicacao'
    else if (d > publicacao && d <= fatal) kind = weekend ? 'nao_conta' : 'conta'
    const cell: CalendarCell = { date: d, day, kind }
    if (kind === 'conta' && d >= inicio) cell.n = ++n
    if (d === interno) cell.interno = true
    if (d === fatal) cell.fatal = true
    cells.push(cell)
  }
  return cells
}
