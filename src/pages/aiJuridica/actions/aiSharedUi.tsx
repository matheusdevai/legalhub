import { Copy, RefreshCw, AlertCircle } from 'lucide-react'
import { Button, Textarea } from '@/components/ui'
import { toast } from '@/components/ui/Toast'
import { formatDate } from '@/lib/utils'

// UI compartilhada só entre os 3 componentes de ação do builder A
// (analise_processo_administrativo/judicial, analise_documento) — arquivo
// novo, não editado pelo outro builder da fase 2, então não colide com
// AiPeticaoInicial/AiCumprimentoDespacho/AiImpugnacaoRecurso.

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
      />
      <p className="text-xs text-slate-400 dark:text-slate-500 italic">
        Conteúdo gerado por IA — revise antes de usar profissionalmente.
      </p>
    </div>
  )
}
