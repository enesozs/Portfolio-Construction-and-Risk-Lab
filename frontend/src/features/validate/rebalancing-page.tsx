import { useMemo, useState } from 'react'
import { ChartGuide } from '@/components/chart-guide'
import { TimeChart } from '@/components/charts/time-chart'
import { useChartColors } from '@/components/charts/theme'
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
import { useLab } from '@/features/universe/universe-context'
import { api, type PortfolioKey, type RebalancingResponse, type TimeSeries } from '@/lib/api'
import { fixed, pct } from '@/lib/format'
import { portfolioLabel } from '@/lib/portfolios'

const CALENDARS = ['5', '21', '63', '126', '252'] as const
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

const CALENDAR_LABELS: Record<(typeof CALENDARS)[number], string> = {
  '5': '1 wk',
  '21': '1 mo',
  '63': '3 mo',
  '126': '6 mo',
  '252': '1 yr',
}

function PolicyTable({ data }: { data: RebalancingResponse }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base" render={<h2 />}>
          Policies side by side
        </CardTitle>
        <CardDescription>
          Same target, same period, same cost per dollar traded. Tracking error measures how far
          each policy's daily returns stray from holding the target exactly (rebalanced every day,
          at no cost).
        </CardDescription>
        <ChartGuide noun="table">
          <p>
            A good policy keeps tracking error low while trading rarely. Buy and hold never pays a
            cost but drifts furthest; trading every week stays close but pays for it.
          </p>
          <p>
            Turnover is one-way per rebalance; total cost is the sum of all costs as a share of
            capital. Sharpe is measured on returns in excess of cash.
          </p>
        </ChartGuide>
      </CardHeader>
      <CardPanel className="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Policy</TableHead>
              <TableHead className="text-right">Annual return</TableHead>
              <TableHead className="text-right">Volatility</TableHead>
              <TableHead className="text-right">Sharpe</TableHead>
              <TableHead className="text-right">Max drawdown</TableHead>
              <TableHead className="text-right">Rebalances</TableHead>
              <TableHead className="text-right">Total cost</TableHead>
              <TableHead className="text-right">Avg turnover</TableHead>
              <TableHead className="text-right">Tracking error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.policies.map((p) => (
              <TableRow key={p.key}>
                <TableCell className="font-medium">{p.label}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {pct(p.performance.annual_return, 1)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {pct(p.performance.annual_volatility, 1)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fixed(p.performance.sharpe, 2)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {pct(p.performance.max_drawdown, 1)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{p.rebalances}</TableCell>
                <TableCell className="text-right tabular-nums">{pct(p.total_cost, 2)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {p.rebalances ? pct(p.average_turnover, 1) : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {pct(p.tracking_error, 2)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardPanel>
    </Card>
  )
}

export default function RebalancingPage() {
  const c = useChartColors()
  const [portfolio, setPortfolio] = useState<PortfolioKey>('max_sharpe')
  const [cost, setCost] = useState(5)
  const [calendar, setCalendar] = useState<(typeof CALENDARS)[number]>('21')
  const [threshold, setThreshold] = useState(5)
  const [distance, setDistance] = useState(10)
  // Memoised so the debounced params keep their identity between renders.
  const params = useMemo(
    () => ({
      portfolio,
      cost_bps: cost,
      calendar_days: Number(calendar),
      threshold: threshold / 100,
      distance: distance / 100,
    }),
    [portfolio, cost, calendar, threshold, distance],
  )
  const query = useLab('rebalancing', api.rebalancing, params)
  const data = query.data
  const colors: Record<string, { color: string; dashed?: boolean }> = {
    never: { color: c.muted, dashed: true },
    calendar: { color: c.series1 },
    threshold: { color: c.series2 },
    distance: { color: c.series3 },
  }
  const rebalanced = data?.policies.filter((p) => p.key !== 'never') ?? []
  const closest = [...rebalanced].sort((a, b) => a.tracking_error - b.tracking_error)[0]
  const cheapest = [...rebalanced].sort((a, b) => a.total_cost - b.total_cost)[0]
  const log = data ? wideRange(data.policies.map((p) => p.wealth)) : false
  const never = data?.policies.find((p) => p.key === 'never')

  return (
    <>
      <PageHeader title="Rebalancing rules">
        Once a portfolio is bought, prices move and the weights drift away from the target: winners
        grow into a bigger share, losers shrink. Rebalancing trades back to the target, at a cost.
        This page compares four rules for when to do it, keeping the {portfolioLabel(portfolio)}{' '}
        target fixed.
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside>
          <Card className="overflow-hidden">
            <PanelSection title="Target" hint="Weights estimated once on the full sample.">
              <PortfolioSelect value={portfolio} onChange={setPortfolio} />
            </PanelSection>
            <Separator />
            <PanelSection title="Costs" hint="Charged on every dollar bought or sold.">
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
            <Separator />
            <PanelSection
              title="Rules"
              hint="Calendar rebalances on a schedule; the other two wait until drift is large enough to matter."
            >
              <div className="flex flex-col gap-2">
                <span className="text-muted-foreground text-sm">Calendar: every</span>
                <Segmented
                  label="Calendar interval"
                  size="sm"
                  value={calendar}
                  onChange={setCalendar}
                  options={CALENDARS.map((v) => ({ value: v, label: CALENDAR_LABELS[v] }))}
                />
              </div>
              <ParamControl
                label="Threshold: any asset off by"
                value={threshold}
                onChange={setThreshold}
                min={1}
                max={25}
                step={1}
                unit="%"
              />
              <ParamControl
                label="Distance: portfolio off by"
                value={distance}
                onChange={setDistance}
                min={1}
                max={50}
                step={1}
                unit="%"
              />
              <p className="text-muted-foreground text-xs">
                Distance is the one-way gap, half the sum of absolute weight differences: the share
                of the portfolio that would have to be traded to get back to target.
              </p>
            </PanelSection>
          </Card>
        </aside>
        <div className="flex min-w-0 flex-col gap-6">
          <QueryError error={query.error} title="Could not simulate the rebalancing rules" />
          {data && closest && cheapest && never && (
            <>
              <StatGrid className="grid-cols-2 md:grid-cols-3">
                <Stat
                  label="Closest to target"
                  value={pct(closest.tracking_error, 2)}
                  hint={`${closest.label} (tracking error)`}
                />
                <Stat
                  label="Cheapest rule"
                  value={pct(cheapest.total_cost, 2)}
                  hint={`${cheapest.label}, ${cheapest.rebalances} rebalances`}
                />
                <Stat
                  label="Drift if never rebalanced"
                  value={pct(never.tracking_error, 2)}
                  hint="tracking error of buy and hold"
                />
              </StatGrid>
              <TimeChart
                title="Growth of $1 under each rule"
                description={`Same target and costs; the only difference is when each rule trades back to it.${log ? ' Log scale.' : ''}`}
                guide={
                  <>
                    <p>
                      The lines usually stay close: rebalancing rarely changes the long-run return
                      much. What it changes is which portfolio you actually hold. Buy and hold ends
                      up concentrated in whatever went up most, so its risk is no longer the risk
                      you chose.
                    </p>
                    <p>
                      Read this chart with the table: a rule that ends slightly higher but with far
                      more turnover or tracking error is not clearly better.
                    </p>
                  </>
                }
                lines={data.policies.map((p) => ({
                  name: p.label,
                  data: p.wealth,
                  ...(colors[p.key] ?? { color: c.other }),
                }))}
                yName={log ? 'Growth of $1 (log)' : 'Growth of $1'}
                yFormat={(v) => `$${fixed(v, v < 10 ? 2 : 0)}`}
                logY={log}
                baseline={1}
                stale={query.stale}
                ariaLabel="Growth of one dollar under four rebalancing rules"
                className="h-80"
              />
              <PolicyTable data={data} />
            </>
          )}
        </div>
      </div>
    </>
  )
}
