import { useMemo, useState } from 'react'
import { AllocationStack } from '@/components/charts/allocation-charts'
import { ChartCard, LegendKey } from '@/components/charts/chart-card'
import { type ChartOption, EChart } from '@/components/charts/echart'
import {
  axisStyle,
  FONT_FAMILY,
  GRID,
  tooltipHeader,
  tooltipRow,
  tooltipStyle,
  useChartColors,
} from '@/components/charts/theme'
import { PageHeader } from '@/components/page-header'
import { QueryError } from '@/components/query-error'
import { Segmented } from '@/components/segmented'
import { Stat, StatGrid } from '@/components/stat-grid'
import { Badge } from '@/components/ui/badge'
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useLab, useUniverse } from '@/features/universe/universe-context'
import { api, type PortfoliosResponse } from '@/lib/api'
import { fixed, pct } from '@/lib/format'

function FrontierChart({ data, stale }: { data: PortfoliosResponse; stale: boolean }) {
  const c = useChartColors()
  const option = useMemo<ChartOption>(() => {
    const axis = axisStyle(c)
    const rf = data.risk_free
    const tangency = data.portfolios.find((p) => p.key === 'max_sharpe')
    const maxVol = Math.max(
      ...data.frontier.map((f) => f.volatility),
      ...data.portfolios.map((p) => p.expected_volatility),
    )
    // Capital market line: cash plus the max-Sharpe portfolio, extended to the plot edge.
    const slope = tangency ? (tangency.expected_return - rf) / tangency.expected_volatility : 0
    const cml = tangency
      ? [
          [0, rf],
          [maxVol * 1.05, rf + slope * maxVol * 1.05],
        ]
      : []
    return {
      animationDurationUpdate: 150,
      grid: { ...GRID, right: 120 },
      tooltip: {
        ...tooltipStyle(c),
        trigger: 'item',
        formatter: (raw: unknown) => {
          const p = raw as { seriesName: string; name: string; color: string; value: number[] }
          return (
            tooltipHeader(p.name || p.seriesName) +
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
        scale: true,
        ...axis,
        axisLabel: { ...axis.axisLabel, formatter: (v: number) => pct(v, 0) },
      },
      series: [
        {
          name: 'Efficient frontier',
          type: 'line',
          data: data.frontier.map((f) => [f.volatility, f.expected_return]),
          showSymbol: false,
          lineStyle: { width: 2, color: c.series1 },
          itemStyle: { color: c.series1 },
        },
        {
          name: 'Capital market line',
          type: 'line',
          data: cml,
          showSymbol: false,
          silent: true,
          lineStyle: { width: 1.5, color: c.muted, type: 'dashed' },
          itemStyle: { color: c.muted },
        },
        {
          name: 'Portfolios',
          type: 'scatter',
          symbolSize: 11,
          data: data.portfolios.map((p) => ({
            name: p.label,
            value: [p.expected_volatility, p.expected_return],
          })),
          itemStyle: { color: c.series2, borderColor: c.surface, borderWidth: 2 },
          label: {
            show: true,
            position: 'right',
            formatter: '{b}',
            color: c.ink2,
            fontSize: 11,
            fontFamily: FONT_FAMILY,
          },
          labelLayout: { moveOverlap: 'shiftY' },
        },
      ],
    }
  }, [data, c])
  return (
    <ChartCard
      title="Efficient frontier"
      description="The highest expected return achievable at each level of volatility (blue), with each standard portfolio placed against it (orange). The dashed capital market line mixes cash with the maximum-Sharpe portfolio."
      guide={
        <>
          <p>
            Portfolios on the frontier are the best mean-variance trade-offs{' '}
            <em>given these estimates</em>. Anything below it could earn more for the same risk.
          </p>
          <p>
            With cash available, the best risky portfolio is the one where a line from the cash rate
            just touches the frontier: maximum Sharpe. Moving along that line (more or less cash)
            beats every other frontier point for its risk. It is only as good as the expected
            returns behind it, which is why the robustness pages exist.
          </p>
        </>
      }
      action={
        <div className="flex flex-wrap gap-4">
          <LegendKey color={c.series1} label="Frontier" />
          <LegendKey color={c.muted} label="Cash + max Sharpe" />
          <LegendKey color={c.series2} label="Portfolios" band />
        </div>
      }
      stale={stale}
    >
      <EChart option={option} className="h-96" ariaLabel="Efficient frontier with portfolios" />
    </ChartCard>
  )
}

function ComparisonTable({ data }: { data: PortfoliosResponse }) {
  const best = (pick: (p: PortfoliosResponse['portfolios'][number]) => number | null | undefined) =>
    data.portfolios.reduce<string | null>((key, p) => {
      const v = pick(p)
      if (v == null) return key
      const cur = data.portfolios.find((q) => q.key === key)
      return cur == null || v > (pick(cur) ?? -Infinity) ? p.key : key
    }, null)
  const bestSharpe = best((p) => p.expected_sharpe)
  const bestHist = best((p) => p.historical_sharpe)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base" render={<h2 />}>
          Side by side
        </CardTitle>
        <CardDescription>
          <strong>Expected</strong> columns come from the estimates the optimisers used;{' '}
          <strong>historical</strong> columns show how each fixed allocation actually did over the
          same sample (in-sample, so flattering). CVaR is the average loss on the worst 5% of days.
        </CardDescription>
      </CardHeader>
      <CardPanel className="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Portfolio</TableHead>
              <TableHead className="text-right">Exp. return</TableHead>
              <TableHead className="text-right">Exp. volatility</TableHead>
              <TableHead className="text-right">Exp. Sharpe</TableHead>
              <TableHead className="text-right">Hist. return</TableHead>
              <TableHead className="text-right">Hist. Sharpe</TableHead>
              <TableHead className="text-right">Max drawdown</TableHead>
              <TableHead className="text-right">Daily CVaR 95%</TableHead>
              <TableHead className="text-right">Effective assets</TableHead>
              <TableHead className="text-right">Diversification</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.portfolios.map((p) => (
              <TableRow key={p.key}>
                <TableCell className="font-medium">
                  {p.label}
                  {p.uses_expected_returns && (
                    <Badge
                      variant="outline"
                      size="sm"
                      className="ms-2"
                      title="Uses expected-return estimates"
                    >
                      μ
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {pct(p.expected_return, 1)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {pct(p.expected_volatility, 1)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fixed(p.expected_sharpe, 2)}
                  {p.key === bestSharpe && ' ★'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {pct(p.historical_return, 1)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fixed(p.historical_sharpe, 2)}
                  {p.key === bestHist && ' ★'}
                </TableCell>
                <TableCell className="text-right tabular-nums">{pct(p.max_drawdown, 1)}</TableCell>
                <TableCell className="text-right tabular-nums">{pct(p.cvar_95, 2)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fixed(p.effective_assets, 1)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fixed(p.diversification_ratio, 2)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {Object.entries(data.errors).map(([key, message]) => (
          <p key={key} className="mt-3 text-muted-foreground text-xs">
            {key} could not be built: {message}
          </p>
        ))}
      </CardPanel>
    </Card>
  )
}

function Rankings({ data }: { data: PortfoliosResponse }) {
  const [objective, setObjective] = useState(data.rankings[0]?.objective ?? 'sharpe')
  const ranking = data.rankings.find((r) => r.objective === objective) ?? data.rankings[0]
  const label = (key: string) => data.portfolios.find((p) => p.key === key)?.label ?? key
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base" render={<h2 />}>
          Which portfolio fits the goal?
        </CardTitle>
        <CardDescription>
          No portfolio wins on every objective. Pick what matters most to see them ranked by it.
        </CardDescription>
      </CardHeader>
      <CardPanel className="flex flex-col gap-4 pt-0">
        <Segmented
          label="Objective"
          size="sm"
          value={objective}
          onChange={setObjective}
          options={data.rankings.map((r) => ({ value: r.objective, label: r.label }))}
          className="flex-wrap"
        />
        {ranking && (
          <ol className="flex flex-col gap-1.5 text-sm">
            {ranking.order.map((key, i) => (
              <li key={key} className="flex items-baseline gap-3">
                <span className="w-5 text-right text-muted-foreground tabular-nums">{i + 1}.</span>
                <span className={i === 0 ? 'font-semibold' : undefined}>{label(key)}</span>
              </li>
            ))}
          </ol>
        )}
        <p className="text-muted-foreground text-xs">
          Ranked by {ranking?.metric.toLowerCase()} in the current sample: a research ranking, not a
          recommendation.
        </p>
      </CardPanel>
    </Card>
  )
}

export default function PortfoliosPage() {
  const { universe } = useUniverse()
  const query = useLab('portfolios', api.portfolios, {})
  const data = query.data
  const top = data
    ? [...data.portfolios].sort((a, b) => (b.expected_sharpe ?? -9) - (a.expected_sharpe ?? -9))[0]
    : undefined
  const calm = data
    ? [...data.portfolios].sort((a, b) => a.expected_volatility - b.expected_volatility)[0]
    : undefined
  const diverse = data
    ? [...data.portfolios].sort((a, b) => b.diversification_ratio - a.diversification_ratio)[0]
    : undefined

  return (
    <>
      <PageHeader title="Portfolio construction">
        Six standard ways to split capital across the same assets. They answer different questions
        (lowest risk, best risk-adjusted return, equal risk shares), so they rarely agree. Methods
        marked μ rely on expected-return estimates, the least reliable input.
      </PageHeader>
      <div className="flex flex-col gap-6">
        <QueryError error={query.error} />
        {data && top && calm && diverse && (
          <>
            <StatGrid className="grid-cols-2 md:grid-cols-4">
              <Stat
                label="Best expected Sharpe"
                value={fixed(top.expected_sharpe, 2)}
                hint={top.label}
              />
              <Stat
                label="Lowest expected volatility"
                value={pct(calm.expected_volatility, 1)}
                hint={calm.label}
              />
              <Stat
                label="Most diversified"
                value={fixed(diverse.diversification_ratio, 2)}
                hint={`${diverse.label} (diversification ratio)`}
              />
              <Stat
                label="Cash rate"
                value={pct(data.risk_free, 2)}
                hint="Sharpe measured against it"
              />
            </StatGrid>
            <AllocationStack
              title="Allocations"
              description="Share of capital in each asset. Colours follow the universe order on every page."
              assets={universe.tickers}
              rows={data.portfolios.map((p) => ({ name: p.label, weights: p.weights }))}
              stale={query.stale}
            />
            <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
              <FrontierChart data={data} stale={query.stale} />
              <Rankings data={data} />
            </div>
            <ComparisonTable data={data} />
          </>
        )}
      </div>
    </>
  )
}
