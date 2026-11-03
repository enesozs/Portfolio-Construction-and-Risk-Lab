import { useState } from 'react'
import { ChartGuide } from '@/components/chart-guide'
import { WeightBars } from '@/components/charts/allocation-charts'
import { PageHeader } from '@/components/page-header'
import { PanelSection } from '@/components/panel-section'
import { ParamControl } from '@/components/param-control'
import { QueryError } from '@/components/query-error'
import { Segmented } from '@/components/segmented'
import { Stat, StatGrid } from '@/components/stat-grid'
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useLab, useUniverse } from '@/features/universe/universe-context'
import { api, type TailRiskResponse } from '@/lib/api'
import { fixed, pct } from '@/lib/format'
import { cn } from '@/lib/utils'

const LEVELS = ['0.9', '0.95', '0.975', '0.99'] as const
type Level = (typeof LEVELS)[number]

function TailTable({ data, stale }: { data: TailRiskResponse; stale: boolean }) {
  const level = pct(data.confidence, data.confidence === 0.975 ? 1 : 0)
  const tail = pct(1 - data.confidence, data.confidence === 0.975 ? 1 : 0)
  const lowest = (pick: (p: TailRiskResponse['portfolios'][number]) => number) =>
    data.portfolios.reduce((a, b) => (pick(b) < pick(a) ? b : a)).key
  const bestVar = lowest((p) => p.var)
  const bestCvar = lowest((p) => p.cvar)
  const bestVol = lowest((p) => p.volatility)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base" render={<h2 />}>
          Tail loss versus volatility
        </CardTitle>
        <CardDescription>
          Daily VaR {level}: the loss exceeded on only {tail} of days. Daily CVaR {level}: the
          average loss on those worst {tail} of days. Volatility is annual. ★ marks the lowest in
          each column.
        </CardDescription>
        <ChartGuide noun="table">
          <p>
            VaR answers "how bad is a bad day?" but says nothing about the days beyond it. CVaR
            (also called expected shortfall) averages them, so it sees a fat tail that VaR misses.
          </p>
          <p>
            Both are measured on the historical daily returns of each fixed allocation over the
            sample, the same data minimum CVaR was fitted to, so its edge here is in-sample.
          </p>
        </ChartGuide>
      </CardHeader>
      <CardPanel className={cn('pt-0 transition-opacity', stale && 'opacity-60')}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Portfolio</TableHead>
              <TableHead className="text-right">Daily VaR</TableHead>
              <TableHead className="text-right">Daily CVaR</TableHead>
              <TableHead className="text-right">CVaR / VaR</TableHead>
              <TableHead className="text-right">Volatility</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.portfolios.map((p) => (
              <TableRow key={p.key}>
                <TableCell className="font-medium">{p.label}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {pct(p.var, 2)}
                  {p.key === bestVar && ' ★'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {pct(p.cvar, 2)}
                  {p.key === bestCvar && ' ★'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fixed(p.var > 0 ? p.cvar / p.var : null, 2)}×
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {pct(p.volatility, 1)}
                  {p.key === bestVol && ' ★'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardPanel>
    </Card>
  )
}

export default function TailRiskPage() {
  const { universe } = useUniverse()
  const [level, setLevel] = useState<Level>('0.95')
  const [useFloor, setUseFloor] = useState(false)
  const [floorPct, setFloorPct] = useState(10)
  const query = useLab('tail-risk', api.tailRisk, {
    confidence: Number(level),
    min_return: useFloor ? floorPct / 100 : null,
  })
  const data = query.data
  const byKey = (key: string) => data?.portfolios.find((p) => p.key === key)
  const cvar = byKey('min_cvar')
  const minVar = byKey('min_variance')
  const sharpe = byKey('max_sharpe')
  const tail = pct(1 - Number(level), level === '0.975' ? 1 : 0)

  return (
    <>
      <PageHeader title="Tail risk">
        Volatility treats a large gain and a large loss as equally bad, and assumes losses are
        roughly bell-shaped. Real returns have fat left tails. Minimum CVaR picks the mix whose
        worst days were least bad on average, which need not be the mix with the lowest volatility.
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside>
          <Card className="overflow-hidden">
            <PanelSection
              title="Tail"
              hint="How far into the loss tail to look. 95% means the worst 5% of days."
            >
              <Segmented<Level>
                label="Confidence level"
                value={level}
                onChange={setLevel}
                options={LEVELS.map((l) => ({
                  value: l,
                  label: pct(Number(l), l === '0.975' ? 1 : 0),
                }))}
                className="w-full"
              />
              <p className="text-muted-foreground text-xs">
                Higher levels focus on rarer, more extreme days, so fewer observations go into each
                estimate and it becomes noisier.
              </p>
            </PanelSection>
            <Separator />
            <PanelSection
              title="Return floor"
              hint="Minimum CVaR alone can settle on a very defensive mix. A floor asks for the smallest tail loss among portfolios expected to earn at least this much."
            >
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="tail-floor" className="font-normal text-muted-foreground">
                  Require a minimum expected return
                </Label>
                <Switch
                  id="tail-floor"
                  aria-label="Require a minimum expected return"
                  checked={useFloor}
                  onCheckedChange={setUseFloor}
                />
              </div>
              {useFloor && (
                <ParamControl
                  label="Minimum expected return"
                  value={floorPct}
                  onChange={setFloorPct}
                  min={0}
                  max={40}
                  step={0.5}
                  digits={1}
                  unit="%"
                />
              )}
              <p className="text-muted-foreground text-xs">
                If the reference portfolios earn less than the floor, they can show a smaller tail
                loss than minimum CVaR: they were not asked to meet it. Only minimum CVaR responds
                to these controls; minimum variance and maximum Sharpe are shown for reference.
              </p>
            </PanelSection>
          </Card>
        </aside>
        <div className="flex min-w-0 flex-col gap-6">
          <QueryError error={query.error} />
          {data && cvar && minVar && sharpe && (
            <>
              <StatGrid className="grid-cols-2 md:grid-cols-3">
                <Stat
                  label={`Min CVaR: average of worst ${tail} days`}
                  value={pct(cvar.cvar, 2)}
                  hint={`VaR ${pct(cvar.var, 2)} · volatility ${pct(cvar.volatility, 1)}`}
                />
                <Stat
                  label="Min variance: same tail"
                  value={pct(minVar.cvar, 2)}
                  hint={`VaR ${pct(minVar.var, 2)} · volatility ${pct(minVar.volatility, 1)}`}
                />
                <Stat
                  label="Max Sharpe: same tail"
                  value={pct(sharpe.cvar, 2)}
                  hint={`VaR ${pct(sharpe.var, 2)} · volatility ${pct(sharpe.volatility, 1)}`}
                />
              </StatGrid>
              <WeightBars
                title="Allocations"
                description="Share of capital in each asset for the three portfolios. Minimum CVaR and minimum variance often look alike; where they differ, an asset's crash behaviour differs from what its volatility suggests."
                guide={
                  <>
                    <p>
                      Minimum variance penalises every large move, up or down, and sees only
                      averages of squared returns. Minimum CVaR looks only at the worst days, so it
                      can hold more of an asset that is volatile but rarely crashes, and less of one
                      that is calm most of the time but falls hard together with the rest.
                    </p>
                    <p>
                      Maximum Sharpe ignores the tail altogether: it is there to show how much tail
                      loss a return-seeking portfolio accepts.
                    </p>
                  </>
                }
                assets={universe.tickers}
                series={data.portfolios.map((p) => ({ name: p.label, weights: p.weights }))}
                stale={query.stale}
                className="h-72"
              />
              <TailTable data={data} stale={query.stale} />
            </>
          )}
        </div>
      </div>
    </>
  )
}
