// ─────────────────────────────────────────────────────────────────────────────
// Google Drive — client-side wrapper (Drive API v3 REST + Google Identity Services)
//
// Mesmo padrão já usado em CalendarPage.tsx (Google Calendar) e exportUtils.ts
// (exportação pra Sheets/Docs): OAuth 100% no navegador via GIS
// (google.accounts.oauth2.initTokenClient), sem Edge Function nem refresh_token
// no backend — o access_token vive só em sessionStorage, por usuário (uid),
// expira em ~1h e precisa de reconexão manual depois disso.
//
// Escopo: drive.file (restrito — só enxerga arquivos/pastas que o próprio app
// cria ou que o usuário escolheu explicitamente via Picker). Por isso toda
// navegação "nativa" parte de uma pasta raiz "LegalHub" que o app cria na
// primeira conexão de cada usuário (ver ensureRootFolder). Itens escolhidos no
// resto do Drive do usuário (ver seção "Picker" abaixo) entram nessa mesma
// pasta como atalhos (shortcutDetails) — mantém o escopo drive.file intacto
// (nunca lemos o Drive inteiro do usuário) e reaproveita 100% da UI existente.
// ─────────────────────────────────────────────────────────────────────────────

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut'
const ROOT_FOLDER_NAME = 'LegalHub'
const DRIVE_FIELDS = 'id,name,mimeType,size,modifiedTime,iconLink,webViewLink,parents,shortcutDetails(targetId,targetMimeType)'

export interface DriveItem {
  id: string
  name: string
  mimeType: string
  size?: string
  modifiedTime?: string
  iconLink?: string
  webViewLink?: string
  parents?: string[]
  shortcutDetails?: { targetId: string; targetMimeType?: string }
}

export function isShortcut(item: DriveItem) {
  return item.mimeType === SHORTCUT_MIME
}

/** Mimetype "efetivo": o do próprio item, ou o do alvo quando o item é um atalho. */
export function effectiveMimeType(item: DriveItem): string | undefined {
  return item.shortcutDetails?.targetMimeType || item.mimeType
}

/** Id "efetivo" pra abrir/baixar/navegar: o do alvo quando o item é um atalho, senão o próprio id. */
export function resolveTargetId(item: DriveItem): string {
  return item.shortcutDetails?.targetId || item.id
}

/** Id de pasta a usar como parent em listagem/criação/upload — resolve atalho de pasta pro id real. */
export function resolveFolderId(folder: DriveItem | null, fallback: string): string {
  return folder ? resolveTargetId(folder) : fallback
}

export function isDriveFolder(item: DriveItem) {
  return effectiveMimeType(item) === FOLDER_MIME
}

/**
 * Ids de todas as subpastas (recursivo) de `folderId`, a partir de uma lista
 * flat de pastas (cada uma com `parents`). Usado pra bloquear ciclos no
 * "mover pasta": não dá pra mover uma pasta pra dentro dela mesma nem de uma
 * das suas próprias descendentes.
 */
export function getDescendantFolderIds(folders: DriveItem[], folderId: string): Set<string> {
  const childrenByParent = new Map<string, string[]>()
  for (const f of folders) {
    for (const parentId of f.parents || []) {
      const siblings = childrenByParent.get(parentId) || []
      siblings.push(f.id)
      childrenByParent.set(parentId, siblings)
    }
  }
  const descendants = new Set<string>()
  const queue = [folderId]
  while (queue.length) {
    const current = queue.shift()!
    for (const childId of childrenByParent.get(current) || []) {
      if (!descendants.has(childId)) {
        descendants.add(childId)
        queue.push(childId)
      }
    }
  }
  return descendants
}

export class DriveApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

// ─── Token storage (mesmo padrão de CalendarPage.tsx, chaves próprias) ────────
// access_token em sessionStorage (dado sensível, não sobrevive ao fechamento do
// navegador); e-mail/flag "conectado" em localStorage (só estado de UX).
function gTokenKey(uid: string) { return `gdrive_token_${uid}` }
function gEmailKey(uid: string) { return `gdrive_email_${uid}` }
function gConnectedKey(uid: string) { return `gdrive_connected_${uid}` }
function gRootFolderKey(uid: string) { return `gdrive_root_${uid}` }

export function getStoredToken(uid: string): string | null {
  try {
    const raw = sessionStorage.getItem(gTokenKey(uid))
    if (!raw) return null
    const { access_token, expires_at } = JSON.parse(raw)
    if (Date.now() > expires_at - 60_000) return null
    return access_token
  } catch { return null }
}

