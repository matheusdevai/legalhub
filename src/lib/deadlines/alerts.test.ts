import { describe, expect, it } from 'vitest'
import { brasiliaNow, dueDeadlineAlerts, dueTriageAlerts, type AlertDeadline } from './alerts'

// Mesmo caso do teste de ponta a ponta: cadastrado sexta 30/10/2026 às 20h25 (Brasília),
// fatal 18/11/2026, interno 16/11/2026. Finados (02/11) não conta como dia útil.
const base: AlertDeadline = { status: 'calculado', act_type: 'Réplica', fatal_date: '2026-11-18', internal_date: '2026-11-16', created_at: '2026-10-30T23:25:00Z' }
const rules = (d: Partial<AlertDeadline>, date: string, hour = 9, escalation = 14) =>
  dueDeadlineAlerts({ ...base, ...d }, { date, hour }, [], escalation).map(a => a.rule)

describe('brasiliaNow', () => {
  it('converte UTC para o dia e a hora de Brasília', () => {
    expect(brasiliaNow(new Date('2026-10-30T23:25:00Z'))).toEqual({ date: '2026-10-30', hour: 20 })
    expect(brasiliaNow(new Date('2026-10-31T02:59:00Z'))).toEqual({ date: '2026-10-30', hour: 23 })
  })
})

describe('dueDeadlineAlerts', () => {
  it('na criação avisa só no app', () => {
    const [a] = dueDeadlineAlerts(base, { date: '2026-10-30', hour: 20 })
    expect(a.rule).toBe('criado')
    expect(a.email).toBe(false)
    expect(rules({}, '2026-10-30', 20)).toEqual(['criado'])
  })

  it('sem conferência: 1 dia útil avisa o conferente; 2 dias úteis, também o administrador', () => {
    expect(rules({}, '2026-11-02')).toEqual(['criado']) // sábado, domingo e Finados não contam
    expect(rules({}, '2026-11-03')).toEqual(['criado', 'sem_conferencia_1'])
    expect(rules({}, '2026-11-04')).toEqual(['criado', 'sem_conferencia_1', 'sem_conferencia_2'])
    expect(rules({ status: 'conferido' }, '2026-11-04')).toEqual(['criado'])
  })

  it('D-5 úteis avisa o responsável no app', () => {
    expect(rules({ status: 'conferido' }, '2026-11-10')).toEqual(['criado']) // 6 dias úteis
    expect(rules({ status: 'conferido' }, '2026-11-11')).toEqual(['criado', 'd5'])
  })

  it('prazo interno chegou sem a peça pronta', () => {
    expect(rules({ status: 'em_elaboracao' }, '2026-11-16')).toEqual(['criado', 'd5', 'interno'])
    expect(rules({ status: 'pronto' }, '2026-11-16')).toEqual(['criado', 'd5'])
  })

  it('D-1 útil avisa responsável e conferente', () => {
    expect(rules({ status: 'conferido' }, '2026-11-17')).toEqual(['criado', 'd1', 'interno'])
  })

  it('dia do fatal: 7h para a dupla, e o escalonamento no horário do escritório inclui o administrador', () => {
    expect(rules({ status: 'pronto' }, '2026-11-18', 6)).toEqual(['criado'])
    expect(rules({ status: 'pronto' }, '2026-11-18', 7)).toEqual(['criado', 'fatal_7h'])
    expect(rules({ status: 'pronto' }, '2026-11-18', 14)).toEqual(['criado', 'fatal_7h', 'fatal_escalonamento'])
    expect(rules({ status: 'pronto' }, '2026-11-18', 14, 16)).toEqual(['criado', 'fatal_7h'])
    const esc = dueDeadlineAlerts({ ...base, status: 'pronto' }, { date: '2026-11-18', hour: 15 }).find(a => a.rule === 'fatal_escalonamento')!
    expect(esc.audience).toEqual(['responsible', 'reviewer', 'admins'])
    expect(esc.critical).toBe(true)
  })

  it('depois do fatal sem protocolo, alerta crítico ao administrador', () => {
    const due = dueDeadlineAlerts({ ...base, status: 'conferido' }, { date: '2026-11-19', hour: 8 })
    expect(due.map(a => a.rule)).toEqual(['criado', 'pos_fatal'])
    expect(due[1]).toMatchObject({ audience: ['admins'], critical: true, email: true })
  })

  it('prazo encerrado não gera alerta', () => {
    for (const status of ['protocolado', 'cancelado', 'perdido']) expect(rules({ status }, '2026-11-18', 15)).toEqual([])
  })

  it('respeita feriados do tribunal na contagem regressiva', () => {
    // Com 12 e 13/11 sem expediente, de 11/11 até 18/11 sobram 3 dias úteis.
    const cal = [{ date: '2026-11-12', kind: 'no_court' as const, label: 'x' }, { date: '2026-11-13', kind: 'no_court' as const, label: 'x' }]
    const d5 = dueDeadlineAlerts({ ...base, status: 'conferido' }, { date: '2026-11-11', hour: 9 }, cal).find(a => a.rule === 'd5')!
    expect(d5.title).toContain('3 dias úteis')
  })
})

describe('dueTriageAlerts', () => {
  const c = { created_at: '2026-10-29T12:00:00Z', title: 'Intimação para réplica' }
  it('1 dia útil sem triagem avisa o responsável; 2, também o administrador', () => {
    expect(dueTriageAlerts(c, { date: '2026-10-29' })).toEqual([])
    expect(dueTriageAlerts(c, { date: '2026-10-30' }).map(a => a.rule)).toEqual(['triagem_1'])
    expect(dueTriageAlerts(c, { date: '2026-11-03' }).map(a => a.rule)).toEqual(['triagem_1', 'triagem_2'])
  })
})
