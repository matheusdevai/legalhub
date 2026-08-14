export interface Profile {
  id: string
  user_id: string
  name: string
  display_name: string
  email: string | null
  tenant_id: string | null
  role: 'admin' | 'lawyer' | 'intern' | 'financial' | 'super_admin' | 'client'
  avatar: string | null
  city: string | null
  phone: string | null
  oab_number: string | null
  oab_seccional: string | null
  onboarding_completed: boolean | null
  subscription_status: string | null
  subscription_plan: string | null
  notification_prefs: NotificationPrefs | null
  client_id: string | null
  created_at: string
  updated_at: string
}

export interface NotificationPrefs {
  new_tasks: boolean
  task_due: boolean
  new_processes: boolean
  new_publications: boolean
  financial_due: boolean
  new_clients: boolean
}

export interface Tenant {
  id: string
  name: string
  slug: string
  plan: 'starter' | 'professional' | 'enterprise' | null
  logo: string | null
  created_at: string | null
  meta_fechamentos_mensal: number | null
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
  beneficio_previdenciario: string | null
  colaborador_pago: boolean | null
  colaborador_pago_data: string | null
  colaborador_pago_valor: number | null
  tags: string[] | null
  lgpd_consent: boolean | null
  lgpd_consent_date: string | null
  origem: string | null
  pais: string | null
  rg: string | null
  birth_date: string | null
  marital_status: string | null
  profession: string | null
  gender: string | null
  nationality: string | null
  celular: string | null
  cep: string | null
  state: string | null
  bairro: string | null
  pis_pasep: string | null
  ctps: string | null
  cid: string | null
  nome_mae: string | null
  avatar_url: string | null
  /** Senha do gov.br do cliente — sensível: nunca incluir em exportações/relatórios */
  senha_gov: string | null
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
  numero_protocolo: string | null
  modalidade: 'judicial' | 'administrativo' | null
  colaborador_id: string | null
  cnj_source: boolean | null
  cnj_synced_at: string | null
  movimentos: ProcessMovimentoAuto[] | null
}

/** Movimentação importada automaticamente via CNJ/DataJud ou PJe (formato varia por fonte) */
export interface ProcessMovimentoAuto {
  nome?: string
  dataHora?: string
  data?: string
  teor?: string
  orgao?: string
  fonte?: string
  parteAdversa?: string
  prazo?: string
  [key: string]: unknown
}

export interface Task {
  id: string
  tenant_id: string
  title: string
  description: string | null
  process_id: string | null
  client_id: string | null
  assigned_to: string | null
  assigned_name: string | null
  due_date: string | null
  priority: 'low' | 'medium' | 'high' | 'urgent' | null
  status: 'pending' | 'in_progress' | 'done' | 'cancelled' | null
  type: 'deadline' | 'hearing' | 'document' | 'meeting' | 'custom' | null
  location: string | null
  all_day: boolean | null
  deadline_date: string | null
  created_at: string | null
  updated_at: string | null
  completed_at: string | null
  deleted_at: string | null
  recurring: boolean | null
  recurrence_interval: 'weekly' | 'monthly' | 'yearly' | null
  recurrence_end_date: string | null
  generated_from_id: string | null
  /** user_id de quem criou/atribuiu a tarefa — usado pra notificar quando ela for concluída */
  created_by: string | null
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
  account_id: string | null
  installment_group_id: string | null
  installment_number: number | null
  installment_total: number | null
  recurring: boolean | null
  recurrence_interval: 'weekly' | 'monthly' | 'yearly' | null
  recurrence_end_date: string | null
  generated_from_id: string | null
  reconciled: boolean | null
  reconciled_in_id: string | null
}

export interface FinancialAccount {
  id: string
  tenant_id: string
  name: string
  created_at: string | null
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

export interface ExpenseBudget {
  id: string
  tenant_id: string
  user_id: string
  category: 'process' | 'travel' | 'food' | 'transport' | 'accommodation' | 'other'
  monthly_limit: number
  created_at: string | null
  updated_at: string | null
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
  task_id: string | null
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
  converted_client_id: string | null
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
  deleted_at: string | null
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
