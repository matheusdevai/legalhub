import { describe, expect, it } from 'vitest'
import { availableActions, boardColumn, canTransition, deadlineFlags, groupBoard, reviewBlockedReason, validateProtocol } from './workflow'

const base = { status: 'calculado' as const, reviewer_id: 'rev', created_by: 'autor', created_at: '2026-10-29T15:00:00-03:00' }

describe('transições (espelho do banco)', () => {
  it('nada sai de encerrado; protocolar exige estar conferido', () => {
    expect(canTransition('protocolado', 'pronto')).toBe(false)
    expect(canTransition('calculado', 'protocolado')).toBe(false)
    expect(canTransition('conferido', 'protocolado')).toBe(true)
    expect(canTransition('pronto', 'calculado')).toBe(true)
  })
})

describe('availableActions', () => {
  const opts = { soloMode: false, today: '2026-10-30' }

  it('só o conferente designado vê conferir/devolver', () => {
    expect(availableActions(base, 'rev', opts)).toContain('conferir')
    expect(availableActions(base, 'autor', opts)).not.toContain('conferir')
  })

  it('autoconferência: nunca fora do modo solo; no solo, só a partir do dia seguinte', () => {
    const self = { ...base, reviewer_id: 'autor' }
    expect(availableActions(self, 'autor', opts)).not.toContain('conferir')
    expect(availableActions(self, 'autor', { soloMode: true, today: '2026-10-29' })).not.toContain('conferir')
    expect(availableActions(self, 'autor', { soloMode: true, today: '2026-10-30' })).toContain('conferir')
    expect(reviewBlockedReason(self, 'autor', { soloMode: true, today: '2026-10-29' })).toMatch(/amanhã/)
  })

  it('protocolar só depois de conferido; encerrado não tem ações', () => {
    expect(availableActions(base, 'rev', opts)).not.toContain('protocolar')
    expect(availableActions({ ...base, status: 'conferido' }, 'x', opts)).toContain('protocolar')
    expect(availableActions({ ...base, status: 'protocolado' }, 'rev', opts)).toEqual([])
  })
})

describe('painel por urgência', () => {
  it('colunas por dias úteis, pulando fim de semana e feriado', () => {
    const today = '2026-11-18' // quarta
    expect(boardColumn('2026-11-17', today)).toBe('vencidos')
    expect(boardColumn('2026-11-18', today)).toBe('hoje')
    // 19 (1), 20 feriado, 21/22 fim de semana, 23 (2), 24 (3) → ainda "3 dias úteis"
    expect(boardColumn('2026-11-24', today)).toBe('tres_dias')
    expect(boardColumn('2026-11-25', today)).toBe('semana')
    expect(boardColumn('2026-12-10', today)).toBe('depois')
  })

  it('agrupa só os abertos, ordenados pela data fatal', () => {
    const g = groupBoard([
      { status: 'conferido' as const, fatal_date: '2026-11-24' },
      { status: 'calculado' as const, fatal_date: '2026-11-19' },
      { status: 'protocolado' as const, fatal_date: '2026-11-19' },
    ], '2026-11-18')
    expect(g.tres_dias.map(d => d.fatal_date)).toEqual(['2026-11-19', '2026-11-24'])
  })

  it('sinaliza prazo interno vencido e sem conferente', () => {
    const f = deadlineFlags({ status: 'calculado', reviewer_id: null, internal_date: '2026-11-17', manually_adjusted: false }, '2026-11-18')
    expect(f.semConferente).toBe(true)
    expect(f.internoVencido).toBe(true)
  })
})

describe('validateProtocol', () => {
  it('exige data e número ou comprovante', () => {
    expect(validateProtocol({ protocolAt: '', protocolNumber: '123', hasFile: false })).toMatch(/data/)
    expect(validateProtocol({ protocolAt: '2026-11-20T10:00', protocolNumber: '', hasFile: false })).toMatch(/número/)
    expect(validateProtocol({ protocolAt: '2026-11-20T10:00', protocolNumber: '', hasFile: true })).toBeNull()
  })
})
