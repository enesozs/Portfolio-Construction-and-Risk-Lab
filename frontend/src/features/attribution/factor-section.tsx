import { useMemo, useState } from 'react'
import { ChartGuide } from '@/components/chart-guide'
import { ChartCard, LegendKey } from '@/components/charts/chart-card'
import { type ChartOption, EChart } from '@/components/charts/echart'
import {
  axisStyle,
  type ChartColors,
  FONT_FAMILY,
  GRID,
  tooltipHeader,
  tooltipRow,
  tooltipStyle,
  useChartColors,
} from '@/components/charts/theme'
import { TimeChart } from '@/components/charts/time-chart'
import { Stat, StatGrid } from '@/components/stat-grid'
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useUniverse } from '@/features/universe/universe-context'
import type { FactorResponse } from '@/lib/api'
import { fixed, longDate, pct, spct } from '@/lib/format'
import { cn } from '@/lib/utils'

type Factor = FactorResponse['factors'][number]

const Z95 = 1.96
const SIGNIFICANCE = 0.05
/** Lines on one chart (dataviz rule). */
const MAX_LINES = 4

/** "Size (small − big)" → "Size": the short name for axes and chips. */
const shortLabel = (f: Factor) => f.label.split(' (')[0]

const pValue = (p: number) => (p < 0.001 ? '<0.001' : fixed(p, 3))

function slotColors(c: ChartColors): string[] {
  return [c.series1, c.series2, c.series3, c.categorical[3]]
}

/** Market plus the two other factors with the largest |beta|. */
function defaultSlots(factors: Factor[]): (string | null)[] {
  const market = factors.find((f) => f.key === 'Mkt-RF')
  const rest = factors
    .filter((f) => f !== market)
    .sort((a, b) => Math.abs(b.beta) - Math.abs(a.beta))
  const picked = [market, ...rest].filter((f): f is Factor => f != null).slice(0, 3)
  return [...picked.map((f) => f.key), ...Array<null>(MAX_LINES - picked.length).fill(null)]
}

function Summary({ data, label }: { data: FactorResponse; label: string }) {
  const alphaSignificant = data.alpha_t != null && Math.abs(data.alpha_t) > Z95
  return (
    <>
      <div className="flex flex-col gap-1 pt-2">
        <h2 className="font-semibold text-base">Fama–French factors: {label}</h2>
        <p className="text-muted-foreground text-sm">
          The portfolio's daily return over T-bills regressed on the five Fama–French factors plus
          momentum, from Kenneth French's data library, {longDate(data.start)} →{' '}
          {longDate(data.end)}.
          {data.stale &&
            ' Using the bundled copy of the factor data, because the library could not be reached.'}{' '}
          The library publishes with a lag of about a month, so the most recent days are not
          included.
        </p>
      </div>
      <StatGrid className="grid-cols-2 md:grid-cols-4">
        <Stat
          label="Alpha (annual)"
          value={spct(data.alpha, 1)}
          hint={`t = ${fixed(data.alpha_t, 2)}${alphaSignificant ? ', significant' : ', within noise'}`}
        />
        <Stat
          label="R²"
          value={fixed(data.r_squared, 2)}
          hint="share of daily variance the factors explain"
        />
        <Stat
          label="Observations"
          value={`${data.observations.toLocaleString('en-US')} days`}
          hint={`Newey–West errors, ${data.lags} lags`}
        />
        <Stat
          label="Idiosyncratic risk"
          value={pct(data.idiosyncratic_share, 0)}
          hint="variance not tied to any factor"
        />
      </StatGrid>
    </>
  )
}

