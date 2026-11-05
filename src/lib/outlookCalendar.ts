// Agenda do Outlook / Hotmail (Microsoft 365, Outlook.com, Hotmail, Live).
//
// Mesmo desenho da integração com o Google (CalendarPage): OAuth 100% no
// navegador, sem client_secret e sem Edge Function. Usa a MSAL.js (biblioteca
// oficial da Microsoft Identity Platform) com o fluxo Authorization Code + PKCE
// e a autoridade "common" — vale para contas PESSOAIS (Hotmail/Outlook.com) e
// CORPORATIVAS/escolares (Entra ID), desde que o administrador da organização
// permita o consentimento do usuário. A MSAL guarda os tokens no navegador e
// renova o access token sozinha (acquireTokenSilent, via refresh token); o
// token nunca passa pelo backend do LegalHub.
//
// Configuração (uma vez): ver CLAUDE.md, seção "Outlook / Hotmail".
import type { AccountInfo, IPublicClientApplication } from '@azure/msal-browser'

export const MS_CLIENT_ID = import.meta.env.VITE_MS_CLIENT_ID as string | undefined
const GRAPH = 'https://graph.microsoft.com/v1.0'
const SCOPES = ['Calendars.ReadWrite', 'User.Read']
export const TIMEZONE = 'America/Sao_Paulo'

export const isOutlookConfigured = () => !!MS_CLIENT_ID

// ── Conversões puras ───────────────────────────────────────────────────────

export interface GraphDateTime { dateTime: string; timeZone?: string }
export interface GraphEvent {
  id: string
  subject?: string | null
  start?: GraphDateTime
  end?: GraphDateTime
  isAllDay?: boolean
  isCancelled?: boolean
  location?: { displayName?: string | null } | null
  bodyPreview?: string | null
  webLink?: string | null
}

export interface OutlookEventRow {
  title: string
  date: string
  time: string | null
  end_date: string | null
  end_time: string | null
  location: string | null
  description: string | null
}

const addDay = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/**
 * Evento do Graph (pedido com Prefer: outlook.timezone="America/Sao_Paulo",
 * então dateTime já vem no horário de Brasília) → colunas de calendar_events.
 * Dia inteiro: o Graph manda o fim como 00:00 do dia SEGUINTE (exclusivo).
 */
export function graphEventToRow(ev: GraphEvent): OutlookEventRow | null {
  const start = ev.start?.dateTime
  if (!start || !/^\d{4}-\d{2}-\d{2}/.test(start)) return null
  const date = start.slice(0, 10)
  const endRaw = ev.end?.dateTime && /^\d{4}-\d{2}-\d{2}/.test(ev.end.dateTime) ? ev.end.dateTime : null
  let endDate = endRaw ? endRaw.slice(0, 10) : null
  if (ev.isAllDay && endDate) endDate = addDay(endDate, -1)
  return {
    title: (ev.subject || '').trim() || 'Sem título',
    date,
    time: ev.isAllDay ? null : start.slice(11, 16),
    end_date: endDate && endDate !== date ? endDate : (ev.isAllDay ? null : endDate),
    end_time: ev.isAllDay || !endRaw ? null : endRaw.slice(11, 16),
    location: ev.location?.displayName?.trim() || null,
    description: ev.bodyPreview?.trim() || null,
  }
}

export interface LocalEventForm {
  title: string
  date: string
  time?: string | null
  end_date?: string | null
  end_time?: string | null
  location?: string | null
  description?: string | null
}

