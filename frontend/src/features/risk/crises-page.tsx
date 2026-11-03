import { AlertTriangleIcon } from 'lucide-react'
import { useState } from 'react'
import { ChartGuide } from '@/components/chart-guide'
import { useChartColors } from '@/components/charts/theme'
import { TimeChart } from '@/components/charts/time-chart'
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
import { useLab } from '@/features/universe/universe-context'
import { api, type CrisisOut, type PortfolioKey } from '@/lib/api'
import { fixed, longDate, pct, spct } from '@/lib/format'
import { cn } from '@/lib/utils'

const growthFormat = (v: number) => fixed(v, 2)
const ddFormat = (v: number) => pct(v, 0)

function MissingBadge({ crisis }: { crisis: CrisisOut }) {
  const missing = crisis.missing ?? []
  if (!missing.length || crisis.error) return null
  const names = missing.join(', ')
  // A missing asset the portfolio barely holds changes nothing; say so without a warning.
  if (crisis.missing_weight < 0.0005) {
    return (
      <Badge variant="outline" size="sm" title="These assets had not started trading yet.">
        {names} not listed yet (no weight to move)
      </Badge>
    )
  }
  return (
    <Badge
      variant="warning"
      size="sm"
      title="These assets had not started trading; their weight is spread over the rest in proportion."
    >
      <AlertTriangleIcon aria-hidden="true" />
      {names} not listed yet ({pct(crisis.missing_weight, 0)} redistributed)
    </Badge>
  )
}

