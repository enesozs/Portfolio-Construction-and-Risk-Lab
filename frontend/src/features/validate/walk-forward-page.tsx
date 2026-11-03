import { useMemo, useState } from 'react'
import { ChartGuide } from '@/components/chart-guide'
import { ChartCard, LegendKey } from '@/components/charts/chart-card'
import { type ChartOption, EChart } from '@/components/charts/echart'
import {
  assetColor,
  axisStyle,
  GRID,
  tooltipHeader,
  tooltipRow,
  tooltipStyle,
  useChartColors,
} from '@/components/charts/theme'
import { TimeChart } from '@/components/charts/time-chart'
import { PageHeader } from '@/components/page-header'
import { PanelSection } from '@/components/panel-section'
import { ParamControl } from '@/components/param-control'
import { PortfolioSelect } from '@/components/portfolio-select'
import { QueryError } from '@/components/query-error'
import { Segmented } from '@/components/segmented'
import { Stat, StatGrid } from '@/components/stat-grid'
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useLab, useUniverse } from '@/features/universe/universe-context'
import {
  api,
  type Performance,
  type PortfolioKey,
  type TimeSeries,
  type WalkForwardResponse,
} from '@/lib/api'
import { fixed, longDate, pct, spct } from '@/lib/format'
import { portfolioLabel } from '@/lib/portfolios'

const LOOKBACKS = ['126', '252', '504', '756'] as const
const REBALANCES = ['5', '21', '63', '126'] as const
const LOOKBACK_LABELS: Record<(typeof LOOKBACKS)[number], string> = {
  '126': '6 mo',
  '252': '1 yr',
  '504': '2 yr',
  '756': '3 yr',
}
const REBALANCE_LABELS: Record<(typeof REBALANCES)[number], string> = {
  '5': 'Weekly',
  '21': 'Monthly',
  '63': 'Quarterly',
  '126': 'Half-yearly',
}

const money = (v: number) => `$${fixed(v, v < 10 ? 2 : 0)}`

