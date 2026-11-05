import { describe, expect, it } from 'vitest'
import { calculateDeadline, RULES_VERSION, type CalendarEntry } from './engine'

// Correção 2026.3: suspensão de prazos (CPC, art. 220; CLT, art. 775-A; CPP,
// art. 798-A) suspende o CURSO do prazo, não o expediente. A publicação (dia
// útil seguinte à disponibilização — Lei 11.419/2006, art. 4º, § 3º) acontece
// normalmente dentro da suspensão, e o 1º dia contado é o 1º dia útil depois
// dela. Antes, a publicação era empurrada para depois da suspensão e a contagem
// começava um dia útil mais tarde.

describe('intimação durante o recesso forense (20/12 a 20/01)', () => {
  it('disponibilizada em 12/01 (expediente normal, prazos suspensos): 1º dia contado é 21/01', () => {
    const r = calculateDeadline({ regime: 'civel', startEvent: 'djen', eventDate: '2027-01-12', amount: 15 })
    expect(r.referenceDate).toBe('2027-01-13') // publicação: 1º dia útil seguinte, mesmo no recesso
    expect(r.startDate).toBe('2027-01-21')
    // 21,22,25–29/01 (7) · 01–05/02 (12) · 08,09,10/02 (15) — Carnaval só se cadastrado pelo tribunal
    expect(r.fatalDate).toBe('2027-02-10')
    expect(r.warnings.join(' ')).toMatch(/recesso/)
    expect(r.rulesVersion).toBe(RULES_VERSION)
  })

  it('disponibilizada no último dia do recesso (19/01 → publicação 20/01): começa em 21/01, não 22/01', () => {
    const r = calculateDeadline({ regime: 'civel', startEvent: 'djen', eventDate: '2027-01-19', amount: 5 })
    expect(r.referenceDate).toBe('2027-01-20')
    expect(r.startDate).toBe('2027-01-21')
    expect(r.fatalDate).toBe('2027-01-27') // 21, 22, 25, 26, 27
  })

  it('disponibilizada na sexta antes do recesso: publicação na segunda (21/12), contagem só em 21/01', () => {
    const r = calculateDeadline({ regime: 'civel', startEvent: 'djen', eventDate: '2026-12-18', amount: 1 })
    expect(r.referenceDate).toBe('2026-12-21')
    expect(r.startDate).toBe('2027-01-21')
    expect(r.fatalDate).toBe('2027-01-21')
  })

  it('fim de semana e feriado continuam sem publicação dentro do recesso', () => {
    // sexta 15/01/2027 → sábado e domingo não → publicação segunda 18/01
    expect(calculateDeadline({ regime: 'civel', startEvent: 'djen', eventDate: '2027-01-15', amount: 1 }).referenceDate).toBe('2027-01-18')
    // 24/12 → 25/12 (Natal) não → 26/27 fim de semana → 28/12
    expect(calculateDeadline({ regime: 'civel', startEvent: 'djen', eventDate: '2026-12-24', amount: 1 }).referenceDate).toBe('2026-12-28')
  })

  it('trabalhista também suspende (CLT, art. 775-A)', () => {
    const r = calculateDeadline({ regime: 'trabalhista', startEvent: 'djen', eventDate: '2027-01-12', amount: 8 })
    expect(r.startDate).toBe('2027-01-21')
    expect(r.fatalDate).toBe('2027-02-01') // 21,22,25,26,27,28,29/01, 01/02
  })

  it('juizado sem recesso marcado conta normalmente (e avisa)', () => {
    const r = calculateDeadline({ regime: 'juizado', startEvent: 'djen', eventDate: '2027-01-12', amount: 5 })
    expect(r.startDate).toBe('2027-01-14')
    expect(r.fatalDate).toBe('2027-01-20')
    expect(r.warnings.join(' ')).toMatch(/Juizados/)
  })

  it('penal: começa no 1º dia útil após o recesso e corre direto (CPP, arts. 798 e 798-A)', () => {
    const r = calculateDeadline({ regime: 'penal', startEvent: 'djen', eventDate: '2027-01-12', amount: 5 })
    expect(r.startDate).toBe('2027-01-21')
    expect(r.fatalDate).toBe('2027-01-25') // 21, 22, 23, 24, 25 (sábado/domingo contam)
  })
})

