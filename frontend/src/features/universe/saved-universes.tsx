import { XIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { UniverseIn } from '@/lib/api'

const KEY = 'portlab-saved-universes'

interface Saved {
  name: string
  universe: UniverseIn
}

function read(): Saved[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Saved[]) : []
  } catch {
    return []
  }
}

function write(list: Saved[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // Saving is a convenience; storage may be unavailable (private mode).
  }
}

/** Named universes (tickers, dates, estimators, constraints), kept in this browser. */
export function SavedUniverses({
  current,
  onLoad,
}: {
  current: UniverseIn
  onLoad: (universe: UniverseIn) => void
}) {
  const [list, setList] = useState<Saved[]>(read)
  const [name, setName] = useState('')
  const update = (next: Saved[]) => {
    setList(next)
    write(next)
  }
  const save = () => {
    const label = name.trim()
    if (!label) return
    update([...list.filter((s) => s.name !== label), { name: label, universe: current }])
    setName('')
  }
  return (
    <div className="flex flex-col gap-2">
      <span className="text-muted-foreground text-xs">Saved in this browser</span>
      {list.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {list.map((s) => (
            <span key={s.name} className="inline-flex items-center">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-e-none"
                title={s.universe.tickers.join(', ')}
                onClick={() => onLoad(s.universe)}
              >
                {s.name}
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                className="-ms-px rounded-s-none"
                aria-label={`Delete ${s.name}`}
                onClick={() => update(list.filter((x) => x.name !== s.name))}
              >
                <XIcon />
              </Button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          size="sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              save()
            }
          }}
          placeholder="Name this setup to save it"
          aria-label="Name for the saved universe"
        />
        <Button type="button" size="sm" variant="secondary" onClick={save} disabled={!name.trim()}>
          Save
        </Button>
      </div>
    </div>
  )
}
