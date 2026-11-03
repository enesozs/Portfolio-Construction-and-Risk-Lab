import { CheckIcon, XIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ChartGuide } from '@/components/chart-guide'
import { WeightBars } from '@/components/charts/allocation-charts'
import { ChartCard, LegendKey } from '@/components/charts/chart-card'
import { type ChartOption, EChart } from '@/components/charts/echart'
import {
  axisStyle,
  GRID,
  tooltipHeader,
  tooltipRow,
  tooltipStyle,
  useChartColors,
} from '@/components/charts/theme'
import { PageHeader } from '@/components/page-header'
import { PanelSection } from '@/components/panel-section'
import { PortfolioSelect } from '@/components/portfolio-select'
import { QueryError } from '@/components/query-error'
import { Segmented } from '@/components/segmented'
import { Stat, StatGrid } from '@/components/stat-grid'
import { Badge } from '@/components/ui/badge'
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
import { useLab } from '@/features/universe/universe-context'
import { api, type PortfolioKey, type VarBacktestResponse } from '@/lib/api'
import { fixed, integer, longDate, pct } from '@/lib/format'
import { cn } from '@/lib/utils'

type Model = 'historical' | 'normal' | 'ewma' | 'filtered_historical'
type VarModel = VarBacktestResponse['models'][number]

const MODELS: { value: Model; label: string; short: string; idea: string }[] = [
  {
    value: 'historical',
    label: 'Historical',
    short: 'Historical',
    idea: 'The window’s own tail quantile (at 99%, roughly its 3rd-worst day in 250), read straight off history. No shape assumed, but slow to react: a calm year in the window keeps the VaR low.',
  },
  {
    value: 'normal',
    label: 'Normal',
    short: 'Normal',
    idea: 'Mean minus z·σ of the window, as if returns were a bell curve. Real returns have fatter tails, so at high confidence this tends to see too many exceptions.',
  },
  {
    value: 'ewma',
    label: 'EWMA (RiskMetrics)',
    short: 'EWMA',
    idea: 'A normal quantile with a volatility that weights recent days most (λ = 0.94, about a 16-day memory), so it adapts within days when markets turn.',
  },
  {
    value: 'filtered_historical',
    label: 'Filtered historical',
    short: 'Filtered',
    idea: 'History standardised by the EWMA volatility, then rescaled by today’s: the fat tails of history with a volatility that adapts quickly.',
  },
]

const modelLabel = (key: string) => MODELS.find((m) => m.value === key)?.label ?? key

const CONFIDENCE = [
  { value: '0.95', label: '95%' },
  { value: '0.975', label: '97.5%' },
  { value: '0.99', label: '99%' },
]
const WINDOWS = [
  { value: '125', label: '125 days' },
  { value: '250', label: '250 days' },
  { value: '500', label: '500 days' },
]
const PERIODS = [
  { value: '252', label: '1y' },
  { value: '756', label: '3y' },
  { value: 'all', label: 'All' },
]

/** Significance level for the coverage tests. */
const ALPHA = 0.05

/** A share of capital, without a "−0.00%" for an asset that holds nothing. */
const capital = (v: number, digits = 2) =>
  pct(Math.abs(v) < 0.5 * 10 ** -(digits + 2) ? 0 : v, digits)

/** Confidence as the control shows it ("99%", "97.5%"). */
const confLabel = (c: number) =>
  `${fixed(c * 100, Math.abs(c * 100 - Math.round(c * 100)) < 1e-9 ? 0 : 1)}%`

function pvalue(p: number): string {
  return p < 0.001 ? '<0.001' : fixed(p, 3)
}

const passes = (m: VarModel) =>
  m.kupiec_p >= ALPHA && m.independence_p >= ALPHA && m.conditional_p >= ALPHA