function CrisisTable({
  crises,
  selected,
  onSelect,
}: {
  crises: CrisisOut[]
  selected: string
  onSelect: (name: string) => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base" render={<h2 />}>
          Historical crises, replayed
        </CardTitle>
        <CardDescription>
          Today's weights held through each episode with daily drift and no rebalancing. Select a
          crisis to see its path below.
        </CardDescription>
        <ChartGuide noun="table">
          <p>
            Max drawdown is the deepest fall from a running peak inside the window; worst day is the
            single largest daily loss. Recovery counts trading days from the trough until the same
            holdings regained their pre-crisis peak, following them past the end of the window ("not
            recovered" means they have not yet).
          </p>
          <p>
            When an asset had not listed yet, its weight is spread over the others in proportion, so
            that row tests a slightly different portfolio. The warning badge shows how much.
          </p>
        </ChartGuide>
      </CardHeader>
      <CardPanel className="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Crisis</TableHead>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Total return</TableHead>
              <TableHead className="text-right">Max drawdown</TableHead>
              <TableHead className="text-right">Worst day</TableHead>
              <TableHead className="text-right">Recovery</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {crises.map((cr) => {
              const active = cr.name === selected
              return (
                <TableRow key={cr.name} data-state={active ? 'selected' : undefined}>
                  <TableCell className="font-medium">
                    <div className="flex flex-col items-start gap-1">
                      {cr.error ? (
                        <span>{cr.name}</span>
                      ) : (
                        <button
                          type="button"
                          aria-pressed={active}
                          className="text-left font-medium underline-offset-4 outline-none hover:underline focus-visible:underline"
                          onClick={() => onSelect(cr.name)}
                        >
                          {cr.name}
                        </button>
                      )}
                      <MissingBadge crisis={cr} />
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {longDate(cr.start)} → {longDate(cr.end)}
                  </TableCell>
                  {cr.error ? (
                    <TableCell colSpan={4} className="whitespace-normal text-muted-foreground">
                      {cr.error}
                    </TableCell>
                  ) : (
                    <>
                      <TableCell className="text-right tabular-nums">
                        {spct(cr.total_return, 1)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {pct(cr.max_drawdown, 1)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {pct(cr.worst_day, 1)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {cr.recovery_days != null ? (
                          `${fixed(cr.recovery_days, 0)} days`
                        ) : (
                          <span className="text-muted-foreground">not recovered</span>
                        )}
                      </TableCell>
                    </>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardPanel>
    </Card>
  )
}

export default function CrisesPage() {
  const c = useChartColors()
  const [portfolio, setPortfolio] = useState<PortfolioKey>('max_sharpe')
  const [picked, setPicked] = useState<string | null>(null)
  const query = useLab('crises', api.crises, { portfolio })
  const crises = query.data?.crises ?? []
  const replayable = crises.filter((cr) => !cr.error && cr.wealth)
  // Default to the worst drawdown, the most informative episode.
  const worst = [...replayable].sort((a, b) => (a.max_drawdown ?? 0) - (b.max_drawdown ?? 0))[0]
  const current = replayable.find((cr) => cr.name === picked) ?? worst

  return (
    <>
      <PageHeader title="Crisis replays">
        What would today's portfolio have done in past sell-offs? Each replay holds the current
        weights through a historical episode. It is a diagnostic of how the mix behaves under stress
        that actually happened, not a forecast of the next crisis.
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside>
          <Card className="overflow-hidden">
            <PanelSection title="Portfolio" hint="Weights from the shared universe and estimates.">
              <PortfolioSelect value={portfolio} onChange={setPortfolio} />
            </PanelSection>
            <Separator />
            <PanelSection title="How replays work">
              <ul className="flex list-disc flex-col gap-2 ps-4 text-muted-foreground text-xs">
                <li>
                  Each replay uses every asset's full price history, regardless of the research
                  window, so a five-year sample can still replay 2008.
                </li>
                <li>
                  Weights are static: bought at the start, left to drift, never rebalanced or
                  re-optimised during the crisis.
                </li>
                <li>
                  Assets that were not trading yet are dropped and their weight is redistributed
                  across the rest; the table flags this.
                </li>
                <li>
                  Crises inside the research window also shaped the estimates behind the weights, so
                  results for those are partly hindsight.
                </li>
              </ul>
            </PanelSection>
          </Card>
        </aside>
        <div className="flex min-w-0 flex-col gap-6">
          <QueryError error={query.error} />
          {query.data && (
            <div className={cn('transition-opacity', query.stale && 'opacity-60')}>
              <CrisisTable crises={crises} selected={current?.name ?? ''} onSelect={setPicked} />
            </div>
          )}
          {current?.wealth && current.drawdown && (
            <>
              <StatGrid className="grid-cols-2 md:grid-cols-4">
                <Stat
                  label="Total return"
                  value={spct(current.total_return, 1)}
                  hint={current.name}
                />
                <Stat
                  label="Max drawdown"
                  value={pct(current.max_drawdown, 1)}
                  hint={`worst day ${pct(current.worst_day, 1)}`}
                />
                <Stat
                  label="Annualised volatility"
                  value={pct(current.annual_volatility, 1)}
                  hint="during the episode"
                />
                <Stat
                  label="Assets replayed"
                  value={`${current.available?.length ?? 0} of ${(current.available?.length ?? 0) + (current.missing?.length ?? 0)}`}
                  hint={
                    current.missing?.length
                      ? `${pct(current.missing_weight, 1)} of weight redistributed`
                      : 'all assets traded'
                  }
                />
              </StatGrid>
              <div className="grid gap-6 xl:grid-cols-2">
                <TimeChart
                  title={`Growth of $1: ${current.name}`}
                  description={`${longDate(current.start)} to ${longDate(current.end)}, with the portfolio's current weights.`}
                  guide={
                    <p>
                      The path shows how the loss unfolded: a sharp single drop and a slow grind
                      down can end at the same total return but feel very different to hold. The
                      line at 1 is the starting value.
                    </p>
                  }
                  lines={[{ name: 'Portfolio', color: c.series1, data: current.wealth }]}
                  yName="Growth of $1"
                  yFormat={growthFormat}
                  baseline={1}
                  stale={query.stale}
                  ariaLabel={`Growth of one dollar during ${current.name}`}
                />
                <TimeChart
                  title="Drawdown"
                  description="Percentage below the running peak on each day of the episode."
                  guide={
                    <p>
                      Drawdown measures the pain of holding: how far the portfolio is below its best
                      value so far. A drawdown still below 0% at the end of the window means the
                      recovery came later; the table shows how many trading days it took.
                    </p>
                  }
                  lines={[
                    { name: 'Drawdown', color: c.series1, data: current.drawdown, area: true },
                  ]}
                  yName="Drawdown"
                  yFormat={ddFormat}
                  baseline={0}
                  stale={query.stale}
                  ariaLabel={`Drawdown during ${current.name}`}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
