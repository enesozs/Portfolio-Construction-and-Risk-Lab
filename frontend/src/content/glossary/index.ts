/** Plain-language definitions of every term the lab uses, with where to see it. */
import { TERMS as UNIVERSE } from './universe'
import { TERMS as CONSTRUCT } from './construct'
import { TERMS as DYNAMIC } from './dynamic'
import { TERMS as RISK } from './risk'
import { TERMS as VALIDATE } from './validate'
import { TERMS as ATTRIBUTION } from './attribution'
import { TERMS as PLAN } from './plan'
import type { Term } from './types'

export type { Term }

/** All terms, alphabetical; a term defined in two areas keeps the first definition. */
export const GLOSSARY: Term[] = [
  ...new Map(
    [...UNIVERSE, ...CONSTRUCT, ...DYNAMIC, ...RISK, ...VALIDATE, ...ATTRIBUTION, ...PLAN].map(
      (t) => [t.term.toLowerCase(), t],
    ),
  ).values(),
].sort((a, b) => a.term.localeCompare(b.term))