describe('suspensão de prazos cadastrada pelo tribunal', () => {
  // Suspensão (ex.: indisponibilidade prolongada / ato do tribunal) de 23 a 27/11/2026
  const calendar: CalendarEntry[] = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27']
    .map(date => ({ date, kind: 'suspension' as const, label: 'Suspensão de prazos', source: 'Portaria do tribunal' }))

  it('publicação cai dentro da suspensão: conta a partir do 1º dia útil depois dela', () => {
    // Disponibilizado qui 19/11 → 20/11 feriado (Consciência Negra) → publicação seg 23/11 (suspenso)
    const r = calculateDeadline({ regime: 'civel', startEvent: 'djen', eventDate: '2026-11-19', amount: 5, calendar })
    expect(r.referenceDate).toBe('2026-11-23')
    expect(r.startDate).toBe('2026-11-30')
    expect(r.fatalDate).toBe('2026-12-04')
    expect(r.warnings.join(' ')).toMatch(/suspensão/)
  })

  it('suspensão no meio do prazo não conta', () => {
    // Disponibilizado 16/11 → publicação 17/11 → 18, 19 (2) · 20 feriado · 23–27 suspensos · 30/11 (3), 01/12 (4), 02/12 (5)
    const r = calculateDeadline({ regime: 'civel', startEvent: 'djen', eventDate: '2026-11-16', amount: 5, calendar })
    expect(r.fatalDate).toBe('2026-12-02')
  })
})

describe('marcos de início que não mudaram', () => {
  it('disponibilização na sexta: publicação na segunda, contagem na terça', () => {
    const r = calculateDeadline({ regime: 'civel', startEvent: 'djen', eventDate: '2026-11-06', amount: 15 })
    expect(r.referenceDate).toBe('2026-11-09')
    expect(r.startDate).toBe('2026-11-10')
    // 10,11,12,13 (4) · 16,17,18,19 (8) · 20 feriado · 23–27 (13) · 30/11 (14), 01/12 (15)
    expect(r.fatalDate).toBe('2026-12-01')
  })

  it('ciência tácita (10 dias corridos do envio) em dia de recesso com expediente vale naquele dia', () => {
    // envio 03/01/2027 → +10 = 13/01 (quarta, expediente, prazos suspensos) → ciência 13/01 → conta de 21/01
    const r = calculateDeadline({ regime: 'civel', startEvent: 'sistema_tacita', eventDate: '2027-01-03', amount: 1 })
    expect(r.referenceDate).toBe('2027-01-13')
    expect(r.fatalDate).toBe('2027-01-21')
  })

  it('expediente encerrado mais cedo no dia seguinte à disponibilização adia a publicação (CPC, art. 224, § 1º)', () => {
    const calendar: CalendarEntry[] = [{ date: '2026-11-10', kind: 'altered_hours', label: 'Expediente até 12h', source: 'Portaria' }]
    const r = calculateDeadline({ regime: 'civel', startEvent: 'djen', eventDate: '2026-11-09', amount: 1, calendar })
    expect(r.referenceDate).toBe('2026-11-11')
    expect(r.fatalDate).toBe('2026-11-12')
  })

  it('vencimento em feriado local cadastrado prorroga para o dia útil seguinte', () => {
    const calendar: CalendarEntry[] = [{ date: '2026-11-13', kind: 'holiday', label: 'Feriado municipal', source: 'Lei municipal' }]
    const r = calculateDeadline({ regime: 'civel', startEvent: 'djen', eventDate: '2026-11-05', amount: 5, calendar })
    // publicação 06/11 · 09,10,11,12 (4) · 13 feriado · 16/11 (5)
    expect(r.fatalDate).toBe('2026-11-16')
  })

  it('administrativo em dias corridos: vencimento no domingo vai para segunda', () => {
    const r = calculateDeadline({ regime: 'administrativo', startEvent: 'data_inicial', eventDate: '2026-11-05', amount: 10 })
    expect(r.fatalDate).toBe('2026-11-16') // 15/11 é domingo e feriado → 16/11
  })
})
