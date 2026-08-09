import { supabase } from '@/lib/supabase'
import { Task } from '@/types'

export const RECURRENCE_LABELS: Record<string, string> = {
  weekly: 'Semanalmente',
  monthly: 'Mensalmente',
}

// ─── Recorrência ──────────────────────────────────────────────────────────────
export function nextRecurrenceDueDate(dueDate: string, interval: string | null): string | null {
  if (interval !== 'weekly' && interval !== 'monthly') return null
  const d = new Date(`${dueDate.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  if (interval === 'weekly') d.setDate(d.getDate() + 7)
  else d.setMonth(d.getMonth() + 1)
  return d.toISOString().slice(0, 10)
}

// ─── Concluir tarefa (com disparo de recorrência) ──────────────────────────────
export async function markTaskDone(task: Task): Promise<{ completed_at: string }> {
  const completed_at = new Date().toISOString()
  await supabase.from('tasks').update({ status: 'done', completed_at }).eq('id', task.id)

  if (task.recurring && task.due_date) {
    const nextDueDate = nextRecurrenceDueDate(task.due_date, task.recurrence_interval)
    if (nextDueDate) {
      await supabase.from('tasks').insert({
        title: task.title,
        description: task.description,
        process_id: task.process_id,
        client_id: task.client_id,
        assigned_to: task.assigned_to,
        assigned_name: task.assigned_name,
        due_date: nextDueDate,
        priority: task.priority,
        status: 'pending',
        type: task.type,
        location: task.location,
        all_day: task.all_day,
        recurring: true,
        recurrence_interval: task.recurrence_interval,
      })
    }
  }

  return { completed_at }
}

// ─── Notificação ao atribuir responsável ──────────────────────────────────────
// Usa uma função no banco (SECURITY DEFINER) porque a política de RLS de
// `notifications` só permite ao usuário logado inserir notificação para si
// mesmo — atribuir uma tarefa a um colega exige inserir para outro user_id,
// o que a policy bloquearia numa inserção direta na tabela.
export async function notifyTaskAssignment(userId: string, taskTitle: string): Promise<void> {
  await supabase.rpc('notify_user', {
    target_user_id: userId,
    p_type: 'task',
    p_title: 'Nova tarefa atribuída a você',
    p_message: taskTitle,
    p_link: '/tarefas',
  })
}

// ─── Tarefa de prazo processual, ao editar o prazo de um processo já existente ─
// (a criação de um processo novo já gera essa tarefa via trigger no banco;
// isto cobre o caso de editar o prazo depois que o processo já existe)
export async function ensureProcessDeadlineTask(process: {
  id: string
  number: string
  assigned_lawyer: string | null
  client_id: string | null
}, previousDeadline: string | null, newDeadline: string | null): Promise<void> {
  if (!newDeadline || newDeadline === previousDeadline) return
  await supabase.from('tasks').insert({
    title: `Verificar prazo processual -- ${process.number}`,
    process_id: process.id,
    client_id: process.client_id,
    assigned_name: process.assigned_lawyer,
    due_date: newDeadline,
    priority: 'high',
    type: 'deadline',
    status: 'pending',
  })
}
