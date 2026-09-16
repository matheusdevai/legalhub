import { useEffect, useState } from 'react'
import { CheckSquare, X } from 'lucide-react'
import { Modal, Button, Input, Select, Textarea } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { notifyTaskAssignment } from '@/lib/taskActions'
import { toast } from '@/components/ui/Toast'
import type { Task, Process, Client, Profile } from '@/types'

// Modal de criação/edição de tarefa — extraído de TasksPage.tsx pra ser
// reutilizável fora dela (ex: botão "Nova atividade" no card do cliente em
// ClientsPage, com `presetClientId` pré-vinculado). Autossuficiente: carrega
// seus próprios lookups (processos/clientes/responsáveis) quando abre, em vez
// de depender do estado já carregado pela página que o invoca.

type TaskForm = {
  title: string; description: string; process_id: string; client_id: string;
  assigned_name: string; assigned_to: string;
  due_date: string; due_time: string; deadline_date: string;
  priority: string; status: string; type: string;
  location: string;
  show_agenda: boolean; inform_end: boolean; all_day: boolean;
  tag_importante: boolean; tag_urgente: boolean; tag_futura: boolean;
  tag_recorrente: boolean; tag_privada: boolean; tag_retroativa: boolean;
  recurrence_interval: 'weekly' | 'monthly' | 'yearly'; recurrence_end_date: string;
}

const EMPTY_FORM: TaskForm = {
  title: '', description: '', process_id: '', client_id: '', assigned_name: '', assigned_to: '',
  due_date: '', due_time: '', deadline_date: '', priority: 'medium', status: 'pending', type: 'custom',
  location: '',
  show_agenda: false, inform_end: false, all_day: false,
  tag_importante: false, tag_urgente: false, tag_futura: false,
  tag_recorrente: false, tag_privada: false, tag_retroativa: false,
  recurrence_interval: 'monthly', recurrence_end_date: '',
}

interface TaskFormModalProps {
  open: boolean
  onClose: () => void
  /** Presente = modo edição. Ausente/null = criação. */
  task?: Task | null
  /** Pré-vincula e trava o cliente (ex: botão "Nova atividade" no card do cliente). */
  presetClientId?: string | null
  presetClientName?: string | null
  /** Prefill editável (não trava campos) pra criação — ex: seguir de uma tarefa concluída pro mesmo cliente/responsável. */
  initialValues?: Partial<Pick<TaskForm, 'client_id' | 'assigned_to' | 'assigned_name' | 'description'>>
  onSaved?: () => void
}

