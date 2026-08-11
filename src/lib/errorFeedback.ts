import { toast } from '@/components/ui/Toast'

// ─── Feedback de erro em escritas no banco ─────────────────────────────────────
// A maioria das chamadas .insert()/.update()/.delete() no sistema não checava o
// retorno { error } do Supabase — se a gravação falhasse (RLS, constraint, rede),
// a tela seguia como se tivesse dado certo. Este helper padroniza a checagem:
// envolve a chamada, e se vier erro, avisa o usuário com um prefixo específico
// da ação (ex: "Erro ao salvar processo"). Mantém o mesmo retorno de sempre
// ({ data, error, ... }), então não muda nenhuma lógica existente de call sites.
export async function withErrorFeedback<T extends { error: { message: string } | null }>(
  promise: PromiseLike<T>,
  errorPrefix: string
): Promise<T> {
  const result = await promise
  if (result.error) toast(`${errorPrefix}: ${result.error.message}`, 'error')
  return result
}
