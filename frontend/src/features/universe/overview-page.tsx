import { InfoIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ChartCard } from '@/components/charts/chart-card'
import { type ChartOption, EChart } from '@/components/charts/echart'
import { CorrelationHeatmap } from '@/components/charts/heatmap'
import {
  assetColor,
  axisStyle,
  FONT_FAMILY,
  GRID,
  tooltipHeader,
  tooltipRow,
  tooltipStyle,
  useChartColors,
} from '@/components/charts/theme'
import { TimeChart } from '@/components/charts/time-chart'
import { PageHeader } from '@/components/page-header'
import { QueryError } from '@/components/query-error'
import { Segmented } from '@/components/segmented'
import { Stat, StatGrid } from '@/components/stat-grid'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api, type OverviewResponse } from '@/lib/api'
import { fixed, longDate, pct } from '@/lib/format'
import { useLab, useOverview } from './universe-context'

const WINDOWS = ['21', '63', '126', '252'] as const

function RiskReturnMap({ data, stale }: { data: OverviewResponse; stale: boolean }) {
  const c = useChartColors()
  const option = useMemo<ChartOption>(() => {
    const axis = axisStyle(c)
    const rf = data.meta.risk_free
    return {
      animationDurationUpdate: 150,
      grid: { ...GRID, right: 40 },
      tooltip: {
        ...tooltipStyle(c),
        trigger: 'item',
        formatter: (raw: unknown) => {
          const p = raw as { name: string; color: string; value: [number, number] }
          return (
            tooltipHeader(p.name) +
            tooltipRow(p.color, pct(p.value[1], 1), 'Expected return') +
            tooltipRow(p.color, pct(p.value[0], 1), 'Volatility')
          )
        },
      },
      xAxis: {
        type: 'value',
        name: 'Volatility (annual)',
        nameLocation: 'middle',
        nameGap: 28,
        min: 0,
        ...axis,
        axisLabel: { ...axis.axisLabel, formatter: (v: number) => pct(v, 0) },
      },
      yAxis: {
        type: 'value',
        name: 'Expected return (annual)',
        ...axis,
        axisLabel: { ...axis.axisLabel, formatter: (v: number) => pct(v, 0) },
      },
      series: [
        {
          type: 'scatter',
          symbolSize: 12,
          data: data.assets.map((a, i) => ({
            name: a.ticker,
            value: [a.volatility, a.expected_return],
            itemStyle: { color: assetColor(c, i), borderColor: c.surface, borderWidth: 2 },
          })),
          label: {
            show: true,
            position: 'right',
            formatter: '{b}',
            color: c.ink2,
            fontSize: 11,
            fontFamily: FONT_FAMILY,
          },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: c.axis, type: 'dashed' as const, width: 1 },
            label: { show: true, formatter: 'cash', color: c.muted, fontSize: 11 },
            data: [{ yAxis: rf }],
          },
        },
      ],
    }
  }, [data, c])
  return (
    <ChartCard
      title="Risk and return by asset"
      description="Each asset's estimated annual return against its volatility. The dashed line is the cash rate: an asset below it was not paid for its risk over this sample."
      guide={
        <>
          <p>
            Expected returns are historical averages, so they describe the past sample, not a
            forecast. They are the noisiest input in portfolio construction: a few years of data
            pins down volatility well but expected return only roughly.
          </p>
          <p>
            Methods that ignore expected returns (minimum variance, risk parity, HRP) are immune to
            that noise; maximum Sharpe leans on it fully.
          </p>
        </>
      }
      stale={stale}
    >
      <EChart option={option} ariaLabel="Scatter of each asset's volatility and expected return" />
    </ChartCard>
  )
}

