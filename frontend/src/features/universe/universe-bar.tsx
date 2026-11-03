import { AlertTriangleIcon, PencilIcon } from 'lucide-react'
import { type FormEvent, useId, useState } from 'react'
import { NumberInput } from '@/components/number-input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import type { UniverseIn } from '@/lib/api'
import { longDate, pct } from '@/lib/format'
import { ConstraintsEditor } from './constraints-editor'
import {
  constraintsSummary,
  DEFAULT_CONSTRAINTS,
  PRESETS,
  useOverview,
  useUniverse,
} from './universe-context'

const TODAY = new Date().toISOString().slice(0, 10)

const RETURN_METHODS = [
  { value: 'arithmetic', label: 'Arithmetic mean' },
  { value: 'geometric', label: 'Geometric mean' },
  { value: 'ewma', label: 'EWMA (recent-weighted)' },
] as const

const COV_METHODS = [
  { value: 'ledoit_wolf', label: 'Ledoit–Wolf shrinkage' },
  { value: 'sample', label: 'Sample' },
  { value: 'ewma', label: 'EWMA (recent-weighted)' },
] as const

function parseTickers(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\s,;]+/)
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean),
    ),
  ]
}

/** Shared universe summary under the header, with the editor dialog. */
export function UniverseBar() {
  const { universe } = useUniverse()
  const overview = useOverview()
  const meta = overview.data?.meta
  const covLabel = COV_METHODS.find((m) => m.value === universe.cov_method)?.label

  return (
    <div className="border-b bg-muted/30">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 text-sm sm:px-6">
        <div className="flex flex-wrap items-center gap-1.5">
          {universe.tickers.map((t) => (
            <Badge key={t} variant="outline" className="font-mono">
              {t}
            </Badge>
          ))}
        </div>
        <span className="text-muted-foreground text-xs">
          {meta ? (
            <>
              {longDate(meta.start)} → {longDate(meta.end)} · {meta.observations} days · cash{' '}
              {pct(meta.risk_free, 2)}
              {universe.risk_free == null ? ' (T-bills)' : ' (manual)'} · {covLabel}
              {universe.max_weight != null && ` · cap ${pct(universe.max_weight, 0)}`}
              {constraintsSummary(universe.constraints) &&
                ` · ${constraintsSummary(universe.constraints)}`}
            </>
          ) : overview.isError ? (
            <span className="text-destructive-foreground">{overview.error.message}</span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Spinner className="size-3" /> Loading prices…
            </span>
          )}
        </span>
        {meta && meta.limiting.length > 0 && (
          <span className="inline-flex items-center gap-1.5 text-warning-foreground text-xs">
            <AlertTriangleIcon className="size-3.5" aria-hidden="true" />
            Sample starts {longDate(meta.start)}, not {longDate(meta.requested_start)}:{' '}
            {meta.limiting.map((t) => `${t} listed ${longDate(meta.inception[t])}`).join(', ')}
          </span>
        )}
        {meta && meta.stale.length > 0 && (
          <span className="inline-flex items-center gap-1.5 text-warning-foreground text-xs">
            <AlertTriangleIcon className="size-3.5" aria-hidden="true" />
            Live data unavailable for {meta.stale.join(', ')}: using a saved copy
          </span>
        )}
        <div className="ms-auto">
          <UniverseEditor />
        </div>
      </div>
    </div>
  )
}

