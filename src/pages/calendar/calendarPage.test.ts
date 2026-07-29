import { describe, it, expect, beforeEach } from 'vitest'

// ─── Tipos mínimos ─────────────────────────────────────────────────────────────
type MockEvent = {
  id: string; title: string; type: string; date: string; time?: string
  status?: string; location?: string; client_name?: string; description?: string
}

// ─── Réplica exata de matchesSearch() / applyFilters() de CalendarPage ───────
function matchesSearch(e: MockEvent, search: string) {
  if (!search) return true
  const q = search.toLowerCase()
  return Boolean(
    e.title?.toLowerCase().includes(q) ||
    e.location?.toLowerCase().includes(q) ||
    e.client_name?.toLowerCase().includes(q) ||
    e.description?.toLowerCase().includes(q)
  )
}

function applyFilters(list: MockEvent[], opts: { filterShowConcluded?: boolean; filterType?: string; search?: string }) {
  const { filterShowConcluded = false, filterType = '', search = '' } = opts
  return list.filter(e => {
    if (!filterShowConcluded && e.status === 'completed') return false
    if (filterType && e.type !== filterType) return false
    if (!matchesSearch(e, search)) return false
    return true
  })
}

// ─── Réplica exata de toGCalEvent() de CalendarPage ───────────────────────────
function toGCalEvent(form: { title: string; date: string; time?: string; end_date?: string; end_time?: string; location?: string; description?: string; client_name?: string; process_number?: string }) {
  const description = [form.description, form.client_name ? `Cliente: ${form.client_name}` : '', form.process_number ? `Processo: ${form.process_number}` : ''].filter(Boolean).join('\n') || undefined
  if (form.time) {
    return {
      summary: form.title, location: form.location || undefined, description,
      start: { dateTime: `${form.date}T${form.time}:00`, timeZone: 'America/Sao_Paulo' },
      end:   { dateTime: `${form.end_date || form.date}T${form.end_time || form.time}:00`, timeZone: 'America/Sao_Paulo' },
    }
  }
  return {
    summary: form.title, location: form.location || undefined, description,
    start: { date: form.date }, end: { date: form.end_date || form.date },
  }
}

// ─── Réplica exata das chaves de sessionStorage/localStorage do token Google ──
function gTokenKey(uid: string) { return `gcal_token_${uid}` }
function getStoredToken(uid: string): string | null {
  try {
    const raw = sessionStorage.getItem(gTokenKey(uid))
    if (!raw) return null
    const { access_token, expires_at } = JSON.parse(raw)
    if (Date.now() > expires_at - 60_000) return null
    return access_token
  } catch { return null }
}
function storeToken(uid: string, token: string, expiresIn: number) {
  sessionStorage.setItem(gTokenKey(uid), JSON.stringify({ access_token: token, expires_at: Date.now() + expiresIn * 1000 }))
}

const EVENTS: MockEvent[] = [
  { id: 'e1', title: 'Audiência Trabalhista', type: 'hearing', date: '2026-08-01', status: 'scheduled', client_name: 'João Silva' },
  { id: 'e2', title: 'Reunião com cliente', type: 'meeting', date: '2026-08-02', status: 'completed', location: 'Escritório' },
  { id: 'e3', title: 'Prazo recursal', type: 'deadline', date: '2026-08-03', status: 'scheduled', description: 'Prazo fatal do processo 123' },
]

describe('CalendarPage — matchesSearch()', () => {
  it('sem busca aceita tudo', () => {
    expect(matchesSearch(EVENTS[0], '')).toBe(true)
  })
  it('busca por título', () => {
    expect(matchesSearch(EVENTS[0], 'audiência')).toBe(true)
    expect(matchesSearch(EVENTS[1], 'audiência')).toBe(false)
  })
  it('busca por cliente', () => {
    expect(matchesSearch(EVENTS[0], 'joão')).toBe(true)
  })
  it('busca por descrição', () => {
    expect(matchesSearch(EVENTS[2], 'processo 123')).toBe(true)
  })
})

describe('CalendarPage — applyFilters()', () => {
  it('sem filtros oculta eventos concluídos por padrão', () => {
    const r = applyFilters(EVENTS, {})
    expect(r.map(e => e.id)).toEqual(['e1', 'e3'])
  })
  it('filterShowConcluded=true inclui eventos concluídos', () => {
    const r = applyFilters(EVENTS, { filterShowConcluded: true })
    expect(r).toHaveLength(3)
  })
  it('filterType filtra por tipo de evento', () => {
    const r = applyFilters(EVENTS, { filterType: 'deadline', filterShowConcluded: true })
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('e3')
  })
  it('combina busca com filtro de tipo', () => {
    const r = applyFilters(EVENTS, { search: 'audiência', filterType: 'hearing' })
    expect(r).toHaveLength(1)
  })
})

describe('CalendarPage — toGCalEvent()', () => {
  it('evento com horário gera dateTime', () => {
    const g = toGCalEvent({ title: 'Reunião', date: '2026-08-05', time: '14:00' })
    expect(g.start).toEqual({ dateTime: '2026-08-05T14:00:00', timeZone: 'America/Sao_Paulo' })
  })
  it('evento sem horário gera evento de dia inteiro', () => {
    const g = toGCalEvent({ title: 'Feriado', date: '2026-08-05' })
    expect(g.start).toEqual({ date: '2026-08-05' })
  })
  it('descrição combina cliente e número do processo', () => {
    const g = toGCalEvent({ title: 'Audiência', date: '2026-08-05', time: '10:00', client_name: 'Ana', process_number: '0001/2026' })
    expect(g.description).toBe('Cliente: Ana\nProcesso: 0001/2026')
  })
  it('sem end_date/end_time usa a data/hora de início', () => {
    const g = toGCalEvent({ title: 'X', date: '2026-08-05', time: '09:00' })
    expect(g.end).toEqual({ dateTime: '2026-08-05T09:00:00', timeZone: 'America/Sao_Paulo' })
  })
})

describe('CalendarPage — token do Google Calendar em sessionStorage', () => {
  beforeEach(() => { sessionStorage.clear() })

  it('token recém-armazenado é lido normalmente', () => {
    storeToken('u1', 'abc123', 3600)
    expect(getStoredToken('u1')).toBe('abc123')
  })
  it('token expirado retorna null', () => {
    sessionStorage.setItem(gTokenKey('u1'), JSON.stringify({ access_token: 'expired', expires_at: Date.now() - 1000 }))
    expect(getStoredToken('u1')).toBeNull()
  })
  it('ausência de token retorna null sem lançar erro', () => {
    expect(getStoredToken('sem-token')).toBeNull()
  })
  it('token de um usuário não vaza para outro', () => {
    storeToken('u1', 'token-u1', 3600)
    expect(getStoredToken('u2')).toBeNull()
  })
})
