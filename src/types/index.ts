export interface Profile {
  id: string
  user_id: string
  name: string
  display_name: string
  email: string | null
  tenant_id: string | null
  role: 'admin' | 'lawyer' | 'intern' | 'financial' | 'super_admin'
  avatar: string | null
  city: string | null
  oab_number: string | null
  oab_seccional: string | null
  onboarding_completed: boolean | null
  subscription_status: string | null
  subscription_plan: string | null
  created_at: string
  updated_at: string
}

export interface Tenant {
  id: string
  name: string
  slug: string
  plan: 'starter' | 'professional' | 'enterprise' | null
  logo: string | null
  created_at: string | null
}

export interface Client {
  id: string
  tenant_id: string
  type: 'pf' | 'pj'
  name: string
  cpf_cnpj: string | null
  email: string | null
  phone: string | null
  address: string | null
  status: 'active' | 'inactive' | 'prospect' | null
  assigned_lawyer: string | null
  total_processes: number | null
  total_billed: number | null
  notes: string | null
  created_at: string | null
  deleted_at: string | null
  assunto: string | null
  cidade: string | null
  entry_date: string | null
  colaborador_id: string | null
  modalidade: 'judicial' | 'administrativo' | null
  area_direito: string | null
  colaborador_pago: boolean | null
  colaborador_pago_data: string | null
  colaborador_pago_valor: number | null
}

export interface Process {
  id: string
  tenant_id: string
  number: string
  title: string
  client_id: string | null
  client_name: string | null
  area: string | null
  type: string | null
  status: 'active' | 'suspended' | 'archived' | 'won' | 'lost' | 'returned' | null
  priority: 'low' | 'medium' | 'high' | 'urgent' | null
  assigned_lawyer: string | null
  court: string | null
  judge: string | null
  counterparty: string | null
  description: string | null
  next_hearing: string | null
  next_deadline: string | null
  created_at: string | null
  updated_at: string | null
  deleted_at: string | null
  data_protocolo: string | null
  modalidade: 'judicial' | 'administrativo' | null
  colaborador_id: string | null
}

export interface Task {
  id: string
  tenant_id: string
  title: string
  description: string | null
  process_id: string | null
  assigned_to: string | null
  assigned_name: string | null
  due_date: string | null
  priority: 'low' | 'medium' | 'high' | 'urgent' | null
  status: 'pending' | 'in_progress' | 'done' | 'cancelled' | null
  type: 'deadline' | 'hearing' | 'document' | 'meeting' | 'custom' | null
  created_at: string | null
  completed_at: string | null
  deleted_at: string | null
}

export interface Financial {
  id: string
  tenant_id: string
  type: 'receivable' | 'payable'
  category: string | null
  description: string
  amount: number
  due_date: string | null
  paid_date: string | null
  status: 'pending' | 'paid' | 'overdue' | 'cancelled' | null
  client_id: string | null
  client_name: string | null
  process_id: string | null
  process_number: string | null
  notes: string | null
  created_at: string | null
  deleted_at: string | null
}

export interface UserExpense {
  id: string
  tenant_id: string
  user_id: string
  category: 'process' | 'travel' | 'food' | 'transport' | 'accommodation' | 'other'
  description: string
  amount: number
  expense_date: string
  process_id: string | null
  process_number: string | null
  trip_destination: string | null
  reimbursable: boolean | null
  reimbursed: boolean | null
  notes: string | null
  receipt_url: string | null
  created_at: string | null
  deleted_at: string | null
}

export interface CalendarEvent {
  id: string
  tenant_id: string
  title: string
  type: 'hearing' | 'deadline' | 'meeting' | 'task' | null
  date: string
  time: string | null
  end_date: string | null
  end_time: string | null
  process_id: string | null
  process_number: string | null
  client_name: string | null
  location: string | null
  description: string | null
  status: 'scheduled' | 'completed' | 'cancelled' | null
  google_event_id: string | null
  user_id: string | null
  sync_google: boolean | null
  created_at: string | null
  deleted_at: string | null
}

export interface Lead {
  id: string
  tenant_id: string
  name: string
  email: string | null
  phone: string | null
  area: string | null
  source: 'website' | 'referral' | 'social' | 'ads' | 'other' | null
  status: 'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost' | null
  assigned_to: string | null
  value: number | null
  notes: string | null
  last_contact: string | null
  created_at: string | null
  deleted_at: string | null
}

export interface Colaborador {
  id: string
  tenant_id: string | null
  nome: string
  email: string | null
  telefone: string | null
  cargo: string | null
  comissao_percent: number | null
  ativo: boolean | null
  notas: string | null
  cidade: string | null
  created_at: string | null
  updated_at: string | null
}

export interface Notification {
  id: string
  user_id: string
  type: 'deadline' | 'hearing' | 'task' | 'payment' | 'system' | null
  title: string
  message: string | null
  read: boolean | null
  link: string | null
  created_at: string | null
}

export interface ProcessUpdate {
  id: string
  process_id: string
  type: string | null
  title: string
  description: string | null
  date: string | null
  author: string | null
  created_at: string | null
}

export interface SupportTicket {
  id: string
  tenant_id: string | null
  user_id: string | null
  user_email: string | null
  user_name: string | null
  subject: string | null
  status: string | null
  created_at: string | null
  updated_at: string | null
}

export interface SystemAnnouncement {
  id: string
  title: string
  message: string
  type: string
  created_by: string | null
  created_at: string | null
}
