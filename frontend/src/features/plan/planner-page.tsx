import { useMemo, useState } from 'react'
import { WeightBars } from '@/components/charts/allocation-charts'
import { ChartCard, LegendKey } from '@/components/charts/chart-card'
import { type ChartOption, EChart } from '@/components/charts/echart'
import { LinesChart } from '@/components/charts/simple-charts'
import {
  axisStyle,
  GRID,
  tooltipHeader,
  tooltipRow,
  tooltipStyle,
  useChartColors,
} from '@/components/charts/theme'
import { NumberInput } from '@/components/number-input'
import { PageHeader } from '@/components/page-header'
import { PanelSection } from '@/components/panel-section'
import { ParamControl } from '@/components/param-control'
import { PortfolioSelect } from '@/components/portfolio-select'
import { QueryError } from '@/components/query-error'
import { Segmented } from '@/components/segmented'
import { Stat, StatGrid } from '@/components/stat-grid'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { useLab } from '@/features/universe/universe-context'
import { api, type PlanResponse, type PortfolioKey } from '@/lib/api'
import { compact, pct } from '@/lib/format'
import { portfolioLabel } from '@/lib/portfolios'

type Model = 'bootstrap' | 'normal' | 'student_t'

function money(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return `$${compact(v)}`
}

function WealthFan({
  data,
  goal,
  stale,
}: {
  data: PlanResponse
  goal: number | null
  stale: boolean
}) {
  const c = useChartColors()
  const option = useMemo<ChartOption>(() => {
    const axis = axisStyle(c)
    const xs = data.years
    const band = (lo: number[], hi: number[], name: string, color: string) => [
      {
        name: `${name} base`,
        type: 'line' as const,
        stack: name,
        data: xs.map((x, i) => [x, lo[i]]),
        showSymbol: false,
        lineStyle: { opacity: 0 },
        silent: true,
      },
      {
        name,
        type: 'line' as const,
        stack: name,
        data: xs.map((x, i) => [x, hi[i] - lo[i]]),
        showSymbol: false,
        lineStyle: { opacity: 0 },
        areaStyle: { color },
        silent: true,
      },
    ]
    return {
      animationDurationUpdate: 150,
      grid: GRID,
      tooltip: {
        ...tooltipStyle(c),
        formatter: (raw: unknown) => {
          const i = (raw as { dataIndex: number }[])[0]?.dataIndex ?? 0
          return (
            tooltipHeader(`Year ${xs[i]}`) +
            tooltipRow(c.series1, money(data.p95[i]), '95th percentile') +
            tooltipRow(c.series1, money(data.p75[i]), '75th') +
            tooltipRow(c.series1, money(data.p50[i]), 'Median') +
            tooltipRow(c.series1, money(data.p25[i]), '25th') +
            tooltipRow(c.series1, money(data.p05[i]), '5th percentile')
          )
        },
      },
      xAxis: {
        type: 'value',
        name: 'Years from now',
        nameLocation: 'middle',
        nameGap: 28,
        min: 0,
        max: xs[xs.length - 1],
        ...axis,
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        name: "Wealth (today's dollars)",
        min: 0,
        ...axis,
        axisLabel: { ...axis.axisLabel, formatter: (v: number) => money(v) },
      },
      series: [
        ...band(data.p05, data.p95, '5–95%', c.band),
        ...band(data.p25, data.p75, '25–75%', c.bandStrong),
        ...data.sample_paths.slice(0, 12).map((path, k) => ({
          name: `path ${k}`,
          type: 'line' as const,
          data: xs.map((x, i) => [x, path[i]]),
          showSymbol: false,
          silent: true,
          lineStyle: { width: 1, color: c.muted, opacity: 0.35 },
        })),
        {
          name: 'Median',
          type: 'line' as const,
          data: xs.map((x, i) => [x, data.p50[i]]),
          showSymbol: false,
          lineStyle: { width: 2, color: c.series1 },
          itemStyle: { color: c.series1 },
          markLine:
            goal != null
              ? {
                  silent: true,
                  symbol: 'none',
                  lineStyle: { color: c.series2, type: 'dashed' as const, width: 1.5 },
                  label: { show: true, formatter: 'goal', color: c.ink2, fontSize: 11 },
                  data: [{ yAxis: goal }],
                }
              : undefined,
        },
      ],
    }
  }, [data, goal, c])
  return (
    <ChartCard
      title="Wealth over the plan"
      description="Simulated wealth in today's dollars: the median, the middle half (dark band) and 90% of outcomes (light band), with a few individual paths in grey."
      guide={
        <>
          <p>
            Values are deflated by inflation, so a flat line means purchasing power is kept. The
            bands widen with time because uncertainty compounds; in retirement the lower band can
            reach zero, which is running out of money.
          </p>
          <p>
            Individual paths show that real outcomes are bumpy: a path's ups and downs do not follow
            the smooth median.
          </p>
        </>
      }
      action={
        <div className="flex flex-wrap gap-4">
          <LegendKey color={c.series1} label="Median" />
          <LegendKey color={c.bandStrong} label="25–75%" band />
          <LegendKey color={c.band} label="5–95%" band />
          {goal != null && <LegendKey color={c.series2} label="Goal" />}
        </div>
      }
      stale={stale}
    >
      <EChart
        option={option}
        className="h-96"
        ariaLabel="Fan chart of simulated real wealth by year"
      />
    </ChartCard>
  )
}

