import { useQuery } from '@tanstack/react-query'
import { InfoIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { WeightBars } from '@/components/charts/allocation-charts'
import { useChartColors } from '@/components/charts/theme'
import { TimeChart } from '@/components/charts/time-chart'
import { WeightsArea } from '@/components/charts/weights-area'
import { NumberInput } from '@/components/number-input'
import { PageHeader } from '@/components/page-header'
import { PanelSection } from '@/components/panel-section'
import { ParamControl } from '@/components/param-control'
import { PortfolioSelect } from '@/components/portfolio-select'
import { QueryError } from '@/components/query-error'
import { Segmented } from '@/components/segmented'
import { Stat, StatGrid } from '@/components/stat-grid'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useLab, useUniverse } from '@/features/universe/universe-context'
import { api, type DynamicResponse, type PortfolioKey, type SignalOut } from '@/lib/api'
import { fixed, longDate, pct, spct } from '@/lib/format'
import { portfolioLabel } from '@/lib/portfolios'
import { SignalStrip, TrialsChart } from './dynamic-charts'

type Method = 'filter' | 'top_k' | 'tilt' | 'black_litterman'

interface Params {
  method: Method
  timing: string | null
  timingParams: Record<string, number>
  ranking: string | null
  rankingParams: Record<string, number>
  baseMode: 'allocator' | 'custom'
  base: PortfolioKey
  custom: Record<string, number>
  offToCash: boolean
  topK: number
  tilt: number
  confidencePct: number
  rebalance: string
  lookback: string
  costBps: number
}

const METHODS: { value: Method; label: string; idea: string }[] = [
  {
    value: 'filter',
    label: 'Filter',
    idea: 'Hold the base weights of assets whose timing signal is on; the rest goes to cash or to the others.',
  },
  {
    value: 'top_k',
    label: 'Top-k',
    idea: 'Rank the assets and hold only the best few, weighted by the base method. With a timing signal, slots left empty are cash.',
  },
  {
    value: 'tilt',
    label: 'Tilt',
    idea: 'Keep every asset but lean the base weights toward high scores; strength sets how far.',
  },
  {
    value: 'black_litterman',
    label: 'BL views',
    idea: 'Turn scores into Black–Litterman views on returns and let max Sharpe weigh them against risk.',
  },
]

const PRESETS: { label: string; params: Partial<Params> }[] = [
  {
    label: 'Trend filter → cash',
    params: { method: 'filter', timing: 'trend', ranking: null, offToCash: true },
  },
  {
    label: 'Dual momentum (top 3)',
    params: { method: 'top_k', timing: 'absolute_momentum', ranking: 'momentum', topK: 3 },
  },
  {
    label: 'Momentum tilt',
    params: { method: 'tilt', timing: null, ranking: 'vol_adjusted_momentum', tilt: 0.5 },
  },
  {
    label: 'Momentum as BL views',
    params: { method: 'black_litterman', timing: null, ranking: 'momentum', tilt: 1 },
  },
]

const DEFAULTS: Params = {
  method: 'filter',
  timing: 'trend',
  timingParams: {},
  ranking: null,
  rankingParams: {},
  baseMode: 'allocator',
  base: 'equal_weight',
  custom: {},
  offToCash: true,
  topK: 3,
  tilt: 0.5,
  confidencePct: 50,
  rebalance: '21',
  lookback: '252',
  costBps: 5,
}

const NONE = '__none__'

