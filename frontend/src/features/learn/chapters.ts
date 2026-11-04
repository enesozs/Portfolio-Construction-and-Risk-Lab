/** The course: one chapter per docs/ note, each with guided experiments in the lab. */
import { CHAPTER as C01 } from './chapters/01-universe'
import { CHAPTER as C02 } from './chapters/02-construction'
import { CHAPTER as C03 } from './chapters/03-dynamic'
import { CHAPTER as C04 } from './chapters/04-risk'
import { CHAPTER as C05 } from './chapters/05-validation'
import { CHAPTER as C06 } from './chapters/06-attribution'
import { CHAPTER as C07 } from './chapters/07-planning'
import type { Chapter, Experiment } from './chapters/types'

export type { Chapter, Experiment }

export const CHAPTERS: Chapter[] = [C01, C02, C03, C04, C05, C06, C07]

export function chapterById(id: string): Chapter | undefined {
  return CHAPTERS.find((c) => c.id === id)
}

const sources = import.meta.glob<string>('../../../../docs/*.md', {
  query: '?raw',
  import: 'default',
})

/** The chapter's markdown, loaded on demand (each note is its own small chunk). */
export function loadChapterText(id: string): Promise<string> {
  const loader = sources[`../../../../docs/${id}.md`]
  if (!loader) return Promise.reject(new Error(`No chapter ${id}`))
  return loader()
}
