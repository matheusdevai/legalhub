import { describe, expect, it } from 'vitest'

// Espelha em JS a expressão CASE da migration ao lado (mantida em sync
// manualmente — não há como rodar a migration real num teste Vitest). Serve
// pra validar o mapeamento antes de aplicar em produção: tasks.type aceita
// ('deadline'|'hearing'|'document'|'meeting'|'custom'|null), calendar_events.type
// só aceita ('hearing'|'deadline'|'meeting'|'task') via CHECK constraint — o
// mapeamento nunca pode gerar um valor fora desse domínio.
function mappedType(taskType: string | null): 'hearing' | 'deadline' | 'meeting' | 'task' {
  if (taskType === 'hearing' || taskType === 'deadline' || taskType === 'meeting') return taskType
  return 'task'
}

describe('mapeamento tasks.type -> calendar_events.type (migration 20260910120000)', () => {
  it('propaga os tipos que calendar_events aceita diretamente', () => {
    expect(mappedType('deadline')).toBe('deadline')
    expect(mappedType('hearing')).toBe('hearing')
    expect(mappedType('meeting')).toBe('meeting')
  })

  it('cai em "task" para tipos de tasks que calendar_events não aceita', () => {
    expect(mappedType('document')).toBe('task')
    expect(mappedType('custom')).toBe('task')
  })

  it('cai em "task" quando a task não tem type definido (comportamento antigo preservado)', () => {
    expect(mappedType(null)).toBe('task')
  })

  it('nunca retorna um valor fora do CHECK constraint de calendar_events.type', () => {
    const ALLOWED = new Set(['hearing', 'deadline', 'meeting', 'task'])
    const inputs: (string | null)[] = ['deadline', 'hearing', 'meeting', 'document', 'custom', null, 'qualquer-outra-coisa']
    for (const input of inputs) {
      expect(ALLOWED.has(mappedType(input))).toBe(true)
    }
  })
})
