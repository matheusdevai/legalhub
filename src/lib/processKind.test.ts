import { describe, it, expect } from 'vitest'
import { processKind, adminStatusSummary, matchesAdminStatus, countAdminStatuses } from './processKind'

const base = { admin_status: null, admin_status_at: null, data_requerimento: null, data_protocolo: null, next_deadline: null }
const TODAY = '2026-11-02'

describe('processKind', () => {
  it('só é administrativo o que foi cadastrado assim', () => {
    expect(processKind({ modalidade: 'administrativo' })).toBe('administrativo')
    expect(processKind({ modalidade: 'judicial' })).toBe('judicial')
  })
  it('importado pela sincronização (modalidade nula) conta como judicial', () => {
    expect(processKind({ modalidade: null })).toBe('judicial')
  })
})

describe('adminStatusSummary', () => {
  it('sem situação pede para informar', () => {
    expect(adminStatusSummary(base, TODAY)).toMatchObject({ label: 'Informar situação', tone: 'muted', alert: false })
  })

  it('em análise conta desde a mudança de situação', () => {
    const s = adminStatusSummary({ ...base, admin_status: 'em_analise', admin_status_at: '2026-10-03' }, TODAY)
    expect(s).toMatchObject({ label: 'Em análise', tone: 'info', detail: 'há 30 dias', alert: false })
  })

  it('em análise sem data de mudança conta desde o requerimento', () => {
    const s = adminStatusSummary({ ...base, admin_status: 'em_analise', data_requerimento: '2026-11-01' }, TODAY)
    expect(s.detail).toBe('há 1 dia')
  })

  it('análise de 90 dias ou mais pede atenção', () => {
    expect(adminStatusSummary({ ...base, admin_status: 'em_analise', admin_status_at: '2026-08-04' }, TODAY).alert).toBe(true)
    expect(adminStatusSummary({ ...base, admin_status: 'em_analise', admin_status_at: '2026-08-05' }, TODAY).alert).toBe(false)
  })

  it('exigência mostra quanto falta para cumprir', () => {
    expect(adminStatusSummary({ ...base, admin_status: 'em_exigencia', next_deadline: '2026-11-20' }, TODAY))
      .toMatchObject({ tone: 'warning', detail: 'cumprir em 18 dias', alert: false })
    expect(adminStatusSummary({ ...base, admin_status: 'em_exigencia', next_deadline: '2026-11-05' }, TODAY).alert).toBe(true)
  })

  it('exigência vencendo hoje ou vencida fica vermelha', () => {
    expect(adminStatusSummary({ ...base, admin_status: 'em_exigencia', next_deadline: TODAY }, TODAY))
      .toMatchObject({ tone: 'danger', detail: 'prazo vence hoje', alert: true })
    expect(adminStatusSummary({ ...base, admin_status: 'em_exigencia', next_deadline: '2026-10-31' }, TODAY))
      .toMatchObject({ tone: 'danger', detail: 'prazo vencido há 2 dias' })
  })

  it('exigência sem prazo avisa que falta o prazo', () => {
    expect(adminStatusSummary({ ...base, admin_status: 'em_exigencia', admin_status_at: TODAY }, TODAY).detail).toBe('desde hoje · sem prazo')
  })

  it('concluídos mostram o resultado', () => {
    expect(adminStatusSummary({ ...base, admin_status: 'deferido', admin_status_at: '2026-10-30' }, TODAY))
      .toMatchObject({ label: 'Deferido', tone: 'success', detail: 'concluído há 3 dias' })
    expect(adminStatusSummary({ ...base, admin_status: 'indeferido' }, TODAY))
      .toMatchObject({ label: 'Indeferido', tone: 'danger', detail: 'concluído' })
  })
})

describe('filtro e contagem por situação', () => {
  const list = [{ admin_status: 'em_analise' as const }, { admin_status: 'em_analise' as const }, { admin_status: null }, { admin_status: 'deferido' as const }]
  it('conta por situação, separando os sem situação', () => {
    expect(countAdminStatuses(list)).toEqual({ em_analise: 2, em_exigencia: 0, deferido: 1, indeferido: 0, __sem__: 1 })
  })
  it('filtra', () => {
    expect(list.filter(p => matchesAdminStatus(p, '__sem__'))).toHaveLength(1)
    expect(list.filter(p => matchesAdminStatus(p, 'em_analise'))).toHaveLength(2)
    expect(list.filter(p => matchesAdminStatus(p, ''))).toHaveLength(4)
  })
})
