import { supabase } from '@/lib/supabase'

// Contrato do frontend com a Edge Function ai-assistant-chat (chat do
// LegalHub Assistente, milestone 2 leitura + milestone 3 escrita com
// confirmação). Mesmo padrão de src/lib/aiJuridica.ts — única fonte da
// verdade do shape de request/response no frontend.

export const SLASH_COMMANDS = [
  'hoje', 'prazos', 'urgente', 'pendencias', 'clientes', 'processos', 'tarefas', 'agenda', 'documentos', 'resumo',
] as const

export type SlashCommand = typeof SLASH_COMMANDS[number]

export type ProposedActionType = 'criar_tarefa' | 'criar_lembrete'

// Ação de escrita proposta pelo modelo — nunca já gravada no banco. `log_id`
// identifica a linha 'proposed' em ai_assistant_logs e precisa voltar junto
// da confirmação/cancelamento (a Edge Function usa ele pra validar dono e
// estado antes de gravar qualquer coisa).
export interface ProposedAction {
  log_id: string
  type: ProposedActionType
  title: string
  description: string | null
  due_date: string | null
  priority: 'low' | 'medium' | 'high' | 'urgent'
  assigned_to: string
  assigned_name: string | null
  note: string | null
}

export interface AssistantChatResult {
  answer: string
  tools_called: string[]
  proposed_action?: ProposedAction | null
}

export async function askAssistant(input: { message?: string; slashCommand?: SlashCommand }): Promise<AssistantChatResult> {
  const body = input.slashCommand ? { slash_command: input.slashCommand } : { message: input.message }
  const { data, error: fnErr } = await supabase.functions.invoke('ai-assistant-chat', { body })
  if (fnErr) throw fnErr
  if (data?.error) throw new Error(data.error)
  return data as AssistantChatResult
}

export interface ConfirmActionInput {
  log_id: string
  type: ProposedActionType
  title: string
  description?: string | null
  due_date?: string | null
  priority?: string | null
  assigned_to: string
}

// Chamada SEPARADA e autenticada, disparada só quando o usuário clica em
// "Confirmar" (ou edita e confirma) no card da UI. Nunca é chamada como
// parte do fluxo de pergunta/resposta do chat.
export async function confirmAssistantAction(input: ConfirmActionInput): Promise<{ task_id: string }> {
  const { data, error: fnErr } = await supabase.functions.invoke('ai-assistant-chat', { body: { confirm_action: input } })
  if (fnErr) throw fnErr
  if (data?.error) throw new Error(data.error)
  return data as { task_id: string }
}

export async function cancelAssistantAction(logId: string): Promise<void> {
  const { data, error: fnErr } = await supabase.functions.invoke('ai-assistant-chat', { body: { cancel_action: { log_id: logId } } })
  if (fnErr) throw fnErr
  if (data?.error) throw new Error(data.error)
}

/** Reconhece "/comando" no início da mensagem digitada, se for um dos comandos válidos. */
export function parseSlashCommand(input: string): SlashCommand | null {
  const trimmed = input.trim()
  if (!trimmed.startsWith('/')) return null
  const word = trimmed.slice(1).split(/\s/)[0].toLowerCase()
  return (SLASH_COMMANDS as readonly string[]).includes(word) ? (word as SlashCommand) : null
}