/** A p-value with a pass / reject mark, so the verdict never relies on colour alone. */
function PValue({ p }: { p: number }) {
  const ok = p >= ALPHA
  return (
    <span className="inline-flex items-center justify-end gap-1.5 tabular-nums">
      {pvalue(p)}
      {ok ? (
        <CheckIcon className="size-3.5 text-success-foreground" aria-label="passes at 5%" />
      ) : (
        <XIcon className="size-3.5 text-destructive-foreground" aria-label="rejected at 5%" />
      )}
    </span>
  )
}

const ZONES: Record<string, { variant: 'success' | 'warning' | 'error'; label: string }> = {
  green: { variant: 'success', label: 'Green zone' },
  yellow: { variant: 'warning', label: 'Yellow zone' },
  red: { variant: 'error', label: 'Red zone' },
}

function ModelTable({
  data,
  selected,
  onSelect,
  stale,
}: {
  data: VarBacktestResponse
  selected: Model
  onSelect: (m: Model) => void
  stale: boolean
}) {
  const days = data.returns.dates.length
  const expected = data.expected_rate * days
  const basel = data.models.some((m) => m.traffic_light != null)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base" render={<h2 />}>
          Four VaR models, tested out of sample
        </CardTitle>
        <CardDescription>
          Each day, every model forecasts tomorrow’s {confLabel(data.confidence)} VaR from past days
          only. An exception is a day whose loss beats the forecast. Over {integer(days)} days a
          correct model expects about {fixed(expected, 0)} exceptions ({pct(data.expected_rate, 1)}
          ). Select a row to chart it.
        </CardDescription>
        <ChartGuide noun="table">
          <p>
            Each p-value answers: if this model were right, how surprising would results like these
            be? A small p-value (below 5%, marked ✕) means the data are unlikely under the model, so
            the test rejects it. A large one (✓) means no evidence against it, which is weaker than
            proof that it is right.
          </p>
          <p>
            <strong>Kupiec</strong> checks the count: is the exception rate close to{' '}
            {pct(data.expected_rate, 1)}? Too many means risk was understated, far too few that it
            was overstated. <strong>Independence</strong> (Christoffersen) checks timing: an
            exception should be no more likely the day after another, and clusters mean the model
            reacts too slowly when volatility rises. <strong>Conditional coverage</strong> tests
            both at once.
          </p>
          {basel && (
            <p>
              The Basel traffic light counts 99% exceptions over the last 250 days, the rule bank
              regulators use: 0–4 green, 5–9 yellow (the model may be understating risk), 10 or more
              red.
            </p>
          )}
        </ChartGuide>
      </CardHeader>
      <CardPanel className={cn('pt-0 transition-opacity', stale && 'opacity-60')}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Model</TableHead>
              <TableHead className="text-right">Exceptions</TableHead>
              <TableHead className="text-right">
                Rate (expected {pct(data.expected_rate, 1)})
              </TableHead>
              <TableHead className="text-right">Last 250 days</TableHead>
              <TableHead className="text-right">Kupiec p</TableHead>
              <TableHead className="text-right">Independence p</TableHead>
              <TableHead className="text-right">Cond. coverage p</TableHead>
              <TableHead>At 5%</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.models.map((m) => {
              const zone = m.traffic_light ? ZONES[m.traffic_light] : undefined
              const active = m.model === selected
              return (
                <TableRow
                  key={m.model}
                  className={cn('cursor-pointer', active && 'bg-muted/72')}
                  onClick={() => onSelect(m.model as Model)}
                >
                  <TableCell className="font-medium">{modelLabel(m.model)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {integer(m.exception_dates.length)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{pct(m.rate, 2)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className="inline-flex items-center gap-2">
                      {m.last_250_exceptions}
                      {zone && (
                        <Badge variant={zone.variant} size="sm">
                          {zone.label}
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <PValue p={m.kupiec_p} />
                  </TableCell>
                  <TableCell className="text-right">
                    <PValue p={m.independence_p} />
                  </TableCell>
                  <TableCell className="text-right">
                    <PValue p={m.conditional_p} />
                  </TableCell>
                  <TableCell>
                    {passes(m) ? (
                      <Badge variant="success" size="sm">
                        Passes all three
                      </Badge>
                    ) : (
                      <Badge variant="outline" size="sm">
                        Rejected
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardPanel>
    </Card>
  )
}

const lossFormat = (v: number) => pct(v, Math.abs(v * 100 - Math.round(v * 100)) < 1e-9 ? 0 : 1)

function ExceptionChart({
  data,
  model,
  onModel,
  stale,
}: {
  data: VarBacktestResponse
  model: Model
  onModel: (m: Model) => void
  stale: boolean
}) {
  const c = useChartColors()
  const [period, setPeriod] = useState('all')
  const m = data.models.find((x) => x.model === model) ?? data.models[0]
  const option = useMemo<ChartOption>(() => {
    const axis = axisStyle(c)
    const n = data.returns.dates.length
    const from = period === 'all' ? 0 : Math.max(0, n - Number(period))
    const dates = data.returns.dates.slice(from)
    const losses = data.returns.values.slice(from).map((r) => -r)
    const varByDate = new Map(m.var.dates.map((d, i) => [d, m.var.values[i]]))
    const lossByDate = new Map(dates.map((d, i) => [d, losses[i]]))
    const start = dates[0] ?? ''
    const hits = m.exception_dates.filter((d) => d >= start)
    const hitSet = new Set(hits)
    return {
      animationDurationUpdate: 150,
      grid: GRID,
      tooltip: {
        ...tooltipStyle(c),
        formatter: (raw: unknown) => {
          const params = raw as { value: [string, number] }[]
          const date = params[0]?.value[0]
          if (!date) return ''
          const loss = lossByDate.get(date)
          const v = varByDate.get(date)
          return (
            tooltipHeader(longDate(date)) +
            tooltipRow(c.muted, pct(loss, 2), (loss ?? 0) >= 0 ? 'Loss' : 'Loss (a gain)') +
            tooltipRow(c.series1, pct(v, 2), 'VaR forecast') +
            (hitSet.has(date) ? tooltipRow(c.series2, 'yes', 'Exception') : '')
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
        name: 'Daily loss (−return)',
        ...axis,
        axisLabel: { ...axis.axisLabel, formatter: lossFormat },
      },
      series: [
        {
          name: 'Daily loss',
          type: 'bar',
          data: dates.map((d, i) => [d, losses[i]]),
          large: true,
          barMaxWidth: 3,
          itemStyle: { color: c.muted, opacity: 0.55 },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: c.axis, type: 'solid', width: 1 },
            label: { show: false },
            data: [{ yAxis: 0 }],
          },
        },
        {
          name: 'VaR forecast',
          type: 'line',
          data: dates.map((d) => [d, varByDate.get(d) ?? null]),
          showSymbol: false,
          z: 3,
          lineStyle: { width: 1.5, color: c.series1 },
          itemStyle: { color: c.series1 },
        },
        {
          name: 'Exception',
          type: 'scatter',
          data: hits.map((d) => [d, lossByDate.get(d) ?? 0]),
          symbolSize: 6,
          z: 4,
          itemStyle: { color: c.series2, borderColor: c.surface, borderWidth: 1 },
        },
      ],
    }
  }, [data, m, period, c])
  return (
    <ChartCard
      title={`Daily losses against the ${modelLabel(m.model)} VaR`}
      description={`Grey bars are each day’s loss (gains point down), the line is the VaR the model forecast the evening before, and dots mark the ${integer(m.exception_dates.length)} days the loss beat it.`}
      guide={
        <>
          <p>
            A good VaR line hugs the volatility: it rises quickly when markets turn rough and falls
            back when they calm down. Then exceptions are rare and scattered.
          </p>
          <p>
            Bunches of dots right after a calm stretch are what the independence test picks up: the
            model was still using calm-period volatility when the storm arrived. Models with an EWMA
            volatility move faster than the fixed-window ones, which is visible as a jumpier line.
          </p>
        </>
      }
      action={
        <div className="flex flex-col items-end gap-3">
          <div className="flex flex-wrap justify-end gap-2">
            <Segmented
              label="VaR model to chart"
              size="sm"
              value={model}
              onChange={onModel}
              options={MODELS.map((x) => ({ value: x.value, label: x.short }))}
            />
            <Segmented
              label="Period"
              size="sm"
              value={period}
              onChange={setPeriod}
              options={PERIODS}
            />
          </div>
          <div className="flex flex-wrap gap-4">
            <LegendKey color={c.muted} label="Daily loss" band />
            <LegendKey color={c.series1} label="VaR forecast" />
            <LegendKey color={c.series2} label="Exception" band />
          </div>
        </div>
      }
      stale={stale}
    >
      <EChart
        option={option}
        className="h-96"
        ariaLabel={`Daily portfolio losses with the ${modelLabel(m.model)} VaR forecast and exception days`}
      />
    </ChartCard>
  )
}

function ComponentRisk({ data, stale }: { data: VarBacktestResponse; stale: boolean }) {
  const rows = data.components
  const assets = rows.map((r) => r.asset)
  const share = (v: number, total: number) => (total ? v / total : 0)
  const conf = confLabel(data.confidence)
  const totalWeight = rows.reduce((s, r) => s + r.weight, 0)
  return (
    <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
      <WeightBars
        title="Where the tail risk comes from"
        description={`Each asset’s share of capital next to its share of the 1-day ${conf} VaR and expected shortfall. A risk bar taller than the weight bar means the asset adds more to bad days than its size suggests.`}
        guide={
          <>
            <p>
              Euler allocation splits a risk measure so the pieces add up exactly to the total: each
              asset’s contribution is its weight times how much the portfolio’s risk rises when that
              weight grows a little. That captures correlation, so a volatile asset that moves with
              the rest contributes more than its weight, and a hedge that rises on bad days can
              contribute less than nothing.
            </p>
            <p>
              Component VaR is parametric (normal, from the sample covariance); component ES is
              historical: each asset’s average loss on the portfolio’s worst{' '}
              {pct(1 - data.confidence, 1)} of days. Both use the whole research window, so they
              describe the typical tail, not today’s.
            </p>
          </>
        }
        assets={assets}
        series={[
          { name: 'Weight', weights: Object.fromEntries(rows.map((r) => [r.asset, r.weight])) },
          {
            name: 'Share of VaR',
            weights: Object.fromEntries(
              rows.map((r) => [r.asset, share(r.component_var, data.var)]),
            ),
          },
          {
            name: 'Share of ES',
            weights: Object.fromEntries(rows.map((r) => [r.asset, share(r.component_es, data.es)])),
          },
        ]}
        stale={stale}
        className="h-72"
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base" render={<h2 />}>
            Component VaR and ES
          </CardTitle>
          <CardDescription>
            1-day losses as a share of capital. The rows add up to the portfolio totals at the
            bottom.
          </CardDescription>
          <ChartGuide noun="table">
            <p>
              Read a row as “of the portfolio’s {pct(data.var, 2)} VaR, this asset is responsible
              for this much”. A negative number is a diversifier: on the portfolio’s bad days it
              tends to gain.
            </p>
            <p>
              ES is larger than VaR because it averages the losses beyond the VaR instead of
              stopping at its edge.
            </p>
          </ChartGuide>
        </CardHeader>
        <CardPanel className={cn('pt-0 transition-opacity', stale && 'opacity-60')}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead className="text-right">Weight</TableHead>
                <TableHead className="text-right">VaR</TableHead>
                <TableHead className="text-right">ES</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.asset}>
                  <TableCell className="font-medium">{r.asset}</TableCell>
                  <TableCell className="text-right tabular-nums">{pct(r.weight, 1)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {capital(r.component_var)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {capital(r.component_es)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold">
                <TableCell>Portfolio</TableCell>
                <TableCell className="text-right tabular-nums">{pct(totalWeight, 1)}</TableCell>
                <TableCell className="text-right tabular-nums">{pct(data.var, 2)}</TableCell>
                <TableCell className="text-right tabular-nums">{pct(data.es, 2)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardPanel>
      </Card>
    </div>
  )
}

export default function VarPage() {
  const [portfolio, setPortfolio] = useState<PortfolioKey>('max_sharpe')
  const [confidence, setConfidence] = useState('0.99')
  const [windowDays, setWindowDays] = useState('250')
  const [model, setModel] = useState<Model>('filtered_historical')

  const query = useLab('var-backtest', api.varBacktest, {
    portfolio,
    confidence: Number(confidence),
    window: Number(windowDays),
  })
  const data = query.data
  const days = data?.returns.dates.length ?? 0
  const passing = data?.models.filter(passes) ?? []

  return (
    <>
      <PageHeader title="VaR backtest">
        Value at Risk is the daily loss a model says will be exceeded only rarely, say on 1 day in
        100. That is a claim history can check: forecast each day from earlier data only, count the
        days the loss beat the forecast, and test whether there were as many as promised and whether
        they arrived independently.
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside>
          <Card className="overflow-hidden">
            <PanelSection title="Portfolio" hint="Built from the shared universe and estimates.">
              <PortfolioSelect value={portfolio} onChange={setPortfolio} />
            </PanelSection>
            <Separator />
            <PanelSection
              title="Confidence"
              hint="The share of days the VaR should cover. Higher confidence looks further into the tail, where fewer observations make it harder to estimate."
            >
              <Segmented
                label="Confidence"
                size="sm"
                value={confidence}
                onChange={setConfidence}
                options={CONFIDENCE}
              />
              <p className="-mt-2 text-muted-foreground text-xs">
                The Basel traffic light applies at 99%, the level regulators use.
              </p>
            </PanelSection>
            <Separator />
            <PanelSection
              title="Estimation window"
              hint="Trailing days each forecast is estimated from."
            >
              <Segmented
                label="Estimation window"
                size="sm"
                value={windowDays}
                onChange={setWindowDays}
                options={WINDOWS}
              />
              <p className="-mt-2 text-muted-foreground text-xs">
                Short windows react faster but are noisier; long windows hold more tail days but
                remember old calm or old crises. The first window’s days are used only for
                estimation, so the test starts after them.
              </p>
            </PanelSection>
            <Separator />
            <PanelSection title="The models">
              <dl className="flex flex-col gap-2 text-xs">
                {MODELS.map((x) => (
                  <div key={x.value}>
                    <dt className="font-medium">{x.label}</dt>
                    <dd className="text-muted-foreground">{x.idea}</dd>
                  </div>
                ))}
              </dl>
            </PanelSection>
          </Card>
        </aside>
        <div className="flex min-w-0 flex-col gap-6">
          <QueryError error={query.error} />
          {data && (
            <>
              <StatGrid className="grid-cols-2 md:grid-cols-4">
                <Stat
                  label="Days tested"
                  value={integer(days)}
                  hint={`${longDate(data.returns.dates[0])} to ${longDate(data.returns.dates[days - 1])}`}
                />
                <Stat
                  label="Expected exceptions"
                  value={fixed(data.expected_rate * days, 0)}
                  hint={`${pct(data.expected_rate, 1)} of days`}
                />
                <Stat
                  label="Models passing all tests"
                  value={`${passing.length} of ${data.models.length}`}
                  hint={
                    passing.length
                      ? passing.map((m) => modelLabel(m.model)).join(', ')
                      : 'at the 5% level'
                  }
                />
                <Stat
                  label={`1-day VaR / ES ${confLabel(data.confidence)}`}
                  value={`${pct(data.var, 2)} / ${pct(data.es, 2)}`}
                  hint="normal VaR, historical ES, whole window"
                />
              </StatGrid>
              <ModelTable data={data} selected={model} onSelect={setModel} stale={query.stale} />
              <ExceptionChart data={data} model={model} onModel={setModel} stale={query.stale} />
              <ComponentRisk data={data} stale={query.stale} />
            </>
          )}
        </div>
      </div>
    </>
  )
}
