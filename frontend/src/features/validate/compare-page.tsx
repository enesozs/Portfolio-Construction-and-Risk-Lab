import { useMemo, useState } from 'react'
import { ChartGuide } from '@/components/chart-guide'
import { ChartCard, LegendKey } from '@/components/charts/chart-card'
import { type ChartOption, EChart } from '@/components/charts/echart'
import {
  axisStyle,
  type ChartColors,
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
import { QueryError } from '@/components/query-error'
import { Segmented } from '@/components/segmented'
import { Stat, StatGrid } from '@/components/stat-grid'
import { Badge } from '@/components/ui/badge'
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useLab } from '@/features/universe/universe-context'
import { api, type CompareMethodsResponse, type PortfolioKey } from '@/lib/api'
import { fixed, longDate, pct } from '@/lib/format'
import { portfolioLabel } from '@/lib/portfolios'
import { cn } from '@/lib/utils'

type Method = CompareMethodsResponse['methods'][number]
type Overfitting = NonNullable<CompareMethodsResponse['overfitting']>

const LOOKBACKS = ['126', '252', '504', '756'] as const
const REBALANCES = ['21', '63', '126'] as const
const LOOKBACK_LABELS: Record<(typeof LOOKBACKS)[number], string> = {
  '126': '6 mo',
  '252': '1 yr',
  '504': '2 yr',
  '756': '3 yr',
}
const REBALANCE_LABELS: Record<(typeof REBALANCES)[number], string> = {
  '21': 'Monthly',
  '63': 'Quarterly',
  '126': 'Half-yearly',
}
const ESTIMATOR_LABELS: Record<string, string> = {
  sample: 'Sample',
  ledoit_wolf: 'Ledoit–Wolf',
  ewma: 'EWMA',
  denoised: 'Denoised (Marchenko–Pastur)',
}
/** Lines on one chart (dataviz rule). */
const MAX_LINES = 4
const SIGNIFICANCE = 0.05

const money = (v: number) => `$${fixed(v, v < 10 ? 2 : 0)}`

function slotColors(c: ChartColors): string[] {
  return [c.series1, c.series2, c.series3, c.categorical[3]]
}

function bySharpe(methods: Method[]): Method[] {
  return [...methods].sort(
    (a, b) => (b.performance.sharpe ?? -Infinity) - (a.performance.sharpe ?? -Infinity),
  )
}

/** Equal weight, the best and worst by Sharpe, and minimum variance (distinct, up to four). */
function defaultSlots(methods: Method[]): (string | null)[] {
  const ranked = bySharpe(methods)
  const wanted = [
    'equal_weight',
    ranked[0]?.key,
    ranked[ranked.length - 1]?.key,
    'min_variance',
    ...ranked.map((m) => m.key),
  ]
  const keys = methods.map((m) => m.key)
  const picked: string[] = []
  for (const k of wanted)
    if (k && keys.includes(k) && !picked.includes(k) && picked.length < MAX_LINES) picked.push(k)
  return [...picked, ...Array<null>(MAX_LINES - picked.length).fill(null)]
}

function errorLabel(key: string): string {
  if (key === 'overfitting') return 'Overfitting test'
  try {
    return portfolioLabel(key as PortfolioKey)
  } catch {
    return key
  }
}

function Verdict({ m }: { m: Method }) {
  if (m.key === 'equal_weight') return <span className="text-muted-foreground">benchmark</span>
  if (m.sharpe_vs_equal_p == null || m.sharpe_vs_equal_z == null)
    return <span className="text-muted-foreground">—</span>
  if (m.sharpe_vs_equal_p >= SIGNIFICANCE)
    return <span className="text-muted-foreground">no significant difference</span>
  return m.sharpe_vs_equal_z > 0 ? (
    <Badge variant="success">better</Badge>
  ) : (
    <Badge variant="warning">worse</Badge>
  )
}

