import type { Task, Financial } from '@/types'

// Central de Pendências do Assistente (milestone 6, seção 8 da spec). Pura
// agregação/categorização sobre dados que já existem em `tasks` e
// `financials` — sem tabela nova, sem CRUD novo (criar/editar continua em
// Tarefas e Financeiro).

export type PendencyCategory = 'documental' | 'processual' | 'financeira' | 'geral'

export const PENDENCY_CATEGORY_ORDER: PendencyCategory[] = ['documental', 'processual', 'financeira', 'geral']

export const PENDENCY_CATEGORY_LABELS: Record<PendencyCategory, string> = {
  documental: 'Documental',
  processual: 'Processual',
  financeira: 'Financeira',
  // A spec original também descreve pendências "administrativas" e separa
  // "do cliente" / "do advogado". O schema hoje não tem nenhum sinal (nem em
  // `tasks` nem em `financials`) que diferencie essas duas direções de quem
  // está esperando o quê de quem, então unificamos tudo isso numa categoria
  // só — ver `categorizeTask` abaixo para o detalhe da heurística.
  geral: 'Geral / Operacional',
}

export type PendencyTaskInput = Pick<
  Task, 'id' | 'title' | 'due_date' | 'priority' | 'status' | 'type' | 'process_id' | 'assigned_name' | 'assigned_to'
>
export type PendencyFinancialInput = Pick<
  Financial, 'id' | 'description' | 'due_date' | 'status' | 'amount' | 'client_name' | 'process_number'
>

export interface PendencyItem {
  id: string
  category: PendencyCategory
  title: string
  subtitle: string | null
  dueDate: string | null
  priority: Task['priority'] | null
  status: string
  amount: number | null
  link: string
  linkLabel: string
  /** ISO date usado só para ordenar dentro da categoria; null ordena por último */
  sortDate: string | null
}

const OPEN_TASK_STATUSES: Array<Task['status']> = ['pending', 'in_progress']
const PENDING_FINANCIAL_STATUSES: Array<Financial['status']> = ['pending', 'overdue']

/**
 * Heurística de categorização de tasks — não existe hoje um campo explícito
 * de "categoria de pendência" no schema, então inferimos a partir de `type`
 * e `process_id`:
 * - `type: 'document'`              → Documental (tarefa explicitamente sobre um documento)
 * - `type: 'deadline' | 'hearing'`  → Processual (ambos amarrados a um ato/prazo processual;
 *   `hearing` não foi mencionado na spec original, mas é claramente processual)
 * - `type: 'custom' | 'meeting'`    → Geral/Operacional, EXCETO quando a tarefa está
 *   vinculada a um processo (`process_id` preenchido) — nesse caso um vínculo direto
 *   com o processo é um sinal melhor que o `type` genérico, então tratamos como Processual.
 *
 * Fora do escopo desta heurística (decisão já tomada, não uma lacuna): distinguir
 * "pendência do cliente" (escritório aguardando o cliente) de "pendência do
 * advogado" (cliente aguardando o escritório) exigiria um sinal de "direção" que
 * não existe em `tasks` hoje — ambas caem juntas em Geral/Operacional.
 */
export function categorizeTask(task: PendencyTaskInput): PendencyCategory {
  if (task.type === 'document') return 'documental'
  if (task.type === 'deadline' || task.type === 'hearing') return 'processual'
  if (task.process_id) return 'processual'
  return 'geral'
}

function taskToPendencyItem(task: PendencyTaskInput): PendencyItem {
  return {
    id: `task-${task.id}`,
    category: categorizeTask(task),
    title: task.title,
    subtitle: task.assigned_name || null,
    dueDate: task.due_date,
    priority: task.priority,
    status: task.status || 'pending',
    amount: null,
    link: '/tarefas',
    linkLabel: 'Resolver em Tarefas',
    sortDate: task.due_date,
  }
}

function financialToPendencyItem(financial: PendencyFinancialInput): PendencyItem {
  return {
    id: `financial-${financial.id}`,
    category: 'financeira',
    title: financial.description,
    subtitle: financial.client_name || financial.process_number || null,
    dueDate: financial.due_date,
    priority: null,
    status: financial.status || 'pending',
    amount: financial.amount,
    link: '/financeiro',
    linkLabel: 'Resolver em Financeiro',
    sortDate: financial.due_date,
  }
}

function sortBySortDate(items: PendencyItem[]): PendencyItem[] {
  return [...items].sort((a, b) => {
    if (a.sortDate === b.sortDate) return 0
    if (!a.sortDate) return 1
    if (!b.sortDate) return -1
    return a.sortDate < b.sortDate ? -1 : 1
  })
}

/**
 * Agrega tasks (abertas, não concluídas/canceladas) e financials (pending/overdue)
 * já filtrados por visibilidade (tenant + regra de papel replicada pelo chamador)
 * nas 4 categorias da Central de Pendências, ordenadas por prazo (sem prazo por último).
 */
export function buildPendencies(
  tasks: PendencyTaskInput[],
  financials: PendencyFinancialInput[],
): Record<PendencyCategory, PendencyItem[]> {
  const grouped: Record<PendencyCategory, PendencyItem[]> = { documental: [], processual: [], financeira: [], geral: [] }

  for (const task of tasks) {
    if (!OPEN_TASK_STATUSES.includes(task.status)) continue
    const item = taskToPendencyItem(task)
    grouped[item.category].push(item)
  }

  for (const financial of financials) {
    if (!PENDING_FINANCIAL_STATUSES.includes(financial.status)) continue
    grouped.financeira.push(financialToPendencyItem(financial))
  }

  for (const category of PENDENCY_CATEGORY_ORDER) {
    grouped[category] = sortBySortDate(grouped[category])
  }
  return grouped
}
