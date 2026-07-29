import { describe, it, expect } from 'vitest'

// ─── Tipos mínimos ─────────────────────────────────────────────────────────────
type MockTenant = { id: string; name?: string; slug?: string }
type MockUser = { id: string; name?: string; display_name?: string; email?: string }
type MockAnnouncement = { id: string; title?: string; message?: string }
type MockTicket = { id: string; user_name?: string; user_email?: string; subject?: string; status: string }

// ─── Réplica exata dos filtros de busca global de AdminPage ──────────────────
function filterTenants(tenants: MockTenant[], search: string) {
  const q = search.trim().toLowerCase()
  return q ? tenants.filter(t => t.name?.toLowerCase().includes(q) || t.slug?.toLowerCase().includes(q)) : tenants
}
function filterUsers(users: MockUser[], search: string) {
  const q = search.trim().toLowerCase()
  return q ? users.filter(u => (u.name || u.display_name || '').toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)) : users
}
function filterAnnouncements(items: MockAnnouncement[], search: string) {
  const q = search.trim().toLowerCase()
  return q ? items.filter(a => a.title?.toLowerCase().includes(q) || a.message?.toLowerCase().includes(q)) : items
}
function filterTickets(tickets: MockTicket[], search: string) {
  const q = search.trim().toLowerCase()
  return q ? tickets.filter(t => t.user_name?.toLowerCase().includes(q) || t.user_email?.toLowerCase().includes(q) || t.subject?.toLowerCase().includes(q)) : tickets
}

// ─── Réplica exata do contador de tickets abertos usado no rótulo da aba ─────
function openTicketsCount(tickets: MockTicket[]) {
  return tickets.filter(t => t.status === 'open').length
}

const TENANTS: MockTenant[] = [
  { id: 't1', name: 'Escritório Silva & Associados', slug: 'silva-associados' },
  { id: 't2', name: 'Costa Advocacia', slug: 'costa-adv' },
]
const USERS: MockUser[] = [
  { id: 'u1', name: 'Ana Pereira', email: 'ana@escritorio.com' },
  { id: 'u2', display_name: 'Bruno C.', email: 'bruno@outro.com' },
]
const ANNOUNCEMENTS: MockAnnouncement[] = [
  { id: 'a1', title: 'Manutenção programada', message: 'Sistema indisponível às 22h' },
  { id: 'a2', title: 'Novidade', message: 'Novo módulo de leads disponível' },
]
const TICKETS: MockTicket[] = [
  { id: 'tk1', user_name: 'Ana Pereira', user_email: 'ana@escritorio.com', subject: 'Erro ao salvar processo', status: 'open' },
  { id: 'tk2', user_name: 'Bruno C.', user_email: 'bruno@outro.com', subject: 'Dúvida sobre faturamento', status: 'resolved' },
]

describe('AdminPage — busca de escritórios (tenants)', () => {
  it('sem busca retorna todos', () => {
    expect(filterTenants(TENANTS, '')).toHaveLength(2)
  })
  it('busca por nome', () => {
    const r = filterTenants(TENANTS, 'silva')
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('t1')
  })
  it('busca por slug', () => {
    const r = filterTenants(TENANTS, 'costa-adv')
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('t2')
  })
})

describe('AdminPage — busca de usuários', () => {
  it('busca por name', () => {
    expect(filterUsers(USERS, 'ana')).toHaveLength(1)
  })
  it('busca por display_name quando name ausente', () => {
    const r = filterUsers(USERS, 'bruno')
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('u2')
  })
  it('busca por email', () => {
    expect(filterUsers(USERS, 'outro.com')).toHaveLength(1)
  })
})

describe('AdminPage — busca de avisos e tickets', () => {
  it('avisos: busca por título', () => {
    expect(filterAnnouncements(ANNOUNCEMENTS, 'manutenção')).toHaveLength(1)
  })
  it('avisos: busca por mensagem', () => {
    expect(filterAnnouncements(ANNOUNCEMENTS, 'leads')).toHaveLength(1)
  })
  it('tickets: busca por assunto', () => {
    expect(filterTickets(TICKETS, 'faturamento')).toHaveLength(1)
  })
  it('tickets: busca por nome do usuário', () => {
    expect(filterTickets(TICKETS, 'ana pereira')).toHaveLength(1)
  })
})

describe('AdminPage — contagem de tickets abertos (rótulo da aba)', () => {
  it('conta apenas tickets com status "open"', () => {
    expect(openTicketsCount(TICKETS)).toBe(1)
  })
  it('lista vazia retorna 0', () => {
    expect(openTicketsCount([])).toBe(0)
  })
})
