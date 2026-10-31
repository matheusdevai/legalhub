import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, ReactNode } from 'react'

interface PageLoadingContextValue {
  setPageLoading: (v: boolean) => void
}

const PageLoadingContext = createContext<PageLoadingContextValue>({ setPageLoading: () => {} })

export function usePageLoading() {
  return useContext(PageLoadingContext)
}

/** Drop-in replacement for `useState(true)` in page load functions.
 *  Liga/desliga a barrinha de progresso no topo enquanto a página busca dados. */
export function usePageLoadingState(initial = true): [boolean, (v: boolean) => void] {
  const { setPageLoading } = useContext(PageLoadingContext)
  const [loading, setLocal] = useState(initial)

  function setLoading(v: boolean) {
    setLocal(v)
    setPageLoading(v)
  }

  useEffect(() => {
    if (initial) setPageLoading(true)
    return () => setPageLoading(false) // cleanup on unmount
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return [loading, setLoading]
}

// Carregamento de página NÃO cobre mais a tela com a logomarca (isso fica só na
// abertura do app, enquanto o login é verificado): mostra uma barra fina no
// topo, sem bloquear a navegação, e só se demorar mais que SHOW_DELAY_MS —
// carregamentos rápidos não piscam nada.
const SHOW_DELAY_MS = 150

function TopProgressBar() {
  return (
    <div role="progressbar" aria-label="Carregando" className="fixed top-0 left-0 right-0 z-[9999] h-0.5 overflow-hidden pointer-events-none">
      <div className="h-full w-1/3 rounded-full bg-primary-500 shadow-[0_0_8px_rgba(37,99,235,0.6)]" style={{ animation: 'lhTopBar 1.1s ease-in-out infinite' }} />
      <style>{`@keyframes lhTopBar { 0% { transform: translateX(-100%) } 100% { transform: translateX(300%) } }`}</style>
    </div>
  )
}

export function PageLoadingProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setPageLoading = useCallback((v: boolean) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = v ? setTimeout(() => setVisible(true), SHOW_DELAY_MS) : null
    if (!v) setVisible(false)
  }, [])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const value = useMemo(() => ({ setPageLoading }), [setPageLoading])

  return (
    <PageLoadingContext.Provider value={value}>
      {children}
      {visible && <TopProgressBar />}
    </PageLoadingContext.Provider>
  )
}
