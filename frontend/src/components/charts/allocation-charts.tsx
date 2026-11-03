import { type ReactNode, useMemo } from 'react'
import { ChartCard, LegendKey } from '@/components/charts/chart-card'
import { type ChartOption, EChart } from '@/components/charts/echart'
import {
  assetColor,
  axisStyle,
  type ChartColors,
  GRID,
  tooltipHeader,
  tooltipRow,
  tooltipStyle,
  useChartColors,
} from '@/components/charts/theme'
import type { Weights } from '@/lib/api'
import { pct } from '@/lib/format'

/** Colours for up to four compared allocations. */
function comparisonColors(c: ChartColors): string[] {
  return [c.series1, c.series2, c.series3, c.categorical[3]]
}

/** Stack segments: the first eight assets by name, the rest folded into "Other". */
function stackSegments(c: ChartColors, assets: string[]) {
  const rest = assets.slice(c.categorical.length)
  const names = [...assets.slice(0, c.categorical.length), ...(rest.length ? ['Other'] : [])]
  return names.map((name) => ({
    name,
    color: name === 'Other' ? c.other : assetColor(c, assets.indexOf(name)),
    members: name === 'Other' ? rest : [name],
  }))
}

interface WeightBarsProps {
  title: string
  description: ReactNode
  guide?: ReactNode
  assets: string[]
  /** Up to four allocations compared side by side (one bar per asset each). */
  series: { name: string; weights: Weights }[]
  stale: boolean
  /** Format for values (default: percentage of capital). */
  format?: (v: number) => string
  className?: string
}

/** Grouped bars: assets along the axis, one bar per allocation. Handles short weights. */
export function WeightBars({
  title,
  description,
  guide,
  assets,
  series,
  stale,
  format = (v) => pct(v, 1),
  className,
}: WeightBarsProps) {
  const c = useChartColors()
  const colors = comparisonColors(c)
  const option = useMemo<ChartOption | null>(() => {
    if (!series.length || !assets.length) return null
    const axis = axisStyle(c)
    const palette = comparisonColors(c)
    return {
      animationDurationUpdate: 150,
      grid: { ...GRID, top: 16 },
      tooltip: {
        ...tooltipStyle(c),
        axisPointer: { type: 'shadow' },
        formatter: (raw: unknown) => {
          const params = raw as { name: string; seriesName: string; color: string; value: number }[]
          if (!params.length) return ''
          return (
            tooltipHeader(params[0].name) +
            params.map((p) => tooltipRow(p.color, format(p.value), p.seriesName)).join('')
          )
        },
      },
      xAxis: {
        type: 'category',
        data: assets,
        ...axis,
        splitLine: { show: false },
        axisLabel: { ...axis.axisLabel, interval: 0, hideOverlap: true },
      },
      yAxis: {
        type: 'value',
        ...axis,
        axisLabel: { ...axis.axisLabel, formatter: (v: number) => format(v) },
      },
      series: series.map((s, i) => ({
        name: s.name,
        type: 'bar' as const,
        data: assets.map((a) => s.weights[a] ?? 0),
        barGap: '12%',
        barMaxWidth: 28,
        itemStyle: { color: palette[i % palette.length], borderRadius: 4 },
      })),
    }
  }, [assets, series, format, c])
  return (
    <ChartCard
      title={title}
      description={description}
      guide={guide}
      action={
        series.length > 1 ? (
          <div className="flex flex-wrap gap-4">
            {series.map((s, i) => (
              <LegendKey key={s.name} color={colors[i % colors.length]} label={s.name} band />
            ))}
          </div>
        ) : undefined
      }
      stale={stale}
    >
      {option ? (
        <EChart
          option={option}
          className={className}
          ariaLabel={`${title}: weights per asset for ${series.map((s) => s.name).join(', ')}`}
        />
      ) : (
        <div className={className ?? 'h-72'} />
      )}
    </ChartCard>
  )
}

interface AllocationStackProps {
  title: string
  description: ReactNode
  guide?: ReactNode
  /** Universe order: fixes each asset's colour. */
  assets: string[]
  rows: { name: string; weights: Weights }[]
  stale: boolean
}

/** One bar per portfolio, a segment per asset. Assets past the 8th fold into "Other".
 * Short positions stack to the left of 0% (ECharts stacks each sign separately), so a
 * long-short bar spans from −short to +long and its total length is the gross exposure. */
export function AllocationStack({
  title,
  description,
  guide,
  assets,
  rows,
  stale,
}: AllocationStackProps) {
  const c = useChartColors()
  const legend = stackSegments(c, assets)
  const option = useMemo<ChartOption | null>(() => {
    if (!rows.length) return null
    const axis = axisStyle(c)
    const value = (w: Weights, members: string[]) =>
      members.reduce((sum, a) => sum + (w[a] ?? 0), 0)
    return {
      animationDurationUpdate: 150,
      grid: { ...GRID, top: 8, bottom: 8 },
      tooltip: {
        ...tooltipStyle(c),
        axisPointer: { type: 'shadow' },
        formatter: (raw: unknown) => {
          const params = raw as { name: string; seriesName: string; color: string; value: number }[]
          if (!params.length) return ''
          return (
            tooltipHeader(params[0].name) +
            params
              .filter((p) => Math.abs(p.value) > 0.0005)
              .map((p) => tooltipRow(p.color, pct(p.value, 1), p.seriesName))
              .join('')
          )
        },
      },
      xAxis: {
        type: 'value',
        // 0–100% for long-only books; wider when shorts or leverage need the room.
        min: (v: { min: number }) => Math.min(0, Math.floor(v.min * 10 + 1e-6) / 10),
        max: (v: { max: number }) => Math.max(1, Math.ceil(v.max * 10 - 1e-6) / 10),
        ...axis,
        axisLabel: { ...axis.axisLabel, formatter: (v: number) => pct(v, 0) },
      },
      yAxis: {
        type: 'category',
        data: rows.map((r) => r.name),
        inverse: true,
        ...axis,
        splitLine: { show: false },
      },
      series: stackSegments(c, assets).map((seg) => ({
        name: seg.name,
        type: 'bar' as const,
        stack: 'weights',
        barMaxWidth: 26,
        data: rows.map((r) => value(r.weights, seg.members)),
        // A 2px surface gap separates neighbouring segments.
        itemStyle: { color: seg.color, borderColor: c.surface, borderWidth: 2 },
      })),
    }
  }, [rows, assets, c])
  return (
    <ChartCard
      title={title}
      description={description}
      guide={guide}
      action={
        <div className="flex max-w-md flex-wrap gap-x-4 gap-y-1">
          {legend.map((s) => (
            <LegendKey key={s.name} color={s.color} label={s.name} band />
          ))}
        </div>
      }
      stale={stale}
    >
      {option ? (
        <EChart
          option={option}
          className="h-80"
          ariaLabel={`${title}: capital weights of each asset in each portfolio`}
        />
      ) : (
        <div className="h-80" />
      )}
    </ChartCard>
  )
}
