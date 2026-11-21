import { describe, expect, it } from 'vitest'
import { calculateDeadline } from '@/lib/deadlines/engine'
import {
  DEMO_FINANCE_ITEMS, DEMO_INTIMACOES, DEMO_OPENING_BALANCE, buildDemoFinancials, computeDemoDeadline,
  demoCalendarRows, demoCashFlow, demoDefaultDate, demoRegimeFor, demoTimeline, demoUnitFor, mentionsDoubled,
  niceCeil, triageIntimacao, type DemoFinanceItem,
} from './landingDemo'

describe('calculadora de prazo (demonstração)', () => {
  it('sugere o regime pelo tribunal, como a tela Intimações', () => {
    expect(demoRegimeFor('trt13')).toBe('trabalhista')
    expect(demoRegimeFor('tjpb')).toBe('civel')
    expect(demoUnitFor('penal')).toBe('dias_corridos')
    expect(demoUnitFor('civel')).toBe('dias_uteis')
  })

  it('marco DJEN: publica no dia útil seguinte e conta a partir do próximo', () => {
    // Disponibilizado na quinta 05/03/2026 → publicado sexta 06/03 → 1º dia segunda 09/03.
    const d = computeDemoDeadline({ court: 'tjpb', regime: 'civel', disponibilizacao: '2026-03-05', amount: 5, doubled: false })
    expect(d.error).toBe('')
    expect(d.result).toMatchObject({ referenceDate: '2026-03-06', startDate: '2026-03-09', fatalDate: '2026-03-13' })
    expect(d.countedDays).toBe(5)
    expect(d.calendarSpan).toBe(8)
    // Prazo interno: 2 dias úteis antes do fatal.
    expect(d.result?.internalDate).toBe('2026-03-11')
  })

  it('é o mesmo resultado do motor real com o calendário de exemplo', () => {
    const d = computeDemoDeadline({ court: 'tjpb', regime: 'civel', disponibilizacao: '2026-02-12', amount: 15, doubled: false })
    const direct = calculateDeadline({ regime: 'civel', startEvent: 'djen', eventDate: '2026-02-12', amount: 15 })
    // Sem o calendário do tribunal o motor conta o Carnaval como dia útil: a demonstração vence depois.
    expect(d.result!.fatalDate > direct.fatalDate).toBe(true)
    expect(d.result!.memory.some(m => m.note === 'Carnaval' && m.kind === 'nao_conta')).toBe(true)
  })

  it('o recesso forense suspende a contagem no cível e não no juizado', () => {
    const civel = computeDemoDeadline({ court: 'tjpb', regime: 'civel', disponibilizacao: '2026-12-15', amount: 15, doubled: false })
    const juizado = computeDemoDeadline({ court: 'tjpb', regime: 'juizado', disponibilizacao: '2026-12-15', amount: 15, doubled: false })
    expect(civel.result!.fatalDate > '2027-01-20').toBe(true)
    expect(juizado.result!.fatalDate < civel.result!.fatalDate).toBe(true)
    expect(juizado.result!.warnings.join(' ')).toMatch(/Juizados/)
    expect(civel.skippedDays).toBeGreaterThan(30)
  })

  it('Justiça Federal usa os feriados da Lei 5.010/1966; os outros tribunais, não', () => {
    // 11/08/2026 é terça: sem expediente só na JF.
    const jf = computeDemoDeadline({ court: 'trf5', regime: 'civel', disponibilizacao: '2026-08-06', amount: 5, doubled: false })
    const tj = computeDemoDeadline({ court: 'tjpb', regime: 'civel', disponibilizacao: '2026-08-06', amount: 5, doubled: false })
    expect(jf.result!.fatalDate).toBe('2026-08-17')
    expect(tj.result!.fatalDate).toBe('2026-08-14')
  })

  it('prazo em dobro dobra a quantidade', () => {
    const d = computeDemoDeadline({ court: 'trt13', regime: 'trabalhista', disponibilizacao: '2026-03-05', amount: 8, doubled: true })
    expect(d.result!.amount).toBe(16)
    expect(d.countedDays).toBe(16)
  })

  it('valida a entrada sem lançar erro', () => {
    expect(computeDemoDeadline({ court: 'tjpb', regime: 'civel', disponibilizacao: '2026-02-31', amount: 5, doubled: false }).error).toMatch(/data/)
    expect(computeDemoDeadline({ court: 'tjpb', regime: 'civel', disponibilizacao: '2026-03-05', amount: 0, doubled: false }).error).toMatch(/prazo/)
    expect(computeDemoDeadline({ court: 'tjpb', regime: 'civel', disponibilizacao: '2026-03-05', amount: 500, doubled: false }).result).toBeNull()
  })

  it('a fita de dias não repete datas e termina no fatal, com o prazo interno marcado', () => {
    const d = computeDemoDeadline({ court: 'tjpb', regime: 'civel', disponibilizacao: '2026-03-05', amount: 5, doubled: false })
    const t = demoTimeline(d.result!)
    expect(new Set(t.map(x => x.date)).size).toBe(t.length)
    expect(t[0]).toMatchObject({ date: '2026-03-05', tone: 'marco' })
    expect(t[t.length - 1]).toMatchObject({ date: '2026-03-13', tone: 'fatal', n: 5 })
    expect(t.find(x => x.date === '2026-03-11')?.tone).toBe('interno')
    expect(t.find(x => x.date === '2026-03-07')?.tone).toBe('pula')
  })

  it('calendário de exemplo sempre identifica a origem', () => {
    const rows = demoCalendarRows([2026])
    expect(rows.every(r => r.source_ref)).toBe(true)
    expect(rows.filter(r => r.court === 'trf5').some(r => r.source_ref === 'Lei 5.010/1966, art. 62')).toBe(true)
  })

  it('data inicial sugerida é uma terça de dezembro do ano corrente', () => {
    expect(demoDefaultDate('2026-11-21')).toBe('2026-12-08')
    expect(demoDefaultDate('2027-03-01')).toBe('2027-12-14')
  })
})