function AssetTable({ data }: { data: OverviewResponse }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base" render={<h2 />}>
          Assets
        </CardTitle>
        <CardDescription>
          Estimates over the common sample. Sharpe is measured against cash; realised return is the
          compound annual growth actually achieved.
        </CardDescription>
      </CardHeader>
      <CardPanel className="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Asset</TableHead>
              <TableHead>First trade</TableHead>
              <TableHead className="text-right">Expected return</TableHead>
              <TableHead className="text-right">Volatility</TableHead>
              <TableHead className="text-right">Sharpe</TableHead>
              <TableHead className="text-right">Realised return</TableHead>
              <TableHead className="text-right">Max drawdown</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.assets.map((a) => (
              <TableRow key={a.ticker}>
                <TableCell className="font-medium font-mono">{a.ticker}</TableCell>
                <TableCell className="text-muted-foreground">
                  {longDate(data.meta.inception[a.ticker])}
                  {data.meta.limiting.includes(a.ticker) && ' ⚑'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {pct(a.expected_return, 1)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{pct(a.volatility, 1)}</TableCell>
                <TableCell className="text-right tabular-nums">{fixed(a.sharpe, 2)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {pct(a.realised_return, 1)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{pct(a.max_drawdown, 1)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardPanel>
    </Card>
  )
}

const ESTIMATOR_LABELS: Record<string, string> = {
  sample: 'Sample',
  ledoit_wolf: 'Ledoit–Wolf',
  ewma: 'EWMA',
}

function DiagnosticsTable({ data }: { data: OverviewResponse }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base" render={<h2 />}>
          How trustworthy is the covariance matrix?
        </CardTitle>
        <CardDescription>
          Optimisers invert the covariance matrix, so its condition number tells you how much small
          estimation errors get amplified in the weights. Under ~100 is comfortable; above 1,000 the
          optimal weights are mostly noise.
        </CardDescription>
      </CardHeader>
      <CardPanel className="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Estimator</TableHead>
              <TableHead className="text-right">Condition number</TableHead>
              <TableHead className="text-right">Effective rank</TableHead>
              <TableHead className="text-right">Distance from sample</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.diagnostics.map((d) => (
              <TableRow key={d.estimator}>
                <TableCell className="font-medium">
                  {ESTIMATOR_LABELS[d.estimator] ?? d.estimator}
                  {d.estimator === data.active_estimator && (
                    <span className="ms-2 text-muted-foreground text-xs">(in use)</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fixed(d.condition_number, 1)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fixed(d.effective_rank, 2)} of {data.assets.length}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {pct(d.distance_vs_sample, 1)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardPanel>
    </Card>
  )
}

export default function OverviewPage() {
  const overview = useOverview()
  const [window, setWindow] = useState<(typeof WINDOWS)[number]>('63')
  const dependency = useLab('dependency', api.dependency, { window: Number(window) })
  const c = useChartColors()
  const data = overview.data
  const stale = overview.isPlaceholderData || overview.isFetching

  return (
    <>
      <PageHeader title="Universe">
        What the chosen assets look like on their own and together, before any portfolio is built.
        Diversification comes from how assets move <em>together</em>, so the correlations below
        matter as much as each asset's own risk.
      </PageHeader>
      <div className="flex flex-col gap-6">
        <QueryError error={overview.error} title="Could not load the universe" />
        {data && (
          <>
            {data.meta.limiting.length > 0 && (
              <Alert variant="warning">
                <InfoIcon aria-hidden="true" />
                <AlertTitle>The sample is shorter than requested</AlertTitle>
                <AlertDescription>
                  Every analysis needs days on which all assets traded, so the sample starts on{' '}
                  {longDate(data.meta.start)} instead of {longDate(data.meta.requested_start)}.{' '}
                  {data.meta.limiting
                    .map((t) => `${t} first traded on ${longDate(data.meta.inception[t])}`)
                    .join('; ')}
                  . Remove it, or accept the shorter history (crisis replays still use each asset's
                  full history).
                </AlertDescription>
              </Alert>
            )}
            <StatGrid className="grid-cols-2 md:grid-cols-5">
              <Stat label="Assets" value={String(data.assets.length)} />
              <Stat
                label="Trading days"
                value={String(data.meta.observations)}
                hint={`${longDate(data.meta.start)} → ${longDate(data.meta.end)}`}
              />
              <Stat
                label="Cash rate"
                value={pct(data.meta.risk_free, 2)}
                hint={data.meta.risk_free_source}
              />
              <Stat
                label="Average correlation"
                value={fixed(data.average_correlation, 2)}
                hint="across all pairs"
              />
              <Stat
                label="Most correlated pair"
                value={`${data.strongest_pair.a} / ${data.strongest_pair.b}`}
                hint={`${fixed(data.strongest_pair.value, 2)} · least: ${data.weakest_pair.a} / ${data.weakest_pair.b} ${fixed(data.weakest_pair.value, 2)}`}
              />
            </StatGrid>
            <TimeChart
              title="Growth of $1"
              description="Each asset's total return (dividends reinvested) over the common sample. When the assets grow by more than 10× the axis switches to a log scale, so equal percentage moves look equal."
              lines={data.assets.map((a, i) => ({
                name: a.ticker,
                color: assetColor(c, i),
                data: data.growth[a.ticker],
              }))}
              yName="Growth of $1"
              yFormat={(v) => `$${fixed(v, v < 10 ? 2 : 0)}`}
              logY
              baseline={1}
              stale={stale}
              ariaLabel="Growth of one dollar invested in each asset"
              className="h-80"
            />
            <div className="grid gap-6 xl:grid-cols-2">
              <CorrelationHeatmap
                title="Correlation of daily returns"
                description="+1: always move together (no diversification); 0: unrelated; −1: opposite. Blue is positive, red negative."
                guide={
                  <p>
                    Portfolio volatility depends on every pair: combining assets with correlation
                    below 1 gives a portfolio less volatile than the weighted average of its parts.
                    The lower the correlations, the bigger that diversification benefit.
                  </p>
                }
                labels={data.meta.tickers}
                matrix={data.correlation}
                stale={stale}
              />
              <RiskReturnMap data={data} stale={stale} />
            </div>
          </>
        )}
        <TimeChart
          title="Rolling average correlation"
          description={
            dependency.data
              ? `Average pairwise correlation over a trailing ${window}-day window. Now ${fixed(dependency.data.latest, 2)}, higher than ${pct(dependency.data.latest_percentile, 0)} of the sample: a ${dependency.data.latest_regime.toLowerCase()} regime.`
              : 'Average pairwise correlation over a trailing window.'
          }
          guide={
            <p>
              Correlations are not constant: in sell-offs they tend to jump toward 1, exactly when
              diversification is needed most. A static correlation matrix averages calm and crisis
              periods together, so it overstates diversification in a crash.
            </p>
          }
          action={
            <Segmented
              label="Window"
              size="sm"
              value={window}
              onChange={setWindow}
              options={WINDOWS.map((w) => ({ value: w, label: `${w}d` }))}
            />
          }
          lines={
            dependency.data
              ? [
                  {
                    name: 'Average correlation',
                    color: c.series1,
                    data: dependency.data.average_correlation,
                  },
                ]
              : []
          }
          yName="Correlation"
          yFormat={(v) => fixed(v, 2)}
          stale={dependency.stale}
          ariaLabel="Rolling average pairwise correlation over time"
        />
        <QueryError error={dependency.error} />
        {data && (
          <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
            <AssetTable data={data} />
            <DiagnosticsTable data={data} />
          </div>
        )}
      </div>
    </>
  )
}
