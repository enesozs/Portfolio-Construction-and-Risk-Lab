import type { Term } from './types'

const MINE = { to: '/plan', label: 'My portfolio' }
const GOALS = { to: '/plan/goals', label: 'Goal planner' }

export const TERMS: Term[] = [
  {
    term: 'Holdings',
    definition:
      'What an account actually owns: a number of shares of each asset, plus cash. Valued at the latest close, they give the current weights.',
    see: MINE,
  },
  {
    term: 'Trade list',
    definition:
      'The orders that move current holdings toward a target: shares to buy or sell per asset, with their value and cost.',
    see: MINE,
  },
  {
    term: 'Fractional shares',
    definition:
      'Shares bought in pieces (0.37 of a share), offered by some brokers. They let small accounts hit target weights closely; with whole shares, expensive stocks leave large gaps.',
    see: MINE,
  },
  {
    term: 'Minimum trade',
    definition:
      'The smallest order worth placing, in dollars. Smaller trades are skipped: fewer orders and lower costs, at the price of being slightly off target.',
    see: MINE,
  },
  {
    term: 'Cash buffer',
    definition:
      'A share of the account deliberately kept uninvested, for upcoming spending or to avoid selling at a bad time.',
    see: MINE,
  },
  {
    term: 'Tracking gap',
    definition:
      'How far the account ends up from the target after trading, as half the sum of absolute weight differences: what share rounding and skipped trades leave unmatched.',
    see: MINE,
  },
  {
    term: 'Nominal vs real',
    definition:
      'Nominal amounts are in the dollars of the day they are paid; real amounts are in today’s dollars, after removing inflation. The planner reports everything in real terms.',
    see: GOALS,
  },
  {
    term: 'Inflation',
    definition:
      'The rate at which prices rise. At 2.5% a year, prices multiply by about 2.7 over 40 years, so a nominal million then buys what about 370,000 dollars buys today.',
    see: GOALS,
  },
  {
    term: 'Glide path',
    definition:
      'A planned change in the risky share of a portfolio over time, usually falling toward cash or bonds as the spending years approach, as target-date funds do.',
    see: GOALS,
  },
  {
    term: 'Contribution',
    definition:
      'Money added to the portfolio while saving. The planner keeps monthly contributions constant in real terms, so they rise with inflation.',
    see: GOALS,
  },
  {
    term: 'Withdrawal',
    definition:
      'Money taken out to spend, from retirement on. The planner keeps it constant in real terms, so the nominal amount rises with inflation.',
    see: GOALS,
  },
  {
    term: 'Probability of ruin',
    definition:
      'The share of simulated paths in which the money runs out while withdrawals are still due.',
    see: GOALS,
  },
  {
    term: 'Safe withdrawal rate',
    definition:
      'The largest yearly withdrawal, as a share of wealth at retirement and rising with inflation, that keeps the probability of ruin below a chosen level. The “4% rule” is the historical US version for 30 years.',
    see: GOALS,
  },
  {
    term: 'Sequence-of-returns risk',
    definition:
      'Two retirements with the same average return can end very differently if the bad years come first: withdrawals then sell assets at low prices, and those shares miss the recovery.',
    see: GOALS,
  },
]
