import { usePageLoadingState } from '@/contexts/PageLoadingContext'
import { useEffect, useState } from 'react'
import {
  Folder, FolderPlus, Upload, ChevronRight, Trash2, Download, File, FileText, Image, X, HardDrive, Home, LayoutGrid, List,
  Link2Off, RefreshCw, Loader, CheckCircle, Pencil, FolderInput, AlertCircle,
} from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Modal, Input, Select, Spinner, EmptyState, Button } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cn, sanitizeFileName } from '@/lib/utils'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { withErrorFeedback } from '@/lib/errorFeedback'
import { getTenantStorageQuotaBytes } from '@/lib/storageUtils'
import {
  DriveItem, isDriveFolder, DriveApiError,
  getStoredToken as getStoredDriveToken, getStoredEmail as getStoredDriveEmail, wasConnected as wasDriveConnected,
  connectDrive, disconnectDrive, ensureRootFolder, listChildren as listDriveChildren, listAllFolders,
  createFolder as createDriveFolderApi, renameItem as renameDriveItemApi, moveItem as moveDriveItemApi,
  trashItem as trashDriveItemApi, uploadFile as uploadDriveFileApi, downloadFile as downloadDriveFileApi, getPreviewUrl as getDrivePreviewUrl,
} from '@/lib/googleDrive'

interface FolderRow {
  id: string
  tenant_id: string
  client_id: string | null
  parent_id: string | null
  name: string
  created_at: string
}

interface FileRow {
  id: string
  title: string
  folder_id: string | null
  file_url?: string
  file_name?: string
  file_size?: number
  file_mime?: string
  created_at: string
}

interface ClientOption { id: string; name: string }

const OFFICE_VIEW_MODE_KEY = 'legalhub_office_view_mode'
type ViewMode = 'icons' | 'list'

