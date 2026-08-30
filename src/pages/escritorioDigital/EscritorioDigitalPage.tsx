import { usePageLoadingState } from '@/contexts/PageLoadingContext'
import { useEffect, useState } from 'react'
import { Folder, FolderPlus, Upload, ChevronRight, Trash2, Download, File, FileText, Image, X, HardDrive, Home, LayoutGrid, List } from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Modal, Input, Select, Spinner, EmptyState, Button } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cn, sanitizeFileName } from '@/lib/utils'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { withErrorFeedback } from '@/lib/errorFeedback'
import { getTenantStorageQuotaBytes } from '@/lib/storageUtils'

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
    </Layout>
  )
}
