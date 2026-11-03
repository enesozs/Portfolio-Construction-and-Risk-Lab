import { NavLink } from 'react-router'
import {
  segmentedControlItemVariants,
  segmentedControlRootClassName,
} from '@/lib/segmented-control'

export interface AreaTab {
  to: string
  label: string
  /** Starts loading the page's code on hover/focus, so the click feels instant. */
  preload: () => Promise<unknown>
  /** Match the path exactly (the area's index page). */
  end: boolean
}

const tabClassName = segmentedControlItemVariants({ state: 'current' })

/** An area's page tabs. */
export function AreaNav({ label, tabs }: { label: string; tabs: AreaTab[] }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <nav
        aria-label={label}
        className={`${segmentedControlRootClassName} max-w-full overflow-x-auto`}
      >
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={tabClassName}
            onMouseEnter={() => void tab.preload()}
            onFocus={() => void tab.preload()}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
