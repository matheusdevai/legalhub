// Normalização/match de telefone para identificar um `client` existente a
// partir do número que mandou a mensagem no WhatsApp.
//
// Mesma estratégia de ClientsPage.tsx (sugestão de cliente duplicado): compara
// só os últimos 9 dígitos, não o número inteiro. Motivo: telefone de cliente
// no Lawfy é cadastrado em formatos inconsistentes (com/sem DDI 55, com/sem
// DDD, com/sem o 9º dígito do celular, com máscara "(11) 91234-5678"), e o
// `wa_id` que a Meta manda no webhook vem em E.164 sem "+" (ex: "5511912345678").
// Os últimos 9 dígitos (celular BR: DDD de 2 dígitos descartado + 9 dígitos do
// número) são a parte estável entre esses formatos.
export function normalizePhone(value: string | null | undefined): string {
  return (value || '').replace(/\D/g, '')
}

export function phoneNumbersMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = normalizePhone(a)
  const db = normalizePhone(b)
  if (da.length < 9 || db.length < 9) return false
  return da.slice(-9) === db.slice(-9)
}

export function findMatchingClientId(
  incomingPhone: string,
  clients: Array<{ id: string; phone: string | null }>,
): string | null {
  const match = clients.find(c => phoneNumbersMatch(incomingPhone, c.phone))
  return match?.id ?? null
}
