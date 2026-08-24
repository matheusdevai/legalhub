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
    taskActions.ts           — markTaskDone(), nextRecurrenceDueDate(), RECURRENCE_LABELS ('weekly'|'monthly'|'yearly'), notifyTaskAssignment(), ensureProcessDeadlineTask()
    exportUtils.ts           — openExportWindow() (relatório HTML com CSV/Planilha Google/Docs Google), downloadVCard()
    expenseUtils.ts          — dateParts(), groupExpensesByMonth() (planilha mensal de Minhas Despesas, usado por FinancialsPage)
    clientImportUtils.ts     — buildClientImportPreview() (importação de contatos por CSV, com dedupe contra o banco E dentro do próprio arquivo)
    prazoUtils.ts            — addBusinessDays(), addCalendarDays(), computePrazo() (cálculo de prazo processual, dias úteis/corridos)
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
    dashboard/Dashboard.tsx   — tabs: visao | lista | quadro | desempenho | ia | configuracoes
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
    portal/ClientPortalPage.tsx — portal do cliente (role 'client'), sempre filtrado por profile.client_id
    auth/ResetPassword.tsx    — só habilita o formulário com link de recuperação real (?/#type=recovery), nunca por sessão ativa qualquer
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
| /portal | ClientPortalPage | role 'client' — vê só os próprios processos/financeiro/documentos (filtrados por profile.client_id) |
| /reset-password | ResetPassword | pública, só funcional com link de recuperação de senha válido |

## Roles
`'admin' | 'lawyer' | 'intern' | 'financial' | 'super_admin' | 'client'`
- `'client'` é o papel do Portal do Cliente — `profile.client_id` aponta para o registro em `clients` que esse usuário pode ver. Toda query no ClientPortalPage DEVE filtrar por `.eq('client_id', profile.client_id)` — nunca confiar só em RLS aqui, já existiu um vazamento de dados entre clientes por falta desse filtro.

## Tipos principais (src/types/index.ts)
```ts
Profile    — id, user_id, name, display_name, email, tenant_id, role, avatar, city, oab_number, oab_seccional, onboarding_completed, subscription_status, subscription_plan
Tenant     — id, name, slug, plan ('starter'|'professional'|'enterprise')
Client     — id, tenant_id, type ('pf'|'pj'), name, cpf_cnpj, email, phone, address, status, assigned_lawyer, total_processes, total_billed, notes, assunto, cidade, entry_date, colaborador_id, modalidade, area_direito, colaborador_pago, colaborador_pago_data, colaborador_pago_valor
Process    — id, tenant_id, number, title, client_id, client_name, area, type, status, priority, assigned_lawyer, court, judge, counterparty, description, next_hearing, next_deadline, data_protocolo, modalidade, colaborador_id
Task       — id, tenant_id, title, description, process_id, assigned_to, assigned_name, due_date, priority, status, type, completed_at
Financial  — id, tenant_id, type ('receivable'|'payable'), category, description, amount, due_date, paid_date, status, client_id, client_name, process_id, process_number, notes
UserExpense — id, tenant_id, user_id, category ('process'|'travel'|'food'|'transport'|'accommodation'|'other'), description, amount, expense_date, process_id, trip_destination, reimbursable, reimbursed, notes, receipt_url
ExpenseBudget — id, tenant_id, user_id, category (mesmas de UserExpense), monthly_limit — meta mensal opcional por categoria, 1 por (user_id, category)
CalendarEvent — id, tenant_id, title, type, date, time, end_date, end_time, process_id, client_name, location, description, status, google_event_id, user_id, sync_google
Lead       — id, tenant_id, name, email, phone, area, source, status, assigned_to, value, notes, last_contact
Colaborador — id, tenant_id, nome, email, telefone, cargo, comissao_percent, ativo, notas, cidade
Notification — id, user_id, type, title, message, read, link
ProcessUpdate — id, process_id, type, title, description, date, author
SupportTicket — id, tenant_id, user_id, user_email, user_name, subject, status
SystemAnnouncement — id, title, message, type, created_by
```

## Tabelas Supabase
`profiles`, `tenants`, `clients`, `processes`, `tasks`, `financials`, `user_expenses`, `expense_budgets`, `calendar_events`, `leads`, `colaboradores`, `notifications`, `process_updates`, `support_tickets`, `system_announcements`, `audit_log`, `document_library_templates`, `edge_function_rate_limits`

Soft-delete padrão: `deleted_at = new Date().toISOString()` — nunca deletar registros.

### ⚠️ Este projeto Supabase (`bdpkkacfsavmpumwftsf`) hospeda MAIS DE UM app
Além das tabelas do Lawfy/LegalHub acima (nomes em inglês, isolamento via
`current_tenant_id()` / `is_client_user()` / `current_client_id()` — todas
lidas de `profiles`), o mesmo projeto tem um sistema **completamente
diferente** com tabelas em português: `escritorios`, `perfis`, `clientes`,
`obrigacoes`, `tarefas`, e funções próprias `lh_get_tenant_id()` /
`lh_get_client_id()` / `lh_handle_new_user()` (lidas de `lh_tenants`, não de
`profiles`). Há também tabelas `agent_*` e `pje_*` de outra(s) integração(ões).
**Nunca** confundir os dois — ao mexer em RLS/migrations, confirme antes via
`list_tables`/`pg_policies` qual função de tenant a tabela em questão usa.

### RLS — pontos já auditados nesta sessão
- `documents` (bucket de storage, público) não tinha NENHUMA policy em
  `storage.objects` → uploads de `DocumentsPage.tsx`/`ProcessesPage.tsx`
  estavam sendo negados silenciosamente. Corrigido: policy por tenant usando
  o 1º segmento do path (`{tenant_id}/...`), mesma convenção usada por ambas
  as páginas.
- `user_expenses` só isolava por `tenant_id` — qualquer usuário autenticado do
  mesmo escritório conseguia ler/editar despesas pessoais de colegas via API
  direta. Corrigido: policy agora também exige `user_id = auth.uid()`.
- `expense_budgets` (nova) já nasce com o mesmo isolamento por dono.
- Funções sem `search_path` fixo (`create_default_tasks_for_process`,
  `current_tenant_id`, `update_updated_at`, `update_pje_updated_at`,
  `set_pje_queue_tenant`, `cleanup_trash`, `sync_client_process_count`,
  `update_documents_updated_at`) receberam `SET search_path = public, pg_temp`.
- **Não corrigido de propósito** (risco de quebrar fluxo existente sem mais
  contexto — revisar manualmente antes de mexer): várias funções
  `SECURITY DEFINER` são executáveis por `anon`/`authenticated` via RPC
  (`notify_user`, `auto_set_tenant_id`, `handle_new_user`, etc. — algumas são
  intencionais, ex. `notify_user` precisa disso para notificar outro usuário);
  extensões `pg_net`/`pg_trgm` instaladas no schema `public`; "Leaked Password
  Protection" desabilitado no Auth (ativar no Dashboard, não há API/migration
  para isso).

