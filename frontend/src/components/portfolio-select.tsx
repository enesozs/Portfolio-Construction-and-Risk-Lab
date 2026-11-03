import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { PortfolioKey } from '@/lib/api'
import { PORTFOLIOS } from '@/lib/portfolios'

/** Pick one of the standard portfolios built from the shared universe. */
export function PortfolioSelect({
  value,
  onChange,
  label = 'Portfolio',
  exclude = [],
}: {
  value: PortfolioKey
  onChange: (value: PortfolioKey) => void
  label?: string
  exclude?: PortfolioKey[]
}) {
  const items = PORTFOLIOS.filter((p) => !exclude.includes(p.value))
  return (
    <div className="flex flex-col gap-2">
      <span className="text-muted-foreground text-sm">{label}</span>
      <Select items={items} value={value} onValueChange={(v) => v && onChange(v as PortfolioKey)}>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectPopup>
          {items.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
      <p className="text-muted-foreground text-xs">
        {PORTFOLIOS.find((p) => p.value === value)?.idea}
      </p>
    </div>
  )
}