function storeToken(uid: string, token: string, expiresIn: number) {
  sessionStorage.setItem(gTokenKey(uid), JSON.stringify({ access_token: token, expires_at: Date.now() + expiresIn * 1000 }))
}

export function clearToken(uid: string) {
  sessionStorage.removeItem(gTokenKey(uid))
  localStorage.removeItem(gEmailKey(uid))
  localStorage.removeItem(gConnectedKey(uid))
  localStorage.removeItem(gRootFolderKey(uid))
}

export function wasConnected(uid: string) { return localStorage.getItem(gConnectedKey(uid)) === '1' }
export function getStoredEmail(uid: string) { return localStorage.getItem(gEmailKey(uid)) }

// ─── GIS loader ────────────────────────────────────────────────────────────
function loadGis(): Promise<void> {
  return new Promise((resolve, reject) => {
    const ready = () => !!(window as any).google?.accounts?.oauth2
    if (ready()) { resolve(); return }
    if (!document.getElementById('gis-script')) {
      const s = document.createElement('script')
      s.id = 'gis-script'; s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true
      document.body.appendChild(s)
    }
    const interval = setInterval(() => { if (ready()) { clearInterval(interval); resolve() } }, 100)
    setTimeout(() => { clearInterval(interval); if (!ready()) reject(new Error('Falha ao carregar biblioteca do Google')) }, 10_000)
  })
}

