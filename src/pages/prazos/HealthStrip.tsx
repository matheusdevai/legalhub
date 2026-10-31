import { useState } from 'react'
import { AlertTriangle, CheckCircle2, ShieldAlert, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui'
import { toast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import { registerSourceCheck, type HealthSnapshot } from '@/lib/deadlines/api'
import { healthItems, overallLevel, type HealthLevel } from '@/lib/deadlines/health'
import { brasiliaNow } from '@/lib/deadlines/alerts'

const STYLE: Record<HealthLevel, string> = {
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300',
  warn: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300',
  error: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300',
}

const ICON = { ok: ShieldCheck, warn: AlertTriangle, error: ShieldAlert }

/** Faixa de saúde no topo do Painel de Prazos (especificação, seção 8). */
export function HealthStrip({ snapshot, onChanged }: { snapshot: HealthSnapshot; onChanged: () => void }) {
  const [saving, setSaving] = useState(false)
  const items = healthItems({ now: brasiliaNow(new Date()), ...snapshot })
  const level = overallLevel(items)
  const Icon = ICON[level]
  const problems = items.filter(i => i.level !== 'ok')

  async function confirmSources() {
    setSaving(true)
    const { error } = await registerSourceCheck()
    setSaving(false)
    if (error) { toast(`Não foi possível registrar: ${error.message}`, 'error'); return }
    toast('Conferência das fontes oficiais registrada.', 'success')
    onChanged()
  }

  return (
    <div role="status" className={cn('flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border px-4 py-3', STYLE[level])}>
      <Icon className="w-5 h-5 flex-shrink-0" />
      <div className="flex-1 min-w-0 text-sm">
        {level === 'ok' ? (
          <p className="font-semibold">Tudo em dia: intimações sincronizadas, alertas funcionando e fontes conferidas hoje.</p>
        ) : (
          <ul className="space-y-0.5">
            {problems.map(p => (
              <li key={p.key}><span className="font-semibold">{p.label}</span>{p.detail && <span className="opacity-80"> — {p.detail}</span>}</li>
            ))}
          </ul>
        )}
        {level !== 'ok' && items.some(i => i.level === 'ok') && (
          <p className="mt-1 text-xs opacity-75">{items.filter(i => i.level === 'ok').map(i => i.label).join(' · ')}</p>
        )}
      </div>
      {!snapshot.sourceCheckedToday && (
        <Button size="sm" variant="secondary" onClick={confirmSources} loading={saving} className="flex-shrink-0">
          <CheckCircle2 className="w-4 h-4" /> Conferi as fontes oficiais hoje
        </Button>
      )}
    </div>
  )
}