function formatFileSize(bytes?: number) {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileIcon({ mime }: { mime?: string }) {
  const isPdf = mime === 'application/pdf'
  const isImage = mime?.startsWith('image/')
  const color = isPdf ? 'text-red-500' : isImage ? 'text-purple-500' : 'text-gray-400'
  if (isImage) return <Image className={cn('w-8 h-8', color)} />
  if (isPdf) return <FileText className={cn('w-8 h-8', color)} />
  return <File className={cn('w-8 h-8', color)} />
}

function DriveFileIcon({ item }: { item: DriveItem }) {
  if (isDriveFolder(item)) return <Folder className="w-8 h-8 text-primary-400" fill="currentColor" fillOpacity={0.15} />
  const isImage = item.mimeType?.startsWith('image/')
  const isPdf = item.mimeType === 'application/pdf'
  const color = isPdf ? 'text-red-500' : isImage ? 'text-purple-500' : 'text-gray-400'
  if (isImage) return <Image className={cn('w-8 h-8', color)} />
  if (isPdf) return <FileText className={cn('w-8 h-8', color)} />
  return <File className={cn('w-8 h-8', color)} />
}

/** Logo do Google, mesmo componente usado em CalendarPage.tsx (não exportado de lá). */
function GIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.85A10.99 10.99 0 0012 23z" />
      <path fill="#FBBC05" d="M5.84 14.09A6.6 6.6 0 015.5 12c0-.73.13-1.43.34-2.09V7.06H2.18A10.99 10.99 0 001 12c0 1.77.43 3.45 1.18 4.94l3.66-2.85z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

export function EscritorioDigitalPage() {
  const { profile } = useAuth()
  const [loading, setLoading] = usePageLoadingState()
  const [path, setPath] = useState<FolderRow[]>([]) // breadcrumb; último item = pasta atual
  const [subfolders, setSubfolders] = useState<FolderRow[]>([])
  const [files, setFiles] = useState<FileRow[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [storage, setStorage] = useState<{ used: number; quota: number } | null>(null)

  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderClientId, setNewFolderClientId] = useState('')
  const [savingFolder, setSavingFolder] = useState(false)

  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [dragOver, setDragOver] = useState(false)

  const [previewFile, setPreviewFile] = useState<FileRow | null>(null)

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const stored = window.localStorage.getItem(OFFICE_VIEW_MODE_KEY)
    return stored === 'list' ? 'list' : 'icons'
  })

  useEffect(() => {
    window.localStorage.setItem(OFFICE_VIEW_MODE_KEY, viewMode)
  }, [viewMode])

  // ─── Google Drive ──────────────────────────────────────────────────────────
  const uid = profile?.user_id || profile?.id || ''
  const [source, setSource] = useState<'local' | 'drive'>('local')

  const [driveToken, setDriveToken] = useState<string | null>(null)
  const [driveEmail, setDriveEmail] = useState<string | null>(null)
  const [driveConnecting, setDriveConnecting] = useState(false)
  const [driveError, setDriveError] = useState('')
  const [driveRootId, setDriveRootId] = useState<string | null>(null)
  const [driveLoading, setDriveLoading] = useState(false)
  const [drivePath, setDrivePath] = useState<DriveItem[]>([]) // breadcrumb; vazio = raiz "LegalHub"
  const [driveItems, setDriveItems] = useState<DriveItem[]>([])

  const [driveNewFolderOpen, setDriveNewFolderOpen] = useState(false)
  const [driveNewFolderName, setDriveNewFolderName] = useState('')
  const [driveSavingFolder, setDriveSavingFolder] = useState(false)

  const [driveUploadOpen, setDriveUploadOpen] = useState(false)
  const [driveUploadFile, setDriveUploadFile] = useState<File | null>(null)
  const [driveUploading, setDriveUploading] = useState(false)
  const [driveUploadError, setDriveUploadError] = useState('')
  const [driveDragOver, setDriveDragOver] = useState(false)

  const [renameTarget, setRenameTarget] = useState<DriveItem | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renaming, setRenaming] = useState(false)

  const [moveTarget, setMoveTarget] = useState<DriveItem | null>(null)
  const [moveFolders, setMoveFolders] = useState<DriveItem[]>([])
  const [moveDestination, setMoveDestination] = useState('')
  const [moving, setMoving] = useState(false)

  const [drivePreviewItem, setDrivePreviewItem] = useState<DriveItem | null>(null)

  const driveCurrentFolder = drivePath[drivePath.length - 1] || null
  const driveConnected = !!driveToken

  // Restaura token salvo (sessionStorage sobrevive a navegação entre páginas, não a fechar a aba)
  useEffect(() => {
    if (!uid) return
    const t = getStoredDriveToken(uid)
    if (t) { setDriveToken(t); setDriveEmail(getStoredDriveEmail(uid)) }
  }, [uid])

  // Tenta reconectar em silêncio (sem popup) se já esteve conectado nesta sessão de navegador
  useEffect(() => {
    if (!uid || driveToken) return
    if (!wasDriveConnected(uid)) return
    connectDrive(uid, { silent: true }).then(({ token, email }) => {
      setDriveToken(token); setDriveEmail(email)
    }).catch(() => { /* silencioso: usuário precisa clicar "Conectar" de novo */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid])

  async function loadDriveChildren(folderId: string) {
    if (!driveToken) return
    setDriveLoading(true)
    setDriveError('')
    try {
      const items = await listDriveChildren(driveToken, folderId)
      setDriveItems(items)
    } catch (err) {
      handleDriveError(err, 'Erro ao carregar arquivos do Google Drive')
    } finally {
      setDriveLoading(false)
    }
  }

  function handleDriveError(err: unknown, prefix: string) {
    if (err instanceof DriveApiError && err.status === 401) {
      disconnectDrive(uid)
      setDriveToken(null); setDriveEmail(null); setDriveRootId(null)
      setDriveError('Sua conexão com o Google Drive expirou. Reconecte para continuar.')
      return
    }
    const message = err instanceof Error ? err.message : 'Erro desconhecido'
    setDriveError(`${prefix}: ${message}`)
  }

  // Ao conectar (ou restaurar token), garante a pasta raiz e carrega o conteúdo
  useEffect(() => {
    if (source !== 'drive' || !driveToken) return
    let cancelled = false
    ;(async () => {
      setDriveLoading(true)
      setDriveError('')
      try {
        const rootId = driveRootId || await ensureRootFolder(driveToken, uid)
        if (cancelled) return
        setDriveRootId(rootId)
        const target = driveCurrentFolder?.id || rootId
        const items = await listDriveChildren(driveToken, target)
        if (!cancelled) setDriveItems(items)
      } catch (err) {
        if (!cancelled) handleDriveError(err, 'Erro ao abrir o Google Drive')
      } finally {
        if (!cancelled) setDriveLoading(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, driveToken, driveCurrentFolder?.id])

  async function connectGoogleDrive() {
    if (!uid) return
    setDriveConnecting(true)
    setDriveError('')
    try {
      const { token, email } = await connectDrive(uid)
      setDriveToken(token); setDriveEmail(email)
    } catch (err) {
      setDriveError(err instanceof Error ? err.message : 'Erro ao conectar com o Google Drive')
    } finally {
      setDriveConnecting(false)
    }
  }

  function disconnectGoogleDrive() {
    disconnectDrive(uid)
    setDriveToken(null); setDriveEmail(null); setDriveRootId(null)
    setDrivePath([]); setDriveItems([])
  }

  function openDriveFolder(folder: DriveItem) {
    setDrivePath(p => [...p, folder])
  }

  function goToDriveBreadcrumb(index: number) {
    setDrivePath(p => p.slice(0, index + 1))
  }

  async function createDriveFolderSubmit() {
    if (!driveToken || !driveNewFolderName.trim()) return
    const parentId = driveCurrentFolder?.id || driveRootId
    if (!parentId) return
    setDriveSavingFolder(true)
    try {
      await createDriveFolderApi(driveToken, driveNewFolderName.trim(), parentId)
      setDriveNewFolderOpen(false); setDriveNewFolderName('')
      loadDriveChildren(parentId)
    } catch (err) {
      handleDriveError(err, 'Erro ao criar pasta no Google Drive')
    } finally {
      setDriveSavingFolder(false)
    }
  }

  async function uploadIntoDriveFolder() {
    if (!driveToken || !driveUploadFile) return
    const parentId = driveCurrentFolder?.id || driveRootId
    if (!parentId) return
    setDriveUploading(true)
    setDriveUploadError('')
    try {
      await uploadDriveFileApi(driveToken, driveUploadFile, parentId)
      setDriveUploadOpen(false); setDriveUploadFile(null)
      loadDriveChildren(parentId)
    } catch (err) {
      setDriveUploadError(err instanceof Error ? err.message : 'Erro ao enviar arquivo')
    } finally {
      setDriveUploading(false)
    }
  }

  function openRenameModal(item: DriveItem) {
    setRenameTarget(item); setRenameValue(item.name)
  }

  async function submitRename() {
    if (!driveToken || !renameTarget || !renameValue.trim()) return
    setRenaming(true)
    try {
      await renameDriveItemApi(driveToken, renameTarget.id, renameValue.trim())
      setRenameTarget(null)
      loadDriveChildren(driveCurrentFolder?.id || driveRootId!)
    } catch (err) {
      handleDriveError(err, 'Erro ao renomear')
    } finally {
      setRenaming(false)
    }
  }

  async function openMoveModal(item: DriveItem) {
    setMoveTarget(item); setMoveDestination('')
    if (!driveToken) return
    try {
      const folders = await listAllFolders(driveToken)
      setMoveFolders(folders.filter(f => f.id !== item.id))
    } catch (err) {
      handleDriveError(err, 'Erro ao listar pastas do Google Drive')
    }
  }

  async function submitMove() {
    if (!driveToken || !moveTarget || !moveDestination) return
    const oldParentId = moveTarget.parents?.[0] || driveCurrentFolder?.id || driveRootId!
    setMoving(true)
    try {
      await moveDriveItemApi(driveToken, moveTarget.id, moveDestination, oldParentId)
      setMoveTarget(null)
      loadDriveChildren(driveCurrentFolder?.id || driveRootId!)
    } catch (err) {
      handleDriveError(err, 'Erro ao mover')
    } finally {
      setMoving(false)
    }
  }

  async function deleteDriveItem(item: DriveItem) {
    if (!driveToken) return
    const label = isDriveFolder(item) ? 'pasta' : 'arquivo'
    if (!(await confirmDialog(`Enviar "${item.name}" para a lixeira do Google Drive?`, { danger: true }))) return
    try {
      await trashDriveItemApi(driveToken, item.id)
      loadDriveChildren(driveCurrentFolder?.id || driveRootId!)
    } catch (err) {
      handleDriveError(err, `Erro ao excluir ${label}`)
    }
  }

  async function downloadDriveItemClick(item: DriveItem) {
    if (!driveToken) return
    try {
      await downloadDriveFileApi(driveToken, item)
    } catch (err) {
      handleDriveError(err, 'Erro ao baixar arquivo')
    }
  }

  const driveFolders = driveItems.filter(isDriveFolder)
  const driveFiles = driveItems.filter(item => !isDriveFolder(item))

  const currentFolder = path[path.length - 1] || null

  async function load() {
    setLoading(true)
    const [{ data: folderData }, { data: fileData }, { data: clientData }, { data: tenantData }, { data: usageData }] = await Promise.all([
      currentFolder
        ? supabase.from('folders').select('*').eq('parent_id', currentFolder.id).is('deleted_at', null).order('name')
        : supabase.from('folders').select('*').is('parent_id', null).is('deleted_at', null).order('name'),
      currentFolder
        ? supabase.from('documents').select('id,title,folder_id,file_url,file_name,file_size,file_mime,created_at').eq('folder_id', currentFolder.id).is('deleted_at', null).order('title')
        : Promise.resolve({ data: [] as FileRow[] }),
      supabase.from('clients').select('id,name').is('deleted_at', null).order('name'),
      supabase.from('tenants').select('plan,storage_used_bytes,storage_quota_bytes').eq('id', profile?.tenant_id).single(),
      supabase.from('documents').select('file_size').eq('tenant_id', profile?.tenant_id).is('deleted_at', null),
    ])
    setSubfolders((folderData || []) as FolderRow[])
    setFiles((fileData || []) as FileRow[])
    setClients((clientData || []) as ClientOption[])
    if (tenantData) {
      const used = (usageData || []).reduce((sum, d: { file_size?: number }) => sum + (d.file_size || 0), 0)
      setStorage({ used, quota: getTenantStorageQuotaBytes(tenantData) })
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [currentFolder?.id])

  function openFolder(folder: FolderRow) {
    setPath(p => [...p, folder])
  }

  function goToBreadcrumb(index: number) {
    // index === -1 volta pra raiz
    setPath(p => p.slice(0, index + 1))
  }

  async function createFolder() {
    if (!newFolderName.trim()) return
    setSavingFolder(true)
    const { error } = await withErrorFeedback(supabase.from('folders').insert({
      tenant_id: profile?.tenant_id,
      name: newFolderName.trim(),
      parent_id: currentFolder?.id || null,
      client_id: currentFolder ? currentFolder.client_id : (newFolderClientId || null),
    }), 'Erro ao criar pasta')
    setSavingFolder(false)
    if (error) return
    setNewFolderOpen(false)
    setNewFolderName('')
    setNewFolderClientId('')
    load()
  }

  async function deleteFolder(folder: FolderRow) {
    const [{ count: childCount }, { count: fileCount }] = await Promise.all([
      supabase.from('folders').select('id', { count: 'exact', head: true }).eq('parent_id', folder.id).is('deleted_at', null),
      supabase.from('documents').select('id', { count: 'exact', head: true }).eq('folder_id', folder.id).is('deleted_at', null),
    ])
    if ((childCount || 0) > 0 || (fileCount || 0) > 0) {
      await confirmDialog('Esta pasta não está vazia. Mova ou exclua o conteúdo antes de excluir a pasta.', { confirmLabel: 'Entendi' })
      return
    }
    if (!(await confirmDialog(`Excluir a pasta "${folder.name}"?`, { danger: true }))) return
    const { error } = await withErrorFeedback(supabase.from('folders').update({ deleted_at: new Date().toISOString() }).eq('id', folder.id), 'Erro ao excluir pasta')
    if (error) return
    load()
  }

  async function deleteFile(file: FileRow) {
    if (!(await confirmDialog('Excluir este arquivo?', { danger: true }))) return
    const { error } = await withErrorFeedback(supabase.from('documents').update({ deleted_at: new Date().toISOString() }).eq('id', file.id), 'Erro ao excluir arquivo')
    if (error) return
    load()
  }

  async function uploadIntoFolder() {
    if (!uploadFile || !currentFolder) return
    if (storage && storage.used + uploadFile.size > storage.quota) {
      const free = Math.max(0, storage.quota - storage.used)
      setUploadError(`Armazenamento cheio: você tem apenas ${formatFileSize(free)} livres de ${formatFileSize(storage.quota)}`)
      return
    }
    setUploading(true)
    setUploadError('')
    try {
      const path = `${profile?.tenant_id}/${Date.now()}_${sanitizeFileName(uploadFile.name)}`
      const { error: storageErr } = await supabase.storage.from('documents').upload(path, uploadFile)
      if (storageErr) throw storageErr
      const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(path)
      const { error: dbErr } = await supabase.from('documents').insert({
        tenant_id: profile?.tenant_id,
        title: uploadTitle.trim() || uploadFile.name,
        type: 'other',
        content: '',
        folder_id: currentFolder.id,
        client_id: currentFolder.client_id,
        file_url: publicUrl,
        file_name: uploadFile.name,
        file_size: uploadFile.size,
        file_mime: uploadFile.type,
      })
      if (dbErr) throw dbErr
      setUploadOpen(false)
      setUploadFile(null)
      setUploadTitle('')
      load()
    } catch (err: any) {
      setUploadError(err.message || 'Erro ao fazer upload')
    } finally {
      setUploading(false)
    }
  }

  const usedPct = storage && storage.quota ? Math.min(100, (storage.used / storage.quota) * 100) : 0

  return (
    <Layout title="Escritório Digital">
      <div className="space-y-6">

        {/* Origem: armazenamento interno x Google Drive */}
        <div className="flex items-center gap-1 border-b border-gray-200 dark:border-dark-700">
          <button
            onClick={() => setSource('local')}
            className={cn('flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              source === 'local'
                ? 'border-primary-600 text-primary-700 dark:text-primary-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200')}
          >
            <HardDrive className="w-4 h-4" /> Meu Armazenamento
          </button>
          <button
            onClick={() => setSource('drive')}
            className={cn('flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              source === 'drive'
                ? 'border-primary-600 text-primary-700 dark:text-primary-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200')}
          >
            <GIcon className="w-4 h-4" /> Google Drive
          </button>
        </div>

        {source === 'local' && (<>
        {/* Cota de armazenamento */}
        {storage && (
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-xl">
            <HardDrive className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                <span>{formatFileSize(storage.used)} usados de {formatFileSize(storage.quota)}</span>
                <span>{usedPct.toFixed(0)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-200 dark:bg-dark-700 overflow-hidden">
                <div className={cn('h-full rounded-full', usedPct > 90 ? 'bg-red-500' : usedPct > 70 ? 'bg-amber-500' : 'bg-primary-500')} style={{ width: `${usedPct}%` }} />
              </div>
            </div>
          </div>
        )}

        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-sm flex-wrap">
          <button onClick={() => goToBreadcrumb(-1)} className={cn('flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors', !currentFolder ? 'font-semibold text-gray-900 dark:text-gray-100' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200')}>
            <Home className="w-3.5 h-3.5" /> Escritório Digital
          </button>
          {path.map((f, i) => (
            <span key={f.id} className="flex items-center gap-1.5">
              <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
              <button onClick={() => goToBreadcrumb(i)} className={cn('px-2 py-1 rounded-lg transition-colors', i === path.length - 1 ? 'font-semibold text-gray-900 dark:text-gray-100' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200')}>
                {f.name}
              </button>
            </span>
          ))}
        </div>

        {/* Ações */}
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={() => { setNewFolderName(''); setNewFolderClientId(''); setNewFolderOpen(true) }}>
            <FolderPlus className="w-4 h-4" /> Nova pasta
          </Button>
          {currentFolder && (
            <Button variant="secondary" size="sm" onClick={() => { setUploadFile(null); setUploadTitle(''); setUploadError(''); setUploadOpen(true) }}>
              <Upload className="w-4 h-4" /> Enviar arquivo
            </Button>
          )}
          <div className="ml-auto flex items-center rounded-lg border border-gray-200 dark:border-dark-600 overflow-hidden">
            <button
              onClick={() => setViewMode('icons')}
              className={cn('p-1.5 transition-colors',
                viewMode === 'icons'
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-dark-700'
              )}
              title="Visualizar em ícones"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn('p-1.5 border-l border-gray-200 dark:border-dark-600 transition-colors',
                viewMode === 'list'
                  ? 'bg-primary-600 text-white border-l-primary-700'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-dark-700'
              )}
              title="Visualizar em lista"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Conteúdo */}
        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : subfolders.length === 0 && files.length === 0 ? (
          <EmptyState
            icon={Folder}
            title={currentFolder ? 'Pasta vazia' : 'Nenhuma pasta ainda'}
            description={currentFolder ? 'Envie um arquivo ou crie uma subpasta.' : 'Crie a primeira pasta do escritório ou de um cliente.'}
          />
        ) : viewMode === 'list' ? (
          <div className="border border-gray-200 dark:border-dark-600 rounded-xl divide-y divide-gray-100 dark:divide-dark-700/50 overflow-hidden">
            {subfolders.map(folder => (
              <div key={folder.id} className="group flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-dark-700/40 transition-colors">
                <button onClick={() => openFolder(folder)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  <Folder className="w-5 h-5 text-primary-400 flex-shrink-0" fill="currentColor" fillOpacity={0.15} />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{folder.name}</span>
                </button>
                <button
                  onClick={() => deleteFolder(folder)}
                  className="p-1.5 rounded-lg text-red-500 opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-900/20 transition-opacity flex-shrink-0" title="Excluir pasta">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {files.map(file => (
              <div key={file.id} className="group flex items-center gap-3 px-4 py-2 hover:bg-gray-50 dark:hover:bg-dark-700/40 transition-colors cursor-pointer" onClick={() => setPreviewFile(file)}>
                <FileIcon mime={file.file_mime} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{file.title}</p>
                  <p className="text-xs text-gray-400">{formatFileSize(file.file_size)}</p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  {file.file_url && (
                    <a href={file.file_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                      className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors" title="Baixar">
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <button onClick={e => { e.stopPropagation(); deleteFile(file) }}
                    className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Excluir">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
            {subfolders.map(folder => (
              <div key={folder.id} className="group flex flex-col items-center">
                <div className="relative w-full">
                  <button
                    onClick={() => openFolder(folder)}
                    className="relative w-full aspect-square rounded-xl border border-gray-200 dark:border-dark-600 bg-gray-50 dark:bg-dark-700 hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-lg transition-all flex items-center justify-center"
                  >
                    <Folder className="w-10 h-10 text-primary-400" fill="currentColor" fillOpacity={0.15} />
                  </button>
                  <button
                    onClick={() => deleteFolder(folder)}
                    className="absolute top-1.5 right-1.5 p-1.5 bg-white/90 rounded-lg text-red-500 opacity-0 group-hover:opacity-100 hover:bg-white transition-opacity" title="Excluir pasta">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <button onClick={() => openFolder(folder)} className="mt-2 text-xs font-medium text-gray-700 dark:text-gray-300 leading-tight line-clamp-2 text-center hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
                  {folder.name}
                </button>
              </div>
            ))}
            {files.map(file => (
              <div key={file.id} className="group flex flex-col items-center">
                <div
                  onClick={() => setPreviewFile(file)}
                  className="relative w-full aspect-square rounded-xl border border-gray-200 dark:border-dark-600 bg-white dark:bg-dark-800 hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-lg transition-all flex items-center justify-center cursor-pointer"
                >
                  <FileIcon mime={file.file_mime} />
                  <div className="absolute inset-0 bg-black/40 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    {file.file_url && (
                      <a href={file.file_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                        className="p-2 bg-white/90 rounded-lg text-emerald-600 hover:bg-white transition-colors" title="Baixar">
                        <Download className="w-4 h-4" />
                      </a>
                    )}
                    <button onClick={e => { e.stopPropagation(); deleteFile(file) }}
                      className="p-2 bg-white/90 rounded-lg text-red-500 hover:bg-white transition-colors" title="Excluir">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-xs font-medium text-gray-700 dark:text-gray-300 leading-tight line-clamp-2 text-center">{file.title}</p>
              </div>
            ))}
          </div>
        )}
        </>)}

        {source === 'drive' && (<>
        {!driveConnected ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-dark-700 flex items-center justify-center">
              <GIcon className="w-7 h-7" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Conecte sua conta do Google Drive</p>
              <p className="text-xs text-gray-400 mt-1 max-w-xs">Navegue, envie e organize arquivos direto do seu Google Drive, sem sair do LegalHub.</p>
            </div>
            {driveError && (
              <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40 rounded-xl px-3 py-2 max-w-sm">{driveError}</p>
            )}
            <button
              onClick={connectGoogleDrive}
              disabled={driveConnecting}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50 text-sm font-semibold transition-colors"
            >
              {driveConnecting ? <Loader className="w-4 h-4 animate-spin" /> : <GIcon className="w-4 h-4" />}
              {driveConnecting ? 'Conectando...' : 'Conectar Google Drive'}
            </button>
          </div>
        ) : (
          <>
            {driveError && (
              <div className="flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/40 rounded-xl">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <p className="flex-1 text-xs text-red-600 dark:text-red-400">{driveError}</p>
                <button onClick={connectGoogleDrive} disabled={driveConnecting} className="flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-400 hover:underline flex-shrink-0">
                  {driveConnecting ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Reconectar
                </button>
              </div>
            )}

            {/* Conta conectada */}
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <CheckCircle className="w-3.5 h-3.5 text-green-600 dark:text-green-400 flex-shrink-0" />
              <span>Conectado{driveEmail ? ` como ${driveEmail}` : ''}</span>
              <button onClick={disconnectGoogleDrive} className="ml-auto flex items-center gap-1.5 text-gray-400 hover:text-red-500 transition-colors" title="Desconectar">
                <Link2Off className="w-3.5 h-3.5" /> Desconectar
              </button>
            </div>

            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-sm flex-wrap">
              <button onClick={() => goToDriveBreadcrumb(-1)} className={cn('flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors', !driveCurrentFolder ? 'font-semibold text-gray-900 dark:text-gray-100' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200')}>
                <GIcon className="w-3.5 h-3.5" /> LegalHub (Drive)
              </button>
              {drivePath.map((f, i) => (
                <span key={f.id} className="flex items-center gap-1.5">
                  <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
                  <button onClick={() => goToDriveBreadcrumb(i)} className={cn('px-2 py-1 rounded-lg transition-colors', i === drivePath.length - 1 ? 'font-semibold text-gray-900 dark:text-gray-100' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200')}>
                    {f.name}
                  </button>
                </span>
              ))}
            </div>

            {/* Ações */}
            <div className="flex items-center gap-3">
              <Button variant="secondary" size="sm" onClick={() => { setDriveNewFolderName(''); setDriveNewFolderOpen(true) }}>
                <FolderPlus className="w-4 h-4" /> Nova pasta
              </Button>
              <Button variant="secondary" size="sm" onClick={() => { setDriveUploadFile(null); setDriveUploadError(''); setDriveUploadOpen(true) }}>
                <Upload className="w-4 h-4" /> Enviar arquivo
              </Button>
              <div className="ml-auto flex items-center rounded-lg border border-gray-200 dark:border-dark-600 overflow-hidden">
                <button onClick={() => setViewMode('icons')} className={cn('p-1.5 transition-colors', viewMode === 'icons' ? 'bg-primary-600 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-dark-700')} title="Visualizar em ícones">
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button onClick={() => setViewMode('list')} className={cn('p-1.5 border-l border-gray-200 dark:border-dark-600 transition-colors', viewMode === 'list' ? 'bg-primary-600 text-white border-l-primary-700' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-dark-700')} title="Visualizar em lista">
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Conteúdo */}
            {driveLoading ? (
              <div className="flex justify-center py-16"><Spinner /></div>
            ) : driveFolders.length === 0 && driveFiles.length === 0 ? (
              <EmptyState icon={Folder} title="Pasta vazia" description="Envie um arquivo ou crie uma subpasta no seu Google Drive." />
            ) : viewMode === 'list' ? (
              <div className="border border-gray-200 dark:border-dark-600 rounded-xl divide-y divide-gray-100 dark:divide-dark-700/50 overflow-hidden">
                {driveFolders.map(item => (
                  <div key={item.id} className="group flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-dark-700/40 transition-colors">
                    <button onClick={() => openDriveFolder(item)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                      <DriveFileIcon item={item} />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{item.name}</span>
                    </button>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button onClick={() => openRenameModal(item)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-dark-600 transition-colors" title="Renomear"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => openMoveModal(item)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-dark-600 transition-colors" title="Mover"><FolderInput className="w-3.5 h-3.5" /></button>
                      <button onClick={() => deleteDriveItem(item)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Excluir"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
                {driveFiles.map(item => (
                  <div key={item.id} className="group flex items-center gap-3 px-4 py-2 hover:bg-gray-50 dark:hover:bg-dark-700/40 transition-colors cursor-pointer" onClick={() => setDrivePreviewItem(item)}>
                    <DriveFileIcon item={item} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{item.name}</p>
                      <p className="text-xs text-gray-400">{formatFileSize(item.size ? Number(item.size) : undefined)}</p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button onClick={e => { e.stopPropagation(); downloadDriveItemClick(item) }} className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors" title="Baixar"><Download className="w-3.5 h-3.5" /></button>
                      <button onClick={e => { e.stopPropagation(); openRenameModal(item) }} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-dark-600 transition-colors" title="Renomear"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={e => { e.stopPropagation(); openMoveModal(item) }} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-dark-600 transition-colors" title="Mover"><FolderInput className="w-3.5 h-3.5" /></button>
                      <button onClick={e => { e.stopPropagation(); deleteDriveItem(item) }} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Excluir"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
                {driveFolders.map(item => (
                  <div key={item.id} className="group flex flex-col items-center">
                    <div className="relative w-full">
                      <button onClick={() => openDriveFolder(item)} className="relative w-full aspect-square rounded-xl border border-gray-200 dark:border-dark-600 bg-gray-50 dark:bg-dark-700 hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-lg transition-all flex items-center justify-center">
                        <Folder className="w-10 h-10 text-primary-400" fill="currentColor" fillOpacity={0.15} />
                      </button>
                      <div className="absolute top-1.5 right-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openRenameModal(item)} className="p-1.5 bg-white/90 rounded-lg text-gray-600 hover:bg-white transition-opacity" title="Renomear"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => deleteDriveItem(item)} className="p-1.5 bg-white/90 rounded-lg text-red-500 hover:bg-white transition-opacity" title="Excluir"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                    <button onClick={() => openDriveFolder(item)} className="mt-2 text-xs font-medium text-gray-700 dark:text-gray-300 leading-tight line-clamp-2 text-center hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
                      {item.name}
                    </button>
                  </div>
                ))}
                {driveFiles.map(item => (
                  <div key={item.id} className="group flex flex-col items-center">
                    <div onClick={() => setDrivePreviewItem(item)} className="relative w-full aspect-square rounded-xl border border-gray-200 dark:border-dark-600 bg-white dark:bg-dark-800 hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-lg transition-all flex items-center justify-center cursor-pointer">
                      <DriveFileIcon item={item} />
                      <div className="absolute inset-0 bg-black/40 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                        <button onClick={e => { e.stopPropagation(); downloadDriveItemClick(item) }} className="p-2 bg-white/90 rounded-lg text-emerald-600 hover:bg-white transition-colors" title="Baixar"><Download className="w-4 h-4" /></button>
                        <button onClick={e => { e.stopPropagation(); openRenameModal(item) }} className="p-2 bg-white/90 rounded-lg text-gray-600 hover:bg-white transition-colors" title="Renomear"><Pencil className="w-4 h-4" /></button>
                        <button onClick={e => { e.stopPropagation(); deleteDriveItem(item) }} className="p-2 bg-white/90 rounded-lg text-red-500 hover:bg-white transition-colors" title="Excluir"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                    <p className="mt-2 text-xs font-medium text-gray-700 dark:text-gray-300 leading-tight line-clamp-2 text-center">{item.name}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        </>)}
      </div>

      {/* Nova pasta */}
      <Modal open={newFolderOpen} onClose={() => setNewFolderOpen(false)} title="Nova pasta" size="sm">
        <div className="space-y-4">
          <Input label="Nome da pasta *" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="Ex: Contratos, Procurações..." autoFocus />
          {!currentFolder && (
            <Select label="Vincular a um cliente (opcional)" value={newFolderClientId} onChange={e => setNewFolderClientId(e.target.value)}>
              <option value="">Pasta geral do escritório</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setNewFolderOpen(false)} className="px-4 py-2 text-sm font-medium border border-gray-200 dark:border-dark-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
            Cancelar
          </button>
          <Button onClick={createFolder} loading={savingFolder} disabled={!newFolderName.trim()}>Criar pasta</Button>
        </div>
      </Modal>

      {/* Upload */}
      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="Enviar arquivo" size="md">
        <div className="space-y-4">
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault(); setDragOver(false)
              const f = e.dataTransfer.files[0]
              if (f) { setUploadFile(f); if (!uploadTitle) setUploadTitle(f.name.replace(/\.[^.]+$/, '')) }
            }}
            className={cn(
              'relative border-2 border-dashed rounded-xl flex flex-col items-center justify-center py-8 gap-3 transition-colors cursor-pointer',
              dragOver ? 'border-primary-400 bg-primary-50/60 dark:bg-primary-900/10' : 'border-gray-300 dark:border-dark-600 hover:border-primary-300 dark:hover:border-primary-600',
            )}
            onClick={() => document.getElementById('ed-file-input')?.click()}
          >
            <input id="ed-file-input" type="file" className="hidden" onChange={e => {
              const f = e.target.files?.[0]
              if (f) { setUploadFile(f); if (!uploadTitle) setUploadTitle(f.name.replace(/\.[^.]+$/, '')) }
            }} />
            {uploadFile ? (
              <>
                <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-emerald-500" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{uploadFile.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatFileSize(uploadFile.size)}</p>
                </div>
                <button onClick={e => { e.stopPropagation(); setUploadFile(null) }} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 transition-colors">
                  <X className="w-3 h-3" /> Remover
                </button>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-dark-700 flex items-center justify-center">
                  <Upload className="w-6 h-6 text-gray-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Arraste um arquivo ou clique para selecionar</p>
                  <p className="text-xs text-gray-400 mt-1">Máx. 50 MB</p>
                </div>
              </>
            )}
          </div>
          <Input label="Título do arquivo" value={uploadTitle} onChange={e => setUploadTitle(e.target.value)} placeholder="Nome para exibir" />
          {uploadError && (
            <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-100 rounded-xl px-3 py-2">{uploadError}</p>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setUploadOpen(false)} className="px-4 py-2 text-sm font-medium border border-gray-200 dark:border-dark-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
            Cancelar
          </button>
          <Button onClick={uploadIntoFolder} loading={uploading} disabled={!uploadFile}>
            <Upload className="w-4 h-4" /> Enviar
          </Button>
        </div>
      </Modal>

      {/* Preview */}
      {previewFile && (
        <Modal open={!!previewFile} onClose={() => setPreviewFile(null)} title={previewFile.title} size="xl">
          <div className="min-h-[400px]">
            {previewFile.file_mime === 'application/pdf' ? (
              <iframe src={previewFile.file_url} className="w-full rounded-xl border border-gray-100 dark:border-dark-700" style={{ height: 520 }} title={previewFile.title} />
            ) : previewFile.file_mime?.startsWith('image/') ? (
              <img src={previewFile.file_url} alt={previewFile.title} className="max-w-full max-h-[520px] mx-auto rounded-xl border border-gray-100 dark:border-dark-700 object-contain" />
            ) : (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <File className="w-16 h-16 text-gray-300" />
                <p className="text-sm text-gray-500 dark:text-gray-400">{previewFile.file_name}</p>
                {previewFile.file_size && <p className="text-xs text-gray-400">{formatFileSize(previewFile.file_size)}</p>}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setPreviewFile(null)} className="px-4 py-2 text-sm font-medium border border-gray-200 dark:border-dark-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
              Fechar
            </button>
            {previewFile.file_url && (
              <a href={previewFile.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors">
                <Download className="w-4 h-4" /> Baixar
              </a>
            )}
          </div>
        </Modal>
      )}

      {/* Drive — Nova pasta */}
      <Modal open={driveNewFolderOpen} onClose={() => setDriveNewFolderOpen(false)} title="Nova pasta no Google Drive" size="sm">
        <div className="space-y-4">
          <Input label="Nome da pasta *" value={driveNewFolderName} onChange={e => setDriveNewFolderName(e.target.value)} placeholder="Ex: Contratos, Procurações..." autoFocus />
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setDriveNewFolderOpen(false)} className="px-4 py-2 text-sm font-medium border border-gray-200 dark:border-dark-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
            Cancelar
          </button>
          <Button onClick={createDriveFolderSubmit} loading={driveSavingFolder} disabled={!driveNewFolderName.trim()}>Criar pasta</Button>
        </div>
      </Modal>

      {/* Drive — Upload */}
      <Modal open={driveUploadOpen} onClose={() => setDriveUploadOpen(false)} title="Enviar arquivo para o Google Drive" size="md">
        <div className="space-y-4">
          <div
            onDragOver={e => { e.preventDefault(); setDriveDragOver(true) }}
            onDragLeave={() => setDriveDragOver(false)}
            onDrop={e => {
              e.preventDefault(); setDriveDragOver(false)
              const f = e.dataTransfer.files[0]
              if (f) setDriveUploadFile(f)
            }}
            className={cn(
              'relative border-2 border-dashed rounded-xl flex flex-col items-center justify-center py-8 gap-3 transition-colors cursor-pointer',
              driveDragOver ? 'border-primary-400 bg-primary-50/60 dark:bg-primary-900/10' : 'border-gray-300 dark:border-dark-600 hover:border-primary-300 dark:hover:border-primary-600',
            )}
            onClick={() => document.getElementById('gdrive-file-input')?.click()}
          >
            <input id="gdrive-file-input" type="file" className="hidden" onChange={e => {
              const f = e.target.files?.[0]
              if (f) setDriveUploadFile(f)
            }} />
            {driveUploadFile ? (
              <>
                <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-emerald-500" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{driveUploadFile.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatFileSize(driveUploadFile.size)}</p>
                </div>
                <button onClick={e => { e.stopPropagation(); setDriveUploadFile(null) }} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 transition-colors">
                  <X className="w-3 h-3" /> Remover
                </button>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-dark-700 flex items-center justify-center">
                  <Upload className="w-6 h-6 text-gray-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Arraste um arquivo ou clique para selecionar</p>
                </div>
              </>
            )}
          </div>
          {driveUploadError && (
            <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-100 rounded-xl px-3 py-2">{driveUploadError}</p>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setDriveUploadOpen(false)} className="px-4 py-2 text-sm font-medium border border-gray-200 dark:border-dark-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
            Cancelar
          </button>
          <Button onClick={uploadIntoDriveFolder} loading={driveUploading} disabled={!driveUploadFile}>
            <Upload className="w-4 h-4" /> Enviar
          </Button>
        </div>
      </Modal>

      {/* Drive — Renomear */}
      <Modal open={!!renameTarget} onClose={() => setRenameTarget(null)} title="Renomear" size="sm">
        <div className="space-y-4">
          <Input label="Novo nome *" value={renameValue} onChange={e => setRenameValue(e.target.value)} autoFocus />
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setRenameTarget(null)} className="px-4 py-2 text-sm font-medium border border-gray-200 dark:border-dark-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
            Cancelar
          </button>
          <Button onClick={submitRename} loading={renaming} disabled={!renameValue.trim()}>Salvar</Button>
        </div>
      </Modal>

      {/* Drive — Mover */}
      <Modal open={!!moveTarget} onClose={() => setMoveTarget(null)} title={`Mover "${moveTarget?.name || ''}"`} size="sm">
        <div className="space-y-4">
          <Select label="Pasta de destino" value={moveDestination} onChange={e => setMoveDestination(e.target.value)}>
            <option value="">Selecione uma pasta...</option>
            {driveRootId && <option value={driveRootId}>LegalHub (Drive) — raiz</option>}
            {moveFolders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </Select>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setMoveTarget(null)} className="px-4 py-2 text-sm font-medium border border-gray-200 dark:border-dark-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
            Cancelar
          </button>
          <Button onClick={submitMove} loading={moving} disabled={!moveDestination}>Mover</Button>
        </div>
      </Modal>

      {/* Drive — Preview */}
      {drivePreviewItem && (
        <Modal open={!!drivePreviewItem} onClose={() => setDrivePreviewItem(null)} title={drivePreviewItem.name} size="xl">
          <div className="min-h-[400px]">
            <iframe
              src={getDrivePreviewUrl(drivePreviewItem)}
              className="w-full rounded-xl border border-gray-100 dark:border-dark-700"
              style={{ height: 520 }}
              title={drivePreviewItem.name}
              allow="autoplay"
            />
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setDrivePreviewItem(null)} className="px-4 py-2 text-sm font-medium border border-gray-200 dark:border-dark-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
              Fechar
            </button>
            <button
              onClick={() => downloadDriveItemClick(drivePreviewItem)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" /> Baixar
            </button>
          </div>
        </Modal>
      )}
    </Layout>
  )
}
