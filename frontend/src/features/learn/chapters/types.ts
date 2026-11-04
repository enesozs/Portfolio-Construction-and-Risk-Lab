export interface Experiment {
  title: string
  /** Page to open. */
  to: string
  /** What to do there, in order (control names exactly as they appear on the page). */
  steps: string[]
  /** What to look for, and why it happens. */
  notice: string
}

export interface Chapter {
  id: string
  title: string
  summary: string
  /** Main page of the matching area. */
  area: string
  areaLabel: string
  experiments: Experiment[]
}
