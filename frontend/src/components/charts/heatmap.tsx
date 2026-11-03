import { type ReactNode, useMemo } from 'react'
import { ChartCard } from '@/components/charts/chart-card'
import { type ChartOption, EChart } from '@/components/charts/echart'
import { axisStyle, FONT_FAMILY, tooltipStyle, useChartColors } from '@/components/charts/theme'
import { fixed } from '@/lib/format'

interface HeatmapProps {
  title: string
  description: ReactNode
  guide?: ReactNode
  labels: string[]
  /** Square matrix in [-1, 1] (correlations). */
  matrix: number[][]
  stale: boolean
}

/** Diverging red ↔ grey ↔ blue matrix with the value printed in each cell. */
export function CorrelationHeatmap({
  title,
  description,
  guide,
  labels,
  matrix,
  stale,
}: HeatmapProps) {
  const c = useChartColors()
  const option = useMemo<ChartOption | null>(() => {
    if (!labels.length) return null
    const axis = axisStyle(c)
    const data = matrix.flatMap((row, i) => row.map((v, j) => [j, i, v]))
    return {
      animation: false,
      grid: { left: 8, right: 8, top: 8, bottom: 8, containLabel: true },
      tooltip: {
        ...tooltipStyle(c),
        trigger: 'item',
        formatter: (raw: unknown) => {
          const [j, i, v] = (raw as { value: [number, number, number] }).value
          return `<b>${fixed(v, 2)}</b> &nbsp;${labels[i]} / ${labels[j]}`
        },
      },
      xAxis: {
        type: 'category',
        data: labels,
        ...axis,
        splitLine: { show: false },
        axisLabel: { ...axis.axisLabel, interval: 0, rotate: labels.length > 8 ? 45 : 0 },
      },
      yAxis: {
        type: 'category',
        data: labels,
        inverse: true,
        ...axis,
        splitLine: { show: false },
        axisLabel: { ...axis.axisLabel, interval: 0 },
      },
      visualMap: {
        show: false,
        min: -1,
        max: 1,
        inRange: { color: [...c.diverging] },
      },
      series: [
        {
          type: 'heatmap',
          data,
          itemStyle: { borderColor: c.surface, borderWidth: 2, borderRadius: 4 },
          label: {
            show: labels.length <= 12,
            formatter: (p: { value?: unknown }) => fixed((p.value as number[])[2], 2),
            fontSize: 11,
            fontFamily: FONT_FAMILY,
            color: c.ink,
          },
        },
      ],
    }
  }, [labels, matrix, c])
  return (
    <ChartCard title={title} description={description} guide={guide} stale={stale}>
      {option ? (
        <EChart option={option} className="h-96" ariaLabel={`${title} matrix`} />
      ) : (
        <div className="h-96" />
      )}
    </ChartCard>
  )
}
