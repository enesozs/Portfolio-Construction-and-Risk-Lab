import { useMemo, useState } from 'react'
import { ChartGuide } from '@/components/chart-guide'
import { ChartCard, LegendKey } from '@/components/charts/chart-card'
import { type ChartOption, EChart } from '@/components/charts/echart'
import {
  axisStyle,
  GRID,
  tooltipHeader,
  tooltipRow,
  tooltipStyle,
  useChartColors,
} from '@/components/charts/theme'
import { PageHeader } from '@/components/page-header'
import { PanelSection } from '@/components/panel-section'
import { PortfolioSelect } from '@/components/portfolio-select'
import { QueryError } from '@/components/query-error'
import { Segmented } from '@/components/segmented'
import { Stat, StatGrid } from '@/components/stat-grid'
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useLab } from '@/features/universe/universe-context'
import { api, type BootstrapResponse, type PortfolioKey } from '@/lib/api'
import { pct } from '@/lib/format'
import { portfolioLabel } from '@/lib/portfolios'

const DRAWS = ['50', '150', '300', '500'] as const
const BLOCKS = ['5', '10', '21', '63'] as const

/** One row per asset: 5–95% whisker, 25–75% box, median tick, full-sample weight marker. */
function StabilityChart({ data, stale }: { data: BootstrapResponse; stale: boolean }) {
  const c = useChartColors()
  const option = useMemo<ChartOption>(() => {
    const axis = axisStyle(c)
    const rows = data.rows
    const assets = rows.map((r) => r.asset)
    const byAsset = new Map(rows.map((r) => [r.asset, r]))
    return {
      animationDurationUpdate: 150,
      grid: { ...GRID, top: 8 },
      tooltip: {
        ...tooltipStyle(c),
        axisPointer: { type: 'shadow' },
        formatter: (raw: unknown) => {
          const params = raw as { axisValue?: string; name?: string }[]
          const r = byAsset.get(params[0]?.axisValue ?? params[0]?.name ?? '')
          if (!r) return ''
          return (
            tooltipHeader(r.asset) +
            tooltipRow(c.series2, pct(r.full_sample, 1), 'Full sample') +
            tooltipRow(c.ink, pct(r.p50, 1), 'Median resample') +
            tooltipRow(c.series1, `${pct(r.p25, 1)} – ${pct(r.p75, 1)}`, 'Middle 50%') +
            tooltipRow(c.muted, `${pct(r.p05, 1)} – ${pct(r.p95, 1)}`, '5% to 95%')
          )
        },
      },
      xAxis: {
        type: 'value',
        min: 0,
        name: 'Weight in the re-optimised portfolio',
        nameLocation: 'middle',
        nameGap: 28,
        ...axis,
        axisLabel: { ...axis.axisLabel, formatter: (v: number) => pct(v, 0) },
      },
      yAxis: {
        type: 'category',
        data: assets,
        inverse: true,
        ...axis,
        splitLine: { show: false },
        axisLabel: { ...axis.axisLabel, interval: 0 },
      },
      series: [
        // Whiskers sit underneath the box; each asset is its own two-point line.
        ...rows.map((r) => ({
          name: `whisker-${r.asset}`,
          type: 'line' as const,
          data: [
            [r.p05, r.asset],
            [r.p95, r.asset],
          ],
          symbol: 'rect',
          symbolSize: [2, 10],
          showSymbol: true,
          lineStyle: { width: 2, color: c.muted },
          itemStyle: { color: c.muted },
          silent: true,
          z: 1,
          tooltip: { show: false },
        })),
        {
          name: 'base',
          type: 'bar' as const,
          stack: 'box',
          data: rows.map((r) => r.p25),
          itemStyle: { color: 'transparent' },
          barWidth: 18,
          silent: true,
          z: 2,
        },
        {
          name: 'Middle 50%',
          type: 'bar' as const,
          stack: 'box',
          data: rows.map((r) => Math.max(r.p75 - r.p25, 0)),
          itemStyle: {
            color: c.bandStrong,
            borderColor: c.series1,
            borderWidth: 2,
            borderRadius: 3,
          },
          barWidth: 18,
          z: 2,
        },
        {
          name: 'Median',
          type: 'scatter' as const,
          data: rows.map((r) => [r.p50, r.asset]),
          symbol: 'rect',
          symbolSize: [3, 22],
          itemStyle: { color: c.ink },
          z: 4,
        },
        {
          name: 'Full sample',
          type: 'scatter' as const,
          data: rows.map((r) => [r.full_sample, r.asset]),
          symbolSize: 11,
          itemStyle: { color: c.series2, borderColor: c.surface, borderWidth: 2 },
          z: 5,
        },
      ],
    }
  }, [data, c])
  const height = Math.max(240, data.rows.length * 44 + 56)
  return (
    <ChartCard
      title="How much each weight moves across resamples"
      description="For each asset: the line spans the middle 90% of re-optimised weights, the box the middle 50%, the dark tick the median. The orange dot is the weight from the actual history."
      guide={
        <>
          <p>
            Every resample is a plausible alternative history built from the same daily returns. If
            a small reshuffle of the past moves an asset from 0% to 40%, its optimised weight is
            mostly a reflection of noise in the estimates, not a stable feature of the asset.
          </p>
          <p>
            Narrow boxes close to the orange dot mean the allocation is robust. Wide ranges are a
            reason to prefer simpler or more constrained methods for this universe.
          </p>
        </>
      }
      action={
        <div className="flex max-w-md flex-wrap gap-x-4 gap-y-1">
          <LegendKey color={c.muted} label="5% to 95%" />
          <LegendKey color={c.series1} label="Middle 50%" band />
          <LegendKey color={c.ink} label="Median" />
          <LegendKey color={c.series2} label="Full sample" band />
        </div>
      }
      stale={stale}
    >
      <div style={{ height }}>
        <EChart
          option={option}
          className="h-full"
          ariaLabel="Range of bootstrapped weights for each asset, with the full-sample weight marked"
        />
      </div>
    </ChartCard>
  )
}

