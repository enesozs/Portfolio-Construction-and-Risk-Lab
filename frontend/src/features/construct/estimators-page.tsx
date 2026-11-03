import { useState } from 'react'
import { ChartGuide } from '@/components/chart-guide'
import { AllocationStack, WeightBars } from '@/components/charts/allocation-charts'
import { PageHeader } from '@/components/page-header'
import { PanelSection } from '@/components/panel-section'
import { PortfolioSelect } from '@/components/portfolio-select'
import { QueryError } from '@/components/query-error'
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
import { useLab, useUniverse } from '@/features/universe/universe-context'
import { api, type EstimatorsResponse, type PortfolioKey } from '@/lib/api'
import { fixed, pct } from '@/lib/format'
import { portfolioLabel } from '@/lib/portfolios'
import { cn } from '@/lib/utils'

const RETURN_LABELS: Record<string, string> = {
  arithmetic: 'Arithmetic',
  geometric: 'Geometric',
  ewma: 'EWMA',
}

const COV_LABELS: Record<string, string> = {
  sample: 'Sample',
  ledoit_wolf: 'Ledoit–Wolf',
  ewma: 'EWMA',
}

/** Allocators that never look at expected returns: only the covariance choice can move them. */
const IGNORES_RETURNS: PortfolioKey[] = ['equal_weight', 'min_variance', 'risk_parity', 'hrp']

type Row = EstimatorsResponse['rows'][number]

function comboLabel(r: Row): string {
  const name = `${RETURN_LABELS[r.return_method] ?? r.return_method} / ${COV_LABELS[r.covariance_method] ?? r.covariance_method}`
  return r.active ? `${name} (in use)` : name
}

function range(values: number[]): [number, number] {
  return [Math.min(...values), Math.max(...values)]
}

