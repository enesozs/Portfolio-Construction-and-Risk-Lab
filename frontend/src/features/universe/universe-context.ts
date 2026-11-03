import {
  keepPreviousData,
  type QueryKey,
  useQuery,
  type UseQueryResult,
} from '@tanstack/react-query'
import { createContext, useContext, useMemo } from 'react'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { api, type OverviewResponse, type UniverseIn } from '@/lib/api'
import { fixed, pct } from '@/lib/format'

export const STORAGE_KEY = 'portlab-universe'

function yearsAgo(years: number): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - years)
  return d.toISOString().slice(0, 10)
}

export const PRESETS: { id: string; label: string; description: string; tickers: string[] }[] = [
  {
    id: 'core',
    label: 'Core six',
    description: 'Large caps across tech, health care and energy, plus long Treasuries.',
    tickers: ['AAPL', 'MSFT', 'NVDA', 'JNJ', 'XOM', 'TLT'],
  },
  {
    id: 'growth',
    label: 'Growth + defensives',
    description: 'Mega-cap growth with TSLA, balanced by J&J, Exxon and Treasuries.',
    tickers: ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'JNJ', 'XOM', 'TLT'],
  },
  {
    id: 'multi-asset',
    label: 'Multi-asset ETFs',
    description:
      'US, developed and emerging equities, Treasuries, aggregate bonds, gold, real estate and commodities.',
    tickers: ['SPY', 'EFA', 'EEM', 'IEF', 'AGG', 'GLD', 'VNQ', 'DBC'],
  },
  {
    id: 'stocks-bonds',
    label: 'Stocks and bonds',
    description:
      'The classic two-asset problem: US equities against long and intermediate Treasuries.',
    tickers: ['SPY', 'TLT', 'IEF'],
  },
]

/* Portfolio constraints (edited in the universe dialog). */
export type ConstraintsIn = NonNullable<UniverseIn['constraints']>

export const DEFAULT_CONSTRAINTS: Required<ConstraintsIn> = {
  long_short: false,
  max_short: 0.2,
  gross_leverage: 1.6,
  group_cap: null,
  max_holdings: null,
  max_tracking_error: null,
}

/** One-line summary for the universe bar, or null when only the defaults apply. */
export function constraintsSummary(c: ConstraintsIn | undefined): string | null {
  if (!c) return null
  const parts: string[] = []
  if (c.long_short)
    parts.push(
      `long-short (≤${pct(c.max_short ?? 0.2, 0)} short, ${fixed(c.gross_leverage ?? 1.6, 1)}× gross)`,
    )
  if (c.group_cap != null) parts.push(`≤${pct(c.group_cap, 0)} per group`)
  if (c.max_holdings != null) parts.push(`≤${c.max_holdings} holdings`)
  if (c.max_tracking_error != null) parts.push(`TE ≤${pct(c.max_tracking_error, 1)}`)
  return parts.length ? parts.join(' · ') : null
}

export const DEFAULT_UNIVERSE: UniverseIn = {
  tickers: PRESETS[0].tickers,
  start: yearsAgo(5),
  end: null,
  return_method: 'arithmetic',
  cov_method: 'ledoit_wolf',
  max_weight: null,
  risk_free: null,
}

export function initialUniverse(): UniverseIn {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return { ...DEFAULT_UNIVERSE, ...(JSON.parse(stored) as Partial<UniverseIn>) }
  } catch {
    // Storage unavailable (private mode) or corrupt: start from the defaults.
  }
  return DEFAULT_UNIVERSE
}

export interface UniverseState {
  universe: UniverseIn
  setUniverse: (next: UniverseIn) => void
}

export const UniverseContext = createContext<UniverseState | null>(null)

export function useUniverse(): UniverseState {
  const state = useContext(UniverseContext)
  if (!state) throw new Error('useUniverse must be used inside UniverseProvider')
  return state
}

/** The overview query doubles as the universe's metadata (sample dates, cash rate, warnings). */
export function useOverview(): UseQueryResult<OverviewResponse> {
  const { universe } = useUniverse()
  return useQuery({
    queryKey: ['overview', universe],
    queryFn: ({ signal }) => api.overview(universe, {}, signal),
    placeholderData: keepPreviousData,
    staleTime: 10 * 60_000,
  })
}

/**
 * Query an endpoint with the shared universe plus page parameters. Parameters are debounced,
 * so dragging a slider sends one request when it settles, and the previous result stays on
 * screen (dimmed) while the next one loads.
 */
export function useLab<P, R>(
  name: string,
  fetcher: (universe: UniverseIn, params: P, signal?: AbortSignal) => Promise<R>,
  params: P,
  options: { enabled?: boolean; delay?: number } = {},
): UseQueryResult<R> & { stale: boolean } {
  const { universe } = useUniverse()
  // Debounce the serialised params: a string compares by value, so a page can pass a fresh
  // object literal on every render without restarting the timer (or re-rendering forever).
  const serial = useDebouncedValue(JSON.stringify(params), options.delay ?? 300)
  const settled = useMemo(() => JSON.parse(serial) as P, [serial])
  const key: QueryKey = [name, universe, settled]
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => fetcher(universe, settled, signal),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  })
  return Object.assign(query, { stale: query.isPlaceholderData || query.isFetching })
}
