import { describe, expect, it } from 'vitest'
import { indicatorsByLawyer, monthlyIndicators, type ReportDeadline } from './reports'

// Novembro/2026: dias úteis nacionais = 19 (feriados: 02, 15 dom, 20).
const d = (over: Partial<ReportDeadline>): ReportDeadline => ({
  id: Math.random().toString(36), status: 'protocolado', responsible_id: 'helena', fatal_date: '2026-11-18', internal_date: '2026-11-16',
  reviewed_at: '2026-11-04T15:00:00Z', protocol_at: '2026-11-17T14:00:00Z', manually_adjusted: false, ...over,
})
const get = (key: string, list: ReturnType<typeof monthlyIndicators>) => list.find(i => i.key === key)!

describe('monthlyIndicators', () => {
  const deadlines = [
    d({}), // com folga, conferido a tempo
    d({ protocol_at: '2026-11-18T21:00:00Z' }), // 18h em Brasília: no dia do fatal
    d({ status: 'conferido', protocol_at: null, fatal_date: '2026-11-10', internal_date: '2026-11-06' }), // passou sem protocolo
    d({ status: 'perdido', protocol_at: null, reviewed_at: '2026-11-17T12:00:00Z', manually_adjusted: true, responsible_id: 'rafael' }), // conferido depois do interno
    d({ status: 'cancelado' }), // fora da conta
    d({ fatal_date: '2026-12-02' }), // outro mês
  ]
  const comms = [
    { created_at: '2026-11-05T13:00:00Z', triage_status: 'deadline', triaged_at: '2026-11-06T13:00:00Z' }, // 1 dia útil: ok
    { created_at: '2026-11-05T13:00:00Z', triage_status: 'no_deadline', triaged_at: '2026-11-10T13:00:00Z' }, // 3 dias úteis: fora
    { created_at: '2026-11-25T13:00:00Z', triage_status: 'pending', triaged_at: null }, // pendente há 0 dia útil: ainda não entra
  ]
  const list = monthlyIndicators({ month: '2026-11', today: '2026-11-25', deadlines, communications: comms, sourceCheckDays: ['2026-11-03', '2026-11-04'] })

  it('triagem em até 1 dia útil ignora a que ainda está dentro do prazo de triagem', () => {
    expect(get('triagem', list)).toMatchObject({ value: 50, base: 2, ok: false })
  })
  it('conferência antes do prazo interno', () => {
    expect(get('conferencia', list)).toMatchObject({ value: 75, base: 4, ok: false })
  })
  it('protocolo com folga e no dia do fatal (hora local de Brasília)', () => {
    expect(get('folga', list)).toMatchObject({ value: 50, base: 2 })
    expect(get('no_dia', list)).toMatchObject({ value: 50, base: 2, ok: false })
  })
  it('perdidos e ajustes manuais; cancelados e outros meses ficam fora', () => {
    expect(get('perdidos', list)).toMatchObject({ value: 2, ok: false })
    expect(get('ajustes', list).value).toBe(1)
  })
  it('dias úteis sem conferência das fontes, só até hoje', () => {
    // dias úteis de 01 a 25/11: 03..06 (4), 09..13 (5), 16..19 (4), 23..25 (3) = 16; conferidos 2
    expect(get('sem_fontes', list).value).toBe(14)
  })
  it('mês sem dados: percentuais nulos, sem acusar meta', () => {
    const empty = monthlyIndicators({ month: '2026-09', today: '2026-11-25', deadlines: [], communications: [], sourceCheckDays: [] })
    expect(get('folga', empty)).toMatchObject({ value: null, ok: null })
  })
})

describe('indicatorsByLawyer', () => {
  it('agrupa por responsável e ordena por volume', () => {
    const rows = indicatorsByLawyer([
      d({}), d({ protocol_at: '2026-11-18T12:00:00Z' }), d({ status: 'em_elaboracao', protocol_at: null, fatal_date: '2026-11-30' }),
      d({ status: 'perdido', protocol_at: null, responsible_id: 'rafael' }),
    ], '2026-11', '2026-11-25')
    expect(rows[0]).toMatchObject({ responsibleId: 'helena', total: 3, early: 1, sameDay: 1, open: 1, lost: 0 })
    expect(rows[1]).toMatchObject({ responsibleId: 'rafael', lost: 1 })
  })
})