// ─── Conexão ───────────────────────────────────────────────────────────────
export async function connectDrive(uid: string, opts?: { silent?: boolean }): Promise<{ token: string; email: string }> {
  if (!CLIENT_ID) throw new Error('VITE_GOOGLE_CLIENT_ID não configurado.')
  await loadGis()
  const g = (window as any).google
  if (!g?.accounts?.oauth2) throw new Error('Biblioteca Google não carregada.')

  return new Promise((resolve, reject) => {
    const client = g.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: DRIVE_SCOPE + ' https://www.googleapis.com/auth/userinfo.email',
      prompt: opts?.silent ? '' : 'consent',
      callback: async (resp: any) => {
        if (resp.error || !resp.access_token) { reject(new Error(resp.error || 'Autorização negada')); return }
        storeToken(uid, resp.access_token, resp.expires_in || 3600)
        let email = getStoredEmail(uid) || ''
        try {
          const info = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${resp.access_token}` } }).then(r => r.json())
          email = info.email || email
        } catch { /* segue sem e-mail se a consulta falhar */ }
        localStorage.setItem(gEmailKey(uid), email)
        localStorage.setItem(gConnectedKey(uid), '1')
        resolve({ token: resp.access_token, email })
      },
    })
    client.requestAccessToken(opts?.silent ? { prompt: '' } : undefined)
  })
}

/**
 * Revoga a concessão OAuth do lado do Google (best-effort — se a lib GIS não
 * estiver carregada ou a chamada falhar, ainda assim limpa o token local, pra
 * "Desconectar" nunca travar por causa de um problema de rede/terceiro) e
 * depois limpa o token local.
 */
export function disconnectDrive(uid: string) {
  const token = getStoredToken(uid)
  if (token) {
    try {
      const g = (window as any).google
      g?.accounts?.oauth2?.revoke(token, () => {})
    } catch { /* best-effort — segue pra limpar o storage local mesmo assim */ }
  }
  clearToken(uid)
}

// ─── Request helper ────────────────────────────────────────────────────────
async function driveRequest(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`${DRIVE_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new DriveApiError(err?.error?.message || `HTTP ${res.status}`, res.status)
  }
  if (res.status === 204) return null
  return res.json()
}

// ─── Pasta raiz "LegalHub" ─────────────────────────────────────────────────
// O escopo drive.file só enxerga o que o app cria — a navegação sempre parte
// dessa pasta. O id é cacheado por usuário; se a pasta tiver sido apagada
// manualmente no Drive, o cache é invalidado e uma nova é criada.
export async function ensureRootFolder(token: string, uid: string): Promise<string> {
  const cached = localStorage.getItem(gRootFolderKey(uid))
  if (cached) {
    try {
      const item = await driveRequest(`/files/${cached}?fields=id,trashed`, token)
      if (item && !item.trashed) return cached
    } catch { /* cache inválido, segue pra busca/criação */ }
  }

  const q = encodeURIComponent(`name='${ROOT_FOLDER_NAME}' and mimeType='${FOLDER_MIME}' and trashed=false`)
  const found = await driveRequest(`/files?q=${q}&fields=files(id,name)`, token)
  if (found?.files?.length) {
    localStorage.setItem(gRootFolderKey(uid), found.files[0].id)
    return found.files[0].id
  }

  const created = await driveRequest(`/files?fields=id`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: ROOT_FOLDER_NAME, mimeType: FOLDER_MIME }),
  })
  localStorage.setItem(gRootFolderKey(uid), created.id)
  return created.id
}

// ─── Navegação e CRUD ──────────────────────────────────────────────────────
export async function listChildren(token: string, folderId: string): Promise<DriveItem[]> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`)
  const data = await driveRequest(`/files?q=${q}&fields=files(${DRIVE_FIELDS})&orderBy=folder,name&pageSize=200`, token)
  return (data?.files || []) as DriveItem[]
}

/** Lista todas as pastas que o app enxerga (usado pelo seletor de "Mover para..."). */
export async function listAllFolders(token: string): Promise<DriveItem[]> {
  const q = encodeURIComponent(`mimeType='${FOLDER_MIME}' and trashed=false`)
  const data = await driveRequest(`/files?q=${q}&fields=files(${DRIVE_FIELDS})&orderBy=name&pageSize=200`, token)
  return (data?.files || []) as DriveItem[]
}

export async function createFolder(token: string, name: string, parentId: string): Promise<DriveItem> {
  return driveRequest(`/files?fields=${DRIVE_FIELDS}`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  })
}

export async function renameItem(token: string, fileId: string, newName: string): Promise<DriveItem> {
  return driveRequest(`/files/${fileId}?fields=${DRIVE_FIELDS}`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName }),
  })
}

export async function moveItem(token: string, fileId: string, newParentId: string, oldParentId: string): Promise<DriveItem> {
  return driveRequest(`/files/${fileId}?addParents=${newParentId}&removeParents=${oldParentId}&fields=${DRIVE_FIELDS}`, token, {
    method: 'PATCH',
  })
}

/**
 * Move o item pra lixeira do Drive (reversível), em vez de excluir permanentemente
 * — mesma filosofia de soft-delete (`deleted_at`) usada no resto do app pros
 * dados no Supabase.
 */
export async function trashItem(token: string, fileId: string): Promise<void> {
  await driveRequest(`/files/${fileId}`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  })
}

export async function uploadFile(token: string, file: File, parentId: string): Promise<DriveItem> {
  const boundary = `legalhub-drive-${Date.now()}`
  const metadataPart =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name: file.name, parents: [parentId] }) + `\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`
  const closingPart = `\r\n--${boundary}--`
  // Blob (não string) preserva o conteúdo binário do arquivo — concatenar como
  // string quebraria PDFs/imagens/etc.
  const body = new Blob([metadataPart, file, closingPart])

  const res = await fetch(`${DRIVE_UPLOAD_API}?uploadType=multipart&fields=${DRIVE_FIELDS}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary="${boundary}"` },
    body,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new DriveApiError(err?.error?.message || `Falha ao enviar (HTTP ${res.status})`, res.status)
  }
  return res.json()
}

/** Baixa o conteúdo do arquivo via alt=media (autenticado com o token) e dispara o download no navegador. */
export async function downloadFile(token: string, item: DriveItem): Promise<void> {
  const res = await fetch(`${DRIVE_API}/files/${resolveTargetId(item)}?alt=media`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new DriveApiError(`Falha ao baixar (HTTP ${res.status})`, res.status)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = item.name
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** URL de preview embutível do próprio Drive (usa a sessão logada do Google no navegador). */
export function getPreviewUrl(item: DriveItem) {
  return `https://drive.google.com/file/d/${resolveTargetId(item)}/preview`
}

/**
 * Cria um atalho (shortcutDetails) dentro de `parentId` apontando pra
 * `targetId` — usado pra "trazer" um item escolhido no Picker (fora do
 * escopo drive.file original) pra dentro da pasta "LegalHub". O escopo
 * drive.file concede acesso ao próprio atalho e ao arquivo/pasta alvo (o
 * Picker já garantiu esse acesso no momento da escolha); excluir o atalho
 * depois (trashItem) nunca afeta o arquivo original do usuário.
 */
