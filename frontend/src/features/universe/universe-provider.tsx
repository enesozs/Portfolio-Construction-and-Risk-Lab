import { type ReactNode, useCallback, useMemo, useState } from 'react'
import type { UniverseIn } from '@/lib/api'
import { initialUniverse, STORAGE_KEY, UniverseContext } from './universe-context'

/** The research universe shared by every page (edited in the universe bar). */
export function UniverseProvider({ children }: { children: ReactNode }) {
  const [universe, setState] = useState<UniverseIn>(initialUniverse)
  const setUniverse = useCallback((next: UniverseIn) => {
    setState(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // A remembered universe is a convenience; ignore storage failures.
    }
  }, [])
  const value = useMemo(() => ({ universe, setUniverse }), [universe, setUniverse])
  return <UniverseContext value={value}>{children}</UniverseContext>
}
