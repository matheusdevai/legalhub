import { describe, it, expect } from 'vitest'

// ─── Réplica exata de FAQ_ITEMS e do filtro de SupportPage ────────────────────
const FAQ_ITEMS = [
  { q: 'Como adicionar um novo usuário ao sistema?', a: 'Acesse Usuários no menu lateral e clique em "+ Novo Usuário". Preencha email, senha e função. O usuário receberá acesso imediatamente.' },
  { q: 'Como integrar o Google Agenda?', a: 'Vá em Agenda > Conectar Google. Você precisará de uma conta Google e autorizar o acesso. Após conectado, os eventos são sincronizados automaticamente.' },
  { q: 'Como exportar relatórios?', a: 'Na tela de Relatórios, use o botão "Exportar" no canto superior direito. Você pode exportar em formato .txt ou usar a função de impressão do navegador para PDF.' },
  { q: 'Como monitorar publicações do Diário de Justiça?', a: 'Acesse Publicações no menu lateral. Clique em "Monitorar Parte" e adicione o CPF/CNPJ ou nome da parte. O sistema verificará diariamente as publicações.' },
  { q: 'Como criar um modelo de documento?', a: 'Acesse Documentos > Novo Documento. Selecione o tipo "Modelo" e use variáveis como [NOME_CLIENTE], [NUMERO_PROCESSO] que serão substituídas automaticamente.' },
]

function filterFaq(items: typeof FAQ_ITEMS, search: string) {
  return items.filter(item =>
    !search || item.q.toLowerCase().includes(search.toLowerCase()) || item.a.toLowerCase().includes(search.toLowerCase())
  )
}

// ─── Réplica exata de STATUS_META (rótulos de tickets) de SupportPage ────────
const STATUS_META: Record<string, { label: string }> = {
  open:        { label: 'Aberto' },
  in_progress: { label: 'Em andamento' },
  resolved:    { label: 'Resolvido' },
  closed:      { label: 'Fechado' },
}

describe('SupportPage — filtro de FAQ', () => {
  it('sem busca retorna todas as perguntas', () => {
    expect(filterFaq(FAQ_ITEMS, '')).toHaveLength(FAQ_ITEMS.length)
  })
  it('busca por termo na pergunta (case-insensitive)', () => {
    const r = filterFaq(FAQ_ITEMS, 'google agenda')
    expect(r).toHaveLength(1)
    expect(r[0].q).toContain('Google Agenda')
  })
  it('busca por termo presente apenas na resposta', () => {
    const r = filterFaq(FAQ_ITEMS, 'NOME_CLIENTE')
    expect(r).toHaveLength(1)
  })
  it('termo inexistente retorna lista vazia', () => {
    expect(filterFaq(FAQ_ITEMS, 'assunto totalmente aleatório xyz')).toHaveLength(0)
  })
})

describe('SupportPage — STATUS_META cobre todos os status usados em tickets', () => {
  it('possui rótulo para cada status conhecido', () => {
    for (const status of ['open', 'in_progress', 'resolved', 'closed']) {
      expect(STATUS_META[status]).toBeDefined()
      expect(STATUS_META[status].label).toBeTruthy()
    }
  })
})