function EstimatorTable({ data, stale }: { data: EstimatorsResponse; stale: boolean }) {
  const sharpes = data.rows.map((r) => r.expected_sharpe ?? -Infinity)
  const best = Math.max(...sharpes)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base" render={<h2 />}>
          Nine estimate sets, one allocator
        </CardTitle>
        <CardDescription>
          Each row re-runs the same allocator with a different return and covariance estimator.
          Turnover is the share of the portfolio that would have to be traded to move from the
          estimator in use to that row.
        </CardDescription>
        <ChartGuide noun="table">
          <p>
            Expected return, volatility and Sharpe are measured with each row's <em>own</em>{' '}
            estimates, so every row looks good by its own yardstick. That is the trap: the optimiser
            always believes its inputs.
          </p>
          <p>
            Effective assets (1 / Σw²) counts how many assets carry real weight. A turnover of 30%
            means switching estimator alone would trade almost a third of the portfolio, with
            nothing about the world having changed.
          </p>
        </ChartGuide>
      </CardHeader>
      <CardPanel className={cn('pt-0 transition-opacity', stale && 'opacity-60')}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Returns</TableHead>
              <TableHead>Covariance</TableHead>
              <TableHead className="text-right">Exp. return</TableHead>
              <TableHead className="text-right">Exp. volatility</TableHead>
              <TableHead className="text-right">Exp. Sharpe</TableHead>
              <TableHead className="text-right">Effective assets</TableHead>
              <TableHead className="text-right">Turnover vs in use</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.map((r) => (
              <TableRow key={`${r.return_method}-${r.covariance_method}`}>
                <TableCell className="font-medium">
                  {RETURN_LABELS[r.return_method] ?? r.return_method}
                </TableCell>
                <TableCell>
                  {COV_LABELS[r.covariance_method] ?? r.covariance_method}
                  {r.active && (
                    <Badge variant="outline" size="sm" className="ms-2">
                      in use
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {pct(r.expected_return, 1)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {pct(r.expected_volatility, 1)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fixed(r.expected_sharpe, 2)}
                  {r.expected_sharpe === best && ' ★'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fixed(r.effective_assets, 1)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {pct(r.turnover_vs_active, 1)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardPanel>
    </Card>
  )
}

export default function EstimatorsPage() {
  const { universe } = useUniverse()
  const [method, setMethod] = useState<PortfolioKey>('max_sharpe')
  const query = useLab('estimators', api.estimators, { method })
  const data = query.data

  const turnovers = data?.rows.filter((r) => !r.active).map((r) => r.turnover_vs_active) ?? []
  const sharpes = data?.rows.flatMap((r) => (r.expected_sharpe == null ? [] : [r.expected_sharpe]))
  const vols = data?.rows.map((r) => r.expected_volatility)
  const widest = data
    ? Object.entries(data.max_weight_spread).sort((a, b) => b[1] - a[1])[0]
    : undefined

  return (
    <>
      <PageHeader title="Estimator sensitivity">
        An optimiser is only as good as the numbers it is fed. Here one allocator is run nine times,
        once per combination of return and covariance estimator, on the same data. When the weights
        swing, it is the estimates, not the optimiser, that are driving the answer.
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside>
          <Card className="overflow-hidden">
            <PanelSection
              title="Allocator"
              hint="The method held fixed while the estimates change."
            >
              <PortfolioSelect value={method} onChange={setMethod} />
              {IGNORES_RETURNS.includes(method) && (
                <p className="text-muted-foreground text-xs">
                  This method ignores expected returns, so rows that share a covariance estimator
                  are identical. Only the covariance choice can move it.
                </p>
              )}
            </PanelSection>
            <Separator />
            <PanelSection title="The estimators">
              <dl className="flex flex-col gap-3 text-xs">
                <div>
                  <dt className="font-medium">Arithmetic mean</dt>
                  <dd className="text-muted-foreground">
                    Average daily return × 252. The textbook input to mean-variance.
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">Geometric mean</dt>
                  <dd className="text-muted-foreground">
                    The compound growth rate actually achieved; lower than the arithmetic mean for
                    volatile assets.
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">EWMA</dt>
                  <dd className="text-muted-foreground">
                    Exponentially weighted: recent days count more. Reacts faster, but is noisier.
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">Sample covariance</dt>
                  <dd className="text-muted-foreground">
                    Every pair estimated independently from the data; unbiased but noisy with few
                    observations per asset.
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">Ledoit–Wolf</dt>
                  <dd className="text-muted-foreground">
                    The sample matrix pulled toward a simple structured target, by an amount chosen
                    from the data. Less noise, more stable weights.
                  </dd>
                </div>
              </dl>
            </PanelSection>
          </Card>
        </aside>
        <div className="flex min-w-0 flex-col gap-6">
          <QueryError error={query.error} />
          {data && sharpes && vols && (
            <>
              <StatGrid className="grid-cols-2 md:grid-cols-4">
                <Stat
                  label="Expected Sharpe range"
                  value={
                    sharpes.length
                      ? `${fixed(range(sharpes)[0], 2)} – ${fixed(range(sharpes)[1], 2)}`
                      : '—'
                  }
                  hint="lowest to highest across the nine"
                />
                <Stat
                  label="Expected volatility range"
                  value={`${pct(range(vols)[0], 1)} – ${pct(range(vols)[1], 1)}`}
                  hint="each row's own covariance"
                />
                <Stat
                  label="Largest weight swing"
                  value={widest ? pct(widest[1], 1) : '—'}
                  hint={widest ? `${widest[0]}, highest minus lowest weight` : undefined}
                />
                <Stat
                  label="Largest switching trade"
                  value={turnovers.length ? pct(Math.max(...turnovers), 1) : '—'}
                  hint={
                    turnovers.length
                      ? `turnover from the estimator in use (average ${pct(turnovers.reduce((a, b) => a + b, 0) / turnovers.length, 1)})`
                      : undefined
                  }
                />
              </StatGrid>
              <AllocationStack
                title={`${portfolioLabel(method)} under each estimator`}
                description="One bar per return / covariance combination, a segment per asset. If the bars look alike, the allocation is robust to the estimate choice; if they don't, small modelling decisions are setting your portfolio."
                guide={
                  <>
                    <p>
                      Read down the bars: same data, same optimiser, only the estimators differ.
                      Methods that use expected returns (maximum Sharpe, minimum CVaR) usually swing
                      the most, because average returns are estimated far less precisely than
                      volatilities and correlations.
                    </p>
                    <p>
                      The row marked "in use" is what the other pages show, set in the universe bar.
                    </p>
                  </>
                }
                assets={universe.tickers}
                rows={data.rows.map((r) => ({ name: comboLabel(r), weights: r.weights }))}
                stale={query.stale}
              />
              <WeightBars
                title="How far each asset's weight moves"
                description="Highest minus lowest weight of each asset across the nine combinations. A bar of 30% means the asset's weight depends on the estimator by up to 30 percentage points."
                guide={
                  <p>
                    Tall bars mark the assets where the estimators disagree. They are usually the
                    ones whose expected return sits close to another asset's with similar risk: the
                    optimiser flips between near-substitutes on tiny differences in the inputs.
                  </p>
                }
                assets={universe.tickers}
                series={[{ name: 'Weight range', weights: data.max_weight_spread }]}
                stale={query.stale}
                className="h-64"
              />
              <EstimatorTable data={data} stale={query.stale} />
            </>
          )}
        </div>
      </div>
    </>
  )
}