/** Dot-and-whisker: each beta with its 95% interval (±1.96 Newey–West standard errors). */
function ExposureChart({ data, stale }: { data: FactorResponse; stale: boolean }) {
  const c = useChartColors()
  const option = useMemo<ChartOption>(() => {
    const axis = axisStyle(c)
    const fs = data.factors
    const colorOf = (f: Factor) => (f.p_value < SIGNIFICANCE ? c.series1 : c.other)
    // Fit the whiskers too (the axis would otherwise fit only the dots), on round ticks.
    const lo = Math.floor(Math.min(0, ...fs.map((f) => f.beta - Z95 * f.stderr)) * 2) / 2
    const hi = Math.ceil(Math.max(0, ...fs.map((f) => f.beta + Z95 * f.stderr)) * 2) / 2
    const step = hi - lo > 2 ? 0.5 : 0.25
    return {
      animationDurationUpdate: 150,
      grid: { ...GRID, top: 8 },
      tooltip: {
        ...tooltipStyle(c),
        trigger: 'item',
        formatter: (raw: unknown) => {
          const f = fs[(raw as { dataIndex: number }).dataIndex]
          return (
            tooltipHeader(f.label) +
            tooltipRow(colorOf(f), fixed(f.beta, 2), 'beta') +
            tooltipRow(
              colorOf(f),
              `${fixed(f.beta - Z95 * f.stderr, 2)} to ${fixed(f.beta + Z95 * f.stderr, 2)}`,
              '95% interval',
            ) +
            tooltipRow(colorOf(f), pValue(f.p_value), 'p-value')
          )
        },
      },
      xAxis: {
        type: 'value',
        name: 'Beta (exposure per unit of factor return)',
        min: lo,
        max: hi,
        interval: step,
        nameLocation: 'middle',
        nameGap: 28,
        ...axis,
        axisLabel: { ...axis.axisLabel, formatter: (v: number) => fixed(v, 2) },
      },
      yAxis: {
        type: 'category',
        data: fs.map((f) => f.label),
        inverse: true,
        ...axis,
        splitLine: { show: false },
        axisLabel: { ...axis.axisLabel, interval: 0 },
      },
      series: [
        {
          type: 'scatter',
          symbolSize: 10,
          data: fs.map((f, i) => ({
            value: [f.beta, i],
            itemStyle: { color: colorOf(f), borderColor: c.surface, borderWidth: 2 },
          })),
          z: 3,
          markLine: {
            silent: true,
            symbol: 'none',
            label: { show: false },
            data: [
              { xAxis: 0, lineStyle: { color: c.axis, type: 'solid' as const, width: 1 } },
              ...fs.map(
                (f, i) =>
                  [
                    {
                      coord: [f.beta - Z95 * f.stderr, i],
                      lineStyle: { color: colorOf(f), type: 'solid' as const, width: 2 },
                    },
                    { coord: [f.beta + Z95 * f.stderr, i] },
                  ] as [
                    { coord: [number, number]; lineStyle: object },
                    { coord: [number, number] },
                  ],
              ),
            ],
          },
        },
      ],
    }
  }, [data, c])
  return (
    <ChartCard
      title="Factor exposures"
      description="Each dot is the portfolio's beta to one factor; the whisker is its 95% interval. Blue exposures are statistically distinguishable from zero (p < 0.05)."
      guide={
        <>
          <p>
            A market beta near 1 means the portfolio moves with the US stock market. The other
            factors are long-short spreads: a positive value beta means the portfolio behaves like
            cheap stocks minus expensive ones, a negative size beta like large companies rather than
            small.
          </p>
          <p>
            A whisker that crosses zero means the data cannot tell the exposure apart from none. The
            intervals use Newey–West standard errors, which allow for daily returns being slightly
            autocorrelated and calmer in some periods than others; plain regression errors would
            make every estimate look more precise than it is.
          </p>
        </>
      }
      action={
        <div className="flex gap-4">
          <LegendKey color={c.series1} label="p < 0.05" band />
          <LegendKey color={c.other} label="Not significant" band />
        </div>
      }
      stale={stale}
    >
      <EChart
        option={option}
        className="h-72"
        ariaLabel="Dot-and-whisker chart of factor betas with 95% intervals"
      />
    </ChartCard>
  )
}

