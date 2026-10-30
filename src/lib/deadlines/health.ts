// Faixa de saúde do Painel de Prazos (especificação, seção 8): mostra se as
// barreiras que impedem perder prazo estão de pé — sincronização das OABs,
// rotina de alertas, e-mail, conferência diária das fontes e advogados sem OAB.

export interface HealthCheckRow {
  check_key: string
  checked_on: string
  ok: boolean
  detail: string | null
  updated_at: string
}

export type HealthLevel = 'ok' | 'warn' | 'error'

export interface HealthItem {
  key: 'sync' | 'alertas' | 'email' | 'fontes' | 'oab'
  level: HealthLevel
  label: string
  detail?: string
}

export interface HealthInput {
  /** Data e hora local (Brasília). */
  now: { date: string; hour: number }
  checks: HealthCheckRow[]
  /** Alguém do escritório marcou "Conferi as fontes oficiais hoje". */
  sourceCheckedToday: { by: string } | null
  /** Advogados/estagiários sem OAB cadastrada (as intimações deles não chegam). */
  lawyersWithoutOab: string[]
  /** Há advogado com OAB cadastrada (sem isso não existe sincronização a vigiar). */
  hasOabProfiles: boolean
}

const prevDay = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10)

/**
 * Antes das 7h a rotina do dia ainda pode não ter rodado (sincronização às 5h,
 * folga até as 7h): aceita o registro de ontem.
 */
function freshSince(now: HealthInput['now']) {
  return now.hour >= 7 ? now.date : prevDay(now.date)
}

export function healthItems(input: HealthInput): HealthItem[] {
  const since = freshSince(input.now)
  const latest = (prefix: string) => input.checks.filter(c => c.check_key === prefix || c.check_key.startsWith(prefix + ':'))
  const items: HealthItem[] = []

  if (input.hasOabProfiles) {
    const sync = latest('sync_oab').filter(c => c.checked_on >= since)
    const failed = sync.filter(c => !c.ok)
    if (!sync.length) items.push({ key: 'sync', level: 'error', label: 'A sincronização das intimações não rodou hoje', detail: 'Confira as intimações direto nas fontes oficiais até a equipe do LegalHub resolver.' })
    else if (failed.length) items.push({ key: 'sync', level: 'error', label: 'A sincronização do DJEN falhou', detail: failed.map(f => f.detail).filter(Boolean).join(' · ') })
    else items.push({ key: 'sync', level: 'ok', label: 'Intimações sincronizadas' })
  }

  const alertas = latest('alertas').filter(c => c.checked_on >= since).sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]
  if (!alertas) items.push({ key: 'alertas', level: 'error', label: 'A rotina de alertas não rodou hoje', detail: 'Os avisos automáticos de prazo não estão saindo.' })
  else if (!alertas.ok) items.push({ key: 'alertas', level: 'error', label: 'A rotina de alertas falhou', detail: alertas.detail || undefined })
  else items.push({ key: 'alertas', level: 'ok', label: 'Alertas funcionando' })

  const email = latest('email').filter(c => c.checked_on >= since)[0]
  if (email && !email.ok) items.push({ key: 'email', level: 'warn', label: 'E-mail desligado: alertas só pelo app', detail: email.detail || undefined })
  else if (email) items.push({ key: 'email', level: 'ok', label: 'E-mail ok' })

  if (input.sourceCheckedToday) items.push({ key: 'fontes', level: 'ok', label: `Fontes conferidas hoje por ${input.sourceCheckedToday.by}` })
  else items.push({ key: 'fontes', level: 'warn', label: 'Ninguém conferiu as fontes oficiais hoje' })

  if (input.lawyersWithoutOab.length) items.push({ key: 'oab', level: 'warn', label: `Sem OAB cadastrada: ${input.lawyersWithoutOab.join(', ')}`, detail: 'As intimações dessas pessoas não estão sendo capturadas.' })

  return items
}

export function overallLevel(items: HealthItem[]): HealthLevel {
  if (items.some(i => i.level === 'error')) return 'error'
  if (items.some(i => i.level === 'warn')) return 'warn'
  return 'ok'
}