export default function PlannerPage() {
  const [portfolio, setPortfolio] = useState<PortfolioKey>('risk_parity')
  const [initial, setInitial] = useState(100_000)
  const [monthly, setMonthly] = useState(1_000)
  const [years, setYears] = useState(40)
  const [retire, setRetire] = useState(25)
  const [withdrawal, setWithdrawal] = useState(40_000)
  const [inflationPct, setInflationPct] = useState(2.5)
  const [useGoal, setUseGoal] = useState(true)
  const [goal, setGoal] = useState(1_000_000)
  const [goalYear, setGoalYear] = useState(25)
  const [glideStart, setGlideStart] = useState(100)
  const [glideEnd, setGlideEnd] = useState(50)
  const [model, setModel] = useState<Model>('bootstrap')
  const [assume, setAssume] = useState(true)
  const [returnPct, setReturnPct] = useState(6)
  const [paths, setPaths] = useState('3000')
  const [confidence, setConfidence] = useState('0.9')
  const retireYear = Math.min(retire, years)
  const query = useLab(
    'planner',
    api.planner,
    {
      portfolio,
      initial,
      monthly_contribution: monthly,
      years,
      retire_year: retireYear,
      annual_withdrawal: withdrawal,
      inflation: inflationPct / 100,
      goal: useGoal ? goal : null,
      goal_year: useGoal ? Math.min(goalYear, years) : null,
      glide_start: glideStart / 100,
      glide_end: glideEnd / 100,
      model,
      expected_return: assume ? returnPct / 100 : null,
      n_paths: Number(paths),
      confidence: Number(confidence),
    },
    { delay: 500 },
  )
  const data = query.data
  const c = useChartColors()
  const retiring = retireYear < years

  return (
    <>
      <PageHeader title="Goal planner">
        Will this portfolio get you there, and will the money last? Thousands of possible futures,
        month by month: saving until retirement, then withdrawals that rise with inflation. All in
        today's dollars, with the growth portfolio gliding toward cash as the plan ages.
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside>
          <Card className="overflow-hidden">
            <PanelSection title="Portfolio" hint="The growth mix, from the shared universe.">
              <PortfolioSelect label="Method" value={portfolio} onChange={setPortfolio} />
              <div className="grid grid-cols-2 gap-3">
                <NumberInput
                  label="Growth share at start"
                  value={glideStart}
                  onChange={setGlideStart}
                  min={0}
                  max={100}
                  unit="%"
                />
                <NumberInput
                  label="Growth share at end"
                  value={glideEnd}
                  onChange={setGlideEnd}
                  min={0}
                  max={100}
                  unit="%"
                />
              </div>
              <p className="-mt-2 text-muted-foreground text-xs">
                The rest is in Treasury bills. The growth share moves in a straight line from start
                to end (a glide path, as target-date funds use).
              </p>
            </PanelSection>
            <Separator />
            <PanelSection title="Saving">
              <NumberInput
                label="Wealth today"
                value={initial}
                onChange={setInitial}
                min={0}
                max={100_000_000}
                step={1000}
                unit="$"
              />
              <NumberInput
                label="Saved each month"
                value={monthly}
                onChange={setMonthly}
                min={0}
                max={1_000_000}
                step={100}
                unit="$"
              />
              <ParamControl
                label="Plan length"
                value={years}
                onChange={setYears}
                min={5}
                max={60}
                step={1}
                unit="yrs"
              />
              <ParamControl
                label="Retire in"
                value={retireYear}
                onChange={setRetire}
                min={0}
                max={years}
                step={1}
                unit="yrs"
              />
            </PanelSection>
            <Separator />
            <PanelSection
              title="Spending"
              hint="Withdrawals start at retirement and rise with inflation."
            >
              <NumberInput
                label="Spend per year (today's $)"
                value={withdrawal}
                onChange={setWithdrawal}
                min={0}
                max={10_000_000}
                step={1000}
                unit="$"
              />
              <NumberInput
                label="Inflation"
                value={inflationPct}
                onChange={setInflationPct}
                min={-2}
                max={20}
                step={0.1}
                digits={1}
                unit="%"
              />
            </PanelSection>
            <Separator />
            <PanelSection title="Goal">
              <Label className="justify-between">
                Wealth target
                <Switch aria-label="Wealth target" checked={useGoal} onCheckedChange={setUseGoal} />
              </Label>
              {useGoal && (
                <div className="grid grid-cols-2 gap-3">
                  <NumberInput
                    label="Amount (today's $)"
                    value={goal}
                    onChange={setGoal}
                    min={0}
                    max={1_000_000_000}
                    step={10_000}
                    unit="$"
                  />
                  <NumberInput
                    label="By year"
                    value={Math.min(goalYear, years)}
                    onChange={setGoalYear}
                    min={1}
                    max={years}
                  />
                </div>
              )}
            </PanelSection>
            <Separator />
            <PanelSection
              title="Return assumption"
              hint="A few years of history are a poor guide to the next few decades."
            >
              <Label className="justify-between">
                Set the growth portfolio's return
                <Switch
                  aria-label="Set the growth portfolio's return"
                  checked={assume}
                  onCheckedChange={setAssume}
                />
              </Label>
              {assume ? (
                <NumberInput
                  label="Expected return per year (before inflation)"
                  value={returnPct}
                  onChange={setReturnPct}
                  min={-10}
                  max={30}
                  step={0.5}
                  digits={1}
                  unit="%"
                />
              ) : null}
              <p className="text-muted-foreground text-xs">
                {data
                  ? `The research sample's own mean for this portfolio is ${pct(data.sample_expected_return, 1)} a year. `
                  : ''}
                {assume
                  ? 'Every asset is shifted by the same amount to hit your assumption; volatility and correlations still come from the data.'
                  : "Using the sample's mean: recent winners make long plans look far better than they are likely to be."}
              </p>
            </PanelSection>
            <Separator />
            <PanelSection title="Simulation">
              <Segmented<Model>
                label="Returns"
                value={model}
                onChange={setModel}
                options={[
                  { value: 'bootstrap', label: 'History' },
                  { value: 'normal', label: 'Normal' },
                  { value: 'student_t', label: 'Fat tails' },
                ]}
                className="w-full"
              />
              <p className="-mt-2 text-muted-foreground text-xs">
                History resamples 12-month blocks of the universe's actual monthly returns; the
                others draw from the shared estimates of mean and covariance.
              </p>
              <div className="flex flex-col gap-2">
                <span className="text-muted-foreground text-sm">Safe withdrawal at</span>
                <Segmented
                  label="Safe-withdrawal confidence"
                  value={confidence}
                  onChange={setConfidence}
                  options={[
                    { value: '0.8', label: '80%' },
                    { value: '0.9', label: '90%' },
                    { value: '0.95', label: '95%' },
                  ]}
                  className="w-full"
                />
              </div>
              <Segmented
                label="Paths"
                value={paths}
                onChange={setPaths}
                options={[
                  { value: '1000', label: '1k paths' },
                  { value: '3000', label: '3k' },
                  { value: '10000', label: '10k' },
                ]}
                className="w-full"
              />
            </PanelSection>
          </Card>
        </aside>
        <div className="flex min-w-0 flex-col gap-6">
          <QueryError error={query.error} />
          {!data && query.isFetching && (
            <div className="flex h-64 items-center justify-center gap-2 text-muted-foreground text-sm">
              <Spinner className="size-4" /> Simulating the plan…
            </div>
          )}
          {data && (
            <>
              <StatGrid className="grid-cols-2 md:grid-cols-4">
                <Stat
                  label={useGoal ? 'Reach the goal' : 'Median wealth at the end'}
                  value={useGoal ? pct(data.probability_goal, 0) : money(data.median_terminal)}
                  hint={
                    useGoal
                      ? `${money(goal)} by year ${Math.min(goalYear, years)}`
                      : "today's dollars"
                  }
                />
                <Stat
                  label="Money lasts the whole plan"
                  value={pct(1 - data.probability_ruin, 0)}
                  hint={
                    retiring ? `spending ${money(withdrawal)} a year` : 'no withdrawals in the plan'
                  }
                />
                <Stat
                  label={`Safe spending (${pct(Number(confidence), 0)})`}
                  value={data.safe_withdrawal != null ? `${money(data.safe_withdrawal)}/yr` : '—'}
                  hint={
                    data.safe_withdrawal_rate != null
                      ? `${pct(data.safe_withdrawal_rate, 1)} of median wealth at retirement`
                      : 'needs a retirement phase'
                  }
                />
                <Stat
                  label="Median wealth at the end"
                  value={money(data.median_terminal)}
                  hint={`${portfolioLabel(portfolio)}, cash at ${pct(data.cash_rate, 1)}`}
                />
              </StatGrid>
              <WealthFan data={data} goal={useGoal ? goal : null} stale={query.stale} />
              {retiring && (
                <div className="grid gap-6 xl:grid-cols-2">
                  <LinesChart
                    title="Running out of money"
                    description="Share of simulated paths that have hit zero by each year."
                    guide={
                      <p>
                        The curve stays at zero while you are saving and rises once withdrawals
                        begin. Its value at the right edge is the plan's overall risk of ruin.
                      </p>
                    }
                    series={[
                      {
                        name: 'Ruined by this year',
                        color: c.series2,
                        points: data.years.map((y, i) => [y, data.ruin_by_year[i]]),
                      },
                    ]}
                    xName="Years from now"
                    yName="Share of paths"
                    xFormat={(v) => String(v)}
                    yFormat={(v) => pct(v, 0)}
                    stale={query.stale}
                    ariaLabel="Cumulative share of paths that ran out of money by year"
                  />
                  <WeightBars
                    title="Sequence-of-returns risk"
                    description="Success rate grouped by the portfolio's nominal return over the first five years of retirement, from the worst fifth to the best."
                    guide={
                      <>
                        <p>
                          Every group has the same long-run assumptions, yet the groups that start
                          retirement with poor returns fail far more often: withdrawals sell assets
                          while prices are low, and those shares are not there for the recovery.
                        </p>
                        <p>
                          This is why the years around retirement are the riskiest, and why glide
                          paths cut risk then.
                        </p>
                      </>
                    }
                    assets={data.sequence.map(
                      (s) =>
                        `${['Worst', '2nd', 'Middle', '4th', 'Best'][s.quintile - 1]} (${pct(s.early_return, 0)})`,
                    )}
                    series={[
                      {
                        name: 'Money lasts',
                        weights: Object.fromEntries(
                          data.sequence.map((s) => [
                            `${['Worst', '2nd', 'Middle', '4th', 'Best'][s.quintile - 1]} (${pct(s.early_return, 0)})`,
                            s.success ?? 0,
                          ]),
                        ),
                      },
                    ]}
                    format={(v) => pct(v, 0)}
                    stale={query.stale}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