function MethodsTable({ methods }: { methods: Method[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base" render={<h2 />}>
          Every method, out of sample
        </CardTitle>
        <CardDescription>
          Each method re-estimated at every rebalance on trailing data only, with the same costs and
          test period, sorted by Sharpe. Return and volatility (Vol) are annual; Sharpe uses returns
          over cash; turnover is one-way per rebalance; cost is the total paid as a share of
          capital. The last columns test each Sharpe ratio against equal weight's.
        </CardDescription>
        <ChartGuide noun="table">
          <p>
            Two Sharpe ratios measured on the same days are correlated: when the market rallies,
            most methods gain together. The test (Jobson–Korkie with Memmel's correction) accounts
            for that, so it is fairer than comparing two separate confidence intervals.
          </p>
          <p>
            z is the Sharpe gap in standard errors; p is the chance of a gap at least this large if
            the two methods were equally good. Below 5% the row reads "better" or "worse"; above,
            the gap is within what luck alone produces over this many years. A Sharpe gap of 0.2
            often falls in that range.
          </p>
        </ChartGuide>
      </CardHeader>
      <CardPanel className="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Method</TableHead>
              <TableHead className="text-right">Return</TableHead>
              <TableHead className="text-right">Vol</TableHead>
              <TableHead className="text-right">Sharpe</TableHead>
              <TableHead className="text-right">Max DD</TableHead>
              <TableHead className="text-right">Turnover</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">z</TableHead>
              <TableHead className="text-right">p</TableHead>
              <TableHead>vs equal weight</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bySharpe(methods).map((m) => (
              <TableRow key={m.key} data-state={m.key === 'equal_weight' ? 'selected' : undefined}>
                <TableCell className="font-medium">{m.label}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {pct(m.performance.annual_return, 1)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {pct(m.performance.annual_volatility, 1)}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {fixed(m.performance.sharpe, 2)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {pct(m.performance.max_drawdown, 1)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground tabular-nums">
                  {pct(m.average_turnover, 1)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground tabular-nums">
                  {pct(m.total_cost, 2)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fixed(m.sharpe_vs_equal_z, 2)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {m.sharpe_vs_equal_p == null
                    ? '—'
                    : m.sharpe_vs_equal_p < 0.001
                      ? '<0.001'
                      : fixed(m.sharpe_vs_equal_p, 3)}
                </TableCell>
                <TableCell>
                  <Verdict m={m} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardPanel>
    </Card>
  )
}

/** Toggle chips that double as the legend: a picked method shows its line colour. */
function MethodPicker({
  methods,
  slots,
  onChange,
}: {
  methods: Method[]
  slots: (string | null)[]
  onChange: (slots: (string | null)[]) => void
}) {
  const c = useChartColors()
  const colors = slotColors(c)
  const full = slots.every((s) => s != null)
  const toggle = (key: string) => {
    const at = slots.indexOf(key)
    const next = [...slots]
    if (at >= 0) next[at] = null
    else {
      const free = next.indexOf(null)
      if (free < 0) return
      next[free] = key
    }
    onChange(next)
  }
  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Methods on the chart">
        {methods.map((m) => {
          const slot = slots.indexOf(m.key)
          const on = slot >= 0
          return (
            <button
              key={m.key}
              type="button"
              aria-pressed={on}
              disabled={!on && full}
              onClick={() => toggle(m.key)}
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                on
                  ? 'border-input bg-accent text-foreground'
                  : 'border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground',
              )}
            >
              <span
                aria-hidden="true"
                className="h-0.5 w-3 rounded-full"
                style={{ background: on ? colors[slot] : c.axis }}
              />
              {m.label}
            </button>
          )
        })}
      </div>
      <p className="text-muted-foreground text-xs">
        Pick up to {MAX_LINES}; {full ? 'remove one to add another.' : 'click to add or remove.'}
      </p>
    </div>
  )
}

function GrowthChart({
  data,
  slots,
  onSlots,
  stale,
}: {
  data: CompareMethodsResponse
  slots: (string | null)[]
  onSlots: (slots: (string | null)[]) => void
  stale: boolean
}) {
  const c = useChartColors()
  const colors = slotColors(c)
  const lines = slots.flatMap((key, i) => {
    const m = data.methods.find((x) => x.key === key)
    return m ? [{ name: m.label, color: colors[i], data: m.wealth }] : []
  })
  return (
    <TimeChart
      title="Growth of $1, out of sample"
      description={`${longDate(data.start)} → ${longDate(data.end)}, after costs. Too many methods for one chart, so pick which to draw; the default is equal weight, the best and worst by Sharpe, and minimum variance.`}
      guide={
        <>
          <p>
            Every line uses weights chosen with data up to the previous rebalance, so each is what
            following that rule live would have earned. The table above has the numbers; this shows
            when the gaps opened up.
          </p>
          <p>
            A method that leads only because of one stretch (a single rally or crash) is less
            convincing than one that pulls ahead steadily. The axis turns logarithmic when the lines
            span more than ten times, so equal slopes mean equal growth rates.
          </p>
        </>
      }
      lines={lines}
      yName="Growth of $1"
      yFormat={money}
      logY
      baseline={1}
      stale={stale}
      ariaLabel={`Growth of one dollar out of sample for ${lines.map((l) => l.name).join(', ')}`}
      className="h-80"
      action={<MethodPicker methods={data.methods} slots={slots} onChange={onSlots} />}
    />
  )
}

/** Where the in-sample winner ranked out of sample: λ ≤ 0 is the bottom half. */
function LogitChart({ o, stale }: { o: Overfitting; stale: boolean }) {
  const c = useChartColors()
  const option = useMemo<ChartOption>(() => {
    const axis = axisStyle(c)
    const { edges, counts } = o.logits
    const centres = counts.map((_, i) => (edges[i] + edges[i + 1]) / 2)
    // Fractional category position of λ = 0, so the guide sits on the boundary between bins.
    const k = Math.max(
      0,
      edges.findIndex((e, i) => i < counts.length && e <= 0 && edges[i + 1] >= 0),
    )
    const zero = k - 0.5 + (0 - edges[k]) / (edges[k + 1] - edges[k] || 1)
    return {
      animationDurationUpdate: 150,
      grid: GRID,
      tooltip: {
        ...tooltipStyle(c),
        axisPointer: { type: 'shadow' },
        formatter: (raw: unknown) => {
          const p = (raw as { dataIndex: number; value: number }[])[0]
          if (!p) return ''
          const i = p.dataIndex
          return (
            tooltipHeader(`λ ${fixed(edges[i], 2)} to ${fixed(edges[i + 1], 2)}`) +
            tooltipRow(
              centres[i] <= 0 ? c.series2 : c.series1,
              `${fixed(p.value, 1)}%`,
              'of splits',
            )
          )
        },
      },
      xAxis: {
        type: 'category',
        data: centres.map((x) => fixed(x, 1)),
        name: 'λ: out-of-sample rank of the in-sample winner (logit)',
        nameLocation: 'middle',
        nameGap: 28,
        ...axis,
        splitLine: { show: false },
        axisLabel: { ...axis.axisLabel, interval: Math.max(0, Math.round(centres.length / 6) - 1) },
      },
      yAxis: {
        type: 'value',
        name: 'Share of splits (%)',
        ...axis,
        axisLabel: { ...axis.axisLabel, formatter: (v: number) => fixed(v, 0) },
      },
      series: [
        {
          type: 'bar',
          barCategoryGap: 2,
          barMaxWidth: 24,
          data: counts.map((v, i) => ({
            value: v,
            itemStyle: {
              color: centres[i] <= 0 ? c.series2 : c.series1,
              borderRadius: [4, 4, 0, 0],
            },
          })),
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: c.ink2, type: 'dashed' as const, width: 1 },
            label: { show: true, color: c.muted, fontSize: 11, formatter: 'median' },
            data: [{ xAxis: zero }],
          },
        },
      ],
    }
  }, [o, c])
  return (
    <ChartCard
      title="Where the in-sample winner landed"
      description="For each split, the best in-sample method's rank among all methods on the other half, as a logit λ. Left of the dashed line (λ ≤ 0) it ranked in the bottom half."
      guide={
        <>
          <p>
            λ = log(ω / (1 − ω)), where ω is the winner's relative rank out of sample (near 0 =
            last, near 1 = first). λ = 0 is the median. The PBO is the orange share: the splits
            where picking the in-sample best led to a below-median method.
          </p>
          <p>
            Mass piled up on the right means in-sample rankings carry over to unseen data. A shape
            centred on zero means the in-sample ranking says little about what comes next.
          </p>
        </>
      }
      action={
        <div className="flex gap-4">
          <LegendKey color={c.series1} label="Top half" band />
          <LegendKey color={c.series2} label="Bottom half (overfit)" band />
        </div>
      }
      stale={stale}
    >
      <EChart
        option={option}
        ariaLabel="Histogram of the out-of-sample logit rank of the in-sample winner"
      />
    </ChartCard>
  )
}

/** In-sample vs out-of-sample Sharpe of each split's winner. */
function DecayChart({ o, stale }: { o: Overfitting; stale: boolean }) {
  const c = useChartColors()
  const option = useMemo<ChartOption>(() => {
    const axis = axisStyle(c)
    const points = o.in_sample_sharpe.map((x, i) => [x, o.out_of_sample_sharpe[i]])
    const all = [...o.in_sample_sharpe, ...o.out_of_sample_sharpe]
    // One shared range on both axes, so the y = x diagonal sits at 45° and stays in view.
    const lo = Math.floor(Math.min(0, ...all) * 2) / 2
    const hi = Math.ceil(Math.max(...all) * 2) / 2
    return {
      animationDurationUpdate: 150,
      grid: GRID,
      tooltip: {
        ...tooltipStyle(c),
        trigger: 'item',
        formatter: (raw: unknown) => {
          const [x, y] = (raw as { value: [number, number] }).value
          return (
            tooltipHeader('One split') +
            tooltipRow(c.series1, fixed(x, 2), 'in-sample Sharpe') +
            tooltipRow(c.series1, fixed(y, 2), 'out-of-sample Sharpe')
          )
        },
      },
      xAxis: {
        type: 'value',
        name: 'In-sample Sharpe of the winner',
        nameLocation: 'middle',
        nameGap: 28,
        min: lo,
        max: hi,
        ...axis,
        axisLabel: { ...axis.axisLabel, formatter: (v: number) => fixed(v, 1) },
      },
      yAxis: {
        type: 'value',
        name: 'Out-of-sample Sharpe',
        min: lo,
        max: hi,
        ...axis,
        axisLabel: { ...axis.axisLabel, formatter: (v: number) => fixed(v, 1) },
      },
      series: [
        {
          type: 'scatter',
          data: points,
          symbolSize: 7,
          itemStyle: { color: c.series1, opacity: 0.45 },
          markLine: {
            silent: true,
            symbol: 'none',
            label: { show: false },
            data: [
              [
                {
                  coord: [lo, lo],
                  lineStyle: { color: c.ink2, type: 'dashed' as const, width: 1 },
                },
                { coord: [hi, hi] },
              ],
              { yAxis: 0, lineStyle: { color: c.axis, type: 'solid' as const, width: 1 } },
            ],
          },
        },
      ],
    }
  }, [o, c])
  return (
    <ChartCard
      title="How much of the winner's Sharpe survived"
      description={`One dot per split (${o.splits}): the winner's Sharpe on the half it was picked on, and on the other half. The dashed diagonal is "no decay".`}
      guide={
        <>
          <p>
            Dots below the diagonal lost Sharpe out of sample, which is normal: the winner was
            partly picked for its luck. A cloud far below the line, or one that slopes downward,
            means the best backtests were mostly luck.
          </p>
          <p>
            The splits share blocks of data, so the dots are not independent and many overlap. Read
            the overall shape rather than single points.
          </p>
        </>
      }
      stale={stale}
    >
      <EChart
        option={option}
        ariaLabel="Scatter of in-sample against out-of-sample Sharpe for each split's winner"
      />
    </ChartCard>
  )
}

function Winners({ o, stale }: { o: Overfitting; stale: boolean }) {
  const c = useChartColors()
  const rows = Object.entries(o.winners).sort((a, b) => b[1] - a[1])
  return (
    <ChartCard
      title="Who won in sample"
      description="How often each method had the best Sharpe on the in-sample half. Methods that never won are left out."
      guide={
        <>
          <p>
            One method winning nearly every split means the ranking at the top is stable across
            periods. Wins spread across many methods mean the "best" method depends on which years
            you look at.
          </p>
        </>
      }
      stale={stale}
    >
      <ul className="flex flex-col gap-2">
        {rows.map(([name, n]) => (
          <li key={name} className="grid grid-cols-[12rem_minmax(0,1fr)_4rem] items-center gap-3">
            <span className="truncate text-sm">{name}</span>
            <span className="h-2 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full"
                style={{ width: `${(100 * n) / o.splits}%`, background: c.series1 }}
              />
            </span>
            <span className="text-right text-muted-foreground text-xs tabular-nums">
              {pct(n / o.splits, 0)}
            </span>
          </li>
        ))}
      </ul>
    </ChartCard>
  )
}

function OverfittingSection({ o, stale }: { o: Overfitting; stale: boolean }) {
  const reading =
    o.pbo < 0.2
      ? 'The in-sample ranking mostly carried over to the unseen half.'
      : o.pbo < 0.5
        ? 'The in-sample ranking carried over only partly.'
        : 'The in-sample ranking did no better than chance on the unseen half.'
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base" render={<h2 />}>
            Probability of backtest overfitting
          </CardTitle>
          <CardDescription>
            How often picking the best in-sample method lands below the median out of sample.
          </CardDescription>
          <ChartGuide noun="card">
            <p>
              The test period is cut into blocks. For every way of using half the blocks as "in
              sample", the method with the best Sharpe there is picked and then ranked against all
              methods on the other half. With 10 blocks that gives {o.splits} splits.
            </p>
            <p>
              A PBO near 0 means choosing the best backtest tends to pick a genuinely good method.
              Near 50%, the choice is a coin flip; above it, the winners tend to be the methods that
              fit noise best. Combinatorially symmetric cross-validation (Bailey, Borwein, López de
              Prado and Zhu, 2017).
            </p>
          </ChartGuide>
        </CardHeader>
        <CardPanel
          className={cn(
            'flex flex-wrap items-baseline gap-x-4 gap-y-1 pt-0',
            stale && 'opacity-60',
          )}
        >
          <span className="font-semibold text-3xl tracking-tight tabular-nums">
            {pct(o.pbo, 0)}
          </span>
          <span className="text-muted-foreground text-sm">
            of {o.splits} splits put the in-sample winner in the bottom half. {reading}
          </span>
        </CardPanel>
      </Card>
      <div className="grid gap-6 xl:grid-cols-2">
        <LogitChart o={o} stale={stale} />
        <DecayChart o={o} stale={stale} />
      </div>
      <Winners o={o} stale={stale} />
    </>
  )
}

function EstimatorsTable({ data }: { data: CompareMethodsResponse }) {
  const rows = data.estimators
  const lowest = rows.reduce<string | null>(
    (best, r) =>
      best == null ||
      r.realized_volatility <
        (rows.find((x) => x.estimator === best)?.realized_volatility ?? Infinity)
        ? r.estimator
        : best,
    null,
  )
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base" render={<h2 />}>
          Covariance estimators, out of sample
        </CardTitle>
        <CardDescription>
          Minimum variance re-estimated at every rebalance with each covariance estimator, before
          costs. Its only goal is low volatility, so the realised volatility scores the estimator
          directly.
        </CardDescription>
        <ChartGuide noun="table">
          <p>
            The lowest realised volatility marks the estimator whose risk picture was most useful
            for this universe. Realised ÷ predicted checks its calibration: above 1, the portfolio
            was riskier than the estimator claimed (risk understated); below 1, it was
            over-cautious.
          </p>
          <p>
            Sample is the plain historical covariance. Ledoit–Wolf shrinks it toward a simple target
            to tame noise. EWMA weights recent days more. Denoised (Marchenko–Pastur) flattens the
            eigenvalues that random data would produce anyway, keeping only the structure that
            stands out from noise.
          </p>
        </ChartGuide>
      </CardHeader>
      <CardPanel className="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Estimator</TableHead>
              <TableHead className="text-right">Realised vol</TableHead>
              <TableHead className="text-right">Predicted vol</TableHead>
              <TableHead className="text-right">Realised ÷ predicted</TableHead>
              <TableHead className="text-right">Sharpe</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.estimator}>
                <TableCell className="font-medium">
                  {ESTIMATOR_LABELS[r.estimator] ?? r.estimator}
                  {r.estimator === lowest && (
                    <Badge variant="info" size="sm" className="ms-2">
                      lowest vol
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {pct(r.realized_volatility, 2)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground tabular-nums">
                  {pct(r.predicted_volatility, 2)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fixed(r.ratio, 2)}
                  <span className="ms-2 text-muted-foreground text-xs">
                    {!Number.isFinite(r.ratio)
                      ? ''
                      : Math.abs(r.ratio - 1) < 0.02
                        ? 'on target'
                        : r.ratio > 1
                          ? 'risk understated'
                          : 'risk overstated'}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{fixed(r.sharpe, 2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardPanel>
    </Card>
  )
}

export default function ComparePage() {
  const [lookback, setLookback] = useState<(typeof LOOKBACKS)[number]>('252')
  const [rebalance, setRebalance] = useState<(typeof REBALANCES)[number]>('21')
  const [cost, setCost] = useState(5)
  const [picked, setPicked] = useState<(string | null)[] | null>(null)
  const query = useLab('compare-methods', api.compareMethods, {
    lookback: Number(lookback),
    rebalance_every: Number(rebalance),
    cost_bps: cost,
  })
  const data = query.data
  const slots = useMemo(() => {
    if (!data) return []
    if (!picked) return defaultSlots(data.methods)
    const keys = new Set(data.methods.map((m) => m.key))
    return picked.map((k) => (k && keys.has(k) ? k : null))
  }, [data, picked])
  const ranked = data ? bySharpe(data.methods) : []
  const equal = data?.methods.find((m) => m.key === 'equal_weight')
  const others = data ? data.methods.filter((m) => m.key !== 'equal_weight') : []
  const significant = others.filter(
    (m) => m.sharpe_vs_equal_p != null && m.sharpe_vs_equal_p < SIGNIFICANCE,
  ).length
  const errors = data ? Object.entries(data.errors) : []

  return (
    <>
      <PageHeader title="Compare methods">
        Every allocation method walked forward on identical settings, then tested for how much of
        the ranking is real. Picking the best of many backtests flatters the winner, so the page
        also measures how often that pick would have disappointed on unseen data.
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside>
          <Card className="overflow-hidden">
            <PanelSection
              title="Estimation window"
              hint="Trailing trading days each method estimates on at every rebalance. The test starts after the first window."
            >
              <Segmented
                label="Lookback"
                size="sm"
                value={lookback}
                onChange={setLookback}
                options={LOOKBACKS.map((v) => ({ value: v, label: LOOKBACK_LABELS[v] }))}
              />
            </PanelSection>
            <Separator />
            <PanelSection
              title="Trading"
              hint="The same schedule and cost for every method, so differences come from the weights alone."
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
          <QueryError error={query.error} title="Could not compare the methods" />
          {!data && query.isFetching && (
            <div className="flex h-64 items-center justify-center gap-2 text-muted-foreground text-sm">
              <Spinner className="size-4" /> Running every method out of sample…
            </div>
          )}
          {data && (
            <>
              <StatGrid className="grid-cols-2 md:grid-cols-4">
                <Stat
                  label="Highest Sharpe"
                  value={fixed(ranked[0]?.performance.sharpe, 2)}
                  hint={ranked[0]?.label}
                />
                <Stat
                  label="Equal weight Sharpe"
                  value={fixed(equal?.performance.sharpe, 2)}
                  hint="the no-estimates benchmark"
                />
                <Stat
                  label="Significantly different"
                  value={`${significant} of ${others.length}`}
                  hint="Sharpe vs equal weight, p < 0.05"
                />
                <Stat
                  label="Overfitting probability"
                  value={data.overfitting ? pct(data.overfitting.pbo, 0) : '—'}
                  hint={`${longDate(data.start)} → ${longDate(data.end)}`}
                />
              </StatGrid>
              <MethodsTable methods={data.methods} />
              <GrowthChart data={data} slots={slots} onSlots={setPicked} stale={query.stale} />
              {data.overfitting && <OverfittingSection o={data.overfitting} stale={query.stale} />}
              <EstimatorsTable data={data} />
              {errors.length > 0 && (
                <ul className="flex flex-col gap-1 text-muted-foreground text-xs">
                  {errors.map(([key, message]) => (
                    <li key={key}>
                      <span className="font-medium">{errorLabel(key)}</span> was left out: {message}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
