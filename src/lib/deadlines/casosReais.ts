import type { CalendarEntry, DeadlineInput } from './engine'
import casos from './casosReais.data.json'

/**
 * Bateria de casos REAIS — critério de saída da Fase 1 do Controle de Prazos:
 * o motor só vai para produção acertando 100% de pelo menos 50 casos, cada um
 * com a data fatal conferida por advogado. Toda mudança futura no motor ou no
 * calendário precisa continuar acertando todos (casosReais.test.ts).
 *
 * Como incluir casos: preencha a planilha "Bateria de casos — Controle de
 * Prazos.csv" (uma linha por intimação real, anonimizada) e rode
 *   node scripts/prazos/importar-casos.ts "<caminho do CSV>"
 * que valida cada linha e grava casosReais.data.json. Nunca editar o JSON à mão.
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

export const CASOS_REAIS: RealCase[] = casos as RealCase[]

export const MINIMO_CASOS_FASE_1 = 50
/** O regime penal tem bateria própria (especificação, fase 5). */
export const MINIMO_CASOS_PENAL = 20
