import type { PageGuide } from './types'

export const UNIVERSE: PageGuide[] = [
  {
    id: 'universe-overview',
    path: '/universe',
    title: 'Universe overview',
    purpose:
      'See the chosen assets on their own and together before any portfolio is built: how they grew, how risky they were, how they move together, and how far the covariance estimate can be trusted.',
    workflow: [
      'Pick the assets, start date and estimators with Edit universe in the bar at the top; every page uses the same choice.',
      'Check the sample: the trading days, the cash rate, and any warning that a young asset moved the start date.',
      'Read the correlation heatmap and the risk–return map to see where diversification can come from.',
      'Change the Window on the rolling correlation to see how stable those correlations are.',
      'Finish with the covariance diagnostics: a high condition number means optimised weights will be fragile.',
    ],
    regions: [
      {
        key: 'universe-bar',
        label: 'The shared universe',
        what: 'The tickers in use, then the common sample (first and last date, trading days), the cash rate and its source, the covariance estimator, and any caps or constraints. Edit universe opens the editor: presets, saved universes, tickers, start date, the expected-return and covariance estimators, a single-asset cap, a manual cash rate and the portfolio constraints.',
        read: [
          'Every page in the lab analyses this one universe, so a change here moves every number on every page.',
          'An amber warning means the sample starts later than you asked because an asset listed later; the youngest asset sets the start.',
          'Cash shows "(T-bills)" when it follows the 13-week Treasury bill yield and "(manual)" when you fixed a rate.',
        ],
        try: 'Open Edit universe, click the Multi-asset ETFs preset and Apply: the whole lab now works on eight asset-class funds.',
      },
      {
        key: 'stats',
        label: 'Sample at a glance',
        what: 'Number of assets, trading days in the common sample (with its dates), the average cash rate, the average pairwise correlation, and the most and least correlated pairs.',
        read: [
          'Five years is about 1,260 trading days: plenty for volatility and correlation, far too few to pin down expected returns.',
          'The higher the average correlation, the less room for diversification; stocks from one sector are often strongly correlated, and mixing in bonds or gold usually pulls the average down.',
        ],
      },
      {
        key: 'Growth of $1',
        label: 'Growth of $1',
        what: 'x: date; y: the value of $1 invested in each asset at the start of the sample, dividends reinvested. One line per asset in the universe colours. The axis switches to a log scale when growth exceeds 10×.',
        read: [
          'On a log axis equal slopes mean equal percentage growth, so a steep line is fast compounding and a jagged one is volatility.',
          'Look for periods where lines dip together (sell-offs) and where one rises while others fall: that asset was a diversifier then.',
        ],
      },
      {
        key: 'Correlation of daily returns',
        label: 'Correlation heatmap',
        what: 'A matrix of the correlation between each pair of assets’ daily returns, value printed in each cell. Blue is positive, red negative, grey near zero; the diagonal is 1.',
        read: [
          'Dark blue blocks are assets that move as one (big tech, two Treasury funds): holding both adds little diversification.',
          'Pale or red cells are where diversification comes from; a stock–bond pair is often the lowest.',
        ],
      },
      {
        key: 'Risk and return by asset',
        label: 'Risk and return map',
        what: 'x: annual volatility; y: annual expected return (from the estimator in use). One dot per asset; the dashed line is the cash rate.',
        read: [
          'Dots up and to the left were the best paid for their risk; a dot below the dashed line did not beat cash over this sample.',
          'The vertical position is the least reliable number in the lab: a few years of data leave an error of several percent a year on each mean.',
        ],
      },
      {
        key: 'Rolling average correlation',
        label: 'Rolling correlation',
        what: 'x: date; y: the average pairwise correlation over a trailing window (21, 63, 126 or 252 days, set with Window). The description says how today compares with the sample.',
        read: [
          'Spikes usually line up with sell-offs: in a crisis assets fall together, just when diversification is needed.',
          'A short window reacts fast but is noisy; 252 days shows the slow drift between regimes.',
        ],
        try: 'Switch Window from 63d to 21d and then 252d and compare how high the peaks go.',
      },
      {
        key: 'Assets',
        label: 'Asset table',
        what: 'Per asset over the common sample: first trading date (⚑ marks an asset that moved the start), expected return, volatility, Sharpe against cash, realised compound return, and maximum drawdown.',
        read: [
          'Expected return is the estimate the optimisers use; realised return is the compound growth actually achieved. The gap widens with volatility.',
          'Maximum drawdown is the worst fall from a peak: often a better feel for risk than volatility.',
        ],
      },
      {
        key: 'How trustworthy is the covariance matrix?',
        label: 'Covariance diagnostics',
        what: 'For each covariance estimator: the condition number (largest over smallest eigenvalue), the effective rank (how many independent directions carry the risk, out of the number of assets), and the distance from the sample matrix. The one in use is marked.',
        read: [
          'Under about 100 is comfortable; above 1,000 optimised weights are mostly noise. Near-duplicate assets push it up.',
          'Ledoit–Wolf and denoising lower the condition number by pulling the extreme eigenvalues in; their distance from the sample shows how much they changed.',
          'An effective rank near 1–2 means one common factor (usually the market) drives most of the risk.',
        ],
      },
    ],
  },
]
