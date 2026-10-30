import type { CalendarEntry, DeadlineInput } from './engine'

/**
 * Bateria de casos REAIS — critério de saída da Fase 1 do Controle de Prazos:
 * o motor só vai para produção acertando 100% de pelo menos 50 casos, cada um
 * com a data fatal conferida por advogado. Toda mudança futura no motor ou no
 * calendário precisa continuar acertando todos (casosReais.test.ts).
 *
 * Como incluir um caso: preencha a planilha "Bateria de casos — Controle de
 * Prazos.csv" (uma linha por intimação real, anonimizada) e converta para o
 * formato abaixo. `calendar` = os dias especiais do tribunal/comarca naquele
 * período, com a fonte, exatamente como estariam em `court_calendar`.
 */
export interface RealCase {
  id: string
  /** Tribunal, comarca e tipo de ato — só para leitura humana. */
  descricao: string
  input: DeadlineInput
  /** Data fatal correta, conferida por advogado. */
  fatalEsperada: string
  /** Por que esta é a data correta (contagem resumida, base legal). */
  justificativa: string
  conferidoPor: string
  calendar?: CalendarEntry[]
}

export const CASOS_REAIS: RealCase[] = [
  // Exemplo do formato (substituir pelos casos reais):
  // {
  //   id: 'tjpb-001',
  //   descricao: 'TJPB, 1ª Vara Cível de João Pessoa — contestação',
  //   input: { regime: 'civel', startEvent: 'djen', eventDate: '2026-10-29', amount: 15 },
  //   fatalEsperada: '2026-11-24',
  //   justificativa: 'Publicação 30/10; início 03/11 (02/11 Finados); 20/11 feriado; 15º dia útil 24/11.',
  //   conferidoPor: 'Dr. Fulano (OAB/PB 00000)',
  // },
]

export const MINIMO_CASOS_FASE_1 = 50
