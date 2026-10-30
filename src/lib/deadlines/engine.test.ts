import { describe, expect, it } from 'vitest'
import { calculateDeadline, DeadlineInputError, easterSunday, movableCourtDates, nationalHolidays, type CalendarEntry } from './engine'

// Casos de REGRA, calculados à mão a partir da lei — cada um explica a contagem.
// A bateria de casos REAIS conferidos por advogado (critério de saída da Fase 1)
// entra em casosReais.test.ts, no mesmo formato.

describe('cível — DJEN, dias úteis', () => {
  it('15 dias: publicação no dia útil seguinte, início no próximo, pula Finados e Consciência Negra', () => {
    // Disponibilizado qui 29/10/2026 → publicado sex 30/10 → início: 02/11 é Finados → ter 03/11.
    // 03,04,05,06,09,10,11,12,13,16,17,18,19 (13) · 20/11 feriado · 23 (14), 24 (15).
    const r = calculateDeadline({ regime: 'civel', startEvent: 'djen', eventDate: '2026-10-29', amount: 15 })
    expect(r.referenceDate).toBe('2026-10-30')
    expect(r.startDate).toBe('2026-11-03')
    expect(r.fatalDate).toBe('2026-11-24')
    expect(r.memory.find(m => m.date === '2026-11-20')?.kind).toBe('nao_conta')
    expect(r.memory.filter(m => m.kind === 'conta')).toHaveLength(15)
  })

  it('prazo interno: 2 dias úteis antes do fatal, pulando o feriado', () => {
    // Fatal 24/11 → 23/11 (1) → 20/11 feriado → 19/11 (2).
    const r = calculateDeadline({ regime: 'civel', startEvent: 'djen', eventDate: '2026-10-29', amount: 15 })
    expect(r.internalDate).toBe('2026-11-19')
  })

  it('disponibilizado na sexta: publicação e início pulam o fim de semana e o feriado', () => {
    // Sex 30/10 → publicação: 02/11 Finados → ter 03/11 → início qua 04/11.
    const r = calculateDeadline({ regime: 'civel', startEvent: 'djen', eventDate: '2026-10-30', amount: 5 })
    expect(r.referenceDate).toBe('2026-11-03')
    expect(r.startDate).toBe('2026-11-04')
    expect(r.fatalDate).toBe('2026-11-10') // 04,05,06,09,10
  })

  it('prazo em dobro: 15 → 30 dias úteis', () => {
    // A partir de 03/11: novembro tem 19 dias úteis (sem o dia 20); dezembro 1..15 completa 30.
    const r = calculateDeadline({ regime: 'civel', startEvent: 'djen', eventDate: '2026-10-29', amount: 15, doubled: true })
    expect(r.amount).toBe(30)
    expect(r.fatalDate).toBe('2026-12-15')
  })

  it('atravessa o recesso: suspende em 20/12 e volta em 21/01', () => {
    // Disponibilizado ter 15/12 → publicado 16/12 → início 17/12: 17 (1), 18 (2) · recesso ·
    // 21,22,25,26,27,28,29/01 (3–9) · 01..05/02 (10–14) · 08/02 (15).
    const r = calculateDeadline({ regime: 'civel', startEvent: 'djen', eventDate: '2026-12-15', amount: 15 })
    expect(r.fatalDate).toBe('2027-02-08')
    expect(r.memory.find(m => m.date === '2026-12-28')?.note).toMatch(/Recesso/)
  })

  it('Carnaval só conta se estiver no calendário do tribunal', () => {
    // Com o mesmo caso acima, Carnaval 2027 (08 e 09/02) cadastrado pelo tribunal → fatal 10/02.
    const { carnavalSegunda, carnavalTerca } = movableCourtDates(2027)
    const calendar: CalendarEntry[] = [
      { date: carnavalSegunda, kind: 'no_court', label: 'Carnaval', source: 'Portaria do tribunal' },
      { date: carnavalTerca, kind: 'no_court', label: 'Carnaval', source: 'Portaria do tribunal' },
    ]
    const r = calculateDeadline({ regime: 'civel', startEvent: 'djen', eventDate: '2026-12-15', amount: 15, calendar })
    expect(r.fatalDate).toBe('2027-02-10')
  })
})

describe('calendário do tribunal', () => {
  const base = { regime: 'civel' as const, startEvent: 'djen' as const, eventDate: '2026-10-29', amount: 15 }

  it('feriado local no meio do prazo empurra o vencimento um dia útil', () => {
    const r = calculateDeadline({ ...base, calendar: [{ date: '2026-11-05', kind: 'holiday', label: 'Feriado municipal', source: 'Lei municipal' }] })
    expect(r.fatalDate).toBe('2026-11-25')
  })

  it('indisponibilidade do sistema no último dia prorroga para o dia útil seguinte', () => {
    const r = calculateDeadline({ ...base, calendar: [{ date: '2026-11-24', kind: 'outage', label: 'Indisponibilidade do PJe', source: 'Certidão do tribunal' }] })
    expect(r.fatalDate).toBe('2026-11-25')
    expect(r.memory.some(m => m.kind === 'prorrogacao')).toBe(true)
  })

  it('indisponibilidade no meio do prazo não suspende: o dia conta normalmente', () => {
    const r = calculateDeadline({ ...base, calendar: [{ date: '2026-11-10', kind: 'outage', label: 'Indisponibilidade do PJe' }] })
    expect(r.fatalDate).toBe('2026-11-24')
  })

  it('expediente alterado conta como dia útil, mas não pode ser o vencimento', () => {
    const mid = calculateDeadline({ ...base, calendar: [{ date: '2026-11-10', kind: 'altered_hours', label: 'Expediente até 12h' }] })
    expect(mid.fatalDate).toBe('2026-11-24') // contou normalmente
    const last = calculateDeadline({ ...base, calendar: [{ date: '2026-11-24', kind: 'altered_hours', label: 'Expediente até 12h' }] })
    expect(last.fatalDate).toBe('2026-11-25')
  })

  it('suspensão de prazos não conta nem em dias corridos', () => {
    const r = calculateDeadline({
      regime: 'administrativo', startEvent: 'data_inicial', eventDate: '2026-10-29', amount: 10,
      calendar: [{ date: '2026-11-02', kind: 'suspension', label: 'Suspensão de prazos', source: 'Portaria' }],
    })
    // 30,31/10, 01/11 (3), 02/11 suspenso, 03..09/11 (4–10) → 09/11 (seg).
    expect(r.fatalDate).toBe('2026-11-09')
  })
})

