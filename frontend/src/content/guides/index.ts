import { ATTRIBUTION } from './attribution'
import { CONSTRUCT } from './construct'
import { DYNAMIC } from './dynamic'
import { PLAN } from './plan'
import { REPORT } from './report'
import { RISK } from './risk'
import { UNIVERSE } from './universe'
import { VALIDATE } from './validate'
import { type PageGuide, type RegionGuide, regionMatches, SPECIAL_REGIONS } from './types'

export type { PageGuide, RegionGuide }
export { regionMatches, SPECIAL_REGIONS }

export const PAGE_GUIDES: PageGuide[] = [
  ...UNIVERSE,
  ...CONSTRUCT,
  ...DYNAMIC,
  ...RISK,
  ...VALIDATE,
  ...ATTRIBUTION,
  ...REPORT,
  ...PLAN,
]

export function guideForPath(path: string): PageGuide | undefined {
  const clean = path.replace(/\/+$/, '') || '/'
  return PAGE_GUIDES.find((g) => g.path === clean)
}

/** Learn chapter for each area (guide ids start with the area's path). */
export const CHAPTER_BY_AREA: Record<string, string> = {
  universe: '01-universe',
  construct: '02-construction',
  dynamic: '03-dynamic',
  risk: '04-risk',
  validate: '05-validation',
  attribution: '06-attribution',
  report: '06-attribution',
  plan: '07-planning',
}

export function chapterForGuide(id: string): string | undefined {
  const area = Object.keys(CHAPTER_BY_AREA).find((a) => id.startsWith(`${a}-`))
  return area ? CHAPTER_BY_AREA[area] : undefined
}

export function guidesForChapter(chapterId: string): PageGuide[] {
  return PAGE_GUIDES.filter((g) => chapterForGuide(g.id) === chapterId)
}
