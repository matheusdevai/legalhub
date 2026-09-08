import { supabase } from '@/lib/supabase'

// Contrato do frontend com a Edge Function ai-assistant-chat (chat do
// LegalHub Assistente, milestone 2). Mesmo padrão de src/lib/aiJuridica.ts —
// única fonte da verdade do shape de request/response no frontend.

export const SLASH_COMMANDS = [
  'hoje', 'prazos', 'urgente', 'pendencias', 'clientes', 'processos', 'tarefas', 'agenda', 'documentos', 'resumo',
] as const

export type SlashCommand = typeof SLASH_COMMANDS[number]

export interface AssistantChatResult {
  answer: string
  tools_called: string[]
}

export async function askAssistant(input: { message?: string; slashCommand?: SlashCommand }): Promise<AssistantChatResult> {
  const body = input.slashCommand ? { slash_command: input.slashCommand } : { message: input.message }
  const { data, error: fnErr } = await supabase.functions.invoke('ai-assistant-chat', { body })
  if (fnErr) throw fnErr
  if (data?.error) throw new Error(data.error)
  return data as AssistantChatResult
}

/** Reconhece "/comando" no início da mensagem digitada, se for um dos comandos válidos. */
export function parseSlashCommand(input: string): SlashCommand | null {
  const trimmed = input.trim()
  if (!trimmed.startsWith('/')) return null
  const word = trimmed.slice(1).split(/\s/)[0].toLowerCase()
  return (SLASH_COMMANDS as readonly string[]).includes(word) ? (word as SlashCommand) : null
}
