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
// cria). Por isso toda navegação parte de uma pasta raiz "LegalHub" que o app
// cria na primeira conexão de cada usuário (ver ensureRootFolder).
// ─────────────────────────────────────────────────────────────────────────────

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const ROOT_FOLDER_NAME = 'LegalHub'
const DRIVE_FIELDS = 'id,name,mimeType,size,modifiedTime,iconLink,webViewLink,parents'

export interface DriveItem {
  id: string
  name: string
  mimeType: string
  size?: string
  modifiedTime?: string
  iconLink?: string
  webViewLink?: string
  parents?: string[]
}

export function isDriveFolder(item: DriveItem) {
  return item.mimeType === FOLDER_MIME
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
  const res = await fetch(`${DRIVE_API}/files/${item.id}?alt=media`, { headers: { Authorization: `Bearer ${token}` } })
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
  return `https://drive.google.com/file/d/${item.id}/preview`
}