function ExposureTable({ data, stale }: { data: FactorResponse; stale: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base" render={<h2 />}>
          Exposure statistics
        </CardTitle>
        <CardDescription>
          The numbers behind the chart above. t is the beta divided by its standard error; p is the
          chance of a beta this far from zero if the true exposure were zero.
        </CardDescription>
        <ChartGuide noun="table">
          <p>
            |t| above about 2 corresponds to p below 5%. Large samples make even small exposures
            significant, so read the size of the beta as well: a significant beta of 0.05 is real
            but barely moves the portfolio.
          </p>
        </ChartGuide>
      </CardHeader>
      <CardPanel className={cn('pt-0 transition-opacity', stale && 'opacity-60')}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Factor</TableHead>
              <TableHead className="text-right">Beta</TableHead>
              <TableHead className="text-right">95% interval</TableHead>
              <TableHead className="text-right">t</TableHead>
              <TableHead className="text-right">p</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.factors.map((f) => (
              <TableRow key={f.key}>
                <TableCell className="font-medium">{f.label}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {fixed(f.beta, 2)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground tabular-nums">
                  {fixed(f.beta - Z95 * f.stderr, 2)} to {fixed(f.beta + Z95 * f.stderr, 2)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fixed(f.t_stat, 1)}</TableCell>
                <TableCell
                  className={cn(
                    'text-right tabular-nums',
                    f.p_value >= SIGNIFICANCE && 'text-muted-foreground',
                  )}
                >
                  {pValue(f.p_value)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardPanel>
    </Card>
  )
}

/** Share of variance per factor (Euler contributions) plus the idiosyncratic rest; sums to 100%. */
function RiskShareChart({ data, stale }: { data: FactorResponse; stale: boolean }) {
  const c = useChartColors()
  const option = useMemo<ChartOption>(() => {
    const axis = axisStyle(c)
    const rows = [
      ...data.factors.map((f) => ({ name: shortLabel(f), value: f.risk_share, factor: true })),
      { name: 'Idiosyncratic', value: data.idiosyncratic_share, factor: false },
    ]
    return {
      animationDurationUpdate: 150,
      grid: { ...GRID, top: 8, left: 16, right: 48 },
      tooltip: {
        ...tooltipStyle(c),
        axisPointer: { type: 'shadow' },
        formatter: (raw: unknown) => {
          const p = (raw as { dataIndex: number }[])[0]
          const r = rows[p.dataIndex]
          return (
            tooltipHeader(r.name) +
            tooltipRow(r.factor ? c.series1 : c.other, pct(r.value, 1), 'of variance')
          )
        },
      },
      xAxis: {
        type: 'value',
        name: 'Share of portfolio variance',
        nameLocation: 'middle',
        nameGap: 28,
        ...axis,
        axisLabel: { ...axis.axisLabel, formatter: (v: number) => pct(v, 0) },
      },
      yAxis: {
        type: 'category',
        data: rows.map((r) => r.name),
        inverse: true,
        ...axis,
        splitLine: { show: false },
        axisLabel: { ...axis.axisLabel, interval: 0 },
      },
      series: [
        {
          type: 'bar',
          barMaxWidth: 18,
          data: rows.map((r) => ({
            value: r.value,
            itemStyle: { color: r.factor ? c.series1 : c.other, borderRadius: 4 },
            label: {
              show: true,
              position: r.value < 0 ? ('left' as const) : ('right' as const),
              formatter: () => pct(r.value, 1),
              color: c.ink2,
              fontSize: 11,
              fontFamily: FONT_FAMILY,
            },
          })),
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: c.axis, width: 1, type: 'solid' as const },
            label: { show: false },
            data: [{ xAxis: 0 }],
          },
        },
      ],
    }
  }, [data, c])
  return (
    <ChartCard
      title="Where the risk comes from"
      description="The portfolio's variance split into each factor's contribution and the idiosyncratic rest (what the factors do not explain). The bars add up to 100%."
      guide={
        <>
          <p>
            Each factor's share is its beta times its covariance with the whole factor exposure, so
            correlated factors share credit. A large market bar is normal for a stock portfolio; a
            large idiosyncratic bar means the result depends on the particular assets more than on
            broad styles.
          </p>
          <p>
            A negative share is a hedge: that exposure tends to move against the rest and lowers
            total variance, so the other shares add up to more than 100% minus idiosyncratic.
          </p>
        </>
      }
      action={
        <div className="flex gap-4">
          <LegendKey color={c.series1} label="Factor" band />
          <LegendKey color={c.other} label="Idiosyncratic" band />
        </div>
      }
      stale={stale}
    >
      <EChart
        option={option}
        className="h-72"
        ariaLabel="Bar chart of each factor's share of portfolio variance, plus idiosyncratic risk"
      />
    </ChartCard>
  )
}

/** Toggle chips that double as the legend: a picked factor shows its line colour. */
function FactorPicker({
  factors,
  slots,
  onChange,
}: {
  factors: Factor[]
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
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Factors on the chart">
      {factors.map((f) => {
        const slot = slots.indexOf(f.key)
        const on = slot >= 0
        return (
          <button
            key={f.key}
            type="button"
            aria-pressed={on}
            disabled={!on && full}
            onClick={() => toggle(f.key)}
            title={full && !on ? `Up to ${MAX_LINES} at once` : f.label}
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
            {shortLabel(f)}
          </button>
        )
      })}
    </div>
  )
}

function RollingChart({ data, stale }: { data: FactorResponse; stale: boolean }) {
  const c = useChartColors()
  const colors = slotColors(c)
  const [picked, setPicked] = useState<(string | null)[] | null>(null)
  const slots = picked ?? defaultSlots(data.factors)
  const lines = slots.flatMap((key, i) => {
    const f = data.factors.find((x) => x.key === key)
    const series = key ? data.rolling[key] : undefined
    return f && series ? [{ name: shortLabel(f), color: colors[i], data: series }] : []
  })
  return (
    <TimeChart
      title="Exposures over time"
      description={`Betas re-estimated over each trailing year, every week. Up to ${MAX_LINES} factors at once; the default is the market and the two largest other exposures.`}
      guide={
        <>
          <p>
            The full-sample betas above are averages. Here you can see whether an exposure was
            steady or came and went: a value beta that flips sign from year to year is not a
            dependable tilt.
          </p>
          <p>
            Fixed weights still drift in factor terms because the assets themselves change character
            (a growth stock can mature into a value stock). These rolling betas use plain regression
            and one year of data, so expect some wobble from noise alone.
          </p>
        </>
      }
      lines={lines}
      yName="Beta"
      yFormat={(v) => fixed(v, 2)}
      baseline={0}
      stale={stale}
      ariaLabel={`Rolling one-year factor betas for ${lines.map((l) => l.name).join(', ')}`}
      className="h-80"
      action={<FactorPicker factors={data.factors} slots={slots} onChange={setPicked} />}
    />
  )
}

/** Assets × factors, betas on a symmetric diverging scale (zero is neutral grey). */
function AssetExposures({ data, stale }: { data: FactorResponse; stale: boolean }) {
  const c = useChartColors()
  const { universe } = useUniverse()
  const option = useMemo<ChartOption | null>(() => {
    const order = new Map(universe.tickers.map((t, i) => [t, i]))
    const assets = [...data.assets].sort(
      (a, b) => (order.get(a.ticker) ?? 0) - (order.get(b.ticker) ?? 0),
    )
    if (!assets.length) return null
    const axis = axisStyle(c)
    const fs = data.factors
    const cells = assets.flatMap((a, i) =>
      fs.map((f, j) => [j, i, a.betas[f.key] ?? 0] as [number, number, number]),
    )
    const extent = Math.max(0.1, ...cells.map((v) => Math.abs(v[2])))
    return {
      animation: false,
      grid: { left: 8, right: 8, top: 8, bottom: 8, containLabel: true },
      tooltip: {
        ...tooltipStyle(c),
        trigger: 'item',
        formatter: (raw: unknown) => {
          const [j, i, v] = (raw as { value: [number, number, number] }).value
          const a = assets[i]
          return (
            tooltipHeader(`${a.ticker} · ${fs[j].label}`) +
            tooltipRow(c.series1, fixed(v, 2), 'beta') +
            tooltipRow(c.muted, spct(a.alpha, 1), 'alpha (annual)') +
            tooltipRow(c.muted, fixed(a.r_squared, 2), 'R²')
          )
        },
      },
      xAxis: {
        type: 'category',
        data: fs.map(shortLabel),
        position: 'top',
        ...axis,
        splitLine: { show: false },
        axisLabel: { ...axis.axisLabel, interval: 0 },
      },
      yAxis: {
        type: 'category',
        data: assets.map((a) => `${a.ticker}  R² ${fixed(a.r_squared, 2)}`),
        inverse: true,
        ...axis,
        splitLine: { show: false },
        axisLabel: { ...axis.axisLabel, interval: 0 },
      },
      visualMap: {
        show: false,
        min: -extent,
        max: extent,
        inRange: { color: [...c.diverging] },
      },
      series: [
        {
          type: 'heatmap',
          // Strong cells are dark in light mode and light in dark mode: flip the text to the
          // surface colour there so it keeps its contrast.
          data: cells.map((v) => ({
            value: v,
            label: { color: Math.abs(v[2]) > 0.75 * extent ? c.surface : c.ink },
          })),
          itemStyle: { borderColor: c.surface, borderWidth: 2, borderRadius: 4 },
          label: {
            show: true,
            formatter: (p: { value?: unknown }) => fixed((p.value as number[])[2], 2),
            fontSize: 11,
            fontFamily: FONT_FAMILY,
            color: c.ink,
          },
        },
      ],
    }
  }, [data, universe.tickers, c])
  const rows = data.assets.length
  return (
    <ChartCard
      title="Exposures by asset"
      description="The same regression run on each asset alone. Blue is a positive beta, red a negative one, grey near zero; the scale is symmetric around zero."
      guide={
        <>
          <p>
            The portfolio's betas are the weighted average of these rows, so this shows which
            holdings bring each tilt. A technology stock typically shows a market beta above 1 and a
            negative value beta (it behaves like an expensive growth stock); a long Treasury fund
            shows a market beta near zero.
          </p>
          <p>
            R² next to each ticker is how much of that asset's daily movement the factors explain.
            The factors are built from US stocks, so bonds, commodities and foreign assets usually
            have a low R²: their risk lies mostly outside these factors.
          </p>
        </>
      }
      stale={stale}
    >
      {option ? (
        <EChart
          option={option}
          className={rows <= 6 ? 'h-72' : rows <= 10 ? 'h-96' : 'h-[36rem]'}
          ariaLabel="Heatmap of factor betas for each asset"
        />
      ) : (
        <div className="h-72" />
      )}
    </ChartCard>
  )
}

export function FactorSection({
  data,
  label,
  stale,
}: {
  data: FactorResponse
  label: string
  stale: boolean
}) {
  return (
    <>
      <Summary data={data} label={label} />
      <ExposureChart data={data} stale={stale} />
      <ExposureTable data={data} stale={stale} />
      <div className="grid gap-6 xl:grid-cols-2">
        <RiskShareChart data={data} stale={stale} />
        <RollingChart data={data} stale={stale} />
      </div>
      <AssetExposures data={data} stale={stale} />
    </>
  )
}