export function TaskFormModal({ open, onClose, task, presetClientId, presetClientName, initialValues, onSaved }: TaskFormModalProps) {
  const { profile } = useAuth()
  const [processes, setProcesses] = useState<Process[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [systemUsers, setSystemUsers] = useState<Profile[]>([])
  const [form, setForm] = useState<TaskForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    supabase.from('processes').select('id,number,title,modalidade,client_id').is('deleted_at', null).order('title')
      .then(({ data }) => setProcesses((data || []) as Process[]))
    supabase.from('clients').select('id,name').is('deleted_at', null).order('name')
      .then(({ data }) => setClients((data || []) as Client[]))
    supabase.from('profiles').select('id,user_id,name,display_name,role').order('name')
      .then(({ data }) => setSystemUsers((data || []) as Profile[]))
  }, [open])

  useEffect(() => {
    if (!open) return
    if (task) {
      setForm({
        title: task.title, description: task.description || '', process_id: task.process_id || '', client_id: task.client_id || '',
        assigned_name: task.assigned_name || '', assigned_to: task.assigned_to || '',
        due_date: task.due_date?.slice(0, 10) || '', due_time: '', deadline_date: task.deadline_date?.slice(0, 10) || '',
        priority: task.priority || 'medium', status: task.status || 'pending',
        type: task.type || 'custom',
        location: task.location || '', show_agenda: false, inform_end: false, all_day: !!task.all_day,
        tag_importante: task.priority === 'high', tag_urgente: task.priority === 'urgent',
        tag_futura: false, tag_recorrente: !!task.recurring, tag_privada: false, tag_retroativa: false,
        recurrence_interval: task.recurrence_interval || 'monthly', recurrence_end_date: task.recurrence_end_date || '',
      })
    } else {
      setForm({
        ...EMPTY_FORM,
        ...initialValues,
        client_id: presetClientId || initialValues?.client_id || '',
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task, presetClientId])

  async function save() {
    if (!form.title.trim()) return
    setSaving(true)
    const derivedPriority = form.tag_urgente ? 'urgent' : form.tag_importante ? 'high' : form.priority
    const dueDateFull = form.due_date
      ? (form.due_time ? `${form.due_date}T${form.due_time}:00` : form.due_date)
      : null
    const derivedClientId = form.process_id
      ? (processes.find(p => p.id === form.process_id)?.client_id || form.client_id || null)
      : (form.client_id || null)
    const { due_time: _due_time, show_agenda: _show_agenda, inform_end: _inform_end,
      tag_importante: _tag_importante, tag_urgente: _tag_urgente, tag_futura: _tag_futura, tag_recorrente, tag_privada: _tag_privada, tag_retroativa: _tag_retroativa,
      recurrence_interval, recurrence_end_date, client_id: _client_id,
      ...rest } = form
    const payload = {
      ...rest, priority: derivedPriority,
      process_id: form.process_id || null,
      client_id: derivedClientId,
      assigned_to: form.assigned_to || null,
      assigned_name: form.assigned_name || null,
      due_date: dueDateFull,
      deadline_date: form.deadline_date || null,
      recurring: tag_recorrente,
      recurrence_interval: tag_recorrente ? recurrence_interval : null,
      recurrence_end_date: tag_recorrente ? (recurrence_end_date || null) : null,
    }
    const previousAssignedTo = task?.assigned_to || null
    let error: any = null
    if (task) {
      const res = await supabase.from('tasks').update(payload).eq('id', task.id)
      error = res.error
    } else {
      const res = await supabase.from('tasks').insert({ ...payload, created_by: profile?.user_id || null })
      error = res.error
    }
    setSaving(false)
    if (error) { toast(`Erro ao salvar tarefa: ${error.message}`, 'error'); return }
    if (payload.assigned_to && payload.assigned_to !== previousAssignedTo) {
      await notifyTaskAssignment(payload.assigned_to, form.title)
    }
    onClose()
    onSaved?.()
  }

  const lockedClientName = presetClientId
    ? (clients.find(c => c.id === presetClientId)?.name || presetClientName || 'Cliente vinculado')
    : null

  return (
    <Modal open={open} onClose={onClose} title="" size="lg">
      <div className="-mx-6 -mt-6">
        <div className="relative overflow-hidden rounded-t-2xl bg-gradient-to-br from-primary-700 via-primary-600 to-primary-500 text-white px-6 py-5">
          <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
          <div className="absolute right-4 top-4 opacity-20"><CheckSquare className="w-20 h-20" /></div>
          <div className="relative flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white/80 font-medium mb-0.5 uppercase tracking-wider">Tarefa</p>
              <h3 className="text-lg font-bold leading-tight pr-6 line-clamp-2">{task ? 'Editar Tarefa' : 'Criar nova tarefa'}</h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors flex-shrink-0 mt-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-6 pt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Processo ou caso</label>
              <Select value={form.process_id} onChange={e => setForm({ ...form, process_id: e.target.value })}>
                <option value="">Nome do cliente ou número do processo</option>
                {processes.map(p => <option key={p.id} value={p.id}>{p.number} — {p.title}</option>)}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cliente</label>
              {lockedClientName ? (
                <div className="h-10 px-3 flex items-center text-sm rounded-xl border border-gray-200 dark:border-dark-600 bg-gray-50 dark:bg-dark-700 text-gray-600 dark:text-gray-300 truncate">
                  {lockedClientName}
                </div>
              ) : (
                <Select
                  value={form.client_id}
                  onChange={e => setForm({ ...form, client_id: e.target.value })}
                  disabled={!!form.process_id}
                >
                  <option value="">{form.process_id ? 'Definido pelo processo' : 'Vincular a um cliente (opcional)'}</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Responsável <span className="text-red-500">*</span></label>
            <Select
              value={form.assigned_to}
              onChange={e => {
                const user = systemUsers.find(u => u.user_id === e.target.value)
                setForm({ ...form, assigned_to: e.target.value, assigned_name: user ? (user.name || user.display_name || '') : '' })
              }}
            >
              <option value="">Quem vai trabalhar nesta tarefa?</option>
              {systemUsers.map(u => (
                <option key={u.user_id} value={u.user_id}>
                  {u.name || u.display_name} — {u.role === 'admin' ? 'Administrador' : u.role === 'lawyer' ? 'Advogado' : u.role === 'intern' ? 'Estagiário' : u.role === 'financial' ? 'Financeiro' : u.role}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tarefa <span className="text-red-500">*</span></label>
            <div className="flex gap-2">
              <div className="flex-1">
                <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="O que essa pessoa irá fazer?" />
              </div>
              <Select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="w-44 flex-shrink-0">
                <option value="custom">Geral</option>
                <option value="deadline">Prazo</option>
                <option value="hearing">Audiência</option>
                <option value="document">Documento</option>
                <option value="meeting">Reunião</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Data</label>
              <Input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Hora</label>
              <Input type="time" value={form.due_time} onChange={e => setForm({ ...form, due_time: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Prazo fatal</label>
              <Input type="date" value={form.deadline_date} onChange={e => setForm({ ...form, deadline_date: e.target.value })} />
            </div>
          </div>

          <div className="flex items-center gap-5">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.all_day}
                onChange={e => setForm({ ...form, all_day: e.target.checked })}
                className="w-3.5 h-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-xs text-gray-600 dark:text-gray-400">Dia inteiro</span>
            </label>
          </div>

          <div className="hidden">
            <Select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              <option value="pending">Pendente</option>
              <option value="in_progress">Em andamento</option>
              <option value="done">Concluída</option>
              <option value="cancelled">Cancelada</option>
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Local</label>
            <Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Local do evento" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descrição</label>
            <Textarea label="" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Adicione um comentário..." />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {[
              { key: 'tag_importante', label: 'Importante' },
              { key: 'tag_urgente', label: 'Urgente' },
              { key: 'tag_recorrente', label: 'Recorrente' },
              { key: 'tag_privada', label: 'Privada' },
              { key: 'tag_retroativa', label: 'Retroativa' },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={(form as any)[key]}
                  onChange={e => setForm({ ...form, [key]: e.target.checked })}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-xs text-gray-600 dark:text-gray-400">{label}</span>
              </label>
            ))}
          </div>

          {form.tag_recorrente && (
            <div className="grid grid-cols-2 gap-3 p-3 bg-primary-50/50 dark:bg-primary-900/10 rounded-xl border border-primary-100 dark:border-primary-900/30">
              <Select label="Repetir a cada" value={form.recurrence_interval} onChange={e => setForm({ ...form, recurrence_interval: e.target.value as TaskForm['recurrence_interval'] })}>
                <option value="weekly">Semana</option>
                <option value="monthly">Mês</option>
                <option value="yearly">Ano</option>
              </Select>
              <Input label="Repetir até (opcional)" type="date" value={form.recurrence_end_date} onChange={e => setForm({ ...form, recurrence_end_date: e.target.value })} />
              <p className="col-span-2 text-[11px] text-gray-400 dark:text-gray-500">
                Uma nova tarefa idêntica será criada automaticamente na data de vencimento, a partir da próxima geração diária (roda às 6h).
              </p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 px-6 border-t border-gray-100 dark:border-dark-700">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} loading={saving}>{task ? 'Salvar' : 'Criar nova tarefa'}</Button>
        </div>
      </div>
    </Modal>
  )
}
