import { describe, expect, it } from 'vitest'
import { calculateDeadline } from '@/lib/deadlines/engine'
import { AI_SCRIPT, BENTO, DEADLINE_EXAMPLE, deadlineCalendar, shortDateLabel } from './motionData'
import { TOUR } from './landingData'

// import.meta.glob só lista os arquivos de vídeo (não carrega nada); o router vem como texto.
const DEMO_FILES = new Set(Object.keys(import.meta.glob('../../../public/demo/*.{mp4,jpg}', { query: '?url' })))
const ROUTER = Object.values(import.meta.glob('../../../supabase/functions/ai-assistant-chat/router.ts', { query: '?raw', import: 'default', eager: true }))[0] as string

describe('linha do tempo do prazo (exemplo da landing)', () => {
  const result = calculateDeadline({ ...DEADLINE_EXAMPLE.input })
  const byKey = Object.fromEntries(DEADLINE_EXAMPLE.steps.map(s => [s.key, s.date]))

  it('bate com o motor real do Controle de Prazos', () => {
    expect(byKey.disponibilizacao).toBe(DEADLINE_EXAMPLE.input.eventDate)
    expect(byKey.publicacao).toBe(result.referenceDate)
    expect(byKey.inicio).toBe(result.startDate)
    expect(byKey.interno).toBe(result.internalDate)
    expect(byKey.fatal).toBe(result.fatalDate)
    expect(result.amount).toBe(DEADLINE_EXAMPLE.businessDays)
    expect(result.warnings).toEqual([])
  })

  it('o calendário conta os mesmos dias que a memória de cálculo', () => {
    const cells = deadlineCalendar()
    const counted = cells.filter(c => c.n !== undefined).map(c => [c.date, c.n])
    const engineCounted = result.memory.filter(m => m.kind === 'conta').map(m => [m.date, m.n])
    expect(counted).toEqual(engineCounted)
    const skipped = result.memory.filter(m => m.kind === 'nao_conta').map(m => m.date)
    expect(cells.filter(c => c.kind === 'nao_conta').map(c => c.date)).toEqual(skipped)
    expect(skipped).toHaveLength(DEADLINE_EXAMPLE.weekendDaysSkipped)
    expect(cells.length % 7).toBe(0)
    expect(cells.filter(c => c.fatal)).toHaveLength(1)
    expect(cells.filter(c => c.interno)).toHaveLength(1)
  })

  it('formata a data curta sem depender do fuso', () => {
    expect(shortDateLabel('2026-08-06')).toBe('qui · 06/08')
    expect(shortDateLabel('2026-08-28')).toBe('sex · 28/08')
  })
})

describe('bento de funcionalidades', () => {
  it('cada bloco usa uma gravação que existe', () => {
    const ids = new Set(TOUR.map(t => t.id))
    for (const item of BENTO) {
      expect(ids.has(item.video)).toBe(true)
      expect(DEMO_FILES.has(`../../../public/demo/${item.video}.mp4`)).toBe(true)
      expect(DEMO_FILES.has(`../../../public/demo/${item.video}.jpg`)).toBe(true)
    }
  })

  it('fecha linhas cheias na grade de 4 colunas', () => {
    const cells = BENTO.reduce((n, b) => n + ({ big: 4, wide: 2, tall: 2, one: 1 })[b.span], 0)
    expect(cells % 4).toBe(0)
  })
})

describe('demonstração do Assistente', () => {
  const router = ROUTER

  it('só mostra tools que existem no backend real', () => {
    for (const t of AI_SCRIPT.toolCalls) expect(router).toContain(`name: '${t.name}'`)
    expect(router).toContain(`name: '${AI_SCRIPT.proposal.tool}'`)
  })

  it('usa argumentos aceitos pelas tools de leitura', () => {
    expect(AI_SCRIPT.toolCalls[0].args).toMatch(/escopo: "(criticos|proximos|todos)"/)
    expect(AI_SCRIPT.toolCalls[1].args).toMatch(/status: "(pendentes|atrasadas|todas)"/)
  })
})