/** Evento do LegalHub → corpo do Graph (POST/PATCH /me/events). Sem hora = dia inteiro. */
export function rowToGraphEvent(f: LocalEventForm) {
  const base = {
    subject: f.title || 'Sem título',
    body: { contentType: 'text', content: f.description || '' },
    location: f.location ? { displayName: f.location } : undefined,
  }
  if (!f.time) {
    const last = f.end_date && f.end_date > f.date ? f.end_date : f.date
    return { ...base, isAllDay: true, start: { dateTime: `${f.date}T00:00:00`, timeZone: TIMEZONE }, end: { dateTime: `${addDay(last, 1)}T00:00:00`, timeZone: TIMEZONE } }
  }
  const endDate = f.end_date || f.date
  // Sem hora de término: 1 hora de duração (mesmo padrão do Google na Agenda).
  let endTime = f.end_time || ''
  let endDay = endDate
  if (!endTime) {
    const [h, m] = f.time.split(':').map(Number)
    const total = h * 60 + m + 60
    endTime = `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
    if (total >= 24 * 60) endDay = addDay(endDate, 1)
  }
  return { ...base, isAllDay: false, start: { dateTime: `${f.date}T${f.time}:00`, timeZone: TIMEZONE }, end: { dateTime: `${endDay}T${endTime}:00`, timeZone: TIMEZONE } }
}

export interface ExistingEvent {
  id: string
  title: string
  date: string
  time: string | null
  outlook_event_id?: string | null
  google_event_id?: string | null
}

const normTitle = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * O que fazer com cada evento vindo do Outlook:
 * - já importado (mesmo outlook_event_id) → atualizar se mudou, apagar se foi cancelado lá;
 * - novo, mas igual a um evento que já existe na agenda (mesmo título, dia e
 *   hora — ex.: veio antes pelo Google ou foi criado aqui) → ignorar, para não duplicar;
 * - novo de verdade → importar.
 */
export function planOutlookImport(existing: ExistingEvent[], incoming: GraphEvent[]) {
  const byOutlookId = new Map(existing.filter(e => e.outlook_event_id).map(e => [e.outlook_event_id as string, e]))
  const signature = (t: string, d: string, h: string | null) => `${normTitle(t)}|${d}|${h || ''}`
  const known = new Set(existing.map(e => signature(e.title, e.date, e.time)))
  const toInsert: (OutlookEventRow & { outlook_event_id: string })[] = []
  const toUpdate: { id: string; row: OutlookEventRow }[] = []
  const toDelete: string[] = []
  let duplicates = 0
  for (const ev of incoming) {
    const mine = byOutlookId.get(ev.id)
    if (ev.isCancelled) { if (mine) toDelete.push(mine.id); continue }
    const row = graphEventToRow(ev)
    if (!row) continue
    if (mine) {
      if (mine.title !== row.title || mine.date !== row.date || (mine.time || null) !== row.time) toUpdate.push({ id: mine.id, row })
      continue
    }
    const sig = signature(row.title, row.date, row.time)
    if (known.has(sig)) { duplicates++; continue }
    known.add(sig)
    toInsert.push({ ...row, outlook_event_id: ev.id })
  }
  return { toInsert, toUpdate, toDelete, duplicates }
}

// ── MSAL + Graph (navegador) ───────────────────────────────────────────────

let msalPromise: Promise<IPublicClientApplication> | null = null

/** Carrega a MSAL só quando a Agenda precisa (não pesa no carregamento do app). */
function getMsal(): Promise<IPublicClientApplication> {
  if (!MS_CLIENT_ID) return Promise.reject(new Error('Integração com Outlook não configurada (VITE_MS_CLIENT_ID).'))
  if (!msalPromise) {
    msalPromise = import('@azure/msal-browser').then(async ({ PublicClientApplication }) => {
      const app = await PublicClientApplication.createPublicClientApplication({
        auth: {
          clientId: MS_CLIENT_ID!,
          authority: 'https://login.microsoftonline.com/common',
          // Página em branco para o popup (não carrega o app inteiro dentro dele).
          redirectUri: `${window.location.origin}/msal-redirect.html`,
        },
        // localStorage: a conexão sobrevive a fechar a aba (mesmo lugar onde o
        // supabase-js já guarda a sessão do app). O token só serve para a agenda.
        cache: { cacheLocation: 'localStorage' },
      })
      return app
    })
  }
  return msalPromise
}

const accountKey = (uid: string) => `outlook_account_${uid}`

async function accountFor(app: IPublicClientApplication, uid: string): Promise<AccountInfo | null> {
  const homeId = localStorage.getItem(accountKey(uid))
  if (!homeId) return null
  return app.getAccountByHomeId(homeId) || null
}

export async function connectOutlook(uid: string): Promise<{ email: string }> {
  const app = await getMsal()
  const res = await app.loginPopup({ scopes: SCOPES, prompt: 'select_account' })
  if (!res.account) throw new Error('A Microsoft não devolveu a conta conectada.')
  localStorage.setItem(accountKey(uid), res.account.homeAccountId)
  return { email: res.account.username }
}

export async function outlookAccount(uid: string): Promise<{ email: string } | null> {
  if (!MS_CLIENT_ID || !localStorage.getItem(accountKey(uid))) return null
  try {
    const acc = await accountFor(await getMsal(), uid)
    return acc ? { email: acc.username } : null
  } catch { return null }
}

/** Desconecta só do LegalHub (apaga os tokens daqui) — não sai da conta Microsoft no navegador. */
export async function disconnectOutlook(uid: string): Promise<void> {
  try {
    const app = await getMsal()
    const acc = await accountFor(app, uid)
    if (acc) await app.clearCache({ account: acc })
  } finally {
    localStorage.removeItem(accountKey(uid))
  }
}

export class OutlookAuthError extends Error {}

/** Access token válido: renova em silêncio; se a Microsoft exigir, abre o popup. */
async function getToken(uid: string, interactiveFallback: boolean): Promise<string> {
  const app = await getMsal()
  const account = await accountFor(app, uid)
  if (!account) throw new OutlookAuthError('Outlook não conectado.')
  try {
    return (await app.acquireTokenSilent({ scopes: SCOPES, account })).accessToken
  } catch (e) {
    const { InteractionRequiredAuthError } = await import('@azure/msal-browser')
    if (interactiveFallback && e instanceof InteractionRequiredAuthError) {
      return (await app.acquireTokenPopup({ scopes: SCOPES, account })).accessToken
    }
    throw new OutlookAuthError('A conexão com o Outlook expirou. Clique em "Reconectar".')
  }
}

async function graph<T>(uid: string, path: string, init: RequestInit = {}, interactive = false): Promise<T> {
  const doFetch = async (token: string) => fetch(path.startsWith('http') ? path : `${GRAPH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: `outlook.timezone="${TIMEZONE}"`,
      ...(init.headers || {}),
    },
  })
  let r = await doFetch(await getToken(uid, interactive))
  // Token revogado/expirado no meio do caminho: renova uma vez e repete.
  if (r.status === 401) r = await doFetch(await getToken(uid, true))
  if (r.status === 429) throw new Error('A Microsoft limitou as requisições por alguns instantes. Tente de novo em 1 minuto.')
  if (!r.ok) {
    const body = await r.json().catch(() => null)
    throw new Error(body?.error?.message || `Microsoft Graph HTTP ${r.status}`)
  }
  return (r.status === 204 ? null : await r.json()) as T
}