## Env vars
```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

## Storage Supabase
- Bucket `avatars` (público, policy aberta). Upload via `supabase.storage.from('avatars').upload(path, file)` → URL pública com `getPublicUrl`.
- Bucket `documents` (público, mas com RLS por tenant em `storage.objects`). Path sempre `{tenant_id}/...` como primeiro segmento — é o que a policy `documents_bucket_tenant_isolation` exige. Usado por: anexos de processo (`ProcessesPage.tsx`, path `{tenant_id}/{processId}/...`), documentos (`DocumentsPage.tsx`, path `{tenant_id}/...`), comprovantes de despesa pessoal (`FinancialsPage.tsx`, path `{tenant_id}/receipts/...`).
- Bucket `documentos` (privado) e `lh_secrets` — pertencem ao OUTRO sistema hospedado neste projeto Supabase (ver seção "Tabelas Supabase" acima). Não usar no Lawfy.

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
- **Cliente duplicado (nome/telefone parecido)** → sugestão de autopreenchimento em ClientsPage NUNCA inclui `cpf_cnpj` (o match é por nome/telefone, não pelo documento — preencher CPF automaticamente arriscaria transplantar o documento de uma pessoa errada)
- **Importação de clientes por CSV** → dedupe cobre tanto clientes já cadastrados quanto linhas repetidas dentro do próprio arquivo (`buildClientImportPreview` em `src/lib/clientImportUtils.ts`)
- **Tarefa recorrente** → `markTaskDone()`/`nextRecurrenceDueDate()` em `src/lib/taskActions.ts` suportam `weekly|monthly|yearly` e respeitam `recurrence_end_date` (não gera a próxima ocorrência se ela ultrapassar a data-limite)
- **Sincronização OAB (CNJ/PJe)** → ao trocar a seccional (UF), `swapSeccionalTribunal()` em `OabSyncModal.tsx` troca o TJ da UF anterior pelo novo (nunca deixa o tribunal antigo "grudado" na lista)
- **Minhas Despesas (Financeiro)** → planilha mensal (`groupExpensesByMonth`), upload de comprovante (`receipt_url`, bucket `documents`), seleção em massa para "marcar como reembolsado", metas de orçamento por categoria (`expense_budgets`) com barra de progresso do mês corrente, exportação (CSV/planilha/PDF) via `openExportWindow`
- **create-user (Edge Function)** → rate limit de 10 chamadas/hora por admin chamador, contra a tabela `edge_function_rate_limits` (padrão a replicar em outras Edge Functions sensíveis, ex. `delete-user`, `criar-acesso-cliente`)

## Dashboard — tabs
| Tab | Conteúdo |
|---|---|
| visao | Stats (concluídas/hoje/pendentes/vencidas), lista de tasks, mini-calendário |
| lista | Tabela de tasks com seções "Não lidas" / "Todas as demais" |
| quadro | Kanban: Todas / Hoje / Próximos / Fazendo / Concluídas hoje |
| desempenho | Stats + Taskscore (gráfico) + Atividades concluídas + calendário completo |
| ia | Copiloto / Inteligência Artificial |
| configuracoes | DashConfiguracoes: só a Caixa de entrada (seções reordenáveis) + callout linkando para /configuracoes (configurações gerais do escritório ficam lá, não aqui) |

`task.description` de tarefas geradas automaticamente pode conter um prefixo interno `client_id:{uuid} | ` (usado por `requestComplete()` em TasksPage para pré-preencher o cliente ao concluir). Nunca exibir esse prefixo ao usuário — use `displayTaskDescription()` de `src/lib/taskActions.ts` em qualquer lugar que renderize `task.description`.

## Processos — campos especiais
- Fases: `NEGOCIAÇÃO | CONHECIMENTO | RECURSAL | EXECUÇÃO | ENCERRADO`
- Grupos de ação: Cível, Criminal, Trabalhista, Tributário, Administrativo, Família, Previdenciário, Empresarial, Imobiliário, Outro
- Campos ADVBOX: grupo_acao, fase, etapa, numero_protocolo, processo_originario, pasta_caso, valor_causa, valor_honorarios, percentual_honorarios, contingenciamento
- View modes: table | byColaborador

## Financeiro — estrutura
- `type: receivable` = entrada (honorários, reembolso)
- `type: payable` = saída (despesa, comissão)
- `UserExpense` = despesas pessoais do usuário (separado de Financial), isolado por dono (`user_id = auth.uid()`) além do tenant
- Secondary tabs em FinancialsPage: `comissoes | expenses | anual` — `expenses` é "Minhas Despesas" (planilha mensal, ver Comportamentos automáticos)
- Gráficos com recharts (BarChart, LineChart)

## AuthContext — uso
```ts
const { session, user, profile, loading, signIn, signOut, refreshProfile } = useAuth()
// profile.role → controle de acesso
// profile.tenant_id → isolamento multi-tenant
```

## Scripts
```bash
npm run dev            # dev server Vite
npm run build           # tsc + vite build
npm run preview         # preview do build
npm test                # vitest run — testes unitários (src/**/*.test.ts[x])
npm run test:watch      # vitest em modo watch
npm run test:coverage   # vitest run --coverage
npx vitest run src/lib/taskActions.test.ts        # rodar um único arquivo de teste
npx vitest run -t "nome do teste"                 # rodar só um teste pelo nome (any arquivo)
```

## Testes
- Runner: Vitest + jsdom + @testing-library/react (`src/test/setup.ts`).
- Convenção: testar funções puras extraídas para `src/lib/*.ts` (ex: `taskActions.test.ts`, `expenseUtils.test.ts`, `clientImportUtils.test.ts`, `prazoUtils.test.ts`) importando a função real — nunca reimplementar/copiar a lógica dentro do teste.
- Para lógica hoje presa dentro de um componente grande (useMemo/handlers inline), preferir extrair para um módulo em `src/lib/` (ou colocation `nomeDoComponente.ts` ao lado da página) antes de testar, em vez de testar via render de componente — mais rápido e mais fácil de manter.
- Para funções que chamam `supabase` diretamente (ex: `markTaskDone`), mockar com `vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(() => ({...})) } }))`.

## Deploy
Vercel (vercel.json presente). Build: `npm run build`. Output: `dist/`.
- Projeto Vercel: `lawfy-saas` (org `matheusadvjp-9108s-projects`), domínio de produção `legalhubgestor.vercel.app`.
- Deploy manual (sem depender do estado do git): `npx vercel --prod` a partir da raiz do projeto (usa `.vercel/project.json` já linkado).
- Edge Functions (`supabase/functions/*`) são deployadas separadamente via Supabase (MCP `deploy_edge_function` ou `supabase functions deploy <nome>`) — `npm run build`/`vercel --prod` NÃO as publica.
