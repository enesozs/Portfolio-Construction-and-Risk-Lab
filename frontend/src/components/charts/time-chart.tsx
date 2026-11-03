import { type ReactNode, useMemo } from 'react'
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
import type { TimeSeries } from '@/lib/api'
import { longDate } from '@/lib/format'

export interface TimeLine {
  name: string
  color: string
  data: TimeSeries
  dashed?: boolean
  /** Shade between the line and zero (drawdowns). */
  area?: boolean
}

interface TimeChartProps {
  title: string
  description: ReactNode
  guide?: ReactNode
  lines: TimeLine[]
  yName: string
  yFormat: (y: number) => string
  /** Log scale (growth of 1 over long periods), used only when values span more than 10×. */
  logY?: boolean
  /** Horizontal guide, e.g. 1.0 on a growth chart or 0 on returns. */
  baseline?: number
  stale: boolean
  ariaLabel: string
  className?: string
  action?: ReactNode
}

/** Lines over calendar dates with a crosshair tooltip; a legend appears for 2+ lines. */
export function TimeChart({
  title,
  description,
  guide,
  lines,
  yName,
  yFormat,
  logY = false,
  baseline,
  stale,
  ariaLabel,
  className,
  action,
}: TimeChartProps) {
  const c = useChartColors()
  const option = useMemo<ChartOption | null>(() => {
    if (lines.every((l) => l.data.dates.length === 0)) return null
    const axis = axisStyle(c)
    // A log axis snaps to powers of ten, which flattens anything spanning less than 10×.
    const values = lines.flatMap((l) => l.data.values).filter((v) => v > 0)
    const useLog = logY && values.length > 0 && Math.max(...values) / Math.min(...values) > 10
    return {
      animationDurationUpdate: 150,
      grid: GRID,
      tooltip: {
        ...tooltipStyle(c),
        formatter: (raw: unknown) => {
          const params = raw as { seriesName: string; color: string; value: [string, number] }[]
          if (!params.length) return ''
          return (
            tooltipHeader(longDate(params[0].value[0])) +
            params.map((p) => tooltipRow(p.color, yFormat(p.value[1]), p.seriesName)).join('')
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
        type: useLog ? 'log' : 'value',
        name: yName,
        scale: true,
        // Bound a log axis by the data; by default it snaps out to whole powers of ten.
        ...(useLog && {
          min: Math.min(...values) * 0.95,
          max: Math.max(...values) * 1.05,
        }),
        ...axis,
        axisLabel: { ...axis.axisLabel, formatter: (v: number) => yFormat(v) },
      },
      series: lines.map((l, i) => ({
        name: l.name,
        type: 'line' as const,
        data: l.data.dates.map((d, k) => [d, l.data.values[k]]),
        showSymbol: false,
        sampling: 'lttb',
        lineStyle: {
          width: 2,
          color: l.color,
          type: l.dashed ? ('dashed' as const) : ('solid' as const),
        },
        itemStyle: { color: l.color },
        areaStyle: l.area ? { color: l.color, opacity: 0.14 } : undefined,
        markLine:
          i === 0 && baseline != null
            ? {
                silent: true,
                symbol: 'none',
                lineStyle: { color: c.axis, type: 'solid' as const, width: 1 },
                label: { show: false },
                data: [{ yAxis: baseline }],
              }
            : undefined,
      })),
    }
  }, [lines, yName, yFormat, logY, baseline, c])
  return (
    <ChartCard
      title={title}
      description={description}
      guide={guide}
      action={
        action ??
        (lines.length > 1 ? (
          <div className="flex flex-wrap gap-4">
            {lines.map((l) => (
              <LegendKey key={l.name} color={l.color} label={l.name} />
            ))}
          </div>
        ) : undefined)
      }
      stale={stale}
    >
      {option ? (
        <EChart option={option} className={className} ariaLabel={ariaLabel} />
      ) : (
        <div className={className ?? 'h-72'} />
      )}
    </ChartCard>
  )
}
