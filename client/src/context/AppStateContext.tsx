import * as React from 'react'
import { api, ApiError } from '@/lib/api'
import type { AppState } from '@/lib/types'

interface AppStateContextValue {
  state: AppState | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  /** Gọi 1 API mutation và cập nhật state toàn cục với response (đã kèm state mới nhất). */
  mutate: (fn: () => Promise<AppState>) => Promise<AppState>
}

const AppStateContext = React.createContext<AppStateContextValue | null>(null)

function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AppState | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const refetch = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await api.getState()
      setState(next)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không kết nối được tới server')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    refetch()
  }, [refetch])

  const mutate = React.useCallback(async (fn: () => Promise<AppState>) => {
    const next = await fn()
    setState(next)
    return next
  }, [])

  const value = React.useMemo(
    () => ({ state, loading, error, refetch, mutate }),
    [state, loading, error, refetch, mutate]
  )

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

function useAppState() {
  const ctx = React.useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState phải được dùng bên trong AppStateProvider')
  return ctx
}

export { AppStateProvider, useAppState }
