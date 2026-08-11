import { useEffect, useState } from 'react'
import { Modal, Button } from './index'

// ─── Confirmação assíncrona, substituindo window.confirm() ─────────────────────
// window.confirm() é um diálogo nativo do navegador: trava a aba até o usuário
// clicar, não tem a marca do sistema, e não respeita dark mode. confirmDialog()
// resolve pra um Promise<boolean>, então o call site só troca
// `if (!confirm('...')) return` por `if (!(await confirmDialog('...'))) return`.
interface ConfirmOptions {
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

interface ConfirmRequest extends ConfirmOptions {
  message: string
  resolve: (value: boolean) => void
}

let dispatch: ((request: ConfirmRequest) => void) | null = null

export function confirmDialog(message: string, options?: ConfirmOptions): Promise<boolean> {
  return new Promise(resolve => {
    if (!dispatch) { resolve(window.confirm(message)); return }
    dispatch({ message, resolve, ...options })
  })
}

/** Monta uma única vez na raiz do app (ver App.tsx). */
export function ConfirmDialogHost() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null)

  useEffect(() => {
    dispatch = setRequest
    return () => { dispatch = null }
  }, [])

  if (!request) return null

  function resolve(value: boolean) {
    request!.resolve(value)
    setRequest(null)
  }

  return (
    <Modal open onClose={() => resolve(false)} title={request.title || 'Confirmar ação'} size="sm">
      <p className="text-sm text-slate-600 dark:text-slate-300">{request.message}</p>
      <div className="flex items-center justify-end gap-2 mt-6">
        <Button variant="secondary" size="sm" onClick={() => resolve(false)}>{request.cancelLabel || 'Cancelar'}</Button>
        <Button variant={request.danger ? 'danger' : 'primary'} size="sm" onClick={() => resolve(true)}>{request.confirmLabel || 'Confirmar'}</Button>
      </div>
    </Modal>
  )
}
