import { useMemo, useState } from 'react'
import { WeightBars } from '@/components/charts/allocation-charts'
import { NumberInput } from '@/components/number-input'
import { PageHeader } from '@/components/page-header'
import { PanelSection } from '@/components/panel-section'
import { QueryError } from '@/components/query-error'
import { Stat, StatGrid } from '@/components/stat-grid'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useLab, useUniverse } from '@/features/universe/universe-context'
import { api } from '@/lib/api'
import { pct } from '@/lib/format'

/** Relative budget units per asset; anything not set counts as 1 (equal shares). */
type Budgets = Record<string, number>

function equal(assets: string[]): Budgets {
  return Object.fromEntries(assets.map((t) => [t, 1]))
}

/** First asset carries 60% of the risk, the rest share 40%. */
function tilted(assets: string[]): Budgets {
  if (assets.length < 2) return equal(assets)
  const rest = 40 / (assets.length - 1)
  return Object.fromEntries(assets.map((t, i) => [t, i === 0 ? 60 : Math.round(rest * 10) / 10]))
}

export default function RiskBudgetPage() {
  const { universe } = useUniverse()
  const assets = universe.tickers
  const [budgets, setBudgets] = useState<Budgets>({})
  const value = (t: string) => budgets[t] ?? 1
  const total = assets.reduce((sum, t) => sum + Math.max(value(t), 0), 0)

  const request = useMemo(
    () => Object.fromEntries(assets.map((t) => [t, Math.max(budgets[t] ?? 1, 0)])),
    [assets, budgets],
  )
  const query = useLab('risk-budget', api.riskBudget, { budgets: request }, { enabled: total > 0 })
  const data = query.data

  const gaps = data
    ? assets
        .map((t) => ({ t, gap: (data.weights[t] ?? 0) - (data.risk_contribution[t] ?? 0) }))
        .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
    : []
  const biggest = gaps[0]
  const miss = data
    ? Math.max(
        ...assets.map((t) => Math.abs((data.risk_contribution[t] ?? 0) - (data.budgets[t] ?? 0))),
      )
    : 0

  return (
    <>
      <PageHeader title="Risk budgeting">
        A 60/40 stock–bond portfolio puts 60% of its money in stocks but typically 90% of its risk
        there, because stocks are far more volatile. Risk budgeting turns this around: you decide
        what share of the risk each asset should carry, and the weights follow.
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside>
          <Card className="overflow-hidden">
            <PanelSection
              title="Risk budget"
              hint="Relative units: only the proportions matter. Equal budgets give risk parity. An asset with a zero budget gets no weight."
            >
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-[4.5rem_1fr_3.5rem] gap-2 text-muted-foreground text-xs">
                  <span>Asset</span>
                  <span className="pe-1 text-right">Budget</span>
                  <span className="text-right">Share</span>
                </div>
                {assets.map((t) => (
                  <div key={t} className="grid grid-cols-[4.5rem_1fr_3.5rem] items-center gap-2">
                    <span className="font-medium font-mono text-xs">{t}</span>
                    <NumberInput
                      hideLabel
                      label={`${t} risk budget`}
                      value={value(t)}
                      onChange={(v) => setBudgets({ ...budgets, [t]: v })}
                      min={0}
                      max={100}
                      step={1}
                      digits={0}
                    />
                    <span className="text-right text-muted-foreground text-xs tabular-nums">
                      {total > 0 ? pct(Math.max(value(t), 0) / total, 0) : '—'}
                    </span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" onClick={() => setBudgets(equal(assets))}>
                  Equal
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBudgets(tilted(assets))}
                  disabled={assets.length < 2}
                  title={`${assets[0]} carries 60% of the risk, the rest share 40%`}
                >
                  60 / 40 on {assets[0]}
                </Button>
              </div>
            </PanelSection>
          </Card>
        </aside>
        <div className="flex min-w-0 flex-col gap-6">
          {total <= 0 && (
            <Alert variant="warning">
              <AlertDescription>
                Give at least one asset a positive budget: risk shares need something to divide.
              </AlertDescription>
            </Alert>
          )}
          <QueryError error={query.error} />
          {data && total > 0 && (
            <>
              <StatGrid className="grid-cols-2 md:grid-cols-3">
                <Stat
                  label="Portfolio volatility"
                  value={pct(data.volatility, 1)}
                  hint="annual, from the shared covariance"
                />
                <Stat
                  label="Largest weight vs risk gap"
                  value={biggest ? `${pct(Math.abs(biggest.gap), 1)}` : '—'}
                  hint={
                    biggest
                      ? `${biggest.t}: ${pct(data.weights[biggest.t], 1)} of capital, ${pct(data.risk_contribution[biggest.t], 1)} of risk`
                      : undefined
                  }
                />
                <Stat
                  label="Largest miss vs budget"
                  value={pct(miss, 2)}
                  hint={
                    miss > 0.01
                      ? 'the universe max-weight cap stops the budget being met exactly'
                      : 'risk shares match the budget'
                  }
                />
              </StatGrid>
              <WeightBars
                title="Budget, risk share and capital"
                description="For each asset: the share of risk you asked for, the share it actually contributes, and the share of capital needed to get there."
                guide={
                  <>
                    <p>
                      An asset's risk contribution is its weight times how much it moves the
                      portfolio's volatility at the margin, so contributions add up to 100% of the
                      portfolio's risk. Calm assets and diversifiers need a lot of capital to carry
                      a given risk share; volatile assets need little.
                    </p>
                    <p>
                      When the first two bars match, the optimiser has met the budget. The gap
                      between them and the capital bar is the point of the page: capital weight is
                      not risk share.
                    </p>
                  </>
                }
                assets={assets}
                series={[
                  { name: 'Target risk budget', weights: data.budgets },
                  { name: 'Realised risk share', weights: data.risk_contribution },
                  { name: 'Capital weight', weights: data.weights },
                ]}
                stale={query.stale}
                className="h-80"
              />
            </>
          )}
        </div>
      </div>
    </>
  )
}