/** Eventos do calendário principal entre hoje-30 e hoje+180 dias (recorrências já expandidas). */
export async function listOutlookEvents(uid: string): Promise<GraphEvent[]> {
  const from = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const to = new Date(Date.now() + 180 * 86_400_000).toISOString()
  const out: GraphEvent[] = []
  let url: string | null = `/me/calendarView?startDateTime=${encodeURIComponent(from)}&endDateTime=${encodeURIComponent(to)}&$top=200&$select=id,subject,start,end,isAllDay,isCancelled,location,bodyPreview`
  for (let page = 0; url && page < 10; page++) {
    const data: { value?: GraphEvent[]; '@odata.nextLink'?: string } = await graph(uid, url, {}, true)
    out.push(...(data.value || []))
    url = data['@odata.nextLink'] || null
  }
  return out
}

export async function createOutlookEvent(uid: string, f: LocalEventForm): Promise<string> {
  const ev = await graph<GraphEvent>(uid, '/me/events', { method: 'POST', body: JSON.stringify(rowToGraphEvent(f)) })
  return ev.id
}

export async function updateOutlookEvent(uid: string, id: string, f: LocalEventForm): Promise<void> {
  await graph(uid, `/me/events/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(rowToGraphEvent(f)) })
}

export async function deleteOutlookEvent(uid: string, id: string): Promise<void> {
  try { await graph(uid, `/me/events/${encodeURIComponent(id)}`, { method: 'DELETE' }) }
  catch (e) { if (!/not found|404/i.test(e instanceof Error ? e.message : '')) throw e }
}