function UniverseEditor() {
  const { universe, setUniverse } = useUniverse()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(universe)
  const [tickerText, setTickerText] = useState(universe.tickers.join(', '))
  const ids = { tickers: useId(), start: useId(), cap: useId(), cash: useId() }
  const tickers = parseTickers(tickerText)
  const capFloor = Math.ceil(100 / Math.max(tickers.length, 1))
  const capPct = draft.max_weight == null ? null : Math.round(draft.max_weight * 100)
  const error =
    tickers.length < 2
      ? 'Enter at least two tickers.'
      : tickers.length > 25
        ? 'At most 25 tickers.'
        : capPct != null && capPct < capFloor
          ? `A ${capPct}% cap cannot add up to 100% across ${tickers.length} assets; use at least ${capFloor}%.`
          : null

  const reset = (next: boolean) => {
    if (next) {
      setDraft(universe)
      setTickerText(universe.tickers.join(', '))
    }
    setOpen(next)
  }
  const set = <K extends keyof UniverseIn>(key: K, value: UniverseIn[K]) =>
    setDraft({ ...draft, [key]: value })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (error) return
    setUniverse({ ...draft, tickers })
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <PencilIcon aria-hidden="true" />
        Edit universe
      </DialogTrigger>
      <DialogPopup className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Research universe</DialogTitle>
          <DialogDescription>
            Every page analyses these assets over the same sample with the same estimators.
          </DialogDescription>
        </DialogHeader>
        <form className="contents" onSubmit={submit}>
          <DialogPanel className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <span className="text-muted-foreground text-xs">Presets</span>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <Button
                    key={p.id}
                    type="button"
                    size="sm"
                    variant="secondary"
                    title={p.description}
                    onClick={() => setTickerText(p.tickers.join(', '))}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={ids.tickers}>Tickers</Label>
              <Input
                id={ids.tickers}
                value={tickerText}
                onChange={(e) => setTickerText(e.target.value)}
                placeholder="AAPL, MSFT, TLT"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-muted-foreground text-xs">
                Yahoo Finance symbols, separated by commas or spaces. The sample starts when the
                youngest asset began trading.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor={ids.start}>Start date</Label>
                <Input
                  id={ids.start}
                  type="date"
                  value={draft.start}
                  max={TODAY}
                  onChange={(e) => e.target.value && set('start', e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <span className="font-medium text-sm">Expected returns</span>
                <Select
                  items={RETURN_METHODS}
                  value={draft.return_method}
                  onValueChange={(v) => v && set('return_method', v)}
                >
                  <SelectTrigger aria-label="Expected-return estimator">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    {RETURN_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </div>
              <div className="flex flex-col gap-2 sm:col-start-2">
                <span className="font-medium text-sm">Covariance</span>
                <Select
                  items={COV_METHODS}
                  value={draft.cov_method}
                  onValueChange={(v) => v && set('cov_method', v)}
                >
                  <SelectTrigger aria-label="Covariance estimator">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    {COV_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2.5">
                <Label htmlFor={ids.cap} className="justify-between">
                  Cap single-asset weight
                  <Switch
                    id={ids.cap}
                    checked={draft.max_weight != null}
                    onCheckedChange={(on) =>
                      set('max_weight', on ? Math.max(capFloor, 40) / 100 : null)
                    }
                  />
                </Label>
                {capPct != null && (
                  <NumberInput
                    label="Maximum weight"
                    value={capPct}
                    onChange={(v) => set('max_weight', v / 100)}
                    min={1}
                    max={100}
                    unit="%"
                  />
                )}
              </div>
              <div className="flex flex-col gap-2.5">
                <Label htmlFor={ids.cash} className="justify-between">
                  Manual cash rate
                  <Switch
                    id={ids.cash}
                    checked={draft.risk_free != null}
                    onCheckedChange={(on) => set('risk_free', on ? 0.03 : null)}
                  />
                </Label>
                {draft.risk_free != null ? (
                  <NumberInput
                    label="Annual cash rate"
                    value={draft.risk_free * 100}
                    onChange={(v) => set('risk_free', v / 100)}
                    min={-5}
                    max={25}
                    step={0.25}
                    digits={2}
                    unit="%"
                  />
                ) : (
                  <p className="text-muted-foreground text-xs">
                    Off: cash earns the 13-week Treasury bill yield day by day, and Sharpe ratios
                    are measured against it.
                  </p>
                )}
              </div>
            </div>
            <ConstraintsEditor
              value={draft.constraints ?? DEFAULT_CONSTRAINTS}
              onChange={(next) => set('constraints', next)}
            />
            {error && (
              <p role="alert" className="text-destructive-foreground text-sm">
                {error}
              </p>
            )}
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="ghost" />}>Cancel</DialogClose>
            <Button type="submit" disabled={error != null}>
              Apply
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  )
}
