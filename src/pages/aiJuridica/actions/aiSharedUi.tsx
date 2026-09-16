import { useState } from 'react'
import { Copy, RefreshCw, AlertCircle, Paperclip, X } from 'lucide-react'
import { Button, Textarea, Spinner } from '@/components/ui'
import { toast } from '@/components/ui/Toast'
import { cn, formatDate } from '@/lib/utils'
import { AI_ATTACHMENT_MAX_COUNT, fileToAiAttachment, validateAiAttachmentFile, type AiAttachment } from './aiAttachment'

// UI compartilhada pelos 7 componentes de ação (loading/erro/resultado/anexo).

export function AiErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/15 border border-red-100 dark:border-red-800/30">
      <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
        <AlertCircle className="w-4 h-4 flex-shrink-0" /> {message}
      </div>
      <Button variant="outline" size="sm" onClick={onRetry} className="flex-shrink-0">
        <RefreshCw className="w-3.5 h-3.5" /> Tentar novamente
      </Button>
    </div>
  )
}

export function AiResultOutput({
  output, onChange, generatedAt,
}: {
  output: string
  onChange: (value: string) => void
  generatedAt: Date | null
}) {
  function copiar() {
    navigator.clipboard.writeText(output)
    toast('Resultado copiado para a área de transferência.', 'success')
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Resultado (editável)
        </label>
        <div className="flex items-center gap-3">
          {generatedAt && (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              Gerado às {formatDate(generatedAt, 'dd/MM/yyyy HH:mm')}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={copiar} disabled={!output}>
            <Copy className="w-3.5 h-3.5" /> Copiar
          </Button>
        </div>
      </div>
      <Textarea
        value={output}
        onChange={e => onChange(e.target.value)}
        rows={16}
        placeholder="O resultado gerado pela IA aparecerá aqui."
        className="font-mono text-xs leading-relaxed"
      />
      <p className="text-xs text-slate-400 dark:text-slate-500 italic">
        Conteúdo gerado por IA — revise antes de usar profissionalmente.
      </p>
    </div>
  )
}

/** Anexa um ou mais documentos (PDF/imagem) a um card pra análise da IA — Gemini aceita várias inlineData parts na mesma chamada. */
export function AiAttachmentsInput({
  value, onChange, disabled,
}: {
  value: AiAttachment[]
  onChange: (attachments: AiAttachment[]) => void
  disabled?: boolean
}) {
  const [error, setError] = useState('')
  const [reading, setReading] = useState(false)

  async function handleFiles(files: FileList | null) {
    setError('')
    if (!files || files.length === 0) return
    const selected = Array.from(files)
    const remainingSlots = AI_ATTACHMENT_MAX_COUNT - value.length
    if (remainingSlots <= 0) {
      setError(`Você já anexou o máximo de ${AI_ATTACHMENT_MAX_COUNT} documentos.`)
      return
    }
    const toProcess = selected.slice(0, remainingSlots)
    if (selected.length > toProcess.length) {
      setError(`Só é possível anexar até ${AI_ATTACHMENT_MAX_COUNT} documentos. Os demais arquivos selecionados foram ignorados.`)
    }
    for (const file of toProcess) {
      const validationError = validateAiAttachmentFile(file)
      if (validationError) {
        setError(validationError)
        return
      }
    }
    setReading(true)
    try {
      const converted = await Promise.all(toProcess.map(fileToAiAttachment))
      onChange([...value, ...converted])
    } catch {
      setError('Não foi possível ler o arquivo.')
    } finally {
      setReading(false)
    }
  }

  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index))
  }

  const atLimit = value.length >= AI_ATTACHMENT_MAX_COUNT

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
        Anexar documentos (opcional)
      </label>

      {value.length > 0 && (
        <ul className="space-y-1.5">
          {value.map((att, i) => (
            <li key={`${att.filename}-${i}`} className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-dark-600 bg-slate-50 dark:bg-dark-700">
              <Paperclip className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <span className="text-sm text-slate-600 dark:text-slate-300 truncate flex-1">{att.filename}</span>
              <span className="text-[11px] text-slate-400 flex-shrink-0">{att.mime_type.split('/')[1]?.toUpperCase()}</span>
              <button type="button" onClick={() => removeAt(i)} disabled={disabled}
                className="p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 flex-shrink-0 disabled:opacity-50">
                <X className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!atLimit && (
        <label className={cn(
          'flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed transition-colors text-sm',
          disabled || reading
            ? 'border-slate-200 dark:border-dark-600 text-slate-400 cursor-not-allowed'
            : 'border-slate-300 dark:border-dark-600 text-slate-500 dark:text-slate-400 hover:border-primary-400 hover:text-primary-600 dark:hover:text-primary-400 cursor-pointer'
        )}>
          {reading
            ? <><Spinner className="w-3.5 h-3.5" /> Lendo arquivo…</>
            : <><Paperclip className="w-3.5 h-3.5" /> {value.length > 0 ? 'Anexar mais documentos' : 'Anexar PDF ou imagem'} (máx. {AI_ATTACHMENT_MAX_COUNT}, 15MB cada)</>}
          <input type="file" accept="application/pdf,image/jpeg,image/png" multiple className="hidden" disabled={disabled || reading}
            onChange={e => { handleFiles(e.target.files); e.target.value = '' }} />
        </label>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
