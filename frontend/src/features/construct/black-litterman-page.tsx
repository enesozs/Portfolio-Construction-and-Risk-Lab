import { useMemo, useState } from 'react'
import { ChartGuide } from '@/components/chart-guide'
import { WeightBars } from '@/components/charts/allocation-charts'
import { NumberInput } from '@/components/number-input'
import { PageHeader } from '@/components/page-header'
import { PanelSection } from '@/components/panel-section'
import { ParamControl } from '@/components/param-control'
import { QueryError } from '@/components/query-error'
import { Segmented } from '@/components/segmented'
import { Stat, StatGrid } from '@/components/stat-grid'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from '@/components/ui/card'
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
import { api, type BlackLittermanResponse, type Weights } from '@/lib/api'
import { fixed, pct, spct } from '@/lib/format'
import { cn } from '@/lib/utils'

type Prior = 'market' | 'equal'

/** One view as edited: percentages in the UI, decimals in the request. */
interface ViewDraft {
  on: boolean
  returnPct: number
  confidencePct: number
}

const SOURCE_LABELS: Record<string, { label: string; hint: string }> = {
  live: { label: 'Live', hint: 'Market cap (stocks) or fund size (ETFs) from Yahoo today.' },
  snapshot: {
    label: 'Snapshot',
    hint: 'Yahoo was unavailable; value from the bundled snapshot.',
  },
  fallback: {
    label: 'Fallback',
    hint: 'No size found; given the average size of the others.',
  },
  equal: { label: 'Equal', hint: 'Equal prior chosen: every asset the same size.' },
}

function oneWayDistance(a: Weights, b: Weights, assets: string[]): number {
  return assets.reduce((sum, t) => sum + Math.abs((a[t] ?? 0) - (b[t] ?? 0)), 0) / 2
}