describe('outros marcos iniciais', () => {
  it('juntada do mandado: início no dia útil seguinte à juntada', () => {
    // Juntada qua 04/11 → início qui 05/11: 05,06,09..13,16..19 (11) · 20/11 · 23..26 (15).
    const r = calculateDeadline({ regime: 'civel', startEvent: 'juntada', eventDate: '2026-11-04', amount: 15 })
    expect(r.startDate).toBe('2026-11-05')
    expect(r.fatalDate).toBe('2026-11-26')
  })

  it('intimação eletrônica não consultada: ciência tácita 10 dias corridos após o envio', () => {
    // Envio seg 26/10 → ciência qui 05/11 → início sex 06/11 → 5 úteis: 06,09,10,11,12.
    const r = calculateDeadline({ regime: 'civel', startEvent: 'sistema_tacita', eventDate: '2026-10-26', amount: 5 })
    expect(r.referenceDate).toBe('2026-11-05')
    expect(r.fatalDate).toBe('2026-11-12')
  })

  it('consulta da intimação no sábado vale como ciência no dia útil seguinte', () => {
    // Consulta sáb 07/11 → ciência seg 09/11 → início ter 10/11 → 5 úteis: 10..13, 16.
    const r = calculateDeadline({ regime: 'civel', startEvent: 'sistema_ciencia', eventDate: '2026-11-07', amount: 5 })
    expect(r.referenceDate).toBe('2026-11-09')
    expect(r.fatalDate).toBe('2026-11-16')
  })
})

describe('regimes', () => {
  it('administrativo (ex.: recurso ao INSS): 30 dias corridos, vencimento no sábado vai para segunda', () => {
    // Ciência qui 29/10 → dia 30 = sáb 28/11 → seg 30/11.
    const r = calculateDeadline({ regime: 'administrativo', startEvent: 'data_inicial', eventDate: '2026-10-29', amount: 30 })
    expect(r.unit).toBe('dias_corridos')
    expect(r.fatalDate).toBe('2026-11-30')
  })

  it('juizado sem recesso por padrão (e avisa)', () => {
    // Disponibilizado 15/12 → publicado 16/12 → início 17/12: 17,18,21,22,23,24,28,29,30,31 (10) · 01/01 · 04..08/01 (15).
    const r = calculateDeadline({ regime: 'juizado', startEvent: 'djen', eventDate: '2026-12-15', amount: 15 })
    expect(r.fatalDate).toBe('2027-01-08')
    expect(r.warnings.join(' ')).toMatch(/recesso/)
  })

  it('juizado com recesso marcado segue a regra do cível', () => {
    const r = calculateDeadline({ regime: 'juizado', startEvent: 'djen', eventDate: '2026-12-15', amount: 15, applyRecess: true })
    expect(r.fatalDate).toBe('2027-02-08')
  })

  it('trabalhista: dias úteis com recesso', () => {
    const r = calculateDeadline({ regime: 'trabalhista', startEvent: 'djen', eventDate: '2026-12-15', amount: 8 })
    // 17, 18 (2) · recesso · 21,22,25,26,27,28 (8).
    expect(r.fatalDate).toBe('2027-01-28')
  })

  it('prazo em meses sem dia correspondente vence no dia imediato', () => {
    // 31/01/2027 + 1 mês → não há 31/02 → 01/03/2027 (segunda).
    const r = calculateDeadline({ regime: 'fixado_juiz', startEvent: 'data_inicial', eventDate: '2027-01-31', amount: 1, unit: 'meses' })
    expect(r.fatalDate).toBe('2027-03-01')
  })
})

describe('feriados e datas móveis', () => {
  it('Páscoa e datas móveis', () => {
    expect(easterSunday(2026)).toBe('2026-04-05')
    expect(easterSunday(2027)).toBe('2027-03-28')
    expect(movableCourtDates(2026).carnavalTerca).toBe('2026-02-17')
    expect(movableCourtDates(2026).corpusChristi).toBe('2026-06-04')
  })

  it('o motor só embute feriados nacionais por lei (Carnaval e Semana Santa ficam no calendário do tribunal)', () => {
    const dates = nationalHolidays(2026).map(h => h.date)
    expect(dates).toContain('2026-11-20')
    expect(dates).not.toContain(movableCourtDates(2026).carnavalTerca)
    expect(dates).not.toContain(movableCourtDates(2026).sextaSanta)
  })
})

describe('entradas inválidas', () => {
  it('recusa data inválida e prazo não positivo', () => {
    expect(() => calculateDeadline({ regime: 'civel', startEvent: 'djen', eventDate: '2026-02-30', amount: 5 })).toThrow(DeadlineInputError)
    expect(() => calculateDeadline({ regime: 'civel', startEvent: 'djen', eventDate: '2026-10-29', amount: 0 })).toThrow(DeadlineInputError)
  })
})
