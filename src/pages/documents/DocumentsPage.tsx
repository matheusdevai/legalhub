import { usePageLoadingState } from '@/contexts/PageLoadingContext'
import { useEffect, useState } from 'react'
import { Plus, Search, Trash2, Edit3, Eye, Copy, Image, Upload, Download, File, FileText, X } from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Modal, Input, Select, Textarea, Spinner, EmptyState } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cn, sanitizeFileName } from '@/lib/utils'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { withErrorFeedback } from '@/lib/errorFeedback'
import { openDocumentPrintWindow } from '@/lib/exportUtils'

interface Document {
  id: string
  title: string
  type: 'template' | 'contract' | 'petition' | 'other'
  category: string
  content: string
  tags?: string[]
  is_template: boolean
  created_at: string
  updated_at: string
  client_id?: string
  process_id?: string
  tenant_id?: string
  file_url?: string
  file_name?: string
  file_size?: number
  file_mime?: string
  area_direito?: string | null
  auto_doc_kind?: 'procuracao' | 'contrato_honorarios' | 'peticao_inicial' | null
}

// Mesma lista base usada em ClientsPage (área do direito do cliente) — mantém as sugestões alinhadas
// para que o matching automático de modelo↔cliente (por texto normalizado) tenha mais chance de bater.
const AREA_DIREITO_OPTIONS = ['Previdenciário', 'Cível', 'Consumidor', 'Trabalhista', 'Tributário', 'Criminal', 'Família', 'Empresarial', 'Imobiliário', 'Administrativo', 'Outro']

const AUTO_DOC_KIND_LABELS: Record<string, string> = {
  procuracao: 'Procuração',
  contrato_honorarios: 'Contrato de Honorários',
  peticao_inicial: 'Petição Inicial',
}

const FILTER_OPTIONS = [
  { id: '',          label: 'Todos os modelos' },
  { id: 'template',  label: 'Modelos' },
  { id: 'contract',  label: 'Contratos' },
  { id: 'petition',  label: 'Petições' },
  { id: 'other',     label: 'Outros' },
]

interface LibraryTemplate {
  id: string
  title: string
  type: string
  category: string | null
  content: string
  is_library_public: true
  area_direito?: string | null
  auto_doc_kind?: 'procuracao' | 'contrato_honorarios' | 'peticao_inicial' | null
}

function formatFileSize(bytes?: number) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileThumbnail({ mime, name }: { mime?: string; name?: string }) {
  const isPdf = mime === 'application/pdf'
  const isImage = mime?.startsWith('image/')
  const isWord = mime?.includes('word') || mime?.includes('wordprocessingml')
  const isExcel = mime?.includes('excel') || mime?.includes('spreadsheetml')

  const bg = isPdf ? 'bg-red-50' : isWord ? 'bg-blue-50' : isExcel ? 'bg-green-50' : isImage ? 'bg-purple-50' : 'bg-gray-50'
  const iconColor = isPdf ? 'text-red-400' : isWord ? 'text-blue-400' : isExcel ? 'text-green-400' : isImage ? 'text-purple-400' : 'text-gray-400'
  const label = isPdf ? 'PDF' : isWord ? 'DOCX' : isExcel ? 'XLSX' : isImage ? 'IMG' : (name?.split('.').pop()?.toUpperCase() || 'ARQ')
  const labelBg = isPdf ? 'bg-red-100 text-red-600' : isWord ? 'bg-blue-100 text-blue-600' : isExcel ? 'bg-green-100 text-green-600' : isImage ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-500'

  return (
    <div className={cn('w-full rounded flex flex-col items-center justify-center gap-2', bg)} style={{ aspectRatio: '0.707' }}>
      {isImage
        ? <Image className={cn('w-8 h-8', iconColor)} />
        : isPdf || isWord || isExcel
          ? <FileText className={cn('w-8 h-8', iconColor)} />
          : <File className={cn('w-8 h-8', iconColor)} />}
      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', labelBg)}>{label}</span>
    </div>
  )
}

