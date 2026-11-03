import { useMemo } from 'react'
import { ChartCard, LegendKey } from '@/components/charts/chart-card'
import { type ChartOption, EChart } from '@/components/charts/echart'
import {
  axisStyle,
  FONT_FAMILY,
  GRID,
  tooltipHeader,
  tooltipRow,
  tooltipStyle,
  useChartColors,
} from '@/components/charts/theme'
import type { DynamicResponse } from '@/lib/api'
import { fixed, longDate, monthYear } from '@/lib/format'

/** Which assets the timing signal held at each rebalance: a strip per asset. */
export function SignalStrip({
  data,
  assets,
  stale,
}: {
  data: DynamicResponse
  assets: string[]
  stale: boolean
}) {
  const c = useChartColors()
  const option = useMemo<ChartOption | null>(() => {
    const rows = assets.filter((a) => a in data.signal_on)
    if (!rows.length) return null
    const axis = axisStyle(c)
    const cells = rows.flatMap((a, i) =>
      data.signal_on[a].map((on, j) => [j, i, on ? 1 : 0] as [number, number, number]),
    )
    return {
      animation: false,
      grid: { left: 8, right: 8, top: 8, bottom: 24, containLabel: true },
      tooltip: {
        ...tooltipStyle(c),
        trigger: 'item',
        formatter: (raw: unknown) => {
          const [j, i, v] = (raw as { value: [number, number, number] }).value
          return (
            tooltipHeader(longDate(data.decision_dates[j])) +
            tooltipRow(v ? c.series1 : c.muted, v ? 'in' : 'out', rows[i])
          )
        },
      },
      xAxis: {
        type: 'category',
        data: data.decision_dates.map(monthYear),
        ...axis,
        splitLine: { show: false },
        axisLabel: { ...axis.axisLabel, hideOverlap: true },
      },
      yAxis: {
        type: 'category',
        data: rows,
        inverse: true,
        ...axis,
        splitLine: { show: false },
        axisLabel: { ...axis.axisLabel, interval: 0 },
      },
      visualMap: {
        show: false,
        type: 'piecewise',
        pieces: [
          { value: 1, color: c.series1 },
          { value: 0, color: c.grid },
        ],
      },
      series: [
        {
          type: 'heatmap',
          data: cells,
          itemStyle: { borderColor: c.surface, borderWidth: 1 },
        },
      ],
    }
  }, [data, assets, c])
  if (!option) return null
  return (
    <ChartCard
      title="When each asset was in"
      description="The timing signal at every rebalance: blue means the asset passed and was eligible to hold, grey means it was out."
      guide={
        <>
          <p>
            Long blue runs are trends the signal stayed with; short alternating stretches are
            whipsaws, where the signal flips in and out and pays trading costs each time.
          </p>
          <p>
            Columns that turn grey together are market-wide sell-offs, when a filter moves the
            portfolio toward cash.
          </p>
        </>
      }
      action={
        <div className="flex gap-4">
          <LegendKey color={c.series1} label="In" band />
          <LegendKey color={c.grid} label="Out" band />
        </div>
      }
      stale={stale}
    >
      <EChart
        option={option}
        className={assets.length > 8 ? 'h-96' : 'h-64'}
        ariaLabel="Strip of timing signal states per asset at each rebalance date"
      />
    </ChartCard>
  )
}

/** Active Sharpe of each neighbouring configuration, the chosen one highlighted. */
export function TrialsChart({ data, stale }: { data: DynamicResponse; stale: boolean }) {
  const c = useChartColors()
  const option = useMemo<ChartOption | null>(() => {
    if (!data.trials.length) return null
    const axis = axisStyle(c)
    return {
      animationDurationUpdate: 150,
      grid: { ...GRID, top: 8, right: 48 },
      tooltip: {
        ...tooltipStyle(c),
        axisPointer: { type: 'shadow' },
        formatter: (raw: unknown) => {
          const p = (raw as { dataIndex: number }[])[0]
          const t = data.trials[p.dataIndex]
          return (
            tooltipHeader(t.label + (t.chosen ? ' (chosen)' : '')) +
            tooltipRow(c.series1, fixed(t.active_sharpe, 2), 'Sharpe of the gap to the base') +
            tooltipRow(c.muted, fixed(t.sharpe, 2), 'Sharpe vs cash')
          )
        },
      },
      xAxis: {
        type: 'value',
        name: 'Active Sharpe vs the rebalanced base',
        nameLocation: 'middle',
        nameGap: 28,
        ...axis,
        axisLabel: { ...axis.axisLabel, formatter: (v: number) => fixed(v, 1) },
      },
      yAxis: {
        type: 'category',
        data: data.trials.map((t) => t.label),
        inverse: true,
        ...axis,
        splitLine: { show: false },
      },
      series: [
        {
          type: 'bar',
          barMaxWidth: 18,
          data: data.trials.map((t) => ({
            value: t.active_sharpe ?? 0,
            itemStyle: {
              color: t.chosen ? c.series1 : c.other,
              borderRadius: 4,
            },
          })),
          label: {
            show: true,
            position: 'right',
            formatter: (p: { value?: unknown }) => fixed(p.value as number, 2),
            color: c.ink2,
            fontSize: 11,
            fontFamily: FONT_FAMILY,
          },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: c.axis, width: 1, type: 'solid' as const },
            label: { show: false },
            data: [{ xAxis: 0 }],
          },
        },
      ],
    }
  }, [data, c])
  if (!option) return null
  return (
    <ChartCard
      title="Robustness: the neighbours you could have picked"
      description="The same strategy with its main window scaled from half to double (and one more or fewer holding for top-k). The chosen setting is blue."
      guide={
        <>
          <p>
            Each bar is the Sharpe ratio of the daily return gap to the base portfolio: above zero,
            the signals added return per unit of extra risk; below, holding the base did better.
          </p>
          <p>
            If only the chosen bar is good and its neighbours are not, the result is probably a
            lucky parameter rather than a real effect. The deflated probability above accounts for
            having tried all of them.
          </p>
        </>
      }
      action={
        <div className="flex gap-4">
          <LegendKey color={c.series1} label="Chosen" band />
          <LegendKey color={c.other} label="Neighbours" band />
        </div>
      }
      stale={stale}
    >
      <EChart
        option={option}
        className={data.trials.length > 8 ? 'h-96' : 'h-64'}
        ariaLabel="Bar chart of active Sharpe ratio for each neighbouring configuration"
      />
    </ChartCard>
  )
}
