import { useMemo, useState } from 'react'
import { ChartGuide } from '@/components/chart-guide'
import { ChartCard, LegendKey } from '@/components/charts/chart-card'
import { type ChartOption, EChart } from '@/components/charts/echart'
import { HistogramChart } from '@/components/charts/simple-charts'
import {
  axisStyle,
  GRID,
  tooltipHeader,
  tooltipRow,
  tooltipStyle,
  useChartColors,
} from '@/components/charts/theme'
import { NumberInput } from '@/components/number-input'
import { PageHeader } from '@/components/page-header'
import { PanelSection } from '@/components/panel-section'
import { ParamControl } from '@/components/param-control'
import { PortfolioSelect } from '@/components/portfolio-select'
import { QueryError } from '@/components/query-error'
import { Segmented } from '@/components/segmented'
import { Stat, StatGrid } from '@/components/stat-grid'
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useLab } from '@/features/universe/universe-context'
import { api, type PortfolioKey, type SimulationResponse } from '@/lib/api'
import { fixed, integer, pct, spct } from '@/lib/format'
import { cn } from '@/lib/utils'

type RegimeOut = NonNullable<SimulationResponse['regime']>

type Model = 'normal' | 'student_t' | 'bootstrap' | 't_copula' | 'regime'

const MODELS: { value: Model; label: string; idea: string }[] = [
  {
    value: 'normal',
    label: 'Normal',
    idea: 'Daily returns drawn from a multivariate normal: thin tails, the textbook baseline.',
  },
  {
    value: 'student_t',
    label: 'Student-t',
    idea: 'Joint Student-t: fat tails that hit all assets on the same days, as in real crashes.',
  },
  {
    value: 't_copula',
    label: 't-copula',
    idea: 'Each asset keeps its own historical return distribution; a Student-t copula decides how they move together, so crashes can be joint even when each asset’s tails differ.',
  },
  {
    value: 'bootstrap',
    label: 'Bootstrap',
    idea: 'Block bootstrap: resampled runs of actual history, keeping its tails and clustering.',
  },
  {
    value: 'regime',
    label: 'Regimes',
    idea: 'Calm and stressed regimes, each with its own means and covariance, with Markov switching between them: crises arrive as lasting spells of high volatility and correlation.',
  },
]

/** Uses the degrees-of-freedom control. */
const usesDf = (m: Model) => m === 'student_t' || m === 't_copula'

/** Average length of a spell in a regime that persists with daily probability p. */
const spell = (p: number) => (p < 1 ? 1 / (1 - p) : Number.POSITIVE_INFINITY)

function RegimeCard({ regime, stale }: { regime: RegimeOut; stale: boolean }) {
  const days = (p: number) => {
    const d = spell(p)
    return Number.isFinite(d) ? `about ${integer(d)} trading days per spell` : 'never leaves'
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base" render={<h2 />}>
          The two regimes fitted to history
        </CardTitle>
        <CardDescription>
          Days are split by the equal-weight portfolio’s trailing 21-day volatility; the split point
          is chosen by the data. Each regime gets its own means and covariance, and the switching
          odds are the observed day-to-day frequencies.
        </CardDescription>
        <ChartGuide noun="card">
          <p>
            The stay probabilities say how sticky each regime is. A regime kept with probability p
            each day lasts 1/(1 − p) days on average, so 0.98 means spells of about 50 days.
            Stickiness is what turns bad days into drawdowns: the simulation can stay stressed for
            weeks, as in 2008 or 2020.
          </p>
          <p>
            Compare the calm and stressed tiles for volatility and correlation. In the stressed
            regime both are higher, so diversification shrinks exactly when it is needed. Volatility
            is for an equal-weight portfolio, annualised; correlation is the average over asset
            pairs.
          </p>
        </ChartGuide>
      </CardHeader>
      <CardPanel className={cn('pt-0 transition-opacity', stale && 'opacity-60')}>
        <StatGrid className="grid-cols-2 md:grid-cols-4">
          <Stat
            label="History in the stressed regime"
            value={pct(regime.share_stressed, 0)}
            hint="share of days"
          />
          <Stat
            label="Simulation starts"
            value={regime.starts_stressed ? 'Stressed' : 'Calm'}
            hint="today’s regime"
          />
          <Stat
            label="Daily chance calm stays calm"
            value={pct(regime.stay_calm, 1)}
            hint={days(regime.stay_calm)}
          />
          <Stat
            label="Daily chance stressed stays stressed"
            value={pct(regime.stay_stressed, 1)}
            hint={days(regime.stay_stressed)}
          />
          <Stat
            label="Volatility, calm"
            value={pct(regime.calm_volatility, 1)}
            hint="equal weight, annualised"
          />
          <Stat
            label="Volatility, stressed"
            value={pct(regime.stressed_volatility, 1)}
            hint="equal weight, annualised"
          />
          <Stat
            label="Average correlation, calm"
            value={fixed(regime.calm_correlation, 2)}
            hint="across asset pairs"
          />
          <Stat
            label="Average correlation, stressed"
            value={fixed(regime.stressed_correlation, 2)}
            hint="across asset pairs"
          />
        </StatGrid>
      </CardPanel>
    </Card>
  )
}

