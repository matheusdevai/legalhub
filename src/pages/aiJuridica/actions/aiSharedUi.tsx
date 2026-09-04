import { useState } from 'react'
import { Copy, RefreshCw, AlertCircle, Paperclip, X } from 'lucide-react'
import { Button, Textarea, Spinner } from '@/components/ui'
import { toast } from '@/components/ui/Toast'
import { cn, formatDate } from '@/lib/utils'
import { fileToAiAttachment, validateAiAttachmentFile, type AiAttachment } from './aiAttachment'

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

export function AiAttachmentInput({
  value, onChange, disabled,
}: {
  value: AiAttachment | null
  onChange: (attachment: AiAttachment | null) => void
  disabled?: boolean
}) {
  const [error, setError] = useState('')
  const [reading, setReading] = useState(false)

  async function handleFile(file: File | undefined) {
    setError('')
    if (!file) return
    const validationError = validateAiAttachmentFile(file)
    if (validationError) {
      setError(validationError)
      return
    }
    setReading(true)
    try {
      onChange(await fileToAiAttachment(file))
    } catch {
      setError('Não foi possível ler o arquivo.')
    } finally {
      setReading(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
        Anexar arquivo (opcional)
      </label>
      {value ? (
        <div className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-dark-600 bg-slate-50 dark:bg-dark-700">
          <Paperclip className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="text-sm text-slate-600 dark:text-slate-300 truncate flex-1">{value.filename}</span>
          <button type="button" onClick={() => onChange(null)} disabled={disabled}
            className="p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 flex-shrink-0 disabled:opacity-50">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <label className={cn(
          'flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed transition-colors text-sm',
          disabled || reading
            ? 'border-slate-200 dark:border-dark-600 text-slate-400 cursor-not-allowed'
            : 'border-slate-300 dark:border-dark-600 text-slate-500 dark:text-slate-400 hover:border-primary-400 hover:text-primary-600 dark:hover:text-primary-400 cursor-pointer'
        )}>
          {reading
            ? <><Spinner className="w-3.5 h-3.5" /> Lendo arquivo…</>
            : <><Paperclip className="w-3.5 h-3.5" /> Anexar PDF ou imagem (máx. 15MB)</>}
          <input type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" disabled={disabled || reading}
            onChange={e => { const f = e.target.files?.[0]; handleFile(f); e.target.value = '' }} />
        </label>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
