import type { Chapter } from './types'

export const CHAPTER: Chapter = {
  id: '07-planning',
  title: 'Planning with real money',
  summary:
    'From weights to whole-share orders that respect cash, costs and a minimum trade; then decades of saving and spending in today’s dollars: glide paths, an explicit return assumption, the chance of reaching a goal or running out, a safe withdrawal rate, and sequence-of-returns risk.',
  area: '/plan',
  areaLabel: 'Plan',
  experiments: [
    {
      title: 'Whole shares leave a gap',
      to: '/plan',
      steps: [
        'Note Gap to target with the example holdings.',
        'Turn on Fractional shares.',
        'Turn it off again and raise Skip trades smaller than to 1000.',
      ],
      notice:
        'Whole shares cannot hit every target exactly, and the error is largest for expensive shares in a small account. Fractional shares remove most of the gap. A high minimum trade skips the small orders: fewer trades and lower costs, at the price of a larger gap. The orders never spend more cash than the account has after costs.',
    },
    {
      title: 'The sample mean is not a 40-year forecast',
      to: '/plan/goals',
      steps: [
        "Read the research sample's own mean under Return assumption.",
        "Switch off Set the growth portfolio's return and watch Reach the goal and the wealth fan.",
      ],
      notice:
        'A few strong years can give a sample mean far above any reasonable long-run return. Compounded over decades, that gap can turn a doubtful plan into a near-certain one. The explicit assumption shifts every asset’s mean by the same amount, keeping the volatilities and correlations from the data.',
    },
    {
      title: 'Finding a safe spending level',
      to: '/plan/goals',
      steps: [
        'Note Money lasts the whole plan and Safe spending.',
        "Set Spend per year (today's $) to the safe spending amount.",
        'Change Safe withdrawal at from 90% to 95%.',
      ],
      notice:
        'At the safe amount, the share of paths that last lands at the chosen confidence (up to the rounding of the displayed amount): the search reuses the same simulated paths, so it finds the exact boundary. Asking for more confidence lowers the safe amount: the extra certainty is paid for in spending. The rate is a share of the median wealth at retirement, so paths that arrive with less face a higher effective rate.',
    },
    {
      title: 'Bad years first',
      to: '/plan/goals',
      steps: [
        'Read Sequence-of-returns risk.',
        'Lower Growth share at end to 30%, then raise it to 100%.',
      ],
      notice:
        'Every fifth of paths has the same long-run assumptions, yet those that start retirement with poor returns fail far more often: withdrawals sell assets while prices are low. A lower growth share late in the plan narrows the gap between the groups, which is why glide paths de-risk around retirement.',
    },
  ],
}
