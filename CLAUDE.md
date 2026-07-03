# Lawfy — Referência rápida para Claude

## Stack
- React 18 + TypeScript + Vite
- Tailwind CSS 3 (dark mode via class)
- Supabase (auth, banco, storage)
- React Router v6
- date-fns + lucide-react + recharts
- Sem react-query nas páginas (estado local + supabase direto)

## Estrutura de arquivos-chave
```
src/
  App.tsx                    — rotas, PrivateRoute, AdminRoute, OnboardingModal
  types/index.ts             — todos os tipos TypeScript
  lib/
    supabase.ts              — createClient singleton
    utils.ts                 — cn(), formatDate(), formatCurrency(), formatCPFCNPJ(), formatPhone(), *_LABELS, *_COLORS
  contexts/
    AuthContext.tsx           — useAuth() → { session, user, profile, loading, signIn, signOut, refreshProfile }
    ThemeContext.tsx          — useTheme() → { theme, toggleTheme }
  components/
    layout/Layout.tsx         — wrapper de todas as páginas, header, sidebar, MaintenanceBanner
    layout/Sidebar.tsx        — nav colapsável (60px / 220px)
    ui/index.tsx              — biblioteca de UI (ver seção abaixo)
    onboarding/OnboardingModal.tsx
  pages/
    auth/Login.tsx
    dashboard/Dashboard.tsx   — tabs: visao | lista | quadro | desempenho | configuracoes
    clients/ClientsPage.tsx
    processes/ProcessesPage.tsx
    tasks/TasksPage.tsx
    financials/FinancialsPage.tsx
    calendar/CalendarPage.tsx
    collaborators/CollaboratorsPage.tsx
    users/UsersPage.tsx
    documents/DocumentsPage.tsx
    publicacoes/PublicacoesPage.tsx
    reports/ReportsPage.tsx
    settings/SettingsPage.tsx
    support/SupportPage.tsx
    admin/AdminPage.tsx       — visível só para super_admin
```

## Rotas
| Path | Componente | Restrição |
|---|---|---|
| /login | Login | pública |
| /dashboard | Dashboard | autenticado |
| /clientes | ClientsPage | autenticado |
| /processos | ProcessesPage | autenticado |
| /tarefas | TasksPage | autenticado |
| /financeiro | FinancialsPage | autenticado |
| /agenda | CalendarPage | autenticado |
| /colaboradores | CollaboratorsPage | autenticado |
| /usuarios | UsersPage | autenticado |
| /documentos | DocumentsPage | autenticado |
| /publicacoes | PublicacoesPage | autenticado |
| /relatorios | ReportsPage | autenticado |
| /configuracoes | SettingsPage | autenticado |
| /suporte | SupportPage | autenticado |
| /admin | AdminPage | super_admin |

## Roles
`'admin' | 'lawyer' | 'intern' | 'financial' | 'super_admin'`

## Tipos principais (src/types/index.ts)
```ts
Profile    — id, user_id, name, display_name, email, tenant_id, role, avatar, city, oab_number, oab_seccional, onboarding_completed, subscription_status, subscription_plan
Tenant     — id, name, slug, plan ('starter'|'professional'|'enterprise')
Client     — id, tenant_id, type ('pf'|'pj'), name, cpf_cnpj, email, phone, address, status, assigned_lawyer, total_processes, total_billed, notes, assunto, cidade, entry_date, colaborador_id, modalidade, area_direito, colaborador_pago, colaborador_pago_data, colaborador_pago_valor
Process    — id, tenant_id, number, title, client_id, client_name, area, type, status, priority, assigned_lawyer, court, judge, counterparty, description, next_hearing, next_deadline, data_protocolo, modalidade, colaborador_id
Task       — id, tenant_id, title, description, process_id, assigned_to, assigned_name, due_date, priority, status, type, completed_at
Financial  — id, tenant_id, type ('receivable'|'payable'), category, description, amount, due_date, paid_date, status, client_id, client_name, process_id, process_number, notes
UserExpense — id, tenant_id, user_id, category ('process'|'travel'|'food'|'transport'|'accommodation'|'other'), description, amount, expense_date, process_id, trip_destination, reimbursable, reimbursed, receipt_url
CalendarEvent — id, tenant_id, title, type, date, time, end_date, end_time, process_id, client_name, location, description, status, google_event_id, user_id, sync_google
Lead       — id, tenant_id, name, email, phone, area, source, status, assigned_to, value, notes, last_contact
Colaborador — id, tenant_id, nome, email, telefone, cargo, comissao_percent, ativo, notas, cidade
Notification — id, user_id, type, title, message, read, link
ProcessUpdate — id, process_id, type, title, description, date, author
SupportTicket — id, tenant_id, user_id, user_email, user_name, subject, status
SystemAnnouncement — id, title, message, type, created_by
```

## Tabelas Supabase
`profiles`, `tenants`, `clients`, `processes`, `tasks`, `financials`, `user_expenses`, `calendar_events`, `leads`, `colaboradores`, `notifications`, `process_updates`, `support_tickets`, `system_announcements`

Soft-delete padrão: `deleted_at = new Date().toISOString()` — nunca deletar registros.

