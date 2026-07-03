import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// ── Mocks estáticos ────────────────────────────────────────────────────────────
vi.mock('./Sidebar', () => ({ Sidebar: () => <div data-testid="sidebar" /> }))
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }) }))
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: { user_id: 'u1', name: 'Test', email: 't@t.com', role: 'admin', tenant_id: 'tenant-1' },
    signOut: vi.fn(),
  }),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }))

import { Layout } from './Layout'
import { supabase } from '@/lib/supabase'

// ── Dados de teste ─────────────────────────────────────────────────────────────
const CLIENTS   = [{ id: 'c1', name: 'João Silva', type: 'pf' as const }]
const PROCESSES = [{ id: 'p1', number: '0001/2024', title: 'Ação de Cobrança', client_name: 'João Silva' }]
const TASKS     = [{ id: 't1', title: 'Protocolar petição', status: 'pending' }]

// ── Helper de mock do supabase ─────────────────────────────────────────────────
function makeChain(data: unknown[]) {
  const q: Record<string, unknown> = {}
  q.select  = vi.fn(() => q)
  q.eq      = vi.fn(() => q)
  q.is      = vi.fn(() => q)
  q.ilike   = vi.fn(() => q)
  q.or      = vi.fn(() => q)
  q.limit   = vi.fn(() => Promise.resolve({ data }))
  return q
}

function setupMock(clients = CLIENTS, processes = PROCESSES, tasks = TASKS) {
  let callCount = 0
  vi.mocked(supabase.from).mockImplementation(() => {
    const order = callCount++
    if (order === 0) return makeChain(clients) as any
    if (order === 1) return makeChain(processes) as any
    return makeChain(tasks) as any
  })
}

function renderLayout() {
  return render(
    <MemoryRouter>
      <Layout><div>conteúdo</div></Layout>
    </MemoryRouter>
  )
}

