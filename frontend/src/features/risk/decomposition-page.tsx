import { useId, useMemo, useState } from 'react'
import { WeightBars } from '@/components/charts/allocation-charts'
import { PageHeader } from '@/components/page-header'
import { PanelSection } from '@/components/panel-section'
import { ParamControl } from '@/components/param-control'
import { PortfolioSelect } from '@/components/portfolio-select'
import { QueryError } from '@/components/query-error'
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
import { ChartGuide } from '@/components/chart-guide'
import { useLab, useUniverse } from '@/features/universe/universe-context'
import { api, type DecompositionResponse, type PortfolioKey, type Weights } from '@/lib/api'
import { fixed, pct, signed } from '@/lib/format'

const ratioChange = (v: number) => signed(v, 2)

function ContributionTable({ data }: { data: DecompositionResponse }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base" render={<h2 />}>
          Where the volatility comes from
        </CardTitle>
        <CardDescription>
          Marginal risk is how much portfolio volatility rises per unit of extra weight in the
          asset. Weight × marginal risk is the asset's component of volatility; the components add
          up exactly to the portfolio's {pct(data.volatility, 1)}.
        </CardDescription>
        <ChartGuide noun="table">
          <p>
            Marginal risk depends on the asset's own volatility <em>and</em> its correlation with
            the rest of the portfolio, so a volatile asset that moves against the others can have a
            small marginal risk.
          </p>
          <p>
            The risk share column is the component divided by total volatility. It is the number
            risk parity sets equal across assets.
          </p>
        </ChartGuide>
      </CardHeader>
      <CardPanel className="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Asset</TableHead>
              <TableHead className="text-right">Weight</TableHead>
              <TableHead className="text-right">Marginal risk</TableHead>
              <TableHead className="text-right">Component of volatility</TableHead>
              <TableHead className="text-right">Risk share</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.map((r) => (
              <TableRow key={r.asset}>
                <TableCell className="font-medium font-mono">{r.asset}</TableCell>
                <TableCell className="text-right tabular-nums">{pct(r.weight, 1)}</TableCell>
                <TableCell className="text-right tabular-nums">{pct(r.marginal_risk, 1)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {pct(r.component_risk, 2)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {pct(r.risk_contribution, 1)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardPanel>
    </Card>
  )
}

export default function DecompositionPage() {
  const { universe } = useUniverse()
  const tickers = universe.tickers
  const [portfolio, setPortfolio] = useState<PortfolioKey>('equal_weight')
  const [targetPct, setTargetPct] = useState(10)
  const [leverage, setLeverage] = useState(false)
  const [maxGross, setMaxGross] = useState(1.5)
  const leverageId = useId()

  const query = useLab('decomposition', api.decomposition, { portfolio })
  const target = useLab('vol-target', api.volTarget, {
    portfolio,
    target_volatility: targetPct / 100,
    allow_leverage: leverage,
    max_gross: maxGross,
  })
  const data = query.data
  const vt = target.data

  const capitalVsRisk = useMemo(() => {
    if (!data) return []
    const weight: Weights = {}
    const risk: Weights = {}
    for (const r of data.rows) {
      weight[r.asset] = r.weight
      risk[r.asset] = r.risk_contribution
    }
    return [
      { name: 'Capital weight', weights: weight },
      { name: 'Risk contribution', weights: risk },
    ]
  }, [data])

  const diversification = useMemo(() => {
    if (!data) return []
    const values: Weights = {}
    for (const [asset, v] of Object.entries(data.marginal_diversification)) {
      if (v != null) values[asset] = v
    }
    return [{ name: 'Change in diversification ratio', weights: values }]
  }, [data])

  const targeted = useMemo(() => {
    if (!vt) return []
    const base: Weights = { ...vt.weights, CASH: 0 }
    for (const r of data?.rows ?? []) base[r.asset] = r.weight
    return [
      { name: 'Base portfolio', weights: base },
      { name: 'Volatility-targeted', weights: vt.weights },
    ]
  }, [vt, data])

  const cash = vt?.weights.CASH ?? 0
  const gross = vt
    ? Object.entries(vt.weights).reduce((s, [k, w]) => (k === 'CASH' ? s : s + w), 0)
    : 0

  return (
    <>
      <PageHeader title="Risk decomposition">
        How much each asset adds to portfolio volatility. An asset's risk contribution is its weight
        times its marginal risk (how much volatility rises if you add a little more of it), so equal
        capital is not equal risk: a 1/n portfolio usually gets most of its volatility from its most
        volatile, most correlated holdings.
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside>
          <Card className="overflow-hidden">
            <PanelSection title="Portfolio" hint="Built from the shared universe and estimates.">
              <PortfolioSelect value={portfolio} onChange={setPortfolio} />
            </PanelSection>
            <Separator />
            <PanelSection
              title="Volatility target"
              hint="Scale the portfolio toward a chosen volatility by mixing it with cash."
            >
              <ParamControl
                label="Target volatility"
                value={targetPct}
                onChange={setTargetPct}
                min={2}
                max={40}
                step={0.5}
                digits={1}
                unit="%"
              />
              <div className="flex flex-col gap-2.5">
                <Label htmlFor={leverageId} className="justify-between">
                  Allow leverage
                  <Switch id={leverageId} checked={leverage} onCheckedChange={setLeverage} />
                </Label>
                <p className="text-muted-foreground text-xs">
                  Off: the risky weights can only shrink, so a target above the portfolio's own
                  volatility leaves it unchanged. On: borrow at the cash rate to scale up.
                </p>
              </div>
              {leverage && (
                <ParamControl
                  label="Max gross exposure"
                  value={maxGross}
                  onChange={setMaxGross}
                  min={1}
                  max={5}
                  step={0.1}
                  digits={1}
                  unit="×"
                />
              )}
            </PanelSection>
          </Card>
        </aside>
        <div className="flex min-w-0 flex-col gap-6">
          <QueryError error={query.error} />
          {data && (
            <>
              <StatGrid className="grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
                <Stat label="Volatility" value={pct(data.volatility, 1)} hint="annual, expected" />
                <Stat
                  label="Effective assets (HHI)"
                  value={fixed(data.effective_assets_hhi, 1)}
                  hint={`1 / Σw² · of ${data.rows.length}`}
                />
                <Stat
                  label="Effective assets (entropy)"
                  value={fixed(data.effective_assets_entropy, 1)}
                  hint="exp of weight entropy"
                />
                <Stat
                  label="Weighted avg correlation"
                  value={fixed(data.weighted_average_correlation, 2)}
                  hint="between holdings"
                />
                <Stat
                  label="Diversification ratio"
                  value={fixed(data.diversification_ratio, 2)}
                  hint="avg asset vol / portfolio vol"
                />
                <Stat
                  label="Diversification benefit"
                  value={pct(data.diversification_benefit, 1)}
                  hint="volatility removed by mixing"
                />
              </StatGrid>
              <WeightBars
                title="Capital weight vs risk contribution"
                description="Blue: share of money in each asset. Orange: share of portfolio volatility it causes. Where orange towers over blue, that asset dominates the risk."
                guide={
                  <>
                    <p>
                      Risk contributions add up to 100%, just like weights. They differ because a
                      dollar in a volatile asset that moves with everything else adds far more
                      volatility than a dollar in a calm or diversifying one.
                    </p>
                    <p>
                      A negative contribution means the asset hedges the rest: adding a little more
                      would lower total volatility.
                    </p>
                  </>
                }
                assets={tickers}
                series={capitalVsRisk}
                stale={query.stale}
              />
              <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
                <ContributionTable data={data} />
                <WeightBars
                  title="Marginal diversification"
                  description="How much the diversification ratio drops if the asset is removed and the rest rescaled. Values are changes in the ratio, not percentages."
                  guide={
                    <p>
                      A large positive value marks an asset doing real diversifying work; near zero
                      means the portfolio barely notices it (often because its weight is tiny). A
                      negative value means the portfolio would be more diversified without it.
                    </p>
                  }
                  assets={tickers}
                  series={diversification}
                  format={ratioChange}
                  stale={query.stale}
                />
              </div>
            </>
          )}
          <QueryError error={target.error} title="Could not apply the volatility target" />
          {vt && (
            <>
              <StatGrid className="grid-cols-2 md:grid-cols-4">
                <Stat
                  label="Volatility before → after"
                  value={`${pct(vt.risky_volatility, 1)} → ${pct(vt.volatility, 1)}`}
                  hint={`target ${pct(targetPct / 100, 1)}`}
                />
                <Stat
                  label="Cash"
                  value={pct(cash, 1)}
                  hint={cash < 0 ? 'negative = borrowed' : 'earning the cash rate'}
                />
                <Stat label="Gross risky exposure" value={`${fixed(gross, 2)}×`} />
                <Stat
                  label="Expected return incl. cash"
                  value={pct(vt.expected_return, 1)}
                  hint={`risky alone ${pct(vt.risky_expected_return, 1)} · cash ${pct(vt.cash_rate, 1)}`}
                />
              </StatGrid>
              <WeightBars
                title="Weights after targeting volatility"
                description="The same risky mix scaled by one factor, with the remainder in cash. Volatility scales one for one with the risky share; cash adds none."
                guide={
                  <>
                    <p>
                      Volatility targeting keeps the relative weights of the risky assets and only
                      changes how much of the portfolio is exposed to them. Halving the risky share
                      halves volatility, and the expected return moves toward the cash rate.
                    </p>
                    <p>
                      Negative cash means the risky assets are bought with borrowed money, which is
                      assumed to cost the cash rate.
                    </p>
                  </>
                }
                assets={[...tickers, 'CASH']}
                series={targeted}
                stale={target.stale}
              />
            </>
          )}
        </div>
      </div>
    </>
  )
}