## Env vars
```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

## Storage Supabase
Bucket `avatars` (público). Upload via `supabase.storage.from('avatars').upload(path, file)` → URL pública com `getPublicUrl`.

## Componentes de UI (src/components/ui/index.tsx)
```tsx
<Button variant="primary|secondary|ghost|danger|outline" size="sm|md|lg" loading={bool}>
<Input label="" error="" hint="" />   // forwardRef
<Select label="" error="">            // forwardRef
<Textarea label="" error="" />        // forwardRef
<Card className="">                   // bg-white rounded-2xl shadow-card
<Badge className="">
<Modal open={bool} onClose={fn} title="" size="sm|md|lg|xl">
<EmptyState icon={Icon} title="" description="" />
<Spinner className="" />
<StatsCard label="" value="" icon={Icon} color="blue|green|purple|orange|red|pink|indigo" trend={{ value: number, label: string }} />
```

## Utilitários (src/lib/utils.ts)
```ts
cn(...classes)                          // classnames helper
formatDate(date, fmt='dd/MM/yyyy')      // usa date-fns ptBR, retorna '—' se inválido
formatCurrency(value)                   // Intl pt-BR BRL
formatCPFCNPJ(value)                    // formata CPF (11d) ou CNPJ (14d)
formatPhone(value)                      // formata celular ou fixo

PROCESS_STATUS_LABELS/COLORS           // active|suspended|archived|won|lost|returned
PRIORITY_LABELS/COLORS                 // low|medium|high|urgent
TASK_STATUS_LABELS                     // pending|in_progress|done|cancelled
LEAD_STATUS_LABELS/COLORS              // new|contacted|qualified|proposal|won|lost
FINANCIAL_STATUS_LABELS/COLORS         // pending|paid|overdue|cancelled
ROLE_LABELS                            // admin|lawyer|intern|financial|super_admin
```

## Tailwind — tokens customizados
```
primary-{50..900}  → azul (#2563eb = 600)
dark-{900..500}    → navy profundo (ex: dark-800 = #0f1e36, dark-900 = #0a1628)
shadow-card / shadow-card-hover / shadow-modal / shadow-button / shadow-button-lg
animate-fade-in / animate-slide-up / animate-scale-in
```

Dark mode: `dark:` prefix — toggleado via `document.documentElement.classList.add('dark')`.

## Padrões recorrentes
### Nova página
```tsx
import { Layout } from '@/components/layout/Layout'
export function MinhaPage() {
  return <Layout title="Título">{/* conteúdo */}</Layout>
}
```

### Query Supabase
```ts
const { data } = await supabase.from('tabela').select('*').is('deleted_at', null).order('created_at', { ascending: false })
```

### Navegação para abrir modal automaticamente
```ts
navigate('/rota', { state: { openNew: true } })
// na página destino:
const location = useLocation()
useEffect(() => {
  if ((location.state as any)?.openNew) { openNew(); window.history.replaceState({}, '') }
}, [location.state])
```

### Modal padrão de criação/edição
```tsx
const [modalOpen, setModalOpen] = useState(false)
const [form, setForm] = useState(EMPTY_FORM)
const [editId, setEditId] = useState<string | null>(null)
const [saving, setSaving] = useState(false)

function openNew() { setEditId(null); setForm(EMPTY_FORM); setModalOpen(true) }
function openEdit(item) { setEditId(item.id); setForm({ ...item }); setModalOpen(true) }
async function save() {
  setSaving(true)
  if (editId) await supabase.from('tabela').update(form).eq('id', editId)
  else await supabase.from('tabela').insert(form)
  setSaving(false); setModalOpen(false); load()
}
```

### Paginação
```ts
const PAGE_SIZE = 15
const [page, setPage] = useState(0)
const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
```

### Filtro local com useMemo
```ts
const filtered = useMemo(() => clients.filter(c => {
  const q = search.toLowerCase()
  return (!search || c.name.toLowerCase().includes(q)) && (!statusFilter || c.status === statusFilter)
}), [clients, search, statusFilter])
```

## Comportamentos automáticos importantes
- **Novo cliente** → cria task automática `"Protocolar processo de {nome}"` com description contendo client_id
- **Colaborador pago com valor** → cria/atualiza registro financial (type: payable, category: comissao)
- **Onboarding** → exibido quando `profile.onboarding_completed = false && !oab_number` (ignorável via localStorage `lawfy_onboarding_skipped`)
- **MaintenanceBanner** → banner âmbar descartável no Layout (sessionStorage `maintenance_dismissed`)

## Dashboard — tabs
| Tab | Conteúdo |
|---|---|
| visao | Stats (concluídas/hoje/pendentes/vencidas), Taskscore, lista de tasks, mini-calendário |
| lista | Tabela de tasks com seções "Não lidas" / "Todas as demais" |
| quadro | Kanban: Todas / Hoje / Próximos / Fazendo / Concluídas hoje |
| desempenho | Stats + Taskscore + calendário completo |
| configuracoes | DashConfiguracoes: Caixa de entrada com seções reordenáveis |

## Processos — campos especiais
- Fases: `NEGOCIAÇÃO | CONHECIMENTO | RECURSAL | EXECUÇÃO | ENCERRADO`
- Grupos de ação: Cível, Criminal, Trabalhista, Tributário, Administrativo, Família, Previdenciário, Empresarial, Imobiliário, Outro
- Campos ADVBOX: grupo_acao, fase, etapa, numero_protocolo, processo_originario, pasta_caso, valor_causa, valor_honorarios, percentual_honorarios, contingenciamento
- View modes: table | byColaborador

## Financeiro — estrutura
- `type: receivable` = entrada (honorários, reembolso)
- `type: payable` = saída (despesa, comissão)
- `UserExpense` = despesas pessoais do usuário (separado de Financial)
- Gráficos com recharts (BarChart, LineChart)

## AuthContext — uso
```ts
const { session, user, profile, loading, signIn, signOut, refreshProfile } = useAuth()
// profile.role → controle de acesso
// profile.tenant_id → isolamento multi-tenant
```

## Scripts
```bash
npm run dev      # dev server Vite
npm run build    # tsc + vite build
npm run preview  # preview do build
```

## Deploy
Vercel (vercel.json presente). Build: `npm run build`. Output: `dist/`.