describe('triagem de intimação (demonstração)', () => {
  it('exemplo de réplica: leitura clara, 15 dias úteis', () => {
    const ex = DEMO_INTIMACOES.find(e => e.id === 'replica')!
    const t = triageIntimacao(ex.text, ex.regime)
    expect(t.suggestion).toMatchObject({ actType: 'Réplica', amount: 15, confidence: 'alta' })
    expect(t.prazoLabel).toBe('15 dias úteis')
    expect(t.canCalculate).toBe(true)
  })

  it('exemplo trabalhista: prazo legal de 8 dias e alerta de prazo em dobro', () => {
    const ex = DEMO_INTIMACOES.find(e => e.id === 'contrarrazoes')!
    const t = triageIntimacao(ex.text, ex.regime)
    expect(t.suggestion).toMatchObject({ actType: 'Contrarrazões', amount: 8, confidence: 'media' })
    expect(mentionsDoubled(t.suggestion)).toBe(true)
    expect(t.confidenceLabel).toMatch(/confira/)
  })

  it('texto vazio ou sem prazo não permite calcular', () => {
    expect(triageIntimacao('').canCalculate).toBe(false)
    const h = triageIntimacao('Manifeste-se a parte em 48 (quarenta e oito) horas.')
    expect(h.suggestion.confidence).toBe('baixa')
    expect(h.canCalculate).toBe(false)
  })
})

describe('fluxo de caixa (demonstração)', () => {
  it('mensais repetem todo mês; avulsos caem só no mês escolhido', () => {
    const cf = demoCashFlow(DEMO_FINANCE_ITEMS, DEMO_OPENING_BALANCE, 2027)
    expect(cf.opening).toBe(4000)
    expect(cf.months).toHaveLength(12)
    expect(cf.months[0]).toMatchObject({ income: 9000, expense: 9700, result: -700, balance: 3300 })
    expect(cf.months[2].expense).toBe(9700 + 7500)
    expect(cf.months[5].income).toBe(9000 + 18000)
    expect(cf.totalIncome).toBe(9000 * 12 + 18000)
    expect(cf.closing).toBe(4000 + cf.totalResult)
  })

  it('avisa os meses de saldo negativo e o menor saldo', () => {
    const cf = demoCashFlow(DEMO_FINANCE_ITEMS, DEMO_OPENING_BALANCE, 2027)
    // jan 3.300 → fev 2.600 → mar −5.600 (perícia) … jun recupera com o êxito.
    expect(cf.negativeMonths).toContain(2)
    expect(cf.negativeMonths).not.toContain(5)
    expect(cf.lowest.month).toBe(4)
  })

  it('recalcula ao ajustar um lançamento', () => {
    const items: DemoFinanceItem[] = DEMO_FINANCE_ITEMS.map(i => (i.id === 'pericia' ? { ...i, enabled: false } : i))
    expect(demoCashFlow(items, DEMO_OPENING_BALANCE, 2027).negativeMonths).toEqual([])
    const later = DEMO_FINANCE_ITEMS.map(i => (i.id === 'mensalistas' ? { ...i, month: 3 } : i))
    expect(demoCashFlow(later, 0, 2027).months[2].income).toBe(0)
  })

  it('saldo inicial negativo vira saída paga no ano anterior', () => {
    const f = buildDemoFinancials([], -2500, 2027)
    expect(f[0]).toMatchObject({ type: 'payable', amount: 2500, paid_date: '2026-12-31', status: 'paid' })
    expect(demoCashFlow([], -2500, 2027).opening).toBe(-2500)
  })

  it('niceCeil arredonda o eixo para cima', () => {
    expect(niceCeil(0)).toBe(1)
    expect(niceCeil(7300)).toBe(10000)
    expect(niceCeil(-18000)).toBe(20000)
    expect(niceCeil(2100)).toBe(2500)
  })
})
