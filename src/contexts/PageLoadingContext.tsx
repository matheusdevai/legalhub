import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { LoadingScreen } from '@/components/ui/LoadingScreen'

interface PageLoadingContextValue {
  setPageLoading: (v: boolean) => void
}

const PageLoadingContext = createContext<PageLoadingContextValue>({ setPageLoading: () => {} })

export function usePageLoading() {
  return useContext(PageLoadingContext)
}

/** Drop-in replacement for `useState(true)` in page load functions.
 *  Automatically shows/hides the global LoadingScreen. */
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

function RouteTransitionWatcher({ onRouteChange }: { onRouteChange: () => void }) {
  const location = useLocation()
  useEffect(() => {
    onRouteChange()
  }, [location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

export function PageLoadingProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(false)
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null)

  function setPageLoading(v: boolean) {
    if (v) {
      setLoading(true)
      if (timer) clearTimeout(timer)
    } else {
      // small delay so the animation doesn't flash for instant loads
      const t = setTimeout(() => setLoading(false), 200)
      setTimer(t)
    }
  }

  function handleRouteChange() {
    setLoading(true)
    if (timer) clearTimeout(timer)
    const t = setTimeout(() => setLoading(false), 700)
    setTimer(t)
  }

  return (
    <PageLoadingContext.Provider value={{ setPageLoading }}>
      <RouteTransitionWatcher onRouteChange={handleRouteChange} />
      {children}
      {loading && <LoadingScreen />}
    </PageLoadingContext.Provider>
  )
}