// Mini document thumbnail — simulates an A4 page with text lines
function DocThumbnail({ content, title }: { content: string; title: string }) {
  const lines = (content || title).split('\n').filter(Boolean).slice(0, 20)
  return (
    <div className="w-full bg-white border border-gray-200 rounded shadow-sm overflow-hidden" style={{ aspectRatio: '0.707' }}>
      <div className="p-2 h-full">
        {lines.map((line, i) => (
          <div
            key={i}
            className={cn(
              'rounded-sm mb-0.5',
              i === 0
                ? 'h-1.5 bg-gray-700 w-3/4 mx-auto mb-1.5'
                : line.trim() === ''
                  ? 'h-1 w-0'
                  : 'h-1 bg-gray-300',
            )}
            style={i > 0 && line.trim() !== '' ? { width: `${55 + Math.random() * 40}%` } : undefined}
          />
        ))}
      </div>
    </div>
  )
}

export function DocumentsPage() {
  const { profile } = useAuth()
  const isSuperAdmin = profile?.role === 'super_admin'
  const [documents, setDocuments] = useState<Document[]>([])
  const [libraryTemplates, setLibraryTemplates] = useState<LibraryTemplate[]>([])
  const [loading, setLoading] = usePageLoadingState()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'escritorio' | 'publica'>('escritorio')
  const [modalOpen, setModalOpen] = useState(false)
  const [previewDoc, setPreviewDoc] = useState<any | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ title: '', type: 'template', category: '', content: '', tags: '', area_direito: '', auto_doc_kind: '' })
  const [editId, setEditId] = useState<string | null>(null)
  const [editingLibrary, setEditingLibrary] = useState(false)

  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadForm, setUploadForm] = useState({ title: '', category: '', tags: '', area_direito: '', auto_doc_kind: '' })
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [dragOver, setDragOver] = useState(false)

  async function load() {
    setLoading(true)
    const [{ data }, { data: libData }] = await Promise.all([
      supabase.from('documents').select('*').is('deleted_at', null).order('updated_at', { ascending: false }),
      supabase.from('document_library_templates').select('*').is('deleted_at', null).order('title'),
    ])
    setDocuments((data || []) as Document[])
    setLibraryTemplates((libData || []).map((t: any) => ({ ...t, is_library_public: true as const })))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function save() {
    if (!form.title.trim()) return
    setSaving(true)
    let error: { message: string } | null = null
    if (editingLibrary) {
      const payload = {
        title: form.title, type: form.type, category: form.category || null, content: form.content,
        area_direito: form.area_direito || null, auto_doc_kind: form.auto_doc_kind || null,
      }
      const res = editId
        ? await withErrorFeedback(supabase.from('document_library_templates').update(payload).eq('id', editId), 'Erro ao atualizar modelo')
        : await withErrorFeedback(supabase.from('document_library_templates').insert(payload), 'Erro ao criar modelo')
      error = res.error
    } else {
      const payload = {
        title: form.title, type: form.type,
        category: form.category || null, content: form.content,
        is_template: form.type === 'template',
        tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        area_direito: form.area_direito || null, auto_doc_kind: form.auto_doc_kind || null,
      }
      const res = editId
        ? await withErrorFeedback(supabase.from('documents').update(payload).eq('id', editId), 'Erro ao atualizar documento')
        : await withErrorFeedback(supabase.from('documents').insert({ ...payload, tenant_id: profile?.tenant_id }), 'Erro ao criar documento')
      error = res.error
    }
    setSaving(false)
    if (error) return
    setModalOpen(false)
    setForm({ title: '', type: 'template', category: '', content: '', tags: '', area_direito: '', auto_doc_kind: '' })
    setEditId(null); setEditingLibrary(false); load()
  }

  async function deleteDoc(id: string) {
    if (!(await confirmDialog('Deseja excluir este documento?'))) return
    const { error } = await withErrorFeedback(supabase.from('documents').update({ deleted_at: new Date().toISOString() }).eq('id', id), 'Erro ao excluir documento')
    if (error) return
    load()
  }

  async function deleteLibraryTemplate(id: string) {
    if (!(await confirmDialog('Excluir este modelo da Biblioteca Pública? Ele deixará de ficar visível para todos os escritórios.'))) return
    const { error } = await withErrorFeedback(supabase.from('document_library_templates').update({ deleted_at: new Date().toISOString() }).eq('id', id), 'Erro ao excluir modelo')
    if (error) return
    load()
  }

  function openNew(prefill?: Partial<typeof form>) {
    setEditId(null)
    setEditingLibrary(false)
    setForm({ title: '', type: 'template', category: '', content: '', tags: '', area_direito: '', auto_doc_kind: '', ...prefill })
    setModalOpen(true)
  }

  function openNewLibraryTemplate() {
    setEditId(null)
    setEditingLibrary(true)
    setForm({ title: '', type: 'template', category: '', content: '', tags: '', area_direito: '', auto_doc_kind: '' })
    setModalOpen(true)
  }

  function openEditLibraryTemplate(tpl: LibraryTemplate) {
    setEditId(tpl.id)
    setEditingLibrary(true)
    setForm({
      title: tpl.title, type: tpl.type, category: tpl.category || '', content: tpl.content, tags: '',
      area_direito: tpl.area_direito || '', auto_doc_kind: tpl.auto_doc_kind || '',
    })
    setModalOpen(true)
  }

  async function uploadDocument() {
    if (!uploadFile) return
    setUploading(true)
    setUploadError('')
    try {
      const path = `${profile?.tenant_id}/${Date.now()}_${sanitizeFileName(uploadFile.name)}`
      const { error: storageErr } = await supabase.storage.from('documents').upload(path, uploadFile)
      if (storageErr) throw storageErr
      const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(path)
      const { error: dbErr } = await supabase.from('documents').insert({
        tenant_id: profile?.tenant_id,
        title: uploadForm.title.trim() || uploadFile.name,
        type: 'other',
        category: uploadForm.category || null,
        content: '',
        is_template: !!uploadForm.auto_doc_kind,
        file_url: publicUrl,
        file_name: uploadFile.name,
        file_size: uploadFile.size,
        file_mime: uploadFile.type,
        tags: uploadForm.tags ? uploadForm.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        area_direito: uploadForm.area_direito || null,
        auto_doc_kind: uploadForm.auto_doc_kind || null,
      })
      if (dbErr) throw dbErr
      setUploadModalOpen(false)
      setUploadFile(null)
      setUploadForm({ title: '', category: '', tags: '', area_direito: '', auto_doc_kind: '' })
      load()
    } catch (err: any) {
      setUploadError(err.message || 'Erro ao fazer upload')
    } finally {
      setUploading(false)
    }
  }

  function openEdit(doc: Document) {
    setEditId(doc.id)
    setEditingLibrary(false)
    setForm({
      title: doc.title, type: doc.type, category: doc.category || '',
      content: doc.content || '', tags: (doc.tags || []).join(', '),
      area_direito: doc.area_direito || '', auto_doc_kind: doc.auto_doc_kind || '',
    })
    setModalOpen(true)
  }

  // Ponto único de fechamento do modal de criação/edição — garante que
  // `editingLibrary` (que decide em qual tabela `save()` grava) nunca fique
  // "grudado" de uma sessão anterior do modal, seja qual for o caminho usado
  // para fechar (botão Cancelar, X, clique no backdrop).
  function closeDocModal() {
    setModalOpen(false)
    setEditingLibrary(false)
  }

  const filterLabel = FILTER_OPTIONS.find(f => f.id === typeFilter)?.label || 'Todos os modelos'

  const displayDocs = activeTab === 'escritorio'
    ? documents.filter(d => {
        const matchSearch = !search || d.title.toLowerCase().includes(search.toLowerCase())
        const matchType = !typeFilter || d.type === typeFilter
        return matchSearch && matchType
      })
    : libraryTemplates.filter(d => {
        const matchSearch = !search || d.title.toLowerCase().includes(search.toLowerCase())
        const matchType = !typeFilter || d.type === typeFilter
        return matchSearch && matchType
      })

  return (
    <Layout title="Documentos">
      <div className="space-y-6">

        {/* "Iniciar um novo documento" */}
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">Iniciar um novo documento</p>
          <div className="flex items-stretch gap-4">
            {/* Em branco */}
            <button
              onClick={() => openNew()}
              className="flex flex-col items-center justify-center w-36 h-44 border-2 border-dashed border-gray-300 dark:border-dark-600 rounded-xl bg-white dark:bg-dark-800 hover:border-primary-400 dark:hover:border-primary-500 hover:bg-primary-50/30 dark:hover:bg-primary-900/10 transition-all group"
            >
              <Plus className="w-8 h-8 text-gray-300 dark:text-dark-500 group-hover:text-primary-400 transition-colors mb-2" />
              <span className="text-xs text-gray-500 dark:text-gray-400 group-hover:text-primary-600 dark:group-hover:text-primary-400 font-medium">Em branco</span>
            </button>

            {/* Criar novo modelo */}
            <button
              onClick={() => openNew({ type: 'template' })}
              className="flex flex-col items-center justify-center w-36 h-44 border border-gray-200 dark:border-dark-600 rounded-xl bg-white dark:bg-dark-800 hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-md transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-dark-700 flex items-center justify-center mb-2 group-hover:bg-primary-50 dark:group-hover:bg-primary-900/20 transition-colors">
                <Image className="w-5 h-5 text-gray-400 dark:text-dark-400 group-hover:text-primary-500 transition-colors" />
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400 group-hover:text-primary-600 dark:group-hover:text-primary-400 font-medium text-center leading-tight px-2">Criar novo modelo</span>
            </button>

            {/* Upload de arquivo */}
            <button
              onClick={() => { setUploadFile(null); setUploadForm({ title: '', category: '', tags: '', area_direito: '', auto_doc_kind: '' }); setUploadError(''); setUploadModalOpen(true) }}
              className="flex flex-col items-center justify-center w-36 h-44 border border-gray-200 dark:border-dark-600 rounded-xl bg-white dark:bg-dark-800 hover:border-emerald-400 dark:hover:border-emerald-500 hover:shadow-md transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-dark-700 flex items-center justify-center mb-2 group-hover:bg-emerald-50 dark:group-hover:bg-emerald-900/20 transition-colors">
                <Upload className="w-5 h-5 text-gray-400 dark:text-dark-400 group-hover:text-emerald-500 transition-colors" />
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 font-medium text-center leading-tight px-2">Upload de arquivo</span>
            </button>
          </div>
        </div>

        {/* Tabs: Modelos do Escritório | Biblioteca Pública */}
        <div className="border-b border-gray-200 dark:border-dark-700">
          <div className="flex gap-0">
            <button
              onClick={() => setActiveTab('escritorio')}
              className={cn(
                'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                activeTab === 'escritorio'
                  ? 'border-primary-600 text-primary-700 dark:text-primary-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              )}
            >
              Modelos do Escritório
            </button>
            <button
              onClick={() => setActiveTab('publica')}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                activeTab === 'publica'
                  ? 'border-primary-600 text-primary-700 dark:text-primary-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              )}
            >
              Biblioteca Pública
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500 text-white uppercase tracking-wide">novo</span>
            </button>
          </div>
        </div>

        {/* Search + filter */}
        {activeTab === 'escritorio' && !loading && documents.length === 0 ? (
          <EmptyState icon={FileText} title="Esta é a sua biblioteca" description={'Crie seu primeiro modelo clicando em "Em branco" acima.'} />
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                  placeholder="Pesquisar documento"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              {/* Filtrar por */}
              <div className="relative ml-auto flex items-center gap-2">
                {activeTab === 'publica' && isSuperAdmin && (
                  <button
                    onClick={openNewLibraryTemplate}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-primary-200 dark:border-primary-800 rounded-lg bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Novo modelo público
                  </button>
                )}
                <button
                  onClick={() => setFilterOpen(v => !v)}
                  className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors"
                >
                  <span className="text-xs text-gray-400 mr-1">Filtrar por</span>
                  {filterLabel}
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {filterOpen && (
                  <div className="absolute right-0 top-full mt-1 bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-600 rounded-xl shadow-lg z-20 py-1 min-w-[180px]">
                    {FILTER_OPTIONS.map(opt => (
                      <button key={opt.id} onClick={() => { setTypeFilter(opt.id); setFilterOpen(false) }}
                        className={cn('w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors',
                          typeFilter === opt.id && 'text-primary-600 dark:text-primary-400 font-semibold')}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Document grid */}
            {!loading && (displayDocs.length === 0 ? (
              <EmptyState icon={FileText} title="Nenhum documento encontrado" />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
                {displayDocs.map((doc, idx) => (
                  <div key={(doc as any).id || idx} className="group flex flex-col">
                    {/* Thumbnail card */}
                    <div className="relative rounded-xl overflow-hidden border border-gray-200 dark:border-dark-600 bg-gray-50 dark:bg-dark-700 hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-lg transition-all cursor-pointer p-2"
                      onClick={() => setPreviewDoc(doc)}>
                      {(doc as Document).file_url
                        ? <FileThumbnail mime={(doc as Document).file_mime} name={(doc as Document).file_name} />
                        : <DocThumbnail content={(doc as any).content || ''} title={doc.title} />}

                      {/* Hover overlay */}
                      <div className="absolute inset-0 bg-black/40 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button
                          onClick={e => { e.stopPropagation(); setPreviewDoc(doc) }}
                          className="p-2 bg-white/90 rounded-lg text-gray-700 hover:bg-white transition-colors" title="Visualizar">
                          <Eye className="w-4 h-4" />
                        </button>
                        {!(doc as any).is_library_public && (doc as Document).file_url && (
                          <a
                            href={(doc as Document).file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="p-2 bg-white/90 rounded-lg text-emerald-600 hover:bg-white transition-colors" title="Baixar">
                            <Download className="w-4 h-4" />
                          </a>
                        )}
                        {!(doc as any).is_library_public && !(doc as Document).file_url && (
                          <button
                            onClick={e => { e.stopPropagation(); openEdit(doc as Document) }}
                            className="p-2 bg-white/90 rounded-lg text-gray-700 hover:bg-white transition-colors" title="Editar">
                            <Edit3 className="w-4 h-4" />
                          </button>
                        )}
                        {!(doc as any).is_library_public && (
                          <button
                            onClick={e => { e.stopPropagation(); deleteDoc((doc as any).id) }}
                            className="p-2 bg-white/90 rounded-lg text-red-500 hover:bg-white transition-colors" title="Excluir">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        {(doc as any).is_library_public && (
                          <button
                            onClick={e => { e.stopPropagation(); openNew({ title: doc.title, type: (doc as any).type, category: (doc as any).category, content: (doc as any).content, area_direito: (doc as any).area_direito || '', auto_doc_kind: (doc as any).auto_doc_kind || '' }) }}
                            className="p-2 bg-white/90 rounded-lg text-gray-700 hover:bg-white transition-colors" title="Usar modelo">
                            <Copy className="w-4 h-4" />
                          </button>
                        )}
                        {(doc as any).is_library_public && isSuperAdmin && (
                          <button
                            onClick={e => { e.stopPropagation(); openEditLibraryTemplate(doc as LibraryTemplate) }}
                            className="p-2 bg-white/90 rounded-lg text-gray-700 hover:bg-white transition-colors" title="Editar (admin)">
                            <Edit3 className="w-4 h-4" />
                          </button>
                        )}
                        {(doc as any).is_library_public && isSuperAdmin && (
                          <button
                            onClick={e => { e.stopPropagation(); deleteLibraryTemplate((doc as any).id) }}
                            className="p-2 bg-white/90 rounded-lg text-red-500 hover:bg-white transition-colors" title="Excluir (admin)">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Title below card */}
                    <p className="mt-2 text-xs font-medium text-gray-700 dark:text-gray-300 leading-tight line-clamp-2 text-center">{doc.title}</p>
                    {(doc as any).category && (
                      <p className="text-[10px] text-gray-400 text-center mt-0.5">{(doc as any).category}</p>
                    )}
                    {(doc as any).auto_doc_kind && (
                      <p className="text-[10px] text-center mt-0.5">
                        <span className="px-1.5 py-0.5 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 font-semibold">
                          Auto · {AUTO_DOC_KIND_LABELS[(doc as any).auto_doc_kind]}{(doc as any).area_direito ? ` · ${(doc as any).area_direito}` : ''}
                        </span>
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </>
        )}

      </div>

      {/* Create/Edit Modal */}
      <Modal open={modalOpen} onClose={closeDocModal} title={
        editingLibrary ? (editId ? 'Editar Modelo Público' : 'Novo Modelo Público') : (editId ? 'Editar Documento' : 'Novo Documento')
      } size="lg">
        <div className="space-y-4">
          <Input label="Título *" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Nome do documento" />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Tipo" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
              <option value="template">Modelo</option>
              <option value="contract">Contrato</option>
              <option value="petition">Petição</option>
              <option value="other">Outro</option>
            </Select>
            <Input label="Categoria" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Ex: Cível, Contratos..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Área do Direito</label>
              <input list="doc-area-options"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                placeholder="Selecione ou digite" value={form.area_direito}
                onChange={e => setForm({ ...form, area_direito: e.target.value })} />
              <datalist id="doc-area-options">{AREA_DIREITO_OPTIONS.map(a => <option key={a} value={a} />)}</datalist>
            </div>
            <Select label="Gerar automaticamente como" value={form.auto_doc_kind} onChange={e => setForm({ ...form, auto_doc_kind: e.target.value })}>
              <option value="">Nenhum (modelo comum)</option>
              <option value="procuracao">Procuração</option>
              <option value="contrato_honorarios">Contrato de Honorários</option>
              <option value="peticao_inicial">Petição Inicial</option>
            </Select>
          </div>
          {form.auto_doc_kind && (
            <p className="text-xs text-primary-700 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/10 border border-primary-200 dark:border-primary-800 rounded-xl px-3 py-2">
              {form.auto_doc_kind === 'peticao_inicial'
                ? <>Ao concluir a tarefa "Protocolar processo" de um cliente na área "{form.area_direito || '— defina a área do direito acima —'}" e criar o processo, o sistema vai sugerir gerar esta petição automaticamente já preenchida com os dados do cliente e o número do processo.</>
                : <>Ao cadastrar um novo cliente na área "{form.area_direito || '— defina a área do direito acima —'}", o sistema vai sugerir gerar este documento automaticamente já preenchido com os dados do cliente.</>}
            </p>
          )}
          <Textarea label="Conteúdo" value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} rows={10}
            placeholder="Insira o conteúdo. Use [NOME_CLIENTE], [CPF_CNPJ], [ENDERECO], [CIDADE], [EMAIL], [TELEFONE], [AREA_DIREITO], [NOME_ESCRITORIO], [NOME_ADVOGADO], [OAB], [NUMERO_PROCESSO], [DATA] como variáveis..." />
          {!editingLibrary && (
            <Input label="Tags (separadas por vírgula)" value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="cível, contrato, honorários" />
          )}
          {editingLibrary && (
            <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2">
              Este modelo fica visível na Biblioteca Pública para todos os escritórios do sistema.
            </p>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={closeDocModal}
            className="px-4 py-2 text-sm font-medium border border-gray-200 dark:border-dark-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
            Cancelar
          </button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm font-semibold bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </Modal>

      {/* Preview Modal */}
      {previewDoc && (
        <Modal open={!!previewDoc} onClose={() => setPreviewDoc(null)} title={previewDoc.title} size="xl">
          {previewDoc.file_url ? (
            <div className="min-h-[400px]">
              {previewDoc.file_mime === 'application/pdf' ? (
                <iframe src={previewDoc.file_url} className="w-full rounded-xl border border-gray-100 dark:border-dark-700" style={{ height: 520 }} title={previewDoc.title} />
              ) : previewDoc.file_mime?.startsWith('image/') ? (
                <img src={previewDoc.file_url} alt={previewDoc.title} className="max-w-full max-h-[520px] mx-auto rounded-xl border border-gray-100 dark:border-dark-700 object-contain" />
              ) : (
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                  <File className="w-16 h-16 text-gray-300" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">{previewDoc.file_name}</p>
                  {previewDoc.file_size && <p className="text-xs text-gray-400">{formatFileSize(previewDoc.file_size)}</p>}
                  <a href={previewDoc.file_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors">
                    <Download className="w-4 h-4" /> Baixar arquivo
                  </a>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white dark:bg-dark-900 rounded-xl border border-gray-100 dark:border-dark-700 p-8 min-h-[400px]">
              <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 font-sans leading-relaxed">
                {previewDoc.content || 'Sem conteúdo.'}
              </pre>
            </div>
          )}
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setPreviewDoc(null)}
              className="px-4 py-2 text-sm font-medium border border-gray-200 dark:border-dark-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
              Fechar
            </button>
            {!previewDoc.is_library_public && previewDoc.file_url && (
              <a href={previewDoc.file_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors">
                <Download className="w-4 h-4" /> Baixar
              </a>
            )}
            {!previewDoc.is_library_public && !previewDoc.file_url && (
              <>
                <button onClick={() => openDocumentPrintWindow(previewDoc.title, previewDoc.content || '')}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold border border-gray-200 dark:border-dark-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
                  <FileText className="w-4 h-4" /> Imprimir / PDF
                </button>
                <button onClick={() => { openEdit(previewDoc); setPreviewDoc(null) }}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors">
                  <Edit3 className="w-4 h-4" /> Editar
                </button>
              </>
            )}
            {previewDoc.is_library_public && (
              <button onClick={() => { openNew({ title: previewDoc.title, type: previewDoc.type, category: previewDoc.category, content: previewDoc.content, area_direito: previewDoc.area_direito || '', auto_doc_kind: previewDoc.auto_doc_kind || '' }); setPreviewDoc(null) }}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors">
                <Copy className="w-4 h-4" /> Usar este modelo
              </button>
            )}
            {previewDoc.is_library_public && isSuperAdmin && (
              <button onClick={() => { openEditLibraryTemplate(previewDoc); setPreviewDoc(null) }}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold border border-gray-200 dark:border-dark-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
                <Edit3 className="w-4 h-4" /> Editar (admin)
              </button>
            )}
          </div>
        </Modal>
      )}

      {/* Upload Modal */}
      <Modal open={uploadModalOpen} onClose={() => setUploadModalOpen(false)} title="Upload de arquivo" size="md">
        <div className="space-y-4">
          {/* Drag-and-drop / file picker zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault(); setDragOver(false)
              const f = e.dataTransfer.files[0]
              if (f) { setUploadFile(f); if (!uploadForm.title) setUploadForm(v => ({ ...v, title: f.name.replace(/\.[^.]+$/, '') })) }
            }}
            className={cn(
              'relative border-2 border-dashed rounded-xl flex flex-col items-center justify-center py-8 gap-3 transition-colors cursor-pointer',
              dragOver ? 'border-primary-400 bg-primary-50/60 dark:bg-primary-900/10' : 'border-gray-300 dark:border-dark-600 hover:border-primary-300 dark:hover:border-primary-600',
            )}
            onClick={() => document.getElementById('doc-file-input')?.click()}
          >
            <input
              id="doc-file-input"
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.webp"
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) { setUploadFile(f); if (!uploadForm.title) setUploadForm(v => ({ ...v, title: f.name.replace(/\.[^.]+$/, '') })) }
              }}
            />
            {uploadFile ? (
              <>
                <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-emerald-500" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{uploadFile.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatFileSize(uploadFile.size)}</p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setUploadFile(null) }}
                  className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 transition-colors">
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
                  <p className="text-xs text-gray-400 mt-1">PDF, Word, Excel, imagens, TXT · Máx. 50 MB</p>
                </div>
              </>
            )}
          </div>

          <Input label="Título do documento" value={uploadForm.title} onChange={e => setUploadForm(v => ({ ...v, title: e.target.value }))} placeholder="Nome para exibir na biblioteca" />
          <Input label="Categoria (opcional)" value={uploadForm.category} onChange={e => setUploadForm(v => ({ ...v, category: e.target.value }))} placeholder="Ex: Cível, Contratos..." />
          <Input label="Tags (separadas por vírgula, opcional)" value={uploadForm.tags} onChange={e => setUploadForm(v => ({ ...v, tags: e.target.value }))} placeholder="contrato, honorários" />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Área do Direito</label>
              <input list="upload-area-options"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-dark-600 rounded-lg bg-gray-50 dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                placeholder="Selecione ou digite" value={uploadForm.area_direito}
                onChange={e => setUploadForm(v => ({ ...v, area_direito: e.target.value }))} />
              <datalist id="upload-area-options">{AREA_DIREITO_OPTIONS.map(a => <option key={a} value={a} />)}</datalist>
            </div>
            <Select label="Gerar automaticamente como" value={uploadForm.auto_doc_kind} onChange={e => setUploadForm(v => ({ ...v, auto_doc_kind: e.target.value }))}>
              <option value="">Nenhum (arquivo comum)</option>
              <option value="procuracao">Procuração</option>
              <option value="contrato_honorarios">Contrato de Honorários</option>
              <option value="peticao_inicial">Petição Inicial</option>
            </Select>
          </div>
          {uploadForm.auto_doc_kind && (
            <p className="text-xs text-primary-700 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/10 border border-primary-200 dark:border-primary-800 rounded-xl px-3 py-2">
              {uploadForm.auto_doc_kind === 'peticao_inicial'
                ? <>Ao concluir a tarefa "Protocolar processo" de um cliente na área "{uploadForm.area_direito || '— defina a área do direito acima —'}" e criar o processo, o sistema vai sugerir vincular este arquivo automaticamente.</>
                : <>Ao cadastrar um novo cliente na área "{uploadForm.area_direito || '— defina a área do direito acima —'}", o sistema vai sugerir gerar este arquivo automaticamente já vinculado ao cliente.</>} Como é um arquivo (não texto), ele não é preenchido com os dados do cliente — só fica pronto, associado à ficha do cliente, para você abrir e completar manualmente.
            </p>
          )}

          {uploadError && (
            <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-100 rounded-xl px-3 py-2">{uploadError}</p>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setUploadModalOpen(false)}
            className="px-4 py-2 text-sm font-medium border border-gray-200 dark:border-dark-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
            Cancelar
          </button>
          <button
            onClick={uploadDocument}
            disabled={!uploadFile || uploading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors disabled:opacity-50">
            {uploading ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Enviando...</> : <><Upload className="w-4 h-4" /> Fazer upload</>}
          </button>
        </div>
      </Modal>
    </Layout>
  )
}
