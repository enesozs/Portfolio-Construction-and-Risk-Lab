import { type ReactNode, useState } from 'react'
import { ChartGuide } from '@/components/chart-guide'
import { WeightBars } from '@/components/charts/allocation-charts'
import { PageHeader } from '@/components/page-header'
import { PanelSection } from '@/components/panel-section'
import { ParamControl } from '@/components/param-control'
import { PortfolioSelect } from '@/components/portfolio-select'
import { QueryError } from '@/components/query-error'
import { Segmented } from '@/components/segmented'
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
import { api, type CompareResponse, type PortfolioKey } from '@/lib/api'
import { fixed, pct } from '@/lib/format'
import { cn } from '@/lib/utils'

type Objective = 'mean_variance' | 'min_volatility'

interface CompareRow {
  label: string
  expected_return: number
  volatility: number
  sharpe: number | null
  turnover: number | null
}

function rows(data: CompareResponse): CompareRow[] {
  return data.labels.map((label, i) => ({
    label,
    expected_return: data.expected_return[i],
    volatility: data.volatility[i],
    sharpe: data.sharpe[i] ?? null,
    turnover: data.turnover?.[i] ?? null,
  }))
}

function CompareTable({
  title,
  description,
  guide,
  data,
  stale,
}: {
  title: string
  description: ReactNode
  guide: ReactNode
  data: CompareRow[]
  stale: boolean
}) {
  const showTurnover = data.some((r) => r.turnover != null)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base" render={<h2 />}>
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
        <ChartGuide noun="table">{guide}</ChartGuide>
      </CardHeader>
      <CardPanel className={cn('pt-0 transition-opacity', stale && 'opacity-60')}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Portfolio</TableHead>
              <TableHead className="text-right">Exp. return</TableHead>
              <TableHead className="text-right">Exp. volatility</TableHead>
              <TableHead className="text-right">Exp. Sharpe</TableHead>
              {showTurnover && <TableHead className="text-right">Turnover</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((r) => (
              <TableRow key={r.label}>
                <TableCell className="font-medium">{r.label}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {pct(r.expected_return, 1)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{pct(r.volatility, 1)}</TableCell>
                <TableCell className="text-right tabular-nums">{fixed(r.sharpe, 2)}</TableCell>
                {showTurnover && (
                  <TableCell className="text-right tabular-nums">{pct(r.turnover, 1)}</TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardPanel>
    </Card>
  )
}

function SectionHeading({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="font-semibold text-lg tracking-tight">{title}</h2>
      <p className="max-w-3xl text-muted-foreground text-sm">{children}</p>
    </div>
  )
}

function OptionalLimit({
  id,
  label,
  enabled,
  onEnabled,
  value,
  onChange,
  min,
  max,
  step,
}: {
  id: string
  label: string
  enabled: boolean
  onEnabled: (on: boolean) => void
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id} className="font-normal text-muted-foreground">
          {label}
        </Label>
        <Switch id={id} aria-label={label} checked={enabled} onCheckedChange={onEnabled} />
      </div>
      {enabled && (
        <ParamControl
          label={`${label} (limit)`}
          value={value}
          onChange={onChange}
          min={min}
          max={max}
          step={step}
          unit="%"
        />
      )}
    </div>
  )
}

export default function RobustPage() {
  const { universe } = useUniverse()
  const assets = universe.tickers

  // Robust mean-variance.
  const [riskAversion, setRiskAversion] = useState(3)
  const [uncertainty, setUncertainty] = useState(2)
  const robust = useLab('robust', api.robust, {
    risk_aversion: riskAversion,
    uncertainty_aversion: uncertainty,
  })
  // The same objective with the uncertainty penalty switched off isolates what the penalty does.
  const plain = useLab('robust', api.robust, {
    risk_aversion: riskAversion,
    uncertainty_aversion: 0,
  })

  // Turnover-aware rebalancing.
  const [objective, setObjective] = useState<Objective>('mean_variance')
  const [reference, setReference] = useState<PortfolioKey>('equal_weight')
  const [targetAversion, setTargetAversion] = useState(3)
  const [costPct, setCostPct] = useState(1)
  const [capTurnover, setCapTurnover] = useState(false)
  const [maxTurnoverPct, setMaxTurnoverPct] = useState(20)
  const [capVol, setCapVol] = useState(false)
  const [maxVolPct, setMaxVolPct] = useState(15)
  const turnover = useLab('turnover', api.turnover, {
    objective,
    reference,
    risk_aversion: targetAversion,
    cost: costPct / 100,
    max_turnover: capTurnover ? maxTurnoverPct / 100 : null,
    max_volatility: capVol ? maxVolPct / 100 : null,
  })

  const robustData = robust.data
  const plainData = plain.data
  const turnoverData = turnover.data

  return (
    <>
      <PageHeader title="Robust and turnover-aware">
        Two ways to stop an optimiser from acting on noise. Robust mean-variance discounts expected
        returns that are poorly measured. Turnover-aware rebalancing starts from what you already
        hold and only trades when the improvement is worth the cost of trading.
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside>
          <Card className="overflow-hidden">
            <PanelSection
              title="Robust mean-variance"
              hint="Maximise expected return − risk aversion × variance − uncertainty aversion × the standard error of the portfolio's expected return."
            >
              <ParamControl
                label="Risk aversion"
                value={riskAversion}
                onChange={setRiskAversion}
                min={0}
                max={20}
                step={0.5}
                digits={1}
              />
              <ParamControl
                label="Uncertainty aversion"
                value={uncertainty}
                onChange={setUncertainty}
                min={0}
                max={20}
                step={0.5}
                digits={1}
              />
              <p className="text-muted-foreground text-xs">
                At 0 uncertainty aversion this is plain mean-variance. Raising it moves weight away
                from assets whose average return is least precisely known, the volatile ones.
              </p>
            </PanelSection>
            <Separator />
            <PanelSection
              title="Turnover-aware rebalancing"
              hint="Move from a current portfolio toward a target, paying a cost for every unit traded."
            >
              <Segmented<Objective>
                label="Target objective"
                value={objective}
                onChange={setObjective}
                options={[
                  { value: 'mean_variance', label: 'Mean-variance' },
                  { value: 'min_volatility', label: 'Min volatility' },
                ]}
                className="w-full"
              />
              <PortfolioSelect
                label="Current portfolio"
                value={reference}
                onChange={setReference}
              />
              {objective === 'mean_variance' && (
                <ParamControl
                  label="Risk aversion"
                  value={targetAversion}
                  onChange={setTargetAversion}
                  min={0}
                  max={20}
                  step={0.5}
                  digits={1}
                />
              )}
              <ParamControl
                label="Cost of turnover"
                value={costPct}
                onChange={setCostPct}
                min={0}
                max={10}
                step={0.1}
                digits={1}
                unit="%"
              />
              <p className="-mt-2 text-muted-foreground text-xs">
                Annual expected return given up per 100% of one-way turnover, in the same units for
                both objectives (mean-variance utility and volatility are both annual returns). 1%
                means trading the whole portfolio must improve the objective by at least 1% a year.
                0 jumps straight to the target. Weight bounds come from the universe constraints.
              </p>
              <OptionalLimit
                id="turnover-cap"
                label="Max turnover"
                enabled={capTurnover}
                onEnabled={setCapTurnover}
                value={maxTurnoverPct}
                onChange={setMaxTurnoverPct}
                min={0}
                max={100}
                step={1}
              />
              <OptionalLimit
                id="vol-cap"
                label="Max volatility"
                enabled={capVol}
                onEnabled={setCapVol}
                value={maxVolPct}
                onChange={setMaxVolPct}
                min={1}
                max={100}
                step={0.5}
              />
            </PanelSection>
          </Card>
        </aside>
        <div className="flex min-w-0 flex-col gap-6">
          <SectionHeading title="Robust mean-variance">
            A sample average of returns has a standard error that grows with the asset's volatility.
            Robust mean-variance treats that error as a cost, so it trusts the optimiser's favourite
            assets a little less.
          </SectionHeading>
          <QueryError error={robust.error ?? plain.error} />
          {robustData && plainData && (
            <>
              <WeightBars
                title="Allocations"
                description="Robust mean-variance next to the same objective without the uncertainty penalty, and maximum Sharpe for reference."
                guide={
                  <>
                    <p>
                      The gap between the first two bars of each asset is the penalty at work. It
                      takes weight from assets whose expected return is measured least precisely and
                      spreads it over the rest.
                    </p>
                    <p>
                      Mean-variance with risk aversion is a different target from maximum Sharpe:
                      low risk aversion chases return, high risk aversion approaches minimum
                      variance.
                    </p>
                  </>
                }
                assets={assets}
                series={[
                  { name: robustData.labels[0], weights: robustData.weights[0] },
                  { name: 'No uncertainty penalty', weights: plainData.weights[0] },
                  { name: robustData.labels[1], weights: robustData.weights[1] },
                ]}
                stale={robust.stale || plain.stale}
                className="h-72"
              />
              <CompareTable
                title="Expected numbers"
                description="Measured with the shared estimates. The robust portfolio gives up a little expected Sharpe in exchange for depending less on the noisiest inputs."
                guide={
                  <p>
                    Judged by the same estimates it distrusts, the robust portfolio can only look
                    slightly worse than the unpenalised one. Its payoff shows up out of sample, when
                    the estimated returns turn out wrong.
                  </p>
                }
                data={[
                  rows(robustData)[0],
                  { ...rows(plainData)[0], label: 'No uncertainty penalty' },
                  rows(robustData)[1],
                ]}
                stale={robust.stale || plain.stale}
              />
            </>
          )}

          <Separator className="my-2" />

          <SectionHeading title="Turnover-aware rebalancing">
            Every trade costs money (spreads, commissions, taxes), so the best portfolio on paper is
            not always worth moving to. This optimiser weighs each step toward the target against
            the turnover it needs.
          </SectionHeading>
          <QueryError error={turnover.error} />
          {turnoverData && (
            <>
              <WeightBars
                title="Rebalancing allocations"
                description="Where you are now, the target the objective would pick from scratch, and the compromise that accounts for trading."
                guide={
                  <>
                    <p>
                      The turnover-aware bars sit between the current and target ones. In effect it
                      makes the trades with the biggest improvement per unit traded first and leaves
                      small differences alone.
                    </p>
                    <p>
                      Raise the cost or set a turnover cap and the bars move back toward the current
                      portfolio.
                    </p>
                  </>
                }
                assets={assets}
                series={turnoverData.labels.map((name, i) => ({
                  name,
                  weights: turnoverData.weights[i],
                }))}
                stale={turnover.stale}
                className="h-72"
              />
              <CompareTable
                title="What the trade buys"
                description="Turnover is one-way: the share of the portfolio sold (and bought) to get there from the current portfolio."
                guide={
                  <p>
                    Compare the Sharpe gained with the turnover needed. If the turnover-aware
                    portfolio keeps most of the improvement for much less trading, the rest of the
                    move to the target was mostly churn on estimation noise.
                  </p>
                }
                data={rows(turnoverData)}
                stale={turnover.stale}
              />
            </>
          )}
        </div>
      </div>
    </>
  )
}
