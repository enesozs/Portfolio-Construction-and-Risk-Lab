/** Page guides: how to use and read each page of the lab, shown in the Learn tours next to an
 * annotated screenshot of the page. (Each chart's own "How to read this chart" text lives with
 * the chart; the tours explain the page as a whole and give something to try.) */

export interface RegionGuide {
  /** Region on the page: "panel" (the inputs on the left), "stats" (the row of headline
   * tiles), "universe-bar" (the shared universe strip), or a card's heading. */
  key: string
  /** How `key` matches a heading: exactly (default), or as its start or end (dynamic headings). */
  match?: 'exact' | 'prefix' | 'suffix'
  /** Other headings the same card can show. */
  aliases?: string[]
  /** Short name used in the tour. */
  label: string
  /** What the region shows: axes, colours, units. */
  what: string
  /** How to read it: what to look at first, what a typical picture means. */
  read: string[]
  /** One thing to try on the page. */
  try?: string
}

export interface PageGuide {
  /** Screenshot id (frontend/public/learn/<id>.jpg; regions in features/learn/screens.json).
   * Starts with the area's path ("construct-portfolios"), which links it to its chapter. */
  id: string
  path: string
  title: string
  /** What the page is for, in one or two sentences. */
  purpose: string
  /** A typical way to use it, step by step. */
  workflow: string[]
  regions: RegionGuide[]
}

/** Region keys that name page parts rather than card headings. */
export const SPECIAL_REGIONS = ['panel', 'stats', 'universe-bar'] as const

export function regionMatches(region: RegionGuide, heading: string): boolean {
  if (region.aliases?.includes(heading)) return true
  if (region.match === 'prefix') return heading.startsWith(region.key)
  if (region.match === 'suffix') return heading.endsWith(region.key)
  return heading === region.key
}
