import type { Term } from './types'

const UNIVERSE_PAGE = { to: '/universe', label: 'Universe' }

export const TERMS: Term[] = [
  {
    term: 'Annualised',
    definition:
      'Converted to a per-year figure. Mean returns and variances are multiplied by 252 trading days; volatility by √252, because it is the square root of variance.',
    see: UNIVERSE_PAGE,
  },
  {
    term: 'Condition number',
    definition:
      'The largest eigenvalue of the covariance matrix divided by the smallest. It bounds how much small errors in the matrix are amplified when an optimiser inverts it. Under ~100 is comfortable; above 1,000 optimised weights are mostly noise.',
    see: UNIVERSE_PAGE,
  },
  {
    term: 'Correlation',
    definition:
      'How two assets move together, from −1 (always opposite) through 0 (unrelated) to +1 (always together). Diversification comes from pairs with correlation below 1.',
    see: UNIVERSE_PAGE,
  },
  {
    term: 'Covariance matrix',
    definition:
      'The table of every pair’s covariance (correlation × both volatilities), with variances on the diagonal. Portfolio variance is wᵀΣw, so it is the main input to every risk-based method.',
    see: UNIVERSE_PAGE,
  },
  {
    term: 'Denoising (Marchenko–Pastur)',
    definition:
      'Random-matrix theory says which eigenvalues of a correlation matrix pure noise could produce. The lab keeps the ones above that range and replaces the rest by their average, then rebuilds the matrix with the sample volatilities.',
    see: UNIVERSE_PAGE,
  },
  {
    term: 'Drawdown',
    definition:
      'The fall from the highest value reached so far. Maximum drawdown is the worst such fall over the sample: what an investor who bought at the peak sat through.',
    see: UNIVERSE_PAGE,
  },
  {
    term: 'Effective rank',
    definition:
      'How many independent directions really carry the risk, from 1 (one factor drives everything) to the number of assets (risk spread evenly). Computed from the entropy of the covariance eigenvalues.',
    see: UNIVERSE_PAGE,
  },
  {
    term: 'Estimation error',
    definition:
      'The gap between a number estimated from a finite sample and its true value. Expected returns carry far more of it than volatilities or correlations, and optimisers amplify it.',
    see: { to: '/construct/estimators', label: 'Estimators' },
  },
  {
    term: 'EWMA',
    definition:
      'Exponentially weighted moving average: recent days count more, older days fade geometrically. The lab uses a 126-day span (half-life about 44 trading days) for both means and covariances.',
    see: { to: '/construct/estimators', label: 'Estimators' },
  },
  {
    term: 'Expected return',
    definition:
      'The average return an asset is assumed to earn per year. In the lab it is estimated from history (arithmetic, geometric or EWMA mean), which describes the past sample, not a forecast.',
    see: UNIVERSE_PAGE,
  },
  {
    term: 'Ledoit–Wolf shrinkage',
    definition:
      'A covariance estimator that blends the sample matrix with a scaled identity (equal variances, zero correlations), by an amount chosen from the data. Noisier samples shrink more. It lowers the condition number and steadies optimised weights; the lab’s default.',
    see: UNIVERSE_PAGE,
  },
  {
    term: 'Return',
    definition:
      'The percentage change in value over a period, dividends included. The lab uses daily simple returns (P_t/P_t−1 − 1) because a portfolio’s simple return is the weighted sum of its assets’.',
    see: UNIVERSE_PAGE,
  },
  {
    term: 'Risk-free rate / T-bill',
    definition:
      'The return on cash. The lab’s cash earns the 13-week US Treasury bill yield (^IRX) day by day; the universe’s cash rate is its average over the sample, or a manual rate you set.',
    see: UNIVERSE_PAGE,
  },
  {
    term: 'Sharpe ratio',
    definition:
      'Return in excess of cash divided by volatility: how much extra return each unit of risk earned. Expected Sharpe uses the estimates; historical Sharpe uses realised daily returns minus that day’s cash return.',
    see: UNIVERSE_PAGE,
  },
  {
    term: 'Standard error',
    definition:
      'The typical size of the error in an estimate. For an annual mean return it is volatility / √(years of data): about 9% a year for a 20%-volatility asset over five years.',
    see: UNIVERSE_PAGE,
  },
  {
    term: 'Universe',
    definition:
      'The assets, date range, estimators, cash rate and constraints shared by every page, set with Edit universe in the bar at the top. The sample starts when the youngest asset began trading.',
    see: UNIVERSE_PAGE,
  },
  {
    term: 'Volatility',
    definition:
      'The standard deviation of returns, annualised: how widely returns swing around their average. Roughly, a 20%-volatility asset moves within ±20% of its mean in about two years out of three.',
    see: UNIVERSE_PAGE,
  },
]