const HORIZONS = [
  { value: '63', label: '3m' },
  { value: '126', label: '6m' },
  { value: '252', label: '1y' },
  { value: '504', label: '2y' },
  { value: '1260', label: '5y' },
]
const PATHS = [
  { value: '1000', label: '1k' },
  { value: '5000', label: '5k' },
  { value: '20000', label: '20k' },
]
const REBALANCE = [
  { value: '0', label: 'Never' },
  { value: '21', label: 'Monthly' },
  { value: '63', label: 'Quarterly' },
]

/** Number of sample paths drawn faintly behind the fan. */
const SHOWN_PATHS = 12

function FanChart({ data, stale }: { data: SimulationResponse; stale: boolean }) {
  const c = useChartColors()
  const option = useMemo<ChartOption>(() => {
    const axis = axisStyle(c)
    const days = data.days.map(String)
    const horizon = data.days[data.days.length - 1] ?? 252
    const raw = horizon / 6
    // Long horizons label each year (also a multiple of the server's day sampling).
    const labelStep =
      horizon > 600
        ? 252
        : raw >= 21
          ? Math.round(raw / 21) * 21
          : Math.max(1, Math.round(raw / 5) * 5)
    const diff = (hi: number[], lo: number[]) => hi.map((v, i) => v - lo[i])
    const band = (name: string, stack: string, lo: number[], hi: number[], color: string) => [
      {
        name: `${name} base`,
        type: 'line' as const,
        stack,
        data: lo,
        showSymbol: false,
        silent: true,
        lineStyle: { opacity: 0 },
        tooltip: { show: false },
      },
      {
        name,
        type: 'line' as const,
        stack,
        data: diff(hi, lo),
        showSymbol: false,
        silent: true,
        lineStyle: { opacity: 0 },
        areaStyle: { color, opacity: 1 },
      },
    ]
    const paths = data.sample_paths.slice(0, SHOWN_PATHS).map((p, k) => ({
      name: `path ${k + 1}`,
      type: 'line' as const,
      data: p,
      showSymbol: false,
      silent: true,
      z: 1,
      lineStyle: { width: 1, color: c.muted, opacity: 0.35 },
    }))
    const rows: [string, number[], string][] = [
      ['95th percentile', data.p95, c.band],
      ['75th percentile', data.p75, c.bandStrong],
      ['Median', data.p50, c.series1],
      ['25th percentile', data.p25, c.bandStrong],
      ['5th percentile', data.p05, c.band],
    ]
    return {
      animationDurationUpdate: 150,
      grid: GRID,
      tooltip: {
        ...tooltipStyle(c),
        formatter: (raw: unknown) => {
          const params = raw as { dataIndex: number }[]
          const i = params[0]?.dataIndex ?? 0
          return (
            tooltipHeader(`Day ${data.days[i]}`) +
            rows.map(([name, s, color]) => tooltipRow(color, fixed(s[i], 2), name)).join('')
          )
        },
      },
      xAxis: {
        type: 'category',
        data: days,
        boundaryGap: false,
        name: 'Trading days ahead',
        nameLocation: 'middle',
        nameGap: 28,
        ...axis,
        splitLine: { show: false },
        axisTick: { show: false },
        // Label about six evenly spaced days, on multiples of a month (21 days) where possible.
        axisLabel: {
          ...axis.axisLabel,
          interval: (_: number, value: string) => Number(value) % labelStep === 0,
        },
      },
      yAxis: {
        type: 'value',
        name: 'Wealth (start = 1)',
        scale: true,
        ...axis,
        axisLabel: { ...axis.axisLabel, formatter: (v: number) => fixed(v, 2) },
      },
      series: [
        ...paths,
        ...band('5–95% range', 'outer', data.p05, data.p95, c.band),
        ...band('25–75% range', 'inner', data.p25, data.p75, c.bandStrong),
        {
          name: 'Median',
          type: 'line',
          data: data.p50,
          showSymbol: false,
          z: 3,
          lineStyle: { width: 2, color: c.series1 },
          itemStyle: { color: c.series1 },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: c.axis, type: 'solid', width: 1 },
            label: { show: false },
            data: [{ yAxis: 1 }],
          },
        },
      ],
    }
  }, [data, c])
  return (
    <ChartCard
      title="Range of simulated wealth"
      description="Where a $1 investment ends up across all simulated paths, day by day. The dark band holds the middle half of paths, the light band 90% of them; grey lines are individual paths."
      guide={
        <>
          <p>
            The fan widens with the horizon because uncertainty compounds: volatility grows with the
            square root of time while expected growth grows linearly, so short horizons are
            dominated by noise.
          </p>
          <p>
            Single paths wander far more than the median suggests. Any one of them is as likely as
            the others to be the one you live through.
          </p>
        </>
      }
      action={
        <div className="flex flex-wrap gap-4">
          <LegendKey color={c.series1} label="Median" />
          <LegendKey color={c.bandStrong} label="25–75%" band />
          <LegendKey color={c.band} label="5–95%" band />
          <LegendKey color={c.muted} label="Sample paths" />
        </div>
      }
      stale={stale}
    >
      <EChart
        option={option}
        className="h-96"
        ariaLabel="Fan chart of simulated wealth percentiles over the horizon"
      />
    </ChartCard>
  )
}

