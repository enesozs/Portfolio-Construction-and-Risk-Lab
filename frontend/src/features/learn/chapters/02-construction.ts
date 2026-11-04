import type { Chapter } from './types'

export const CHAPTER: Chapter = {
  id: '02-construction',
  title: 'Portfolio construction',
  summary:
    'Mean-variance, the efficient frontier and maximum Sharpe, and the many ways to defend against noisy estimates: methods that ignore expected returns, risk budgets, clustering, Black–Litterman, resampling, robust penalties and turnover costs. Plus the constraints and the convex solvers behind them.',
  area: '/construct',
  areaLabel: 'Construct',
  experiments: [
    {
      title: 'The estimates, not the optimiser, set the weights',
      to: '/construct/estimators',
      steps: [
        'Keep Allocator on Maximum Sharpe and read the twelve bars and How far each asset’s weight moves.',
        'Switch Allocator to Minimum Variance.',
      ],
      notice:
        'Under maximum Sharpe, some assets swing by tens of percentage points between estimator combinations, because expected returns enter the weights directly and are then amplified by the inverse covariance. Minimum variance ignores expected returns, so only the four covariance estimators can move it and the bars look much more alike.',
    },
    {
      title: 'Black–Litterman: no views, no bets',
      to: '/construct/black-litterman',
      steps: [
        'With no views, compare the Prior and Black–Litterman bars in Weights.',
        'Switch on a view for TLT, set Expected return 3 percentage points above its implied return and Confidence to 50%.',
        'Raise Confidence to 100%.',
      ],
      notice:
        'With no views the two match: the implied returns were reverse-engineered so the prior is optimal. At 50% confidence TLT’s posterior return closes half the gap to your view and its weight rises; at 100% it matches the view. Assets correlated with TLT shift a little too. Historical maximum Sharpe, with no anchor, sits far from all of this.',
    },
    {
      title: 'Capital is not risk',
      to: '/construct/risk-budget',
      steps: [
        'Open Edit universe, click the Stocks and bonds preset and click Apply.',
        'Click Equal and compare the bars in Budget, risk share and capital.',
        'Click 60 / 40 on SPY.',
      ],
      notice:
        'With equal risk shares the calmest fund, IEF (intermediate Treasuries), needs by far the most capital, while the more volatile SPY and TLT need less to carry the same third of the risk. Giving SPY 60% of the risk still leaves it well under 60% of capital: risk share is weight times marginal risk, and a volatile asset has a lot of marginal risk.',
    },
    {
      title: 'Only trade when it pays',
      to: '/construct/robust',
      steps: [
        'Under Turnover-aware rebalancing, keep Current portfolio on Equal Weight and set Cost of turnover to 0.',
        'Note the turnover and Sharpe in What the trade buys.',
        'Raise Cost of turnover to 2%, then 5%.',
      ],
      notice:
        'At zero cost the turnover-aware portfolio jumps all the way to the target. As the cost rises it stops short: it makes the trades with the biggest improvement per unit traded and leaves small differences alone. Compare the expected Sharpe: it usually changes far less than the turnover, a sign that much of the full move was paying to act on small, noisy differences.',
    },
  ],
}
