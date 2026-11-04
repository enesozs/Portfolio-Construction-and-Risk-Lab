import type { PageGuide } from './types'

export const PLAN: PageGuide[] = [
  {
    id: 'plan-holdings',
    path: '/plan',
    title: 'My portfolio',
    purpose:
      'Turn what you hold into the orders that move it to a target allocation, respecting whole shares, your cash, trading costs and a minimum trade size, and see what the trades change.',
    workflow: [
      'Paste your holdings (shares or dollar values) and enter your cash.',
      'Pick a target method; optionally make your holdings the universe.',
      'Set the trading rules: fractional shares, minimum trade, cost, cash to keep.',
      'Check the gap to target and the risk table, then download the orders.',
    ],
    regions: [
      {
        key: 'universe-bar',
        label: 'Shared universe',
        what: 'The universe the target is built on.',
        read: [
          'Holdings outside the universe get a zero target and are sold; add them to the universe to include them.',
        ],
      },
      {
        key: 'panel',
        label: 'Holdings, target, trading rules',
        what: 'Your holdings and cash, the target method, and the trading rules: fractional shares, minimum trade, cost per dollar traded, and a share to keep in cash.',
        read: [
          'One holding per line: a ticker and a share count, or a dollar value written with a dollar sign.',
          'Holdings are kept in this page only; nothing is saved.',
        ],
        try: 'Turn on Fractional shares and watch the gap to target shrink.',
      },
      {
        key: 'stats',
        label: 'Account summary',
        what: 'Account value, one-way traded share, estimated costs, cash after trading, and the gap to target.',
        read: [
          'The gap to target is half the sum of weight differences after trading: what rounding and skipped trades leave.',
          'Cash after never goes below zero: buys are funded by sells and existing cash, after costs.',
        ],
      },
      {
        key: 'Weights now, target and after trading',
        label: 'Now, target, after',
        what: 'Share of the account in each asset and in cash: now, at the target, and after the orders.',
        read: [
          'After sits on target except where whole shares cannot hit it, a trade was too small, or costs used some cash.',
          'Expensive shares in a small account show the largest gaps.',
        ],
      },
      {
        key: 'What changes',
        label: 'Risk before and after',
        what: 'Ex-ante expected return, volatility and Sharpe of the current, target and after-trading portfolios, from the shared estimates.',
        read: [
          'After should be close to target; a large difference points to rounding or skipped trades.',
          'These are model estimates from the research sample, not forecasts.',
        ],
      },
      {
        key: 'Orders',
        label: 'Orders',
        what: 'Per asset: price, shares held, the order, its value and cost, and the weight now, after and at target.',
        read: [
          'Sells come first in practice, so their proceeds pay for the buys.',
          'The CSV download lists the same orders for a broker or spreadsheet.',
        ],
      },
    ],
  },
  {
    id: 'plan-goals',
    path: '/plan/goals',
    title: 'Goal planner',
    purpose:
      'Simulate thousands of possible futures month by month, saving until retirement and then spending, to estimate the chance of reaching a goal, of running out of money, and a safe level of spending.',
    workflow: [
      'Pick the growth portfolio and its glide path toward cash.',
      'Enter wealth today, monthly saving, plan length and retirement year.',
      'Set spending and inflation, and optionally a wealth target.',
      'Keep an explicit return assumption, choose the return model, and read the probabilities.',
    ],
    regions: [
      {
        key: 'universe-bar',
        label: 'Shared universe',
        what: 'The assets of the growth portfolio, and the history the risk estimates and the bootstrap come from.',
        read: [
          'A few years of history set the risk; the expected return is your assumption unless you switch it off.',
        ],
      },
      {
        key: 'panel',
        label: 'Plan inputs',
        what: 'The growth portfolio and glide path, saving, spending and inflation, the wealth target, the return assumption, and the simulation model, confidence and number of paths.',
        read: [
          'All amounts are in today’s dollars; saving and spending rise with inflation.',
          'The growth share moves in a straight line from start to end over the whole plan; the rest is in T-bills.',
          'The research sample’s own mean is shown under the return assumption for comparison.',
        ],
        try: "Switch off Set the growth portfolio's return and compare the sample's mean with the 6% assumption.",
      },
      {
        key: 'stats',
        label: 'Headline probabilities',
        what: 'The chance of reaching the goal (or median final wealth), the chance the money lasts, the safe spending level at the chosen confidence, and median final wealth.',
        read: [
          'Safe spending is a share of the median wealth at retirement, found by bisection on the same paths.',
          'These are probabilities under the model and assumption, not guarantees.',
        ],
      },
      {
        key: 'Wealth over the plan',
        label: 'Wealth fan',
        what: 'Real wealth by year: the median, the middle 50% (dark band), 90% of outcomes (light band), a few individual paths, and the goal line.',
        read: [
          'The bands widen with time because uncertainty compounds.',
          'In retirement the lower band can reach zero: running out of money.',
        ],
      },
      {
        key: 'Running out of money',
        label: 'Ruin by year',
        what: 'The share of paths that have hit zero by each year.',
        read: [
          'Flat at zero while saving, rising once withdrawals begin.',
          'The value at the right edge is the plan’s overall probability of ruin.',
        ],
      },
      {
        key: 'Sequence-of-returns risk',
        label: 'Sequence risk',
        what: 'Success rate for each fifth of paths, grouped by the portfolio’s return over the first five years of retirement.',
        read: [
          'Same long-run assumptions in every group, yet poor early returns fail far more often: withdrawals sell at low prices.',
          'This is why glide paths cut risk around retirement.',
        ],
      },
    ],
  },
]
