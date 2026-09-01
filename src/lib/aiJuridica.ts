import { supabase } from '@/lib/supabase'

// Contrato compartilhado do frontend com a Edge Function ai-gemini-assistant.
// Ver FOUNDATION_CONTRACT.md (raiz do work dir da missão) para o documento
// completo. Este arquivo é a única fonte da verdade do shape de request/
// response no frontend — os 6 componentes de ação (src/pages/aiJuridica/actions)
// importam daqui, nunca duplicam o fetch.

export const AI_TIPOS = [
  'analise_processo_administrativo',
  'analise_processo_judicial',
  'analise_documento',
  'peticao_inicial',
  'cumprimento_despacho',
  'impugnacao_recurso',
  'parecer_juridico',
] as const

export type AiTipo = typeof AI_TIPOS[number]

export interface AiGenerationRequest {
  tipo: AiTipo
  processo_id?: string | null
  input_context: Record<string, unknown>
}

export interface AiGenerationResult {
  id: string
  output_text: string
  status: 'completed' | 'error'
  error?: string
}

export async function runAiGeneration(req: AiGenerationRequest): Promise<AiGenerationResult> {
  const { data, error: fnErr } = await supabase.functions.invoke('ai-gemini-assistant', {
    body: req,
  })
  if (fnErr) throw fnErr
  if (data?.error) throw new Error(data.error)
  return data as AiGenerationResult
}
