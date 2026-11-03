import { useMemo, useState } from 'react'
import { WeightBars } from '@/components/charts/allocation-charts'
import { useChartColors } from '@/components/charts/theme'
import { LinesChart } from '@/components/charts/simple-charts'
import { NumberInput } from '@/components/number-input'
import { PageHeader } from '@/components/page-header'
import { PanelSection } from '@/components/panel-section'
import { ParamControl } from '@/components/param-control'
import { PortfolioSelect } from '@/components/portfolio-select'
import { QueryError } from '@/components/query-error'
import { Stat, StatGrid } from '@/components/stat-grid'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useLab, useUniverse } from '@/features/universe/universe-context'
import { api, type PortfolioKey } from '@/lib/api'
import { fixed, pct, signed, spct } from '@/lib/format'

/** Assets treated as defensive (Treasuries, aggregate bonds, gold) in the presets. */
const DEFENSIVE = new Set(['TLT', 'IEF', 'AGG', 'SHY', 'GLD'])

/** Shocks in percent per asset; defensive assets get their own move, everything else `other`. */
const PRESETS: {
  id: string
  label: string
  idea: string
  other: number
  defensive: Record<string, number>
}[] = [
  {
    id: 'crash',
    label: 'Equity crash',
    idea: 'Stocks −30%; Treasuries and gold rally as investors seek safety.',
    other: -30,
    defensive: { TLT: 10, IEF: 5, AGG: 3, SHY: 1, GLD: 5 },
  },
  {
    id: 'rates',
    label: 'Rate shock',
    idea: 'Inflation surprise: stocks −20% and long bonds fall too, as in 2022.',
    other: -20,
    defensive: { TLT: -30, IEF: -15, AGG: -13, SHY: -4, GLD: -2 },
  },
  {
    id: 'broad',
    label: 'Everything falls',
    idea: 'A liquidity squeeze where nothing hedges: every asset −15%.',
    other: -15,
    defensive: { TLT: -15, IEF: -15, AGG: -15, SHY: -15, GLD: -15 },
  },
]

function presetShocks(id: string, tickers: string[]): Record<string, number> {
  const p = PRESETS.find((x) => x.id === id) ?? PRESETS[0]
  return Object.fromEntries(
    tickers.map((t) => [t, DEFENSIVE.has(t) ? (p.defensive[t] ?? 0) : p.other]),
  )
}

const volPct = (v: number) => pct(v, 1)
const stressPct = (v: number) => pct(v, 0)
const signedPct = (v: number) => spct(v, 1)

