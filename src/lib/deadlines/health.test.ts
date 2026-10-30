import { describe, expect, it } from 'vitest'
import { healthItems, overallLevel, type HealthCheckRow, type HealthInput } from './health'

const row = (check_key: string, checked_on: string, ok = true, detail: string | null = null): HealthCheckRow =>
  ({ check_key, checked_on, ok, detail, updated_at: `${checked_on}T10:00:00Z` })
const base: HealthInput = {
  now: { date: '2026-11-03', hour: 9 },
  checks: [row('sync_oab:a', '2026-11-03'), row('alertas', '2026-11-03'), row('email', '2026-11-03')],
  sourceCheckedToday: { by: 'Helena' },
  lawyersWithoutOab: [],
  hasOabProfiles: true,
}
const level = (i: Partial<HealthInput>) => overallLevel(healthItems({ ...base, ...i }))
const keys = (i: Partial<HealthInput>, lv: string) => healthItems({ ...base, ...i }).filter(x => x.level === lv).map(x => x.key)

describe('faixa de saúde', () => {
  it('tudo em dia fica verde', () => {
    expect(level({})).toBe('ok')
  })

  it('sincronização que não rodou hoje deixa a faixa vermelha (critério de aceite da seção 12)', () => {
    expect(keys({ checks: [row('sync_oab:a', '2026-11-02'), row('alertas', '2026-11-03'), row('email', '2026-11-03')] }, 'error')).toEqual(['sync'])
  })

  it('antes das 7h aceita o registro de ontem', () => {
    expect(level({ now: { date: '2026-11-03', hour: 6 }, checks: [row('sync_oab:a', '2026-11-02'), row('alertas', '2026-11-02'), row('email', '2026-11-02')] })).toBe('ok')
  })

  it('uma OAB com falha no DJEN deixa vermelho, com o motivo', () => {
    const items = healthItems({ ...base, checks: [...base.checks, row('sync_oab:b', '2026-11-03', false, 'OAB 123/PB: PJe/DJEN: HTTP 503')] })
    expect(items.find(i => i.key === 'sync')).toMatchObject({ level: 'error', detail: 'OAB 123/PB: PJe/DJEN: HTTP 503' })
  })

  it('sem advogado com OAB não há sincronização para vigiar', () => {
    expect(healthItems({ ...base, hasOabProfiles: false, checks: [row('alertas', '2026-11-03')] }).map(i => i.key)).not.toContain('sync')
  })

  it('rotina de alertas parada é vermelho; e-mail desligado, fontes não conferidas e advogado sem OAB são avisos', () => {
    expect(keys({ checks: [row('sync_oab:a', '2026-11-03')] }, 'error')).toEqual(['alertas'])
    expect(keys({ checks: [...base.checks.slice(0, 2), row('email', '2026-11-03', false, 'RESEND_API_KEY não configurada')], sourceCheckedToday: null, lawyersWithoutOab: ['Rafael'] }, 'warn'))
      .toEqual(['email', 'fontes', 'oab'])
  })
})
