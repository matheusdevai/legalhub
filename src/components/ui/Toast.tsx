import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Notificação não bloqueante, substituindo window.alert() ───────────────────
// window.alert() trava a aba até o usuário clicar OK e não tem a marca do
// sistema. toast() empilha uma notificação no canto da tela que some sozinha.
type ToastVariant = 'error' | 'success' | 'info'
interface ToastItem { id: number; message: string; variant: ToastVariant }

let dispatch: ((item: Omit<ToastItem, 'id'>) => void) | null = null
let nextId = 0

export function toast(message: string, variant: ToastVariant = 'info') {
  if (!dispatch) { if (variant === 'error') window.alert(message); return }
  dispatch({ message, variant })
}

const VARIANT_META: Record<ToastVariant, { icon: typeof CheckCircle2; className: string }> = {
  error:   { icon: XCircle,      className: 'bg-red-600 text-white' },
  success: { icon: CheckCircle2, className: 'bg-emerald-600 text-white' },
  info:    { icon: Info,         className: 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' },
}

/** Monta uma única vez na raiz do app (ver App.tsx). */
export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    dispatch = (item) => {
      const id = ++nextId
      setItems(prev => [...prev, { ...item, id }])
      setTimeout(() => setItems(prev => prev.filter(t => t.id !== id)), 5000)
    }
    return () => { dispatch = null }
  }, [])

  if (items.length === 0) return null

  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 items-end max-w-[calc(100vw-2.5rem)]">
      {items.map(item => {
        const meta = VARIANT_META[item.variant]
        const Icon = meta.icon
        return (
          <div key={item.id} className={cn('flex items-start gap-2.5 px-4 py-3 rounded-xl shadow-modal text-sm font-medium max-w-sm animate-slide-up', meta.className)}>
            <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span className="flex-1">{item.message}</span>
            <button onClick={() => setItems(prev => prev.filter(t => t.id !== item.id))} className="flex-shrink-0 opacity-70 hover:opacity-100">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