function PriorTable({
  data,
  assets,
  stale,
}: {
  data: BlackLittermanResponse
  assets: string[]
  stale: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base" render={<h2 />}>
          Where the prior comes from
        </CardTitle>
        <CardDescription>
          The market prior weights each asset by its size: market capitalisation for stocks, total
          fund assets for ETFs.
        </CardDescription>
        <ChartGuide noun="table">
          <p>
            If everyone holds the market and the market is in equilibrium, these weights must be
            optimal for the average investor. Black–Litterman runs the optimiser backwards on them
            to recover the returns that would make that true.
          </p>
          <p>
            Mixing stock market caps with ETF fund sizes is a practical shortcut: a fund's size is
            not the size of its asset class, so treat a multi-asset prior as a rough anchor.
          </p>
        </ChartGuide>
      </CardHeader>
      <CardPanel className={cn('pt-0 transition-opacity', stale && 'opacity-60')}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Asset</TableHead>
              <TableHead className="text-right">Prior weight</TableHead>
              <TableHead>Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assets.map((t) => {
              const source = data.prior_sources[t] ?? 'fallback'
              const meta = SOURCE_LABELS[source] ?? { label: source, hint: '' }
              return (
                <TableRow key={t}>
                  <TableCell className="font-medium font-mono">{t}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {pct(data.prior_weights[t], 1)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        source === 'fallback'
                          ? 'warning'
                          : source === 'snapshot'
                            ? 'secondary'
                            : 'outline'
                      }
                      size="sm"
                      title={meta.hint}
                    >
                      {meta.label}
                    </Badge>
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

export default function BlackLittermanPage() {
  const { universe } = useUniverse()
  const assets = universe.tickers
  const [prior, setPrior] = useState<Prior>('market')
  const [riskAversion, setRiskAversion] = useState(2.5)
  const [drafts, setDrafts] = useState<Record<string, ViewDraft>>({})

  const views = useMemo(
    () =>
      assets.flatMap((asset) => {
        const d = drafts[asset]
        return d?.on
          ? [
              {
                asset,
                expected_return: d.returnPct / 100,
                confidence: Math.min(Math.max(d.confidencePct, 1), 100) / 100,
              },
            ]
          : []
      }),
    [assets, drafts],
  )
  const query = useLab('black-litterman', api.blackLitterman, {
    prior,
    risk_aversion: riskAversion,
    views,
  })
  const data = query.data

  const update = (asset: string, patch: Partial<ViewDraft>) =>
    setDrafts((cur) => {
      // A new view starts at the asset's historical average return: "what if history repeats?"
      const hist = data?.historical[asset]
      const base = cur[asset] ?? {
        on: false,
        returnPct: hist == null ? 10 : Math.round(hist * 200) / 2,
        confidencePct: 50,
      }
      return { ...cur, [asset]: { ...base, ...patch } }
    })

  const shifts = data
    ? assets
        .map((t) => ({ t, shift: (data.posterior[t] ?? 0) - (data.equilibrium[t] ?? 0) }))
        .sort((a, b) => Math.abs(b.shift) - Math.abs(a.shift))
    : []
  const biggest = shifts[0]

  return (
    <>
      <PageHeader title="Black–Litterman">
        Maximum Sharpe on historical averages tends to bet heavily on whatever did best recently.
        Black–Litterman starts instead from the returns the market itself implies, then tilts them
        only where you state a view, and only as far as your confidence allows. With no views you
        simply get the market portfolio back.
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside>
          <Card className="overflow-hidden">
            <PanelSection
              title="Prior"
              hint="The portfolio assumed to be optimal before any views."
            >
              <Segmented<Prior>
                label="Prior portfolio"
                value={prior}
                onChange={setPrior}
                options={[
                  { value: 'market', label: 'Market value' },
                  { value: 'equal', label: 'Equal weight' },
                ]}
                className="w-full"
              />
              <ParamControl
                label="Risk aversion (δ)"
                value={riskAversion}
                onChange={setRiskAversion}
                min={0.5}
                max={10}
                step={0.1}
                digits={1}
              />
              <p className="-mt-2 text-muted-foreground text-xs">
                How much return the market demands per unit of variance. Higher δ scales every
                implied risk premium up.
              </p>
            </PanelSection>
            <Separator />
            <PanelSection
              title="Your views"
              hint="Switch on an asset to state the annual total return you expect for it, and how sure you are. Assets without a view keep their equilibrium return, adjusted only through correlation."
            >
              <div className="flex flex-col gap-3">
                {assets.map((t) => {
                  const d = drafts[t]
                  return (
                    <div key={t} className="flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium font-mono text-sm">{t}</span>
                        <div className="flex items-center gap-2">
                          {data && (
                            <span className="text-muted-foreground text-xs tabular-nums">
                              implied {pct(data.equilibrium[t], 1)}
                            </span>
                          )}
                          <Switch
                            aria-label={`View on ${t}`}
                            checked={d?.on ?? false}
                            onCheckedChange={(on) => update(t, { on })}
                          />
                        </div>
                      </div>
                      {d?.on && (
                        <div className="grid grid-cols-2 gap-2">
                          <NumberInput
                            label="Expected return"
                            value={d.returnPct}
                            onChange={(v) => update(t, { returnPct: v })}
                            min={-50}
                            max={100}
                            step={0.5}
                            digits={1}
                            unit="%"
                          />
                          <NumberInput
                            label="Confidence"
                            value={d.confidencePct}
                            onChange={(v) => update(t, { confidencePct: v })}
                            min={1}
                            max={100}
                            step={5}
                            unit="%"
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              {views.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => setDrafts({})}>
                  Clear views
                </Button>
              )}
            </PanelSection>
          </Card>
        </aside>
        <div className="flex min-w-0 flex-col gap-6">
          <QueryError error={query.error} />
          {data && (
            <>
              <StatGrid className="grid-cols-2 md:grid-cols-4">
                <Stat
                  label="Views"
                  value={String(views.length)}
                  hint={views.length ? views.map((v) => v.asset).join(', ') : 'market returns only'}
                />
                <Stat
                  label="Biggest return tilt"
                  value={views.length && biggest ? spct(biggest.shift, 1) : '—'}
                  hint={
                    views.length && biggest
                      ? `${biggest.t}, posterior minus implied`
                      : 'switch on a view to tilt returns'
                  }
                />
                <Stat
                  label="Distance from prior"
                  value={pct(oneWayDistance(data.weights, data.prior_weights, assets), 1)}
                  hint="Black–Litterman weights vs the prior (one-way)"
                />
                <Stat
                  label="Historical max Sharpe vs prior"
                  value={pct(
                    oneWayDistance(data.historical_max_sharpe, data.prior_weights, assets),
                    1,
                  )}
                  hint="how far raw history pulls you"
                />
              </StatGrid>
              <WeightBars
                title="Expected returns"
                description="Annual total returns (cash included). Implied: what the prior portfolio needs to be optimal. Posterior: implied blended with your views. Historical: the sample averages maximum Sharpe normally uses."
                guide={
                  <>
                    <p>
                      The posterior sits between the implied returns and your views, closer to the
                      view when confidence is high. Assets without a view still shift a little when
                      they are correlated with one that has a view.
                    </p>
                    <p>
                      Compare the historical bars: they are often far more spread out than the
                      implied ones, which is why optimising on them alone gives extreme weights.
                    </p>
                  </>
                }
                assets={assets}
                series={[
                  { name: 'Implied (equilibrium)', weights: data.equilibrium },
                  { name: 'Posterior', weights: data.posterior },
                  { name: 'Historical', weights: data.historical },
                ]}
                stale={query.stale}
                className="h-72"
              />
              <WeightBars
                title="Weights"
                description="Maximum Sharpe run on the posterior returns, next to the prior it started from and maximum Sharpe on historical averages."
                guide={
                  <>
                    <p>
                      With no views the Black–Litterman bars match the prior (unless the universe's
                      max-weight cap binds): the implied returns were built so that the prior is
                      optimal. Each view then moves weight toward or away from that asset, and only
                      that far.
                    </p>
                    <p>
                      Historical maximum Sharpe has no such anchor, so it often concentrates in a
                      few assets. Black–Litterman stays diversified unless you ask it not to.
                    </p>
                  </>
                }
                assets={assets}
                series={[
                  { name: 'Prior', weights: data.prior_weights },
                  { name: 'Black–Litterman', weights: data.weights },
                  { name: 'Historical max Sharpe', weights: data.historical_max_sharpe },
                ]}
                stale={query.stale}
                className="h-72"
              />
              <PriorTable data={data} assets={assets} stale={query.stale} />
              <p className="text-muted-foreground text-xs">
                Risk aversion {fixed(riskAversion, 1)}. Views are absolute (one asset, one return);
                confidence 100% means the posterior matches the view.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  )
}
