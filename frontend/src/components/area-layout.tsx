import { Suspense } from 'react'
import { Outlet } from 'react-router'
import { type AreaTab, AreaNav } from '@/components/area-nav'
import { PageFallback } from '@/components/page-fallback'

/** An area: its page tabs above the lazily loaded page. */
export function AreaLayout({ label, tabs }: { label: string; tabs: AreaTab[] }) {
  return (
    <>
      {tabs.length > 1 && <AreaNav label={label} tabs={tabs} />}
      <Suspense fallback={<PageFallback />}>
        <Outlet />
      </Suspense>
    </>
  )
}
