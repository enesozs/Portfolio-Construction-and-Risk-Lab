import { type ReactNode, useMemo } from 'react'
import { ChartCard, LegendKey } from '@/components/charts/chart-card'
import { type ChartOption, EChart } from '@/components/charts/echart'
import {
  assetColor,
  axisStyle,
  GRID,
  tooltipHeader,
  tooltipRow,
  tooltipStyle,
  useChartColors,
} from '@/components/charts/theme'
import type { TimeSeries } from '@/lib/api'
import { longDate, pct } from '@/lib/format'

const CASH = 'CASH'

interface WeightsAreaProps {
  title: string
  description: ReactNode
  guide?: ReactNode
  /** Universe order: fixes each asset's colour. */
  assets: string[]
  /** One series per asset (and optionally CASH), all on the same dates. */
  weights: Record<string, TimeSeries>
  /** Targets held until the next date (step) or holdings sampled over time (smooth). */
  step?: boolean
  /** Extend the last value to this date (the end of the final holding period). */
  until?: string
  tooltipLabel?: (date: string) => string
  stale: boolean
  className?: string
}

/** Stacked shares of capital over time; assets past the 8th fold into "Other", cash is grey. */
export function WeightsArea({
  title,
  description,
  guide,
  assets,
  weights,
  step = false,
  until,
  tooltipLabel = longDate,
  stale,
  className = 'h-80',
}: WeightsAreaProps) {
  const c = useChartColors()
  const segments = useMemo(() => {
    const known = assets.filter((a) => a in weights)
    const rest = known.slice(c.categorical.length)
    const out = known.slice(0, c.categorical.length).map((name) => ({
      name,
      color: assetColor(c, assets.indexOf(name)),
      members: [name],
    }))
    if (rest.length) out.push({ name: 'Other', color: c.other, members: rest })
    if (CASH in weights) out.push({ name: 'Cash', color: c.muted, members: [CASH] })
    return out
  }, [assets, weights, c])
  const option = useMemo<ChartOption | null>(() => {
    const first = segments[0] && weights[segments[0].members[0]]
    if (!first || first.dates.length === 0) return null
    const axis = axisStyle(c)
    const dates = first.dates
    const xs = until && until > dates[dates.length - 1] ? [...dates, until] : dates
    return {
      animationDurationUpdate: 150,
      grid: { ...GRID, top: 16 },
      tooltip: {
        ...tooltipStyle(c),
        formatter: (raw: unknown) => {
          const params = raw as { seriesName: string; color: string; value: [string, number] }[]
          if (!params.length) return ''
          return (
            tooltipHeader(tooltipLabel(params[0].value[0])) +
            [...params]
              .reverse()
              .filter((p) => Math.abs(p.value[1]) > 0.0005)
              .map((p) => tooltipRow(p.color, pct(p.value[1], 1), p.seriesName))
              .join('')
          )
        },
      },
      xAxis: {
        type: 'time',
        ...axis,
        splitLine: { show: false },
        axisLabel: { ...axis.axisLabel, hideOverlap: true },
      },
      yAxis: {
        type: 'value',
        min: (v: { min: number }) => Math.min(0, Math.floor(v.min * 10 + 1e-6) / 10),
        max: (v: { max: number }) => Math.max(1, Math.ceil(v.max * 10 - 1e-6) / 10),
        ...axis,
        axisLabel: { ...axis.axisLabel, formatter: (v: number) => pct(v, 0) },
      },
      series: segments.map((seg) => ({
        name: seg.name,
        type: 'line' as const,
        stack: 'weights',
        step: step ? ('end' as const) : false,
        showSymbol: false,
        sampling: 'lttb',
        data: xs.map((d, k) => {
          const i = Math.min(k, dates.length - 1)
          return [d, seg.members.reduce((s, a) => s + (weights[a]?.values[i] ?? 0), 0)]
        }),
        // The boundary line is drawn in the surface colour: a 2px gap between fills.
        lineStyle: { width: 2, color: c.surface },
        itemStyle: { color: seg.color },
        areaStyle: { color: seg.color, opacity: 1 },
        emphasis: { disabled: true },
      })),
    }
  }, [segments, weights, step, until, tooltipLabel, c])
  return (
    <ChartCard
      title={title}
      description={description}
      guide={guide}
      action={
        <div className="flex max-w-md flex-wrap gap-x-4 gap-y-1">
          {segments.map((s) => (
            <LegendKey key={s.name} color={s.color} label={s.name} band />
          ))}
        </div>
      }
      stale={stale}
    >
      {option ? (
        <EChart
          option={option}
          className={className}
          ariaLabel={`${title}: stacked shares of capital over time`}
        />
      ) : (
        <div className={className} />
      )}
    </ChartCard>
  )
}