const returnFormat = (x: number) => pct(x, 0)

export default function SimulationPage() {
  const c = useChartColors()
  const [portfolio, setPortfolio] = useState<PortfolioKey>('max_sharpe')
  const [model, setModel] = useState<Model>('student_t')
  const [horizon, setHorizon] = useState('252')
  const [paths, setPaths] = useState('5000')
  const [rebalance, setRebalance] = useState('0')
  const [df, setDf] = useState(5)
  const [block, setBlock] = useState(21)
  const [seed, setSeed] = useState(42)

  const query = useLab('simulation', api.simulation, {
    portfolio,
    model,
    horizon_days: Number(horizon),
    n_paths: Number(paths),
    rebalance_every: Number(rebalance),
    student_df: df,
    block_size: block,
    seed,
  })
  const data = query.data
  const m = data?.metrics
  const est = (key: string, fmt: (v: number) => string, shift = 0) => {
    const e = m?.[key]
    return e ? `${fmt(e.value - shift)} ± ${pct(e.stderr, 1)}` : '—'
  }
  const horizonLabel = HORIZONS.find((h) => h.value === horizon)?.label ?? `${horizon}d`

  return (
    <>
      <PageHeader title="Monte Carlo simulation">
        Thousands of possible futures for the portfolio, simulated asset by asset. Expected returns
        and the covariance come from the shared estimates, so the simulation can only be as right as
        they are; the point is to see the spread of outcomes, not to predict one.
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside>
          <Card className="overflow-hidden">
            <PanelSection title="Portfolio" hint="Built from the shared universe and estimates.">
              <PortfolioSelect value={portfolio} onChange={setPortfolio} />
            </PanelSection>
            <Separator />
            <PanelSection title="Return model" hint="How each simulated day of returns is drawn.">
              <Segmented
                label="Return model"
                size="sm"
                className="w-full flex-wrap"
                value={model}
                onChange={setModel}
                options={MODELS.map((x) => ({ value: x.value, label: x.label }))}
              />
              <p className="-mt-2 text-muted-foreground text-xs">
                {MODELS.find((x) => x.value === model)?.idea}
              </p>
              {usesDf(model) && (
                <ParamControl
                  label="Degrees of freedom"
                  value={df}
                  onChange={setDf}
                  min={2.5}
                  max={30}
                  step={0.5}
                  digits={1}
                />
              )}
              {model === 'student_t' && (
                <p className="-mt-2 text-muted-foreground text-xs">
                  Lower means fatter tails; around 30 it is close to normal. Volatility is kept the
                  same either way.
                </p>
              )}
              {model === 't_copula' && (
                <p className="-mt-2 text-muted-foreground text-xs">
                  Here it sets only how assets crash together: lower means extreme days are more
                  often shared. Each asset’s own tails come from its history either way.
                </p>
              )}
              {model === 'bootstrap' && (
                <ParamControl
                  label="Block length"
                  value={block}
                  onChange={setBlock}
                  min={1}
                  max={126}
                  step={1}
                  unit="days"
                />
              )}
              {model === 'bootstrap' && (
                <p className="-mt-2 text-muted-foreground text-xs">
                  Consecutive days are drawn together so volatility clusters and short trends
                  survive. 1 day treats every day as independent.
                </p>
              )}
            </PanelSection>
            <Separator />
            <PanelSection title="Simulation">
              <div className="flex flex-col gap-2">
                <span className="text-muted-foreground text-sm">Horizon</span>
                <Segmented
                  label="Horizon"
                  size="sm"
                  value={horizon}
                  onChange={setHorizon}
                  options={HORIZONS}
                />
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-muted-foreground text-sm">Paths</span>
                <Segmented
                  label="Number of paths"
                  size="sm"
                  value={paths}
                  onChange={setPaths}
                  options={PATHS}
                />
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-muted-foreground text-sm">Rebalancing</span>
                <Segmented
                  label="Rebalancing"
                  size="sm"
                  value={rebalance}
                  onChange={setRebalance}
                  options={REBALANCE}
                />
                <p className="text-muted-foreground text-xs">
                  Never: weights drift with prices (buy and hold). Otherwise they are reset to the
                  target every 21 or 63 trading days.
                </p>
              </div>
              <NumberInput label="Random seed" value={seed} onChange={setSeed} min={0} step={1} />
            </PanelSection>
          </Card>
        </aside>
        <div className="flex min-w-0 flex-col gap-6">
          <QueryError error={query.error} />
          {data && m && (
            <>
              <div className="flex flex-col gap-2">
                <StatGrid className="grid-cols-2 md:grid-cols-3">
                  <Stat
                    label="Mean return"
                    value={est('mean_terminal', (v) => spct(v, 1), 1)}
                    hint={`over ${horizonLabel}`}
                  />
                  <Stat
                    label="Median return"
                    value={est('median_terminal', (v) => spct(v, 1), 1)}
                    hint="half of paths do better"
                  />
                  <Stat
                    label="Probability of a loss"
                    value={est('probability_of_loss', (v) => pct(v, 1))}
                    hint="ending below the start"
                  />
                  <Stat
                    label="5th percentile return"
                    value={est('p05_terminal', (v) => spct(v, 1), 1)}
                    hint="1 path in 20 ends lower"
                  />
                  <Stat
                    label="95th percentile return"
                    value={est('p95_terminal', (v) => spct(v, 1), 1)}
                    hint="1 path in 20 ends higher"
                  />
                  <Stat
                    label="VaR 95%"
                    value={est('var_95', (v) => pct(v, 1))}
                    hint="loss exceeded on 5% of paths"
                  />
                  <Stat
                    label="Expected shortfall 95%"
                    value={est('es_95', (v) => pct(v, 1))}
                    hint="average loss on those worst 5%"
                  />
                  <Stat
                    label="Median max drawdown"
                    value={est('median_max_drawdown', (v) => pct(v, 1))}
                    hint="deepest fall from a peak, typical path"
                  />
                  <Stat
                    label="Probability of a 20% drawdown"
                    value={est('probability_drawdown_20', (v) => pct(v, 1))}
                    hint="at some point in the horizon"
                  />
                </StatGrid>
                <p className="text-muted-foreground text-xs">
                  The ± is the Monte Carlo standard error (batch means): how much the number would
                  move with a different seed, because only {integer(Number(paths))} paths were
                  drawn. More paths shrink it. It is far smaller than the model error from using
                  estimated returns and covariances, which no number of paths removes.
                </p>
              </div>
              {data.regime && <RegimeCard regime={data.regime} stale={query.stale} />}
              <FanChart data={data} stale={query.stale} />
              <div className="grid gap-6 xl:grid-cols-2">
                <HistogramChart
                  title="Return at the horizon"
                  description={`Share of paths by total return after ${horizonLabel}. Dashed lines mark break-even and the 5th percentile; the tail left of it is what VaR and ES summarise.`}
                  histograms={[{ name: 'Terminal return', color: c.series1, data: data.terminal }]}
                  xName="Total return"
                  xFormat={returnFormat}
                  markers={[
                    { x: 0, label: 'break-even' },
                    { x: m.p05_terminal.value - 1, label: '5th percentile' },
                  ]}
                  stale={query.stale}
                  ariaLabel="Histogram of simulated total return at the horizon"
                />
                <HistogramChart
                  title="Worst drawdown along the way"
                  description="Share of paths by their deepest fall from a running peak. Even paths that end up ahead usually pass through a sizeable drawdown."
                  histograms={[{ name: 'Max drawdown', color: c.series2, data: data.max_drawdown }]}
                  xName="Max drawdown"
                  xFormat={returnFormat}
                  markers={[{ x: 0.2, label: '20%' }]}
                  stale={query.stale}
                  ariaLabel="Histogram of simulated maximum drawdown"
                />
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