function StabilityTable({ data }: { data: BootstrapResponse }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base" render={<h2 />}>
          Weight distribution per asset
        </CardTitle>
        <CardDescription>
          Percentiles of each asset's weight across all resamples, next to the full-sample weight.
          Standard deviation summarises the spread in one number.
        </CardDescription>
        <ChartGuide noun="table">
          <p>
            Compare the full-sample weight with the median: if they differ a lot, the actual history
            happened to favour (or penalise) that asset more than a typical resample does. The 5–95%
            range is the span you should expect the weight to move within if the history had been
            slightly different.
          </p>
        </ChartGuide>
      </CardHeader>
      <CardPanel className="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Asset</TableHead>
              <TableHead className="text-right">Full sample</TableHead>
              <TableHead className="text-right">Mean</TableHead>
              <TableHead className="text-right">Median</TableHead>
              <TableHead className="text-right">5%</TableHead>
              <TableHead className="text-right">25%</TableHead>
              <TableHead className="text-right">75%</TableHead>
              <TableHead className="text-right">95%</TableHead>
              <TableHead className="text-right">Std dev</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.map((r) => (
              <TableRow key={r.asset}>
                <TableCell className="font-medium font-mono">
                  {r.asset}
                  {r.asset === data.least_stable && (
                    <span className="ms-2 font-sans text-muted-foreground text-xs">
                      (least stable)
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{pct(r.full_sample, 1)}</TableCell>
                <TableCell className="text-right tabular-nums">{pct(r.mean, 1)}</TableCell>
                <TableCell className="text-right tabular-nums">{pct(r.p50, 1)}</TableCell>
                <TableCell className="text-right text-muted-foreground tabular-nums">
                  {pct(r.p05, 1)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground tabular-nums">
                  {pct(r.p25, 1)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground tabular-nums">
                  {pct(r.p75, 1)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground tabular-nums">
                  {pct(r.p95, 1)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{pct(r.std, 1)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardPanel>
    </Card>
  )
}

export default function BootstrapPage() {
  const [method, setMethod] = useState<PortfolioKey>('max_sharpe')
  const [draws, setDraws] = useState<(typeof DRAWS)[number]>('150')
  const [sampling, setSampling] = useState<'iid' | 'block'>('block')
  const [block, setBlock] = useState<(typeof BLOCKS)[number]>('21')
  // Memoised so the debounced params keep their identity between renders.
  const params = useMemo(
    () => ({
      method,
      n_bootstrap: Number(draws),
      bootstrap_method: sampling,
      block_size: Number(block),
    }),
    [method, draws, sampling, block],
  )
  const query = useLab('bootstrap', api.bootstrap, params, { delay: 400 })
  const data = query.data
  const least = data?.rows.find((r) => r.asset === data.least_stable)

  return (
    <>
      <PageHeader title="Bootstrap weight stability">
        An optimiser treats its estimates as exact, but they come from one finite history. Here that
        history is resampled many times and the portfolio re-optimised on each copy. The spread of
        the resulting weights shows how much of the allocation is driven by noise.
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside>
          <Card className="overflow-hidden">
            <PanelSection
              title="Allocator"
              hint="Equal weight is left out: it uses no estimates, so it never changes."
            >
              <PortfolioSelect
                value={method}
                onChange={setMethod}
                label="Method"
                exclude={['equal_weight', 'resampled']}
              />
            </PanelSection>
            <Separator />
            <PanelSection
              title="Resampling"
              hint="More resamples give smoother percentiles but take longer."
            >
              <div className="flex flex-col gap-2">
                <span className="text-muted-foreground text-sm">Resamples</span>
                <Segmented
                  label="Number of resamples"
                  size="sm"
                  value={draws}
                  onChange={setDraws}
                  options={DRAWS.map((v) => ({ value: v, label: v }))}
                />
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-muted-foreground text-sm">Sampling</span>
                <Segmented
                  label="Sampling scheme"
                  value={sampling}
                  onChange={setSampling}
                  options={[
                    { value: 'block', label: 'Block' },
                    { value: 'iid', label: 'Day by day' },
                  ]}
                />
                <p className="text-muted-foreground text-xs">
                  Day by day draws single days at random, which breaks up calm and turbulent
                  stretches. Blocks draw runs of consecutive days, so volatility clustering and
                  short-term momentum survive in each resample.
                </p>
              </div>
              {sampling === 'block' && (
                <div className="flex flex-col gap-2">
                  <span className="text-muted-foreground text-sm">Block length (days)</span>
                  <Segmented
                    label="Block length"
                    size="sm"
                    value={block}
                    onChange={setBlock}
                    options={BLOCKS.map((v) => ({ value: v, label: v }))}
                  />
                </div>
              )}
            </PanelSection>
          </Card>
        </aside>
        <div className="flex min-w-0 flex-col gap-6">
          <QueryError error={query.error} title="Could not resample the allocation" />
          {query.isPending && !query.error && (
            <Card>
              <CardPanel className="flex items-center gap-3 py-10 text-muted-foreground text-sm">
                <Spinner className="size-4" />
                Resampling {draws} histories and re-optimising {portfolioLabel(method)} on each…
              </CardPanel>
            </Card>
          )}
          {data && least && (
            <>
              <StatGrid className="grid-cols-2 md:grid-cols-3">
                <Stat
                  label="Least stable weight"
                  value={least.asset}
                  hint={`std dev ${pct(least.std, 1)}; 5–95% ${pct(least.p05, 0)} to ${pct(least.p95, 0)}`}
                />
                <Stat
                  label="Average 5–95% range"
                  value={pct(data.average_range, 1)}
                  hint="mean width across assets"
                />
                <Stat
                  label="Resamples"
                  value={query.stale ? 'Resampling…' : draws}
                  hint={sampling === 'block' ? `blocks of ${block} days` : 'days drawn one by one'}
                />
              </StatGrid>
              <StabilityChart data={data} stale={query.stale} />
              <StabilityTable data={data} />
            </>
          )}
        </div>
      </div>
    </>
  )
}