export async function createShortcut(token: string, targetId: string, parentId: string, name: string): Promise<DriveItem> {
  return driveRequest(`/files?fields=${DRIVE_FIELDS}`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: SHORTCUT_MIME,
      parents: [parentId],
      shortcutDetails: { targetId },
    }),
  })
}

// ─── Google Picker ─────────────────────────────────────────────────────────
// Deixa o usuário escolher arquivos/pastas de QUALQUER lugar do próprio Drive
// (não só o que o app já criou) sem alargar o escopo OAuth: o Picker roda com
// o mesmo access_token de drive.file, e o próprio ato de escolher um item
// nesse widget concede ao app acesso drive.file aquele item específico (é o
// mecanismo oficial do Google pra "afrouxar" drive.file sem pedir o escopo
// amplo `drive.readonly`/`drive`). Requer developer key (API key restrita) +
// appId (número do projeto GCP) — ver isPickerConfigured().
const PICKER_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY as string | undefined
const PICKER_APP_ID = import.meta.env.VITE_GOOGLE_APP_ID as string | undefined

export function isPickerConfigured(): boolean {
  return !!PICKER_API_KEY && !!PICKER_APP_ID
}

export interface PickerSelection {
  id: string
  name: string
  mimeType: string
}

/**
 * Extrai a seleção de um callback do Google Picker — função pura (sem
 * dependência do `window.google`), testável isoladamente com um fixture da
 * resposta real da lib (`{ action, docs: [{ id, name, mimeType, ... }] }`).
 */
export function extractPickerSelection(data: unknown): PickerSelection[] {
  const d = data as { action?: string; docs?: Array<{ id?: string; name?: string; mimeType?: string }> } | null | undefined
  if (!d || d.action !== 'picked' || !Array.isArray(d.docs)) return []
  return d.docs
    .filter((doc): doc is { id: string; name: string; mimeType: string } => !!doc?.id && !!doc?.name && !!doc?.mimeType)
    .map(doc => ({ id: doc.id, name: doc.name, mimeType: doc.mimeType }))
}

function loadPickerLib(): Promise<void> {
  return new Promise((resolve, reject) => {
    const g = () => (window as any).google
    const gapi = () => (window as any).gapi
    if (g()?.picker) { resolve(); return }
    const onGapiReady = () => {
      gapi().load('picker', { callback: () => resolve(), onerror: () => reject(new Error('Falha ao carregar o Google Picker')) })
    }
    if (gapi()) { onGapiReady(); return }
    if (!document.getElementById('gapi-script')) {
      const s = document.createElement('script')
      s.id = 'gapi-script'; s.src = 'https://apis.google.com/js/api.js'; s.async = true; s.defer = true
      s.onload = onGapiReady
      s.onerror = () => reject(new Error('Falha ao carregar a biblioteca do Google API'))
      document.body.appendChild(s)
    } else {
      const interval = setInterval(() => { if (gapi()) { clearInterval(interval); onGapiReady() } }, 100)
      setTimeout(() => { clearInterval(interval); if (!gapi()) reject(new Error('Falha ao carregar a biblioteca do Google API')) }, 10_000)
    }
  })
}

/**
 * Abre o Google Picker (DocsView com pastas navegáveis/selecionáveis,
 * multi-seleção) usando o access_token já obtido em connectDrive. Resolve com
 * a lista escolhida (vazia se o usuário cancelar).
 */
export async function openDrivePicker(token: string): Promise<PickerSelection[]> {
  if (!isPickerConfigured()) {
    throw new Error('Google Picker não configurado: faltam as variáveis VITE_GOOGLE_API_KEY / VITE_GOOGLE_APP_ID.')
  }
  await loadPickerLib()
  const google = (window as any).google
  return new Promise((resolve, reject) => {
    try {
      const docsView = new google.picker.DocsView(google.picker.ViewId.DOCS)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(true)

      const picker = new google.picker.PickerBuilder()
        .addView(docsView)
        .setOAuthToken(token)
        .setDeveloperKey(PICKER_API_KEY)
        .setAppId(PICKER_APP_ID)
        .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
        .setCallback((data: any) => {
          if (data.action === google.picker.Action.PICKED) resolve(extractPickerSelection(data))
          else if (data.action === google.picker.Action.CANCEL) resolve([])
        })
        .build()
      picker.setVisible(true)
    } catch (err) {
      reject(err instanceof Error ? err : new Error('Erro ao abrir o Google Picker'))
    }
  })
}
