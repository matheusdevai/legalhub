import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// ── Mocks estáticos ────────────────────────────────────────────────────────────
vi.mock('./Sidebar', () => ({ Sidebar: () => <div data-testid="sidebar" /> }))

vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }),
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: { user_id: 'user-1', name: 'Test User', email: 't@test.com', role: 'admin', tenant_id: 't1' },
    signOut: vi.fn(),
  }),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }))

import { Layout } from './Layout'
import { supabase } from '@/lib/supabase'

// ── Dados de teste ─────────────────────────────────────────────────────────────
const NOTIFS_MIXED = [
  { id: 'n1', user_id: 'user-1', type: 'task',     title: 'Tarefa vencendo',    message: 'Prazo amanhã',          read: false, link: '/tarefas', created_at: new Date().toISOString() },
  { id: 'n2', user_id: 'user-1', type: 'deadline', title: 'Prazo urgente',      message: null,                    read: false, link: null,       created_at: new Date().toISOString() },
  { id: 'n3', user_id: 'user-1', type: 'system',   title: 'Aviso do sistema',   message: 'Atualização disponível', read: true,  link: null,       created_at: new Date().toISOString() },
]

const NOTIFS_ALL_READ = NOTIFS_MIXED.map(n => ({ ...n, read: true }))

// ── Helpers de mock ────────────────────────────────────────────────────────────
function makeThenableEq() {
  return Object.assign(Promise.resolve({ data: null }), {
    eq: vi.fn().mockResolvedValue({ data: null }),
  })
}

function setupSupabaseMock(notifications: typeof NOTIFS_MIXED = []) {
  const selectChain = {
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn().mockResolvedValue({ data: notifications }),
  }
  selectChain.eq.mockReturnValue(selectChain)
  selectChain.order.mockReturnValue(selectChain)

  const updateChain = { eq: vi.fn(() => makeThenableEq()) }

  vi.mocked(supabase.from).mockReturnValue({
    select: vi.fn().mockReturnValue(selectChain),
    update: vi.fn().mockReturnValue(updateChain),
  } as any)

  return { selectChain, updateChain }
}

function renderLayout() {
  return render(
    <MemoryRouter>
      <Layout>
        <div data-testid="page-content">Conteúdo</div>
      </Layout>
    </MemoryRouter>
  )
}

async function openNotifications() {
  await userEvent.click(screen.getByTitle('Notificações'))
}

// ── Testes ─────────────────────────────────────────────────────────────────────
describe('Layout — botão de notificações', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Prevent DailyAgendaModal from triggering in these tests
    const today = new Date().toISOString().slice(0, 10)
    localStorage.setItem(`lawfy_agenda_${today}_user-1`, '1')
    setupSupabaseMock()
  })

  it('renderiza o botão de notificações', () => {
    renderLayout()
    expect(screen.getByTitle('Notificações')).toBeInTheDocument()
  })

  it('dropdown não está visível antes de clicar', () => {
    renderLayout()
    expect(screen.queryByText('Notificações')).not.toBeInTheDocument()
  })

  it('abre o dropdown ao clicar no sino', async () => {
    setupSupabaseMock([])
    renderLayout()
    await openNotifications()
    expect(screen.getByText('Notificações')).toBeInTheDocument()
  })

  it('fecha o dropdown ao clicar no sino novamente', async () => {
    setupSupabaseMock([])
    renderLayout()
    await openNotifications()
    await userEvent.click(screen.getByTitle('Notificações'))
    await waitFor(() => {
      expect(screen.queryByText('Nenhuma notificação')).not.toBeInTheDocument()
    })
  })
})

// ── Conteúdo do dropdown ──────────────────────────────────────────────────────
describe('Layout — conteúdo do dropdown de notificações', () => {
  beforeEach(() => vi.clearAllMocks())

  it('exibe estado vazio quando não há notificações', async () => {
    setupSupabaseMock([])
    renderLayout()
    await openNotifications()
    await waitFor(() => {
      expect(screen.getByText('Nenhuma notificação')).toBeInTheDocument()
    })
  })

  it('exibe os títulos das notificações', async () => {
    setupSupabaseMock(NOTIFS_MIXED)
    renderLayout()
    await openNotifications()
    await waitFor(() => {
      expect(screen.getByText('Tarefa vencendo')).toBeInTheDocument()
      expect(screen.getByText('Prazo urgente')).toBeInTheDocument()
      expect(screen.getByText('Aviso do sistema')).toBeInTheDocument()
    })
  })

  it('exibe mensagem quando disponível', async () => {
    setupSupabaseMock(NOTIFS_MIXED)
    renderLayout()
    await openNotifications()
    await waitFor(() => {
      expect(screen.getByText('Prazo amanhã')).toBeInTheDocument()
      expect(screen.getByText('Atualização disponível')).toBeInTheDocument()
    })
  })

  it('exibe todas as notificações em ordem', async () => {
    setupSupabaseMock(NOTIFS_MIXED)
    renderLayout()
    await openNotifications()
    await waitFor(() => {
      const titles = screen.getAllByText(/Tarefa vencendo|Prazo urgente|Aviso do sistema/)
      expect(titles).toHaveLength(3)
    })
  })
})

