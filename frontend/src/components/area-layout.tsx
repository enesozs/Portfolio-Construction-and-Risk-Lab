import { Suspense } from 'react'
import { Outlet } from 'react-router'
import { type AreaTab, AreaNav } from '@/components/area-nav'
import { PageFallback } from '@/components/page-fallback'

/** An area: its page tabs above the lazily loaded page. */
export function AreaLayout({
  label,
  tabs,
  chapter,
}: {
  label: string
  tabs: AreaTab[]
  chapter?: string
}) {
  return (
    <>
      <AreaNav label={label} tabs={tabs} chapter={chapter} />
      <Suspense fallback={<PageFallback />}>
        <Outlet />
      </Suspense>
    </>
  )
}
