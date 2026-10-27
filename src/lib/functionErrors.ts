// supabase.functions.invoke() devolve um FunctionsHttpError genérico ("Edge
// Function returned a non-2xx status code") quando a função responde 4xx/5xx;
// a mensagem útil fica no corpo JSON ({ error }) em fnErr.context.
export async function extractFunctionErrorMessage(fnErr: unknown, data: { error?: string } | null): Promise<string> {
  if (data?.error) return data.error
  const withContext = fnErr as { context?: Response; message?: string } | null
  if (withContext?.context && typeof withContext.context.json === 'function') {
    try {
      const body = await withContext.context.json()
      if (body?.error) return body.error
    } catch { /* corpo não era JSON */ }
  }
  return withContext?.message || 'Erro inesperado. Tente novamente.'
}
