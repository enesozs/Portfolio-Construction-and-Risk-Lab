import { useId } from 'react'
import { NumberInput } from '@/components/number-input'
import { Segmented } from '@/components/segmented'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { type ConstraintsIn, DEFAULT_CONSTRAINTS } from './universe-context'

/** Optional limit: a switch that reveals one number input. */
function Limit({
  label,
  hint,
  value,
  onChange,
  fallback,
  ...input
}: {
  label: string
  hint: string
  value: number | null | undefined
  onChange: (value: number | null) => void
  fallback: number
  min: number
  max: number
  step?: number
  digits?: number
  unit?: string
  scale?: number
}) {
  const id = useId()
  const scale = input.scale ?? 1
  return (
    <div className="flex flex-col gap-2.5">
      <Label htmlFor={id} className="justify-between">
        {label}
        <Switch
          id={id}
          aria-label={label}
          checked={value != null}
          onCheckedChange={(on) => onChange(on ? fallback : null)}
        />
      </Label>
      {value != null ? (
        <NumberInput
          label={label}
          hideLabel
          value={value * scale}
          onChange={(v) => onChange(v / scale)}
          min={input.min}
          max={input.max}
          step={input.step}
          digits={input.digits}
          unit={input.unit}
        />
      ) : (
        <p className="text-muted-foreground text-xs">{hint}</p>
      )}
    </div>
  )
}

/** Portfolio rules applied by every constraint-aware allocator on every page. */
export function ConstraintsEditor({
  value,
  onChange,
}: {
  value: ConstraintsIn
  onChange: (next: ConstraintsIn) => void
}) {
  const c = { ...DEFAULT_CONSTRAINTS, ...value }
  const set = <K extends keyof ConstraintsIn>(key: K, v: ConstraintsIn[K]) =>
    onChange({ ...c, [key]: v })
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="font-medium text-sm">Constraints</span>
        <p className="text-muted-foreground text-xs">
          Enforced exactly by the optimising methods. Equal weight, HRP, HERC and NCO are long-only
          by construction and ignore these; the pages flag them.
        </p>
      </div>
      <Segmented
        label="Position direction"
        value={c.long_short ? 'long_short' : 'long_only'}
        onChange={(v) => set('long_short', v === 'long_short')}
        options={[
          { value: 'long_only', label: 'Long only' },
          { value: 'long_short', label: 'Long-short' },
        ]}
        className="w-full"
      />
      {c.long_short && (
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberInput
            label="Largest short per asset"
            value={c.max_short * 100}
            onChange={(v) => set('max_short', v / 100)}
            min={0}
            max={100}
            unit="%"
          />
          <NumberInput
            label="Gross exposure cap"
            value={c.gross_leverage}
            onChange={(v) => set('gross_leverage', v)}
            min={1}
            max={4}
            step={0.1}
            digits={1}
            unit="×"
          />
          <p className="text-muted-foreground text-xs sm:col-span-2">
            Gross exposure is Σ|weights|: 1.6× allows 130% long and 30% short (a 130/30 fund).
            Shorting lets the optimiser bet against assets, which it will do on noise too.
          </p>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Limit
          label="Group cap"
          hint="Off: no limit per sector or asset class."
          value={c.group_cap}
          onChange={(v) => set('group_cap', v)}
          fallback={0.4}
          scale={100}
          min={1}
          max={100}
          unit="%"
        />
        <Limit
          label="Max holdings"
          hint="Off: any number of assets may be held."
          value={c.max_holdings}
          onChange={(v) => set('max_holdings', v == null ? null : Math.round(v))}
          fallback={4}
          min={1}
          max={25}
        />
        <Limit
          label="Tracking error"
          hint="Off: no leash to equal weight."
          value={c.max_tracking_error}
          onChange={(v) => set('max_tracking_error', v)}
          fallback={0.04}
          scale={100}
          min={0.5}
          max={50}
          step={0.5}
          digits={1}
          unit="%"
        />
      </div>
      <p className="text-muted-foreground text-xs">
        Groups are Yahoo's sector for stocks and fund category for ETFs. Tracking error is the
        annual volatility of the return gap to an equal-weight portfolio of the same assets. Max
        holdings solves once, keeps the largest positions and solves again on those.
      </p>
    </div>
  )
}
