import { useId, useMemo, useState } from 'react'
import { WeightBars } from '@/components/charts/allocation-charts'
import { useChartColors } from '@/components/charts/theme'
import { TimeChart } from '@/components/charts/time-chart'
import { PageHeader } from '@/components/page-header'
import { PanelSection } from '@/components/panel-section'
import { PortfolioSelect } from '@/components/portfolio-select'
import { QueryError } from '@/components/query-error'
import { Stat, StatGrid } from '@/components/stat-grid'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { useLab, useUniverse } from '@/features/universe/universe-context'
import { api, type PortfolioKey, type TimeSeries } from '@/lib/api'
import { fixed, pct, spct } from '@/lib/format'
import { portfolioLabel } from '@/lib/portfolios'

const signedPct = (v: number) => spct(v, 1)
const beta = (v: number) => fixed(v, 2)

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

export default function AttributionPage() {
  const { universe } = useUniverse()
  const c = useChartColors()
  const ids = { benchmark: useId() }
  const [portfolio, setPortfolio] = useState<PortfolioKey>('max_sharpe')
  const [benchmarkText, setBenchmarkText] = useState('SPY')
  const benchmark = benchmarkText.trim().toUpperCase()
  // Memoised so the debounced params keep their identity between renders.
  const benchParams = useMemo(() => ({ portfolio, benchmark }), [portfolio, benchmark])
  const factorParams = useMemo(() => ({ portfolio }), [portfolio])
  const bench = useLab('benchmark', api.benchmark, benchParams, {
    enabled: benchmark.length > 0,
    delay: 600,
  })
  const factors = useLab('factors', api.factors, factorParams)
  const b = bench.data
  const f = factors.data
  const label = portfolioLabel(portfolio)
  const log = b ? wideRange([b.portfolio, b.benchmark_wealth]) : false

  return (
    <>
      <PageHeader title="Attribution">
        Where the portfolio's return came from. Against a benchmark: how much is market exposure
        (beta) and how much is left over (alpha). By asset: which holdings did the work. By factor:
        which broad styles (size, value, momentum…) the portfolio leans on without saying so.
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside>
          <Card className="overflow-hidden">
            <PanelSection title="Portfolio" hint="Fixed weights, estimated on the full sample.">
              <PortfolioSelect value={portfolio} onChange={setPortfolio} />
            </PanelSection>
            <Separator />
            <PanelSection
              title="Benchmark"
              hint="What you would otherwise hold. A broad index fund is the usual choice."
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor={ids.benchmark}>Ticker</Label>
                <Input
                  id={ids.benchmark}
                  value={benchmarkText}
                  onChange={(e) => setBenchmarkText(e.target.value.toUpperCase())}
                  placeholder="SPY"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={12}
                />
                <p className="text-muted-foreground text-xs">
                  Any Yahoo Finance symbol, e.g. SPY (US large caps), ACWI (global equities) or AGG
                  (US bonds). Compared over the universe's sample dates.
                </p>
              </div>
            </PanelSection>
          </Card>
        </aside>
        <div className="flex min-w-0 flex-col gap-6">
          <QueryError
            error={benchmark ? bench.error : null}
            title={`Could not compare with ${benchmark}`}
          />
          {b && (
            <>
              <StatGrid className="grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
                <Stat
                  label="Alpha (annual)"
                  value={spct(b.alpha, 1)}
                  hint="return not explained by beta"
                />
                <Stat
                  label="Beta"
                  value={fixed(b.beta, 2)}
                  hint={`sensitivity to ${b.benchmark}`}
                />
                <Stat
                  label="Tracking error"
                  value={pct(b.tracking_error, 1)}
                  hint={`active return ${spct(b.active_return, 1)}`}
                />
                <Stat
                  label="Information ratio"
                  value={fixed(b.information_ratio, 2)}
                  hint="active return / tracking error"
                />
                <Stat
                  label="Upside capture"
                  value={pct(b.upside_capture, 0)}
                  hint={`of ${b.benchmark}'s up days`}
                />
                <Stat
                  label="Downside capture"
                  value={pct(b.downside_capture, 0)}
                  hint={`of ${b.benchmark}'s down days`}
                />
              </StatGrid>
              <TimeChart
                title={`Growth of $1: ${label} vs ${b.benchmark}`}
                description={`Both held over the same dates, the portfolio at its fixed target weights.${log ? ' Log scale.' : ''}`}
                guide={
                  <>
                    <p>
                      Beta says how much the portfolio moves per 1% move in the benchmark; alpha is
                      the average annual return left over after that. A beta below 1 with a positive
                      alpha means the portfolio earned more than its market exposure alone would
                      explain.
                    </p>
                    <p>
                      Capture ratios split this by direction: ideally the portfolio captures more of
                      the up days than of the down days. These are in-sample numbers for weights
                      chosen on the same data, so they flatter the portfolio.
                    </p>
                  </>
                }
                lines={[
                  { name: label, color: c.series1, data: b.portfolio },
                  { name: b.benchmark, color: c.series2, data: b.benchmark_wealth },
                ]}
                yName={log ? 'Growth of $1 (log)' : 'Growth of $1'}
                yFormat={(v) => `$${fixed(v, v < 10 ? 2 : 0)}`}
                logY={log}
                baseline={1}
                stale={bench.stale}
                ariaLabel={`Growth of one dollar in ${label} and in ${b.benchmark}`}
                className="h-80"
              />
              <WeightBars
                title="Return contribution by asset"
                description="Each asset's weight times its annualised return: the parts add up to the portfolio's return. Assets with zero weight contribute nothing."
                guide={
                  <>
                    <p>
                      A portfolio's return is the weighted sum of its holdings' returns, so this
                      shows which positions actually produced it. One bar towering over the rest
                      means the result depends on a single asset.
                    </p>
                    <p>
                      Compare with risk contributions on the decomposition page: an asset that adds
                      far more risk than return is a candidate for a smaller weight.
                    </p>
                  </>
                }
                assets={universe.tickers}
                series={[{ name: 'Contribution', weights: b.contributions }]}
                format={signedPct}
                stale={bench.stale}
              />
            </>
          )}
          <QueryError error={factors.error} title="Could not estimate factor exposures" />
          {f && (
            <>
              <WeightBars
                title="Factor exposures"
                description={`Regression betas of the portfolio's daily returns on six style factors (${f.observations.toLocaleString('en-US')} days). Annual alpha ${spct(f.alpha, 1)}; R² ${fixed(f.r_squared, 2)} (share of daily variation the factors explain).`}
                guide={
                  <>
                    <p>
                      A market beta near 1 means the portfolio moves with the stock market. The
                      other factors are long-short spreads: a positive Value beta means the
                      portfolio behaves like cheap stocks minus expensive ones, a negative Size beta
                      like large companies rather than small.
                    </p>
                    <p>
                      Exposures you did not intend are hidden bets. A low R² means much of the
                      portfolio's behaviour is not captured by these factors at all, as is typical
                      for bond-heavy or concentrated portfolios.
                    </p>
                  </>
                }
                assets={Object.keys(f.exposures)}
                series={[{ name: 'Beta', weights: f.exposures }]}
                format={beta}
                stale={factors.stale}
              />
              <p className="-mt-3 text-muted-foreground text-xs">
                Factors are built from ETF prices:{' '}
                {Object.entries(f.proxies)
                  .map(([name, proxy]) => `${name} = ${proxy}`)
                  .join('; ')}
                . These are ETF proxies, not the official Fama–French factors, so they include fund
                fees and the ETFs' own index rules.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  )
}