/** Log scale only when the lines span a wide range (long samples); otherwise linear reads better. */
function wideRange(series: TimeSeries[]): boolean {
  let lo = Infinity
  let hi = -Infinity
  for (const s of series)
    for (const v of s.values) {
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
  return lo > 0 && hi / lo > 10
}

/** Target weights at each rebalance, held flat until the next one, stacked to 100%. */
function TargetsChart({
  data,
  assets,
  stale,
}: {
  data: WalkForwardResponse
  assets: string[]
  stale: boolean
}) {
  const c = useChartColors()
  const segments = useMemo(() => {
    const known = assets.filter((a) => a in data.targets)
    const rest = known.slice(c.categorical.length)
    const names = [...known.slice(0, c.categorical.length), ...(rest.length ? ['Other'] : [])]
    return names.map((name) => ({
      name,
      color: name === 'Other' ? c.other : assetColor(c, assets.indexOf(name)),
      members: name === 'Other' ? rest : [name],
    }))
  }, [assets, data.targets, c])
  const option = useMemo<ChartOption | null>(() => {
    const first = segments[0] && data.targets[segments[0].members[0]]
    if (!first || first.dates.length === 0) return null
    const axis = axisStyle(c)
    const dates = first.dates
    // Extend the last target to the end of the test so the final holding period shows.
    const end = data.net.dates[data.net.dates.length - 1]
    const xs = end && end > dates[dates.length - 1] ? [...dates, end] : dates
    return {
      animationDurationUpdate: 150,
      grid: { ...GRID, top: 16 },
      tooltip: {
        ...tooltipStyle(c),
        formatter: (raw: unknown) => {
          const params = raw as { seriesName: string; color: string; value: [string, number] }[]
          if (!params.length) return ''
          return (
            tooltipHeader(`Target set ${longDate(params[0].value[0])}`) +
            [...params]
              .reverse()
              .filter((p) => p.value[1] > 0.0005)
              .map((p) => tooltipRow(p.color, pct(p.value[1], 1), p.seriesName))
              .join('')
          )
        },
      },
      xAxis: {
        type: 'time',
        ...axis,
        splitLine: { show: false },
        axisLabel: { ...axis.axisLabel, hideOverlap: true },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 1,
        ...axis,
        axisLabel: { ...axis.axisLabel, formatter: (v: number) => pct(v, 0) },
      },
      series: segments.map((seg) => ({
        name: seg.name,
        type: 'line' as const,
        stack: 'targets',
        step: 'end' as const,
        showSymbol: false,
        data: xs.map((d, k) => {
          const i = Math.min(k, dates.length - 1)
          const v = seg.members.reduce((s, a) => s + (data.targets[a]?.values[i] ?? 0), 0)
          return [d, Math.max(v, 0)]
        }),
        // The boundary line is drawn in the surface colour: a 2px gap between fills.
        lineStyle: { width: 2, color: c.surface },
        itemStyle: { color: seg.color },
        areaStyle: { color: seg.color, opacity: 1 },
        emphasis: { disabled: true },
      })),
    }
  }, [segments, data, c])
  return (
    <ChartCard
      title="Target weights over time"
      description="The allocation chosen at each rebalance date, using only the data available that day. Between rebalances the actual holdings drift away from these targets with prices."
      guide={
        <>
          <p>
            Each band is one asset's share of capital in the new target. Large jumps from one
            rebalance to the next mean the allocator is reacting strongly to a changing estimation
            window, which shows up as turnover and cost.
          </p>
          <p>
            A stable picture suggests the method is not chasing noise; a jumpy one suggests its
            in-sample weights are less reliable than they look.
          </p>
        </>
      }
      action={
        <div className="flex max-w-md flex-wrap gap-x-4 gap-y-1">
          {segments.map((s) => (
            <LegendKey key={s.name} color={s.color} label={s.name} band />
          ))}
        </div>
      }
      stale={stale}
    >
      {option ? (
        <EChart
          option={option}
          className="h-80"
          ariaLabel="Stacked area of target weights per asset at each rebalance date"
        />
      ) : (
        <div className="h-80" />
      )}
    </ChartCard>
  )
}

function PerformanceTable({ data, label }: { data: WalkForwardResponse; label: string }) {
  const rows: { name: string; perf: Performance; trading: boolean }[] = [
    { name: `${label}, after costs`, perf: data.performance, trading: true },
    { name: 'Before costs', perf: data.gross_performance, trading: true },
    { name: 'Equal weight (buy and hold)', perf: data.equal_weight_performance, trading: false },
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base" render={<h2 />}>
          Out-of-sample performance
        </CardTitle>
        <CardDescription>
          The same test period for all three rows. Return and volatility (Vol) are annual; Sharpe
          and Sortino use returns in excess of cash; Max DD is the worst peak-to-trough fall and
          Calmar is return divided by it.
        </CardDescription>
        <ChartGuide noun="table">
          <p>
            The gap between the first two rows is what trading cost. The equal-weight row needs no
            estimates and never trades after day one, so a method has to beat it after costs to
            justify its complexity.
          </p>
          <p>
            Turnover is one-way (the share of the portfolio bought, equal to the share sold) per
            rebalance; total cost is the sum of all costs as a share of capital.
          </p>
        </ChartGuide>
      </CardHeader>
      <CardPanel className="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Strategy</TableHead>
              <TableHead className="text-right">Return</TableHead>
              <TableHead className="text-right">Vol</TableHead>
              <TableHead className="text-right">Sharpe</TableHead>
              <TableHead className="text-right">Sortino</TableHead>
              <TableHead className="text-right">Max DD</TableHead>
              <TableHead className="text-right">Calmar</TableHead>
              <TableHead className="text-right">Turnover</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Rebalances</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={r.name}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {pct(r.perf.annual_return, 1)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {pct(r.perf.annual_volatility, 1)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fixed(r.perf.sharpe, 2)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fixed(r.perf.sortino, 2)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {pct(r.perf.max_drawdown, 1)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fixed(r.perf.calmar, 2)}</TableCell>
                <TableCell className="text-right text-muted-foreground tabular-nums">
                  {r.trading ? pct(data.average_turnover, 1) : '—'}
                </TableCell>
                <TableCell className="text-right text-muted-foreground tabular-nums">
                  {i === 0 ? pct(data.total_cost, 2) : i === 1 ? pct(0, 2) : '—'}
                </TableCell>
                <TableCell className="text-right text-muted-foreground tabular-nums">
                  {r.trading ? data.rebalances : 0}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardPanel>
    </Card>
  )
}

export default function WalkForwardPage() {
  const { universe } = useUniverse()
  const c = useChartColors()
  const [method, setMethod] = useState<PortfolioKey>('min_variance')
  const [window, setWindow] = useState<'rolling' | 'expanding'>('rolling')
  const [lookback, setLookback] = useState<(typeof LOOKBACKS)[number]>('252')
  const [rebalance, setRebalance] = useState<(typeof REBALANCES)[number]>('21')
  const [cost, setCost] = useState(5)
  // Memoised so the debounced params keep their identity between renders.
  const params = useMemo(
    () => ({
      method,
      window,
      lookback: Number(lookback),
      rebalance_every: Number(rebalance),
      cost_bps: cost,
    }),
    [method, window, lookback, rebalance, cost],
  )
  const query = useLab('walk-forward', api.walkForward, params)
  const data = query.data
  const label = portfolioLabel(method)
  const start = data?.net.dates[0]
  const log = data ? wideRange([data.net, data.equal_weight]) : false
  const excess = data
    ? data.performance.annual_return - data.equal_weight_performance.annual_return
    : 0

  return (
    <>
      <PageHeader title="Walk-forward test">
        An honest backtest of an allocation method. At each rebalance date the method sees only the
        data up to that day, picks weights, and holds them until the next date. Costs are paid on
        what is actually traded, and the result is compared with doing nothing clever: equal weight
        and cash.
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside>
          <Card className="overflow-hidden">
            <PanelSection
              title="Allocator"
              hint="The method re-run at every rebalance on the trailing data."
            >
              <PortfolioSelect value={method} onChange={setMethod} label="Method" />
            </PanelSection>
            <Separator />
            <PanelSection
              title="Estimation window"
              hint="Rolling forgets old data and adapts faster; expanding keeps everything since the start and is steadier."
            >
              <Segmented
                label="Window type"
                value={window}
                onChange={setWindow}
                options={[
                  { value: 'rolling', label: 'Rolling' },
                  { value: 'expanding', label: 'Expanding' },
                ]}
              />
              <div className="flex flex-col gap-2">
                <span className="text-muted-foreground text-sm">
                  {window === 'rolling' ? 'Lookback' : 'Initial window'}
                </span>
                <Segmented
                  label="Lookback"
                  size="sm"
                  value={lookback}
                  onChange={setLookback}
                  options={LOOKBACKS.map((v) => ({ value: v, label: LOOKBACK_LABELS[v] }))}
                />
                <p className="text-muted-foreground text-xs">
                  Trading days of history per decision. The first {lookback} days are used only for
                  estimation, so the test starts after them.
                </p>
              </div>
            </PanelSection>
            <Separator />
            <PanelSection
              title="Trading"
              hint="More frequent rebalancing tracks the targets closely but trades more."
            >
              <div className="flex flex-col gap-2">
                <span className="text-muted-foreground text-sm">Rebalance every</span>
                <Segmented
                  label="Rebalance frequency"
                  size="sm"
                  value={rebalance}
                  onChange={setRebalance}
                  options={REBALANCES.map((v) => ({ value: v, label: REBALANCE_LABELS[v] }))}
                />
              </div>
              <ParamControl
                label="Cost per dollar traded"
                value={cost}
                onChange={setCost}
                min={0}
                max={50}
                step={1}
                unit="bp"
              />
            </PanelSection>
          </Card>
        </aside>
        <div className="flex min-w-0 flex-col gap-6">
          <QueryError error={query.error} title="Could not run the walk-forward test" />
          {data && (
            <>
              <StatGrid className="grid-cols-2 md:grid-cols-4">
                <Stat
                  label="Annual return after costs"
                  value={pct(data.performance.annual_return, 1)}
                  hint={`${spct(excess, 1)} vs equal weight`}
                />
                <Stat
                  label="Sharpe vs cash"
                  value={fixed(data.performance.sharpe, 2)}
                  hint={`equal weight ${fixed(data.equal_weight_performance.sharpe, 2)}`}
                />
                <Stat
                  label="Cost drag"
                  value={pct(
                    data.gross_performance.annual_return - data.performance.annual_return,
                    2,
                  )}
                  hint="annual return lost to trading"
                />
                <Stat
                  label="Test period"
                  value={`${data.rebalances} rebalances`}
                  hint={start ? `from ${longDate(start)}` : undefined}
                />
              </StatGrid>
              <TimeChart
                title="Growth of $1, out of sample"
                description={`${label} after costs (solid) and before costs (dashed), against buy-and-hold equal weight and cash over the same test period.${log ? ' Log scale.' : ''}`}
                guide={
                  <>
                    <p>
                      Every point on the {label.toLowerCase()} line uses weights chosen with data up
                      to the previous rebalance, so there is no look-ahead: this is what you could
                      have earned following the rule live.
                    </p>
                    <p>
                      The space between solid and dashed is trading cost. If the equal-weight line
                      ends higher, the optimiser's estimates did not pay for themselves over this
                      period; if cash ends higher, taking risk did not pay at all.
                    </p>
                  </>
                }
                lines={[
                  { name: `${label} (net)`, color: c.series1, data: data.net },
                  { name: `${label} (gross)`, color: c.series1, data: data.gross, dashed: true },
                  { name: 'Equal weight, buy and hold', color: c.series2, data: data.equal_weight },
                  { name: 'Cash', color: c.muted, data: data.cash, dashed: true },
                ]}
                yName={log ? 'Growth of $1 (log)' : 'Growth of $1'}
                yFormat={money}
                logY={log}
                baseline={1}
                stale={query.stale}
                ariaLabel="Growth of one dollar: walk-forward strategy after and before costs, equal weight, and cash"
                className="h-80"
              />
              <PerformanceTable data={data} label={label} />
              <div className="grid gap-6 xl:grid-cols-2">
                <TimeChart
                  title="Predicted vs realised volatility"
                  description="At each rebalance: the volatility the estimates predicted for the new weights, and the volatility they actually delivered until the next rebalance."
                  guide={
                    <>
                      <p>
                        Risk estimates are only useful if they hold up out of sample. When the
                        realised line sits above the predicted one, the portfolio was riskier than
                        the model believed, which typically happens when markets turn turbulent.
                      </p>
                      <p>
                        Short holding periods make realised volatility noisy, so look for persistent
                        gaps rather than single spikes.
                      </p>
                    </>
                  }
                  lines={[
                    { name: 'Predicted', color: c.series1, data: data.predicted_volatility },
                    { name: 'Realised', color: c.series2, data: data.realized_volatility },
                  ]}
                  yName="Annual volatility"
                  yFormat={(v) => pct(v, 0)}
                  stale={query.stale}
                  ariaLabel="Predicted and realised annual volatility at each rebalance"
                />
                <TargetsChart data={data} assets={universe.tickers} stale={query.stale} />
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
