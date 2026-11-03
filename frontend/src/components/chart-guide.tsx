import { ChevronDownIcon, LightbulbIcon } from 'lucide-react'
import { type ReactNode, useId, useState } from 'react'
import { cn } from '@/lib/utils'

/** "How to read this chart" (or table): an explanation for a card, revealed on demand. */
export function ChartGuide({
  noun = 'chart',
  children,
}: {
  noun?: 'chart' | 'table' | 'card'
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 self-start rounded text-muted-foreground text-xs outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <LightbulbIcon className="size-3.5" aria-hidden="true" />
        How to read this {noun}
        <ChevronDownIcon
          className={cn('size-3.5 transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div
          id={id}
          className="flex max-w-prose flex-col gap-2 rounded-lg border bg-muted/40 p-3 text-sm"
        >
          {children}
        </div>
      )}
    </div>
  )
}