// ── Testes ─────────────────────────────────────────────────────────────────────
describe('Layout — campo de busca (estrutura)', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mockNavigate.mockReset()
    const today = new Date().toISOString().slice(0, 10)
    localStorage.setItem(`lawfy_agenda_${today}_u1`, '1')
    localStorage.setItem(`lawfy_daily_notif_${today}_u1`, '1')
    setupMock()
  })

  it('renderiza o campo de busca', () => {
    renderLayout()
    expect(screen.getByPlaceholderText(/Digite \/ para pesquisar/i)).toBeInTheDocument()
  })

  it('dropdown não aparece antes de digitar', () => {
    renderLayout()
    expect(screen.queryByText('Clientes')).not.toBeInTheDocument()
  })

  it('não abre dropdown com menos de 2 caracteres', async () => {
    renderLayout()
    await userEvent.type(screen.getByPlaceholderText(/Digite \//i), 'a')
    expect(screen.queryByText('Clientes')).not.toBeInTheDocument()
  })

  it('botão X aparece quando há texto digitado', async () => {
    renderLayout()
    await userEvent.type(screen.getByPlaceholderText(/Digite \//i), 'jo')
    expect(document.querySelector('button svg.lucide-x') ?? document.querySelector('[data-lucide="x"]')).toBeDefined()
  })
})

describe('Layout — busca com resultados', () => {
  beforeEach(() => { vi.clearAllMocks(); mockNavigate.mockReset() })

  it('exibe seção Clientes quando há resultados', async () => {
    setupMock(CLIENTS, [], [])
    renderLayout()
    await userEvent.type(screen.getByPlaceholderText(/Digite \//i), 'jo')
    await waitFor(() => expect(screen.getByText('Clientes')).toBeInTheDocument(), { timeout: 1000 })
  })

  it('exibe nome do cliente encontrado', async () => {
    setupMock(CLIENTS, [], [])
    renderLayout()
    await userEvent.type(screen.getByPlaceholderText(/Digite \//i), 'jo')
    await waitFor(() => expect(screen.getByText('João Silva')).toBeInTheDocument(), { timeout: 1000 })
  })

  it('exibe seção Processos quando há resultados', async () => {
    setupMock([], PROCESSES, [])
    renderLayout()
    await userEvent.type(screen.getByPlaceholderText(/Digite \//i), 'co')
    await waitFor(() => expect(screen.getByText('Processos')).toBeInTheDocument(), { timeout: 1000 })
  })

  it('exibe título e número do processo', async () => {
    setupMock([], PROCESSES, [])
    renderLayout()
    await userEvent.type(screen.getByPlaceholderText(/Digite \//i), 'co')
    await waitFor(() => {
      expect(screen.getByText('Ação de Cobrança')).toBeInTheDocument()
      expect(screen.getByText('0001/2024')).toBeInTheDocument()
    }, { timeout: 1000 })
  })

  it('exibe seção Tarefas quando há resultados', async () => {
    setupMock([], [], TASKS)
    renderLayout()
    await userEvent.type(screen.getByPlaceholderText(/Digite \//i), 'pr')
    await waitFor(() => expect(screen.getByText('Tarefas')).toBeInTheDocument(), { timeout: 1000 })
  })

  it('exibe título da tarefa encontrada', async () => {
    setupMock([], [], TASKS)
    renderLayout()
    await userEvent.type(screen.getByPlaceholderText(/Digite \//i), 'pr')
    await waitFor(() => expect(screen.getByText('Protocolar petição')).toBeInTheDocument(), { timeout: 1000 })
  })

  it('exibe os três grupos juntos quando todos têm resultado', async () => {
    setupMock(CLIENTS, PROCESSES, TASKS)
    renderLayout()
    await userEvent.type(screen.getByPlaceholderText(/Digite \//i), 'si')
    await waitFor(() => {
      expect(screen.getByText('Clientes')).toBeInTheDocument()
      expect(screen.getByText('Processos')).toBeInTheDocument()
      expect(screen.getByText('Tarefas')).toBeInTheDocument()
    }, { timeout: 1000 })
  })
})

describe('Layout — busca sem resultados', () => {
  beforeEach(() => { vi.clearAllMocks(); mockNavigate.mockReset() })

  it('exibe mensagem "Nenhum resultado" quando não há dados', async () => {
    setupMock([], [], [])
    renderLayout()
    await userEvent.type(screen.getByPlaceholderText(/Digite \//i), 'xyzzy')
    await waitFor(() => expect(screen.getByText(/Nenhum resultado/i)).toBeInTheDocument(), { timeout: 1000 })
  })

  it('inclui o termo buscado na mensagem de vazio', async () => {
    setupMock([], [], [])
    renderLayout()
    await userEvent.type(screen.getByPlaceholderText(/Digite \//i), 'xyzzy')
    await waitFor(() => expect(screen.getByText(/xyzzy/)).toBeInTheDocument(), { timeout: 1000 })
  })
})

describe('Layout — navegação a partir da busca', () => {
  beforeEach(() => { vi.clearAllMocks(); mockNavigate.mockReset() })

  it('clicar em cliente navega para /clientes', async () => {
    setupMock(CLIENTS, [], [])
    renderLayout()
    await userEvent.type(screen.getByPlaceholderText(/Digite \//i), 'jo')
    await waitFor(() => screen.getByText('João Silva'), { timeout: 1000 })
    await userEvent.click(screen.getByText('João Silva'))
    expect(mockNavigate).toHaveBeenCalledWith('/clientes')
  })

  it('clicar em "Ver todos os clientes" navega para /clientes', async () => {
    setupMock(CLIENTS, [], [])
    renderLayout()
    await userEvent.type(screen.getByPlaceholderText(/Digite \//i), 'jo')
    await waitFor(() => screen.getByText(/Ver todos os clientes/i), { timeout: 1000 })
    await userEvent.click(screen.getByText(/Ver todos os clientes/i))
    expect(mockNavigate).toHaveBeenCalledWith('/clientes')
  })

  it('clicar em processo navega para /processos', async () => {
    setupMock([], PROCESSES, [])
    renderLayout()
    await userEvent.type(screen.getByPlaceholderText(/Digite \//i), 'ac')
    await waitFor(() => screen.getByText('Ação de Cobrança'), { timeout: 1000 })
    await userEvent.click(screen.getByText('Ação de Cobrança'))
    expect(mockNavigate).toHaveBeenCalledWith('/processos')
  })

  it('clicar em tarefa navega para /tarefas', async () => {
    setupMock([], [], TASKS)
    renderLayout()
    await userEvent.type(screen.getByPlaceholderText(/Digite \//i), 'pr')
    await waitFor(() => screen.getByText('Protocolar petição'), { timeout: 1000 })
    await userEvent.click(screen.getByText('Protocolar petição'))
    expect(mockNavigate).toHaveBeenCalledWith('/tarefas')
  })

  it('após navegar, o campo de busca é limpo', async () => {
    setupMock(CLIENTS, [], [])
    renderLayout()
    const input = screen.getByPlaceholderText(/Digite \//i)
    await userEvent.type(input, 'jo')
    await waitFor(() => screen.getByText('João Silva'), { timeout: 1000 })
    await userEvent.click(screen.getByText('João Silva'))
    expect(input).toHaveValue('')
  })
})

describe('Layout — atalho de teclado', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mockNavigate.mockReset()
    const today = new Date().toISOString().slice(0, 10)
    localStorage.setItem(`lawfy_agenda_${today}_u1`, '1')
    localStorage.setItem(`lawfy_daily_notif_${today}_u1`, '1')
    setupMock()
  })

  it('Escape limpa o campo de busca', async () => {
    renderLayout()
    const input = screen.getByPlaceholderText(/Digite \//i)
    await userEvent.type(input, 'jo')
    expect(input).toHaveValue('jo')
    await userEvent.keyboard('{Escape}')
    expect(input).toHaveValue('')
  })

  it('Escape fecha o dropdown', async () => {
    setupMock(CLIENTS, [], [])
    renderLayout()
    await userEvent.type(screen.getByPlaceholderText(/Digite \//i), 'jo')
    await waitFor(() => screen.getByText('Clientes'), { timeout: 1000 })
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByText('Clientes')).not.toBeInTheDocument())
  })
})
