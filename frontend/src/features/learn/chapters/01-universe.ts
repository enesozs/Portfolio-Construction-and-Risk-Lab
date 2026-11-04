import type { Chapter } from './types'

export const CHAPTER: Chapter = {
  id: '01-universe',
  title: 'Universe and estimation',
  summary:
    'Daily returns, annualising, and the two estimates every page is built on: expected returns (the noisiest number in the lab) and the covariance matrix, with the estimators that make it safer to invert. Plus the cash rate, the common sample and correlations that move.',
  area: '/universe',
  areaLabel: 'Universe',
  experiments: [
    {
      title: 'Expected returns are fragile, volatility is not',
      to: '/universe',
      steps: [
        'Note where each dot sits on Risk and return by asset.',
        'Open Edit universe, set Expected returns to EWMA (recent-weighted) and click Apply.',
        'Compare the dots again, then switch back to Arithmetic mean.',
      ],
      notice:
        'The dots move up and down, often by many percentage points, but not sideways: only the mean estimate changed. A few years of data pin volatility down to a fraction of a percent, while the mean has a standard error of σ/√years, around 9% a year for a 20%-volatility stock over five years.',
    },
    {
      title: 'The youngest asset sets the start',
      to: '/universe',
      steps: [
        'Open Edit universe, click the Stocks and bonds preset, set Start date to 1 January 2005 and click Apply. Note the Trading days.',
        'Open Edit universe again, add META to Tickers and click Apply.',
      ],
      notice:
        'A warning appears, the trading days fall by about a third and META is flagged ⚑ in the Assets table: META listed in May 2012, and every analysis needs days on which all assets traded. The 2008 crisis has silently left every estimate, which is why the lab reports it.',
    },
    {
      title: 'Near-duplicates break the covariance matrix',
      to: '/universe',
      steps: [
        'Open Edit universe, set Tickers to SPY, IWD, IWF, QQQ, TLT, IEF and click Apply.',
        'Read How trustworthy is the covariance matrix? and compare the Sample and Ledoit–Wolf rows.',
        'Click the Core six preset in Edit universe, Apply, and read the table again.',
      ],
      notice:
        'SPY is close to a mix of IWD (value) and IWF (growth), so one combination of the three barely moves and the smallest eigenvalue is tiny: the sample condition number can pass 1,000, against far lower values for six distinct stocks and bonds. An optimiser inverting this matrix bets heavily on that near-hedge. Ledoit–Wolf pulls the eigenvalues together and cuts the condition number several-fold, at the cost of a small distance from the sample.',
    },
    {
      title: 'Correlations jump in a crisis',
      to: '/universe',
      steps: [
        'Open Edit universe, click the Multi-asset ETFs preset, set Start date to 1 March 2006 and click Apply.',
        'On Rolling average correlation, set Window to 63d and look at late 2008 and March 2020.',
        'Switch Window to 252d.',
      ],
      notice:
        'The average correlation rises sharply in both sell-offs, when investors sold everything together. A correlation matrix estimated over the whole sample averages calm and stress, so it overstates the diversification available in a crash. The 252-day window smooths the spikes and shows the slower drift between regimes.',
    },
  ],
}
