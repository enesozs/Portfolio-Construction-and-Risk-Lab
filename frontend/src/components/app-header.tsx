import { useQuery } from '@tanstack/react-query'
import { MoonIcon, SunIcon } from 'lucide-react'
import { NavLink } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  segmentedControlItemVariants,
  segmentedControlRootClassName,
} from '@/lib/segmented-control'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { AREAS } from '@/areas'

// One section per research area (roadmap in AGENTS.md).
const SECTIONS = [
  ...AREAS.map((a) => ({ label: a.label, to: `/${a.path}` })),
  { label: 'Learn', to: '/learn' },
]

function ApiStatus() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const response = await fetch('/api/health')
      if (!response.ok) throw new Error('unhealthy')
      return true
    },
    refetchInterval: 15_000,
    retry: false,
  })
  const online = health.isSuccess
  return (
    <span className="hidden items-center gap-1.5 text-muted-foreground text-xs sm:inline-flex">
      <span
        aria-hidden="true"
        className={cn(
          'size-2 rounded-full',
          online ? 'bg-success' : health.isPending ? 'bg-muted-foreground' : 'bg-destructive',
        )}
      />
      {online ? 'API connected' : health.isPending ? 'Connecting…' : 'API offline'}
    </span>
  )
}

export function AppHeader() {
  const { theme, toggle } = useTheme()
  const item = segmentedControlItemVariants({ size: 'sm', state: 'current' })

  return (
    <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-6 px-4 sm:px-6">
        <NavLink to="/universe" className="flex items-center gap-2.5">
          <Logo />
          <span className="font-semibold text-sm tracking-tight">Portfolio Lab</span>
        </NavLink>
        <nav aria-label="Sections" className={cn(segmentedControlRootClassName, 'hidden md:flex')}>
          {SECTIONS.map((s) => (
            <NavLink key={s.label} to={s.to} className={item}>
              {s.label}
            </NavLink>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-3">
          <ApiStatus />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </Button>
        </div>
      </div>
    </header>
  )
}

function Logo() {
  // Three stacked allocation segments.
  return (
    <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
      <svg viewBox="0 0 16 16" className="size-4" fill="currentColor" aria-hidden="true">
        <rect x="2" y="9" width="3" height="5" rx="1" />
        <rect x="6.5" y="5" width="3" height="9" rx="1" opacity=".8" />
        <rect x="11" y="2" width="3" height="12" rx="1" opacity=".6" />
      </svg>
    </span>
  )
}
