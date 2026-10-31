import { Sparkles, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { Confidence, TextSuggestion } from '@/lib/deadlines/suggest'

const CONFIDENCE: Record<Confidence, { label: string; cls: string }> = {
  alta: { label: 'Leitura clara', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  media: { label: 'Confira', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  baixa: { label: 'Leitura incerta', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
}

const UNIT_TEXT: Record<string, string> = { dias_uteis: 'dias úteis', dias_corridos: 'dias corridos', meses: 'meses', anos: 'anos' }

interface Props {
  suggestion: TextSuggestion
  source: 'regras' | 'ia'
  onApply: () => void
  onAskAi?: () => void
  askingAi?: boolean
}

/** O que foi lido da intimação, com o trecho que justifica — sempre sugestão a conferir. */
export function SuggestionBox({ suggestion: s, source, onApply, onAskAi, askingAi }: Props) {
  const c = CONFIDENCE[s.confidence]
  const summary = [s.actType, s.amount !== null ? `${s.amount} ${UNIT_TEXT[s.unit || 'dias_uteis']}` : null].filter(Boolean).join(' · ')
  return (
    <div className="rounded-xl border border-primary-100 dark:border-primary-900/40 bg-primary-50/50 dark:bg-primary-900/10 p-3 text-xs space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {source === 'ia' ? <Sparkles className="w-4 h-4 text-primary-600" /> : <Wand2 className="w-4 h-4 text-primary-600" />}
        <span className="font-semibold text-slate-800 dark:text-slate-100">{source === 'ia' ? 'Leitura da IA' : 'Lido da intimação'}: {summary || 'nada identificado'}</span>
        <span className={cn('rounded-full px-2 py-0.5 font-semibold', c.cls)}>{c.label}</span>
      </div>
      {s.evidence.map((e, i) => <p key={i} className="italic text-slate-600 dark:text-slate-300">“{e}”</p>)}
      {s.notes.length > 0 && (
        <ul className="list-disc pl-4 space-y-0.5 text-slate-600 dark:text-slate-300">
          {s.notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        {(s.actType || s.amount !== null) && <Button size="sm" variant="secondary" onClick={onApply}>Usar esta sugestão</Button>}
        {onAskAi && s.confidence === 'baixa' && (
          <Button size="sm" variant="ghost" onClick={onAskAi} loading={askingAi}><Sparkles className="w-3.5 h-3.5" /> Pedir uma segunda leitura à IA</Button>
        )}
        {askingAi && <span className="self-center text-slate-500">A IA está lendo a intimação — pode levar até meio minuto.</span>}
      </div>
    </div>
  )
}