function SignalPicker({
  label,
  kind,
  catalogue,
  value,
  params,
  optional,
  onChange,
  onParams,
}: {
  label: string
  kind: 'timing' | 'ranking'
  catalogue: SignalOut[]
  value: string | null
  params: Record<string, number>
  optional: boolean
  onChange: (key: string | null) => void
  onParams: (params: Record<string, number>) => void
}) {
  const options = catalogue.filter((s) => s.kind === kind)
  const items = [
    ...(optional ? [{ value: NONE, label: 'None' }] : []),
    ...options.map((s) => ({ value: s.key, label: s.label })),
  ]
  const spec = options.find((s) => s.key === value)
  return (
    <div className="flex flex-col gap-3">
      <span className="text-muted-foreground text-sm">{label}</span>
      <Select
        items={items}
        value={value ?? NONE}
        onValueChange={(v) => v && onChange(v === NONE ? null : v)}
      >
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectPopup>
          {items.map((i) => (
            <SelectItem key={i.value} value={i.value}>
              {i.label}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
      {spec && <p className="-mt-1 text-muted-foreground text-xs">{spec.idea}</p>}
      {spec?.params.map((p) => (
        <ParamControl
          key={p.name}
          label={p.label}
          value={params[p.name] ?? p.default}
          onChange={(v) => onParams({ ...params, [p.name]: v })}
          min={p.min}
          max={p.max}
          step={p.integer ? 1 : 0.01}
          digits={p.integer ? 0 : 2}
        />
      ))}
    </div>
  )
}

function Verdict({ data, baseName }: { data: DynamicResponse; baseName: string }) {
  const s = data.strategy_stats.performance
  const b = data.base_stats.performance
  const beats = data.probability_beats_base
  const deflated = data.deflated_probability
  return (
    <StatGrid className="grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
      <Stat
        label="Annual return"
        value={pct(s.annual_return, 1)}
        hint={`${spct(s.annual_return - b.annual_return, 1)} vs ${baseName}`}
      />
      <Stat label="Sharpe vs cash" value={fixed(s.sharpe, 2)} hint={`base ${fixed(b.sharpe, 2)}`} />
      <Stat
        label="Max drawdown"
        value={pct(s.max_drawdown, 1)}
        hint={`base ${pct(b.max_drawdown, 1)}`}
      />
      <Stat
        label="Average in cash"
        value={pct(data.strategy_stats.average_cash, 0)}
        hint={`${data.strategy_stats.rebalances} rebalances`}
      />
      <Stat
        label="P(beats the base)"
        value={beats == null ? '—' : pct(beats, 0)}
        hint="from the daily return gap"
      />
      <Stat
        label="After trying neighbours"
        value={deflated == null ? '—' : pct(deflated, 0)}
        hint={`deflated for ${data.trials.length} variants`}
      />
    </StatGrid>
  )
}

function PerformanceTable({ data, baseName }: { data: DynamicResponse; baseName: string }) {
  const rows = [
    { name: 'Strategy', s: data.strategy_stats },
    { name: `${baseName}, rebalanced`, s: data.base_stats },
    { name: `${baseName}, buy and hold`, s: data.hold_stats },
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base" render={<h2 />}>
          Side by side
        </CardTitle>
        <CardDescription>
          The same test period for every row, after trading costs. The rebalanced base trades on the
          same schedule with no signals, so the gap between the first two rows is what the signals
          added. Active return {spct(data.active_return, 1)} a year with a tracking error of{' '}
          {pct(data.tracking_error, 1)}.
        </CardDescription>
      </CardHeader>
      <CardPanel className="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Portfolio</TableHead>
              <TableHead className="text-right">Return</TableHead>
              <TableHead className="text-right">Volatility</TableHead>
              <TableHead className="text-right">Sharpe</TableHead>
              <TableHead className="text-right">Sortino</TableHead>
              <TableHead className="text-right">Max DD</TableHead>
              <TableHead className="text-right">Calmar</TableHead>
              <TableHead className="text-right">In cash</TableHead>
              <TableHead className="text-right">Turnover</TableHead>
              <TableHead className="text-right">Costs</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ name, s }) => (
              <TableRow key={name}>
                <TableCell className="font-medium">{name}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {pct(s.performance.annual_return, 1)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {pct(s.performance.annual_volatility, 1)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fixed(s.performance.sharpe, 2)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fixed(s.performance.sortino, 2)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {pct(s.performance.max_drawdown, 1)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fixed(s.performance.calmar, 2)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{pct(s.average_cash, 0)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {s.rebalances ? pct(s.average_turnover, 1) : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {s.rebalances ? pct(s.total_cost, 2) : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardPanel>
    </Card>
  )
}

function CurrentTarget({
  data,
  assets,
  stale,
}: {
  data: DynamicResponse
  assets: string[]
  stale: boolean
}) {
  const hasTiming = Object.keys(data.signal_on).length > 0
  const hasScores = Object.values(data.current.score).some((v) => v != null)
  return (
    <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
      <WeightBars
        title={`What the strategy holds now (${longDate(data.current.date)})`}
        description="The target weights after the latest close, cash included. This is what the rules say today, not a recommendation."
        guide={
          <p>
            These are the weights the backtest would trade into at the latest rebalance. Running the
            same rules forward would hold them until the next rebalance date.
          </p>
        }
        assets={[...assets, 'CASH']}
        series={[{ name: 'Target', weights: data.current.target }]}
        stale={stale}
        className="h-64"
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base" render={<h2 />}>
            Today's signals
          </CardTitle>
          <CardDescription>
            {hasTiming && 'In / out from the timing signal. '}
            {hasScores && 'Scores from the ranking signal: higher ranks first.'}
          </CardDescription>
        </CardHeader>
        <CardPanel className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                {hasTiming && <TableHead>Timing</TableHead>}
                {hasScores && <TableHead className="text-right">Score</TableHead>}
                <TableHead className="text-right">Target</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assets.map((a) => (
                <TableRow key={a}>
                  <TableCell className="font-medium font-mono">{a}</TableCell>
                  {hasTiming && (
                    <TableCell className={data.current.on[a] ? undefined : 'text-muted-foreground'}>
                      {data.current.on[a] ? 'in' : 'out'}
                    </TableCell>
                  )}
                  {hasScores && (
                    <TableCell className="text-right tabular-nums">
                      {fixed(data.current.score[a], 3)}
                    </TableCell>
                  )}
                  <TableCell className="text-right tabular-nums">
                    {pct(data.current.target[a], 1)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="font-medium">Cash</TableCell>
                {hasTiming && <TableCell />}
                {hasScores && <TableCell />}
                <TableCell className="text-right tabular-nums">
                  {pct(data.current.target.CASH, 1)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardPanel>
      </Card>
    </div>
  )
}

export default function DynamicPage() {
  const { universe } = useUniverse()
  const assets = universe.tickers
  const c = useChartColors()
  const [p, setP] = useState<Params>(DEFAULTS)
  const catalogue = useQuery({
    queryKey: ['signals'],
    queryFn: ({ signal }) => api.signals(signal),
    staleTime: Infinity,
  })
  const set = <K extends keyof Params>(key: K, value: Params[K]) => setP({ ...p, [key]: value })
  const setMethod = (method: Method) =>
    setP({
      ...p,
      method,
      timing: method === 'filter' ? (p.timing ?? 'trend') : p.timing,
      ranking: method === 'filter' ? null : (p.ranking ?? 'momentum'),
      topK: Math.min(p.topK, assets.length),
    })

  const request = useMemo(
    () => ({
      method: p.method,
      timing: p.timing,
      timing_params: p.timingParams,
      ranking: p.method === 'filter' ? null : p.ranking,
      ranking_params: p.rankingParams,
      base: p.baseMode === 'custom' ? ('custom' as const) : p.base,
      base_weights:
        p.baseMode === 'custom'
          ? Object.fromEntries(assets.map((a) => [a, (p.custom[a] ?? 100 / assets.length) / 100]))
          : null,
      // Tilt and BL views apply a timing signal only by moving out-of-signal weight to cash.
      off_to_cash: p.method === 'filter' ? p.offToCash : true,
      top_k: Math.min(p.topK, assets.length),
      tilt_strength: p.tilt,
      view_confidence: p.confidencePct / 100,
      rebalance_every: Number(p.rebalance),
      lookback: Number(p.lookback),
      cost_bps: p.costBps,
    }),
    [p, assets],
  )
  const query = useLab('dynamic', api.dynamic, request, { delay: 500 })
  const data = query.data
  const baseName = p.baseMode === 'custom' ? 'Custom base' : portfolioLabel(p.base)
  const method = METHODS.find((m) => m.value === p.method)

  return (
    <>
      <PageHeader title="Dynamic allocation">
        Keep the assets you chose, but let signals decide how much of each to hold, and when to step
        into cash. The same machinery as the walk-forward test: decisions use only past data,
        holdings drift between rebalances, and every trade pays costs. The yardstick is your base
        portfolio held without signals.
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside>
          <Card className="overflow-hidden">
            <PanelSection title="Start from" hint="Ready-made strategies; adjust anything below.">
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((preset) => (
                  <Button
                    key={preset.label}
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setP({
                        ...p,
                        ...preset.params,
                        timingParams: {},
                        rankingParams: {},
                        topK: Math.min(preset.params.topK ?? p.topK, assets.length),
                      })
                    }
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </PanelSection>
            <Separator />
            <PanelSection
              title="Base portfolio"
              hint="The allocation the signals adjust, and the benchmark they must beat."
            >
              <Segmented
                label="Base"
                value={p.baseMode}
                onChange={(v) => set('baseMode', v)}
                options={[
                  { value: 'allocator', label: 'A method' },
                  { value: 'custom', label: 'My weights' },
                ]}
                className="w-full"
              />
              {p.baseMode === 'allocator' ? (
                <PortfolioSelect label="Method" value={p.base} onChange={(v) => set('base', v)} />
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {assets.map((a) => (
                    <NumberInput
                      key={a}
                      label={a}
                      value={p.custom[a] ?? Math.round((100 / assets.length) * 10) / 10}
                      onChange={(v) => set('custom', { ...p.custom, [a]: v })}
                      min={0}
                      max={100}
                      step={1}
                      digits={1}
                      unit="%"
                    />
                  ))}
                  <p className="col-span-2 text-muted-foreground text-xs">
                    Relative weights, rescaled to 100%. A method is re-estimated at every rebalance;
                    your weights stay fixed.
                  </p>
                </div>
              )}
            </PanelSection>
            <Separator />
            <PanelSection title="Method" hint={method?.idea}>
              <Segmented
                label="Method"
                size="sm"
                value={p.method}
                onChange={setMethod}
                options={METHODS.map((m) => ({ value: m.value, label: m.label }))}
                className="w-full"
              />
              {p.method === 'top_k' && (
                <ParamControl
                  label="Assets held (k)"
                  value={Math.min(p.topK, assets.length)}
                  onChange={(v) => set('topK', v)}
                  min={1}
                  max={assets.length}
                  step={1}
                />
              )}
              {(p.method === 'tilt' || p.method === 'black_litterman') && (
                <ParamControl
                  label={p.method === 'tilt' ? 'Tilt strength' : 'View size (σ per z-score)'}
                  value={p.tilt}
                  onChange={(v) => set('tilt', v)}
                  min={0}
                  max={3}
                  step={0.05}
                  digits={2}
                />
              )}
              {p.method === 'black_litterman' && (
                <ParamControl
                  label="View confidence"
                  value={p.confidencePct}
                  onChange={(v) => set('confidencePct', v)}
                  min={5}
                  max={100}
                  step={5}
                  unit="%"
                />
              )}
            </PanelSection>
            <Separator />
            <PanelSection title="Signals">
              {catalogue.data ? (
                <>
                  <SignalPicker
                    label="Timing (in or out)"
                    kind="timing"
                    catalogue={catalogue.data.signals}
                    value={p.timing}
                    params={p.timingParams}
                    optional={p.method !== 'filter'}
                    onChange={(v) => setP({ ...p, timing: v, timingParams: {} })}
                    onParams={(v) => set('timingParams', v)}
                  />
                  {p.timing && p.method === 'filter' && (
                    <Label className="justify-between">
                      Out-of-signal weight goes to cash
                      <Switch
                        aria-label="Out-of-signal weight goes to cash"
                        checked={p.offToCash}
                        onCheckedChange={(v) => set('offToCash', v)}
                      />
                    </Label>
                  )}
                  {p.timing && (p.method === 'tilt' || p.method === 'black_litterman') && (
                    <p className="-mt-1 text-muted-foreground text-xs">
                      Assets whose timing signal is out keep no weight: their share goes to cash.
                    </p>
                  )}
                  {p.timing && p.method === 'filter' && !p.offToCash && (
                    <p className="-mt-2 text-muted-foreground text-xs">
                      Off: the base method is re-run on the assets still in, so the portfolio stays
                      invested unless every asset is out.
                    </p>
                  )}
                  {p.method !== 'filter' && (
                    <SignalPicker
                      label="Ranking (which assets first)"
                      kind="ranking"
                      catalogue={catalogue.data.signals}
                      value={p.ranking}
                      params={p.rankingParams}
                      optional={false}
                      onChange={(v) => setP({ ...p, ranking: v, rankingParams: {} })}
                      onParams={(v) => set('rankingParams', v)}
                    />
                  )}
                </>
              ) : (
                <Spinner className="size-4" />
              )}
            </PanelSection>
            <Separator />
            <PanelSection title="Trading">
              <div className="flex flex-col gap-2">
                <span className="text-muted-foreground text-sm">Rebalance every</span>
                <Segmented
                  label="Rebalance every"
                  value={p.rebalance}
                  onChange={(v) => set('rebalance', v)}
                  options={[
                    { value: '5', label: 'Week' },
                    { value: '21', label: 'Month' },
                    { value: '63', label: 'Quarter' },
                  ]}
                  className="w-full"
                />
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-muted-foreground text-sm">Estimation window</span>
                <Segmented
                  label="Estimation window"
                  value={p.lookback}
                  onChange={(v) => set('lookback', v)}
                  options={[
                    { value: '126', label: '6 mo' },
                    { value: '252', label: '1 yr' },
                    { value: '504', label: '2 yr' },
                  ]}
                  className="w-full"
                />
                <p className="text-muted-foreground text-xs">
                  Data the base method is estimated on. The test starts after this window.
                </p>
              </div>
              <ParamControl
                label="Cost per dollar traded"
                value={p.costBps}
                onChange={(v) => set('costBps', v)}
                min={0}
                max={50}
                step={1}
                unit="bp"
              />
            </PanelSection>
          </Card>
        </aside>
        <div className="flex min-w-0 flex-col gap-6">
          <QueryError error={query.error} />
          {!data && query.isFetching && (
            <div className="flex h-64 items-center justify-center gap-2 text-muted-foreground text-sm">
              <Spinner className="size-4" /> Backtesting the strategy and its neighbours…
            </div>
          )}
          {data && (
            <>
              <Verdict data={data} baseName={baseName} />
              <Alert variant="info">
                <InfoIcon aria-hidden="true" />
                <AlertTitle>Read the result with hindsight in mind</AlertTitle>
                <AlertDescription>
                  <p>
                    The test uses only past data at every decision, but the universe itself was
                    chosen today. A universe of assets that are famous <em>now</em> makes momentum
                    look better than it could have been in real time. The probability tiles measure
                    the gap to the base, deflated for the {data.trials.length} variants tried; they
                    cannot correct for how the assets were picked.
                  </p>
                </AlertDescription>
              </Alert>
              <TimeChart
                title="Growth of $1"
                description={`${longDate(data.start)} → ${longDate(data.end)}, after costs. The strategy against the same base rebalanced on the same schedule, the base bought and held, and cash.`}
                guide={
                  <>
                    <p>
                      The gap between the strategy and the rebalanced base is the signals' doing:
                      both trade on the same days, only the targets differ. Buy-and-hold shows what
                      never trading would have done.
                    </p>
                    <p>
                      Timing strategies often trail in strong bull markets (they sit in cash during
                      dips that recover) and earn their keep in long sell-offs.
                    </p>
                  </>
                }
                lines={[
                  { name: 'Strategy', color: c.series1, data: data.strategy },
                  { name: `${baseName}, rebalanced`, color: c.series2, data: data.base_rebalanced },
                  { name: 'Buy and hold', color: c.series3, data: data.buy_and_hold },
                  { name: 'Cash', color: c.muted, data: data.cash, dashed: true },
                ]}
                yName="Growth of $1"
                yFormat={(v) => `$${fixed(v, v < 10 ? 2 : 0)}`}
                logY
                baseline={1}
                stale={query.stale}
                ariaLabel="Growth of one dollar: strategy, rebalanced base, buy and hold, cash"
                className="h-80"
              />
              <div className="grid gap-6 xl:grid-cols-2">
                <TimeChart
                  title="Drawdown"
                  description="How far below its previous peak each portfolio was. Timing signals are mostly about making this shallower."
                  lines={[
                    { name: 'Strategy', color: c.series1, data: data.strategy_drawdown },
                    {
                      name: `${baseName}, rebalanced`,
                      color: c.series2,
                      data: data.base_drawdown,
                    },
                  ]}
                  yName="Below peak"
                  yFormat={(v) => pct(v, 0)}
                  baseline={0}
                  stale={query.stale}
                  ariaLabel="Drawdown of the strategy and the rebalanced base"
                />
                <WeightsArea
                  title="Holdings over time"
                  description="Share of wealth in each asset and in cash, end of each week."
                  guide={
                    <p>
                      Grey is cash. Bands change at rebalances and drift with prices in between; a
                      filter or dual momentum shows up as grey swelling in sell-offs.
                    </p>
                  }
                  assets={assets}
                  weights={data.holdings}
                  stale={query.stale}
                  className="h-72"
                />
              </div>
              {Object.keys(data.signal_on).length > 0 && (
                <SignalStrip data={data} assets={assets} stale={query.stale} />
              )}
              <PerformanceTable data={data} baseName={baseName} />
              <TrialsChart data={data} stale={query.stale} />
              <CurrentTarget data={data} assets={assets} stale={query.stale} />
            </>
          )}
        </div>
      </div>
    </>
  )
}