// ── Badge de não lidas ────────────────────────────────────────────────────────
describe('Layout — badge de notificações não lidas', () => {
  beforeEach(() => vi.clearAllMocks())

  it('não exibe badge quando não há notificações carregadas', () => {
    setupSupabaseMock([])
    renderLayout()
    const badge = document.querySelector('.bg-red-500')
    expect(badge).not.toBeInTheDocument()
  })

  it('exibe badge com contagem correta após abrir o painel', async () => {
    setupSupabaseMock(NOTIFS_MIXED)
    renderLayout()
    await openNotifications()
    await waitFor(() => {
      const badge = document.querySelector('.bg-red-500')
      expect(badge).toBeInTheDocument()
      expect(badge?.textContent).toBe('2')
    })
  })

  it('não exibe badge quando todas as notificações são lidas', async () => {
    setupSupabaseMock(NOTIFS_ALL_READ)
    renderLayout()
    await openNotifications()
    await waitFor(() => {
      expect(document.querySelector('.bg-red-500')).not.toBeInTheDocument()
    })
  })
})

// ── Marcar como lida ──────────────────────────────────────────────────────────
describe('Layout — "Marcar todas como lidas"', () => {
  beforeEach(() => vi.clearAllMocks())

  it('botão aparece quando há não lidas', async () => {
    setupSupabaseMock(NOTIFS_MIXED)
    renderLayout()
    await openNotifications()
    await waitFor(() => {
      expect(screen.getByText('Marcar todas como lidas')).toBeInTheDocument()
    })
  })

  it('botão não aparece quando todas são lidas', async () => {
    setupSupabaseMock(NOTIFS_ALL_READ)
    renderLayout()
    await openNotifications()
    await waitFor(() => {
      expect(screen.queryByText('Marcar todas como lidas')).not.toBeInTheDocument()
    })
  })

  it('clicar em "Marcar todas como lidas" remove o badge', async () => {
    setupSupabaseMock(NOTIFS_MIXED)
    renderLayout()
    await openNotifications()
    await waitFor(() => screen.getByText('Marcar todas como lidas'))
    await userEvent.click(screen.getByText('Marcar todas como lidas'))
    await waitFor(() => {
      expect(document.querySelector('.bg-red-500')).not.toBeInTheDocument()
    })
  })

  it('clicar em "Marcar todas como lidas" chama supabase.update', async () => {
    const { updateChain } = setupSupabaseMock(NOTIFS_MIXED)
    renderLayout()
    await openNotifications()
    await waitFor(() => screen.getByText('Marcar todas como lidas'))
    await userEvent.click(screen.getByText('Marcar todas como lidas'))
    await waitFor(() => {
      expect(updateChain.eq).toHaveBeenCalled()
    })
  })
})

// ── Clicar em notificação ─────────────────────────────────────────────────────
describe('Layout — clicar em uma notificação', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockReset()
  })

  it('navega para o link quando a notificação tem link', async () => {
    setupSupabaseMock(NOTIFS_MIXED)
    renderLayout()
    await openNotifications()
    await waitFor(() => screen.getByText('Tarefa vencendo'))
    await userEvent.click(screen.getByText('Tarefa vencendo'))
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/tarefas')
    })
  })

  it('fecha o dropdown após clicar em notificação com link', async () => {
    setupSupabaseMock(NOTIFS_MIXED)
    renderLayout()
    await openNotifications()
    await waitFor(() => screen.getByText('Tarefa vencendo'))
    await userEvent.click(screen.getByText('Tarefa vencendo'))
    await waitFor(() => {
      expect(screen.queryByText('Marcar todas como lidas')).not.toBeInTheDocument()
    })
  })

  it('não navega quando a notificação não tem link', async () => {
    setupSupabaseMock(NOTIFS_MIXED)
    renderLayout()
    await openNotifications()
    await waitFor(() => screen.getByText('Prazo urgente'))
    await userEvent.click(screen.getByText('Prazo urgente'))
    await waitFor(() => {
      expect(mockNavigate).not.toHaveBeenCalled()
    })
  })

  it('chama supabase.update ao clicar em notificação não lida', async () => {
    const { updateChain } = setupSupabaseMock(NOTIFS_MIXED)
    renderLayout()
    await openNotifications()
    await waitFor(() => screen.getByText('Prazo urgente'))
    await userEvent.click(screen.getByText('Prazo urgente'))
    await waitFor(() => {
      expect(updateChain.eq).toHaveBeenCalled()
    })
  })

  it('não chama supabase.update ao clicar em notificação já lida sem link', async () => {
    const { updateChain } = setupSupabaseMock(NOTIFS_MIXED)
    renderLayout()
    await openNotifications()
    await waitFor(() => screen.getByText('Aviso do sistema'))
    await userEvent.click(screen.getByText('Aviso do sistema'))
    await waitFor(() => {
      expect(updateChain.eq).not.toHaveBeenCalled()
    })
  })
})

// ── Interação com outros dropdowns ────────────────────────────────────────────
describe('Layout — interação entre dropdowns', () => {
  beforeEach(() => vi.clearAllMocks())

  it('abre o painel de notificações e fecha ao abrir o dropdown "Adicionar"', async () => {
    setupSupabaseMock([])
    renderLayout()
    await openNotifications()
    await waitFor(() => screen.getByText('Notificações'))
    await userEvent.click(screen.getByText('Adicionar'))
    await waitFor(() => {
      expect(screen.queryByText('Nenhuma notificação')).not.toBeInTheDocument()
    })
  })
})
