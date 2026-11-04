export interface Term {
  term: string
  definition: string
  /** A page where the term appears. */
  see?: { to: string; label: string }
}