export default function StressPage() {
  const { universe } = useUniverse()
  const tickers = universe.tickers
  const c = useChartColors()
  const [portfolio, setPortfolio] = useState<PortfolioKey>('max_sharpe')
  const [corrPct, setCorrPct] = useState(30)
  const [volMult, setVolMult] = useState(1.5)
  // A preset applies to whatever tickers are in the universe; editing a cell freezes the values.
  const [preset, setPreset] = useState<string | null>('crash')
  const [custom, setCustom] = useState<Record<string, number>>({})
  const shocksPct = useMemo(
    () => (preset ? presetShocks(preset, tickers) : custom),
    [preset, custom, tickers],
  )

  const stress = useLab('stress', api.stress, {
    portfolio,
    correlation_stress: corrPct / 100,
    volatility_multiplier: volMult,
  })
  const scenario = useLab('scenario', api.scenario, {
    portfolio,
    shocks: Object.fromEntries(tickers.map((t) => [t, (shocksPct[t] ?? 0) / 100])),
  })
  const s = stress.data
  const sc = scenario.data

  const curves = useMemo(() => {
    if (!s) return []
    return [
      {
        name: 'Today’s volatilities (1×)',
        color: c.series1,
        points: s.grid.map((g, i) => [g, s.curve_base_vol[i]] as [number, number]),
      },
      {
        name: `Volatilities × ${fixed(volMult, 1)}`,
        color: c.series2,
        points: s.grid.map((g, i) => [g, s.curve_stressed_vol[i]] as [number, number]),
      },
    ]
  }, [s, c, volMult])

  const setShock = (ticker: string, value: number) => {
    setCustom({ ...shocksPct, [ticker]: value })
    setPreset(null)
  }

  const activePreset = PRESETS.find((p) => p.id === preset)
  const ranked = sc ? Object.entries(sc.contributions).sort((x, y) => x[1] - y[1]) : []
  const worst = ranked[0]
  const best = ranked[ranked.length - 1]

  return (
    <>
      <PageHeader title="Stress tests">
        Estimated volatility assumes the calm-and-crisis average of the sample. In a sell-off,
        volatilities jump and correlations rise toward +1, so the diversification the estimates
        promise shrinks exactly when it is needed. These tests push both levers, then apply return
        shocks of your choosing.
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside>
          <Card className="overflow-hidden">
            <PanelSection title="Portfolio" hint="Built from the shared universe and estimates.">
              <PortfolioSelect value={portfolio} onChange={setPortfolio} />
            </PanelSection>
            <Separator />
            <PanelSection
              title="Covariance stress"
              hint="Applied to the estimated covariance matrix; the weights stay fixed."
            >
              <ParamControl
                label="Push correlations toward +1"
                value={corrPct}
                onChange={setCorrPct}
                min={0}
                max={100}
                step={5}
                unit="%"
              />
              <p className="-mt-2 text-muted-foreground text-xs">
                0% keeps today's correlations; 100% makes every pair move in lockstep (no
                diversification left).
              </p>
              <ParamControl
                label="Volatility multiplier"
                value={volMult}
                onChange={setVolMult}
                min={0.5}
                max={4}
                step={0.1}
                digits={1}
                unit="×"
              />
            </PanelSection>
            <Separator />
            <PanelSection
              title="Custom scenario"
              hint="A one-off return for each asset. Pick a preset or type your own."
            >
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <Button
                    key={p.id}
                    size="sm"
                    variant={preset === p.id ? 'secondary' : 'outline'}
                    aria-pressed={preset === p.id}
                    onClick={() => setPreset(p.id)}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
              <p className="text-muted-foreground text-xs">
                {activePreset
                  ? activePreset.idea
                  : 'Custom shocks. Bonds and gold (TLT, IEF, AGG, SHY, GLD) count as defensive in the presets.'}
              </p>
              <div className="grid grid-cols-2 gap-3">
                {tickers.map((t) => (
                  <NumberInput
                    key={t}
                    label={t}
                    value={shocksPct[t] ?? 0}
                    onChange={(v) => setShock(t, v)}
                    min={-100}
                    max={300}
                    step={1}
                    digits={0}
                    unit="%"
                  />
                ))}
              </div>
            </PanelSection>
          </Card>
        </aside>
        <div className="flex min-w-0 flex-col gap-6">
          <QueryError error={stress.error} />
          {s && (
            <>
              <StatGrid className="grid-cols-2 md:grid-cols-4">
                <Stat label="Base volatility" value={pct(s.base, 1)} hint="estimated, annual" />
                <Stat
                  label="Correlation stress only"
                  value={pct(s.correlation_only, 1)}
                  hint={`${signed((s.correlation_only - s.base) * 100, 1)} pts vs base`}
                />
                <Stat
                  label="Volatility stress only"
                  value={pct(s.volatility_only, 1)}
                  hint={`${signed((s.volatility_only - s.base) * 100, 1)} pts vs base`}
                />
                <Stat
                  label="Combined"
                  value={pct(s.combined, 1)}
                  hint={`${fixed(s.combined / s.base, 2)}× the base`}
                />
              </StatGrid>
              <LinesChart
                title="Portfolio volatility as correlations rise"
                description="Each point blends today's correlations with perfect correlation by the amount on the x-axis (dashed: your setting). A steep blue line means the portfolio relies on low correlations; the orange line adds higher asset volatilities, which scales the whole curve."
                series={curves}
                xName="Correlation push toward +1"
                yName="Portfolio volatility (annual)"
                xFormat={stressPct}
                yFormat={volPct}
                current={corrPct / 100}
                stale={stress.stale}
                ariaLabel="Portfolio volatility against correlation stress, at today's and at stressed asset volatilities"
              />
            </>
          )}
          <QueryError error={scenario.error} title="Could not apply the scenario" />
          {sc && (
            <>
              <StatGrid className="grid-cols-2 md:grid-cols-3">
                <Stat
                  label="Portfolio return in this scenario"
                  value={spct(sc.portfolio_return, 1)}
                  hint={activePreset ? activePreset.label : 'custom shocks'}
                />
                <Stat
                  label="Largest loss"
                  value={worst ? `${worst[0]} ${spct(worst[1], 1)}` : '—'}
                  hint="weight × shock"
                />
                <Stat
                  label="Largest offset"
                  value={best && best[1] > 0.00005 ? `${best[0]} ${spct(best[1], 1)}` : 'None'}
                  hint={
                    best && best[1] > 0.00005
                      ? 'weight × shock'
                      : 'no holding gains in this scenario'
                  }
                />
              </StatGrid>
              <WeightBars
                title="Contribution to the scenario return"
                description="Each asset's weight times its shock. The bars add up to the portfolio return above."
                guide={
                  <>
                    <p>
                      A scenario is a single what-if, not a probability: it shows how much the
                      current weights would lose if those moves happened together, with no
                      rebalancing.
                    </p>
                    <p>
                      Positive bars are the hedges. If none appear in a crash preset, nothing in the
                      portfolio is offsetting the equity loss.
                    </p>
                  </>
                }
                assets={tickers}
                series={[{ name: 'Contribution', weights: sc.contributions }]}
                format={signedPct}
                stale={scenario.stale}
              />
            </>
          )}
        </div>
      </div>
    </>
  )
}
