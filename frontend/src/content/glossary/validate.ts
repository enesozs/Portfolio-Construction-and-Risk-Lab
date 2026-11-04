import type { Term } from './types'

const WF = { to: '/validate', label: 'Walk-forward' }
const REB = { to: '/validate/rebalancing', label: 'Rebalancing' }
const BOOT = { to: '/validate/bootstrap', label: 'Stability' }
const CMP = { to: '/validate/compare', label: 'Compare methods' }

export const TERMS: Term[] = [
  {
    term: 'In-sample',
    definition:
      'Results measured on the same data used to choose the weights. They flatter the method, because the optimiser has effectively seen the answer.',
    see: WF,
  },
  {
    term: 'Out-of-sample',
    definition:
      'Results measured on data the decision could not see. The honest test of whether a rule, not just one fitted portfolio, works.',
    see: WF,
  },
  {
    term: 'Walk-forward test',
    definition:
      'A backtest that re-estimates and re-allocates on a schedule using only past data, holds the weights until the next date, and pays costs on what is traded. What following the rule live would have earned.',
    see: WF,
  },
  {
    term: 'Rolling window',
    definition:
      'An estimation window of fixed length that moves forward with each decision, forgetting the oldest data. Adapts quickly, with noisier estimates.',
    see: WF,
  },
  {
    term: 'Expanding window',
    definition:
      'An estimation window that starts at the beginning of the sample and grows with each decision. Steadier and more precise over time, slower to react to change.',
    see: WF,
  },
  {
    term: 'Rebalancing',
    definition:
      'Trading back to target weights after prices have made the holdings drift: winners grow into a larger share, losers shrink. It costs money and keeps the risk you chose.',
    see: REB,
  },
  {
    term: 'Calendar rebalancing',
    definition:
      'Rebalancing on a fixed schedule (weekly, monthly, yearly), however far the weights have drifted.',
    see: REB,
  },
  {
    term: 'Threshold rebalancing',
    definition:
      'Rebalancing only when drift is large enough to matter: when any one asset is a set distance from its target, or when the whole portfolio is (half the sum of the weight gaps).',
    see: REB,
  },
  {
    term: 'Transaction cost',
    definition:
      'What trading costs: spreads, commissions and market impact. The lab charges a fixed number of basis points per dollar bought or sold (5 bp = 0.05%).',
    see: WF,
  },
  {
    term: 'Bootstrap',
    definition:
      'Building many alternative histories by resampling the actual one with replacement, then repeating an analysis on each. The spread of the results shows how much depends on the particular sample.',
    see: BOOT,
  },
  {
    term: 'Moving-block bootstrap',
    definition:
      'A bootstrap that draws runs of consecutive days instead of single days, so volatility clustering and short-term dependence survive in each resample.',
    see: BOOT,
  },
  {
    term: 'Jobson–Korkie test',
    definition:
      'A test of whether two Sharpe ratios measured on the same days differ by more than noise, allowing for the correlation between the two return series. The lab uses Memmel’s corrected version.',
    see: CMP,
  },
  {
    term: 'p-value',
    definition:
      'The probability of a result at least this extreme if there were no real effect. Small values (below 0.05 by convention) count as evidence; it is not the probability that the effect is real.',
    see: CMP,
  },
  {
    term: 'Multiple testing',
    definition:
      'Running many tests raises the chance that some look significant by luck: nine independent tests at 5% give about a 37% chance of at least one false positive. Bonferroni divides the threshold by the number of tests.',
    see: CMP,
  },
  {
    term: 'Backtest overfitting (PBO)',
    definition:
      'Choosing the best of many backtests partly picks the luckiest. The probability of backtest overfitting is how often the in-sample winner ranks in the bottom half on unseen data.',
    see: CMP,
  },
  {
    term: 'CSCV',
    definition:
      'Combinatorially symmetric cross-validation: cut the test period into blocks and try every way of splitting them into equal in-sample and out-of-sample halves (252 splits for 10 blocks). Used to estimate PBO.',
    see: CMP,
  },
]
