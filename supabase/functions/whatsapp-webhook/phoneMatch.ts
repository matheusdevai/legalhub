// Normalização/match de telefone para identificar um `client` existente a
// partir do número que mandou a mensagem no WhatsApp.
//
// Mesma estratégia de ClientsPage.tsx (sugestão de cliente duplicado): compara
// os últimos 9 dígitos como sinal mínimo de match. Motivo: telefone de cliente
// no Lawfy é cadastrado em formatos inconsistentes (com/sem DDI 55, com/sem
// DDD, com/sem o 9º dígito do celular, com máscara "(11) 91234-5678"), e o
// `wa_id` que a Meta manda no webhook vem em E.164 sem "+" (ex: "5511912345678").
// Os últimos 9 dígitos (celular BR: 9 dígitos do número, sem DDD) são a parte
// estável entre esses formatos.
//
// DIFERENÇA IMPORTANTE em relação a ClientsPage.tsx: lá o match é só uma
// SUGESTÃO que o usuário confirma manualmente antes de qualquer gravação. Aqui
// o client_id é gravado automaticamente, sem humano no loop — então só os
// últimos 9 dígitos não bastam como critério de certeza: dois clientes de DDDs
// diferentes (ex: (11) 91234-5678 e (21) 91234-5678) podem ter o mesmo final,
// e atribuir a mensagem ao cliente errado silenciosamente é pior do que não
// atribuir. Por isso todo match carrega uma CONFIANÇA:
// - 'exact'   → os últimos 11 dígitos batem (DDD + número) — DDI pode diferir
//               (ex: "5511912345678" vs "11912345678" é EXACT, mesmo número
//               real em formatos diferentes).
// - 'partial' → só os últimos 9 dígitos batem, mas o DDD não pôde ser
//               confirmado igual (ou um dos dois números é curto demais pra
//               ter DDD) — candidato plausível, não certeza.
// A Milestone 9 (inbox) usa isso pra distinguir "cliente identificado" de
// "possível cliente — confirme" na UI, em vez de tratar tudo como certeza.
export type ClientMatchConfidence = 'exact' | 'partial'

export function normalizePhone(value: string | null | undefined): string {
  return (value || '').replace(/\D/g, '')
}

function lastDigits(value: string, n: number): string | null {
  return value.length >= n ? value.slice(-n) : null
}

export function phoneMatchConfidence(
  a: string | null | undefined,
  b: string | null | undefined,
): ClientMatchConfidence | null {
  const da = normalizePhone(a)
  const db = normalizePhone(b)

  const last9a = lastDigits(da, 9)
  const last9b = lastDigits(db, 9)
  if (!last9a || !last9b || last9a !== last9b) return null

  const last11a = lastDigits(da, 11)
  const last11b = lastDigits(db, 11)
  if (last11a && last11b && last11a === last11b) return 'exact'

  return 'partial'
}

export type ClientMatch = {
  clientId: string | null
  confidence: ClientMatchConfidence | null
}

export function findMatchingClient(
  incomingPhone: string,
  clients: Array<{ id: string; phone: string | null }>,
): ClientMatch {
  let partialMatch: string | null = null

  for (const client of clients) {
    const confidence = phoneMatchConfidence(incomingPhone, client.phone)
    // Prioriza o primeiro 'exact' encontrado — se existir um cliente cujo DDD
    // também bate, ele é a resposta certa mesmo que outro cliente de DDD
    // diferente também tenha o mesmo final de número (o cenário que motivou
    // essa distinção).
    if (confidence === 'exact') return { clientId: client.id, confidence: 'exact' }
    if (confidence === 'partial' && !partialMatch) partialMatch = client.id
  }

  if (partialMatch) return { clientId: partialMatch, confidence: 'partial' }
  return { clientId: null, confidence: null }
}
