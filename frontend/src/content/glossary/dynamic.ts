import type { Term } from './types'

const PAGE = { to: '/dynamic', label: 'Dynamic allocation' }

export const TERMS: Term[] = [
  {
    term: 'Tactical allocation',
    definition:
      'Moving weight between assets and cash over time based on signals, instead of holding one fixed mix. Also called dynamic allocation; the fixed mix is strategic allocation.',
    see: PAGE,
  },
  {
    term: 'Timing signal',
    definition:
      'A rule that looks at one asset’s own price history and says in (hold it) or out (do not). Trend filters, crossovers and absolute momentum are timing signals.',
    see: PAGE,
  },
  {
    term: 'Ranking signal',
    definition:
      'A score that compares assets with each other (higher ranks first). Only the order matters; rotation, tilts and Black–Litterman views are built on it.',
    see: PAGE,
  },
  {
    term: 'Trend filter',
    definition:
      'Hold an asset while its price is above its moving average (200 days by default) and step aside when it falls below, to avoid part of long declines.',
    see: PAGE,
  },
  {
    term: 'Moving-average crossover',
    definition:
      'In while a fast moving average (say 50 days) is above a slow one (200 days). Comparing two averages instead of the price makes it less sensitive to single noisy days. The EMA version reacts faster.',
    see: PAGE,
  },
  {
    term: 'MACD',
    definition:
      'Moving average convergence divergence: the 12-day minus the 26-day exponential average of the price. The signal is in while this line is above its own 9-day average, that is, while the trend is strengthening.',
    see: PAGE,
  },
  {
    term: 'Donchian channel',
    definition:
      'The band between the highest and lowest close over a window. The breakout rule enters on a close above the prior 50-day high and exits on a close below the prior 20-day low.',
    see: PAGE,
  },
  {
    term: 'Momentum',
    definition:
      'The tendency of assets that rose over the past year to keep outperforming for a few months. The standard 12-1 measure is the return from 12 months to 1 month ago, skipping the last month because of short-term reversal.',
    see: PAGE,
  },
  {
    term: 'Absolute momentum',
    definition:
      'Hold an asset only if its trailing return (usually a year) beat Treasury bills over the same period. It compares each asset with cash rather than with the others.',
    see: PAGE,
  },
  {
    term: 'Dual momentum',
    definition:
      'Relative momentum to pick the best assets, plus absolute momentum to require that they also beat T-bills. In the lab, top-k slots left empty by the second test are held in cash.',
    see: PAGE,
  },
  {
    term: 'Reversal',
    definition:
      'The tendency of last month’s biggest losers to bounce back a little, and winners to give back a little. The short-term reversal signal ranks last month’s losers first.',
    see: PAGE,
  },
  {
    term: 'Low-volatility anomaly',
    definition:
      'The observation that calm assets have historically earned about as much as volatile ones, so more return per unit of risk than the CAPM predicts. The low-volatility signal ranks the calmest assets first.',
    see: PAGE,
  },
  {
    term: 'Tilt',
    definition:
      'Leaning base weights toward assets with high scores without dropping the others: wᵢ ∝ bᵢ·exp(s·zᵢ), with zᵢ the asset’s z-score and s the tilt strength. At s = 0 the base is unchanged.',
    see: PAGE,
  },
  {
    term: 'Base portfolio',
    definition:
      'The allocation a dynamic strategy adjusts (an allocator re-estimated at each rebalance, or fixed weights), and the benchmark it must beat when rebalanced on the same schedule.',
    see: PAGE,
  },
  {
    term: 'Whipsaw',
    definition:
      'A timing signal flipping in and out repeatedly while a price hovers near its threshold. Each flip pays trading costs and often sells low and buys back higher.',
    see: PAGE,
  },
  {
    term: 'Look-ahead bias',
    definition:
      'Using information in a backtest that was not available when the decision was made. The lab decides at day t’s close with data through t, and the new weights earn from t + 1.',
    see: PAGE,
  },
  {
    term: 'Active return',
    definition:
      'A strategy’s return minus its benchmark’s, day by day. Its annualised standard deviation is the tracking error, and their ratio is the active Sharpe (information ratio).',
    see: PAGE,
  },
  {
    term: 'Probabilistic Sharpe ratio',
    definition:
      'The probability that the true Sharpe ratio exceeds a benchmark, given the sample length, skewness and fat tails of the returns (Bailey & López de Prado). Short, lumpy records earn less confidence.',
    see: PAGE,
  },
  {
    term: 'Deflated Sharpe ratio',
    definition:
      'The probabilistic Sharpe ratio with the benchmark raised to the Sharpe the best of N skill-less trials would show by luck. It corrects for keeping the best of many configurations.',
    see: PAGE,
  },
  {
    term: 'Hindsight bias',
    definition:
      'Judging a strategy on a universe picked with today’s knowledge, for example assets famous because they rose. Momentum looks better on such a universe than it could have in real time.',
    see: PAGE,
  },
]
