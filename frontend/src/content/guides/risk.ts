import type { PageGuide } from './types'

export const RISK: PageGuide[] = [
  {
    id: 'risk-decomposition',
    path: '/risk',
    title: 'Risk decomposition',
    purpose:
      'See which assets cause the portfolio’s volatility, how diversified it really is, and how mixing it with cash moves it to a volatility target.',
    workflow: [
      'Pick a portfolio.',
      'Compare capital weights with risk contributions: where does the risk really come from?',
      'Read the diversification tiles and the marginal diversification chart.',
      'Set a target volatility and see how much cash it takes to reach it.',
    ],
    regions: [
      {
        key: 'panel',
        label: 'Portfolio and target',
        what: 'The portfolio (built from the shared universe and estimates), a target volatility in percent a year, and whether leverage is allowed, with its maximum gross exposure.',
        read: [
          'Without leverage the risky weights can only shrink, so a target above the portfolio’s own volatility changes nothing.',
          'With leverage, borrowing is assumed to cost the cash rate.',
        ],
      },
      {
        key: 'stats',
        label: 'Diversification tiles',
        what: 'Expected annual volatility; effective number of assets by HHI (1/Σw²) and by entropy; the weighted average correlation between holdings; the diversification ratio; and the volatility removed by mixing.',
        read: [
          'Effective assets count capital, not risk: six correlated stocks can score 6 and still behave like one.',
          'A diversification ratio of 1 means no diversification; higher is better.',
        ],
      },
      {
        key: 'Capital weight vs risk contribution',
        label: 'Capital vs risk',
        what: 'One pair of bars per asset: share of money (blue) and share of portfolio volatility it causes (orange). Both add up to 100%.',
        read: [
          'Where orange towers over blue, the asset dominates the risk: usually the most volatile, most correlated holdings.',
          'An orange bar below zero is a hedge: a little more of it would lower total volatility.',
        ],
        try: 'Switch between Equal Weight and Risk Parity: the second makes the orange bars equal, at the cost of uneven blue ones.',
      },
      {
        key: 'Where the volatility comes from',
        label: 'Risk table',
        what: 'For each asset: weight, marginal risk (volatility added per unit of extra weight), component of volatility (weight × marginal risk) and risk share.',
        read: [
          'The components add up exactly to the portfolio volatility (Euler’s theorem).',
          'Marginal risk depends on correlation with the rest, not just the asset’s own volatility.',
        ],
      },
      {
        key: 'Marginal diversification',
        label: 'Marginal diversification',
        what: 'For each asset, how much the diversification ratio falls if it is removed and the rest rescaled. Values are changes in the ratio, not percentages.',
        read: [
          'Large positive bars mark assets doing real diversifying work.',
          'Negative bars mean the portfolio would be more diversified without that asset.',
        ],
      },
      {
        key: 'Weights after targeting volatility',
        label: 'Volatility target',
        what: 'The base weights next to the volatility-targeted ones, cash included; tiles above show volatility before and after, the cash share, gross exposure and expected return including cash.',
        read: [
          'The risky assets keep their relative weights; only the overall exposure changes.',
          'Halving the risky share halves volatility and moves the expected return toward the cash rate.',
        ],
        try: 'Turn on Allow leverage and set a target above the portfolio’s volatility: cash turns negative (borrowed).',
      },
    ],
  },
  {
    id: 'risk-stress',
    path: '/risk/stress',
    title: 'Stress & scenarios',
    purpose:
      'Push correlations toward +1 and volatilities up to see how much of the estimated diversification survives a crisis, and apply one-off return shocks to see what the current weights would lose.',
    workflow: [
      'Pick a portfolio.',
      'Set how far to push correlations toward +1 and the volatility multiplier.',
      'Read how steeply volatility rises along the correlation curve.',
      'Apply a preset scenario or type your own shocks, and see which holdings lose and which offset.',
    ],
    regions: [
      {
        key: 'panel',
        label: 'Stress settings',
        what: 'The portfolio; the covariance stress (Push correlations toward +1 from 0% to 100%, Volatility multiplier); and the custom scenario with presets and one shock per asset in percent.',
        read: [
          'The weights stay fixed under every stress; only the risk inputs change.',
          'In the presets, TLT, IEF, AGG, SHY and GLD count as defensive and get their own moves.',
        ],
      },
      {
        key: 'stats',
        label: 'Stressed volatility',
        what: 'Base volatility, then the volatility with only the correlation stress, only the volatility stress, and both combined.',
        read: [
          'The correlation stress shows how much the portfolio relies on low correlations.',
          'The volatility multiplier scales the result one for one.',
        ],
      },
      {
        key: 'Portfolio volatility as correlations rise',
        label: 'Correlation curve',
        what: 'x: how far correlations are pushed toward +1; y: annual portfolio volatility. Blue at today’s asset volatilities, orange with the multiplier applied; dashed line at your setting.',
        read: [
          'A steep curve means diversification does a lot of work in this portfolio, and would be lost if everything moved together.',
          'At 100% every pair moves in lockstep: volatility equals the weighted average of the assets’ volatilities.',
        ],
        try: 'Compare Minimum Variance with Equal Weight: the minimum-variance curve usually rises further relative to where it starts, because it leans hardest on low correlations.',
      },
      {
        key: 'Contribution to the scenario return',
        label: 'Scenario contributions',
        what: 'Each asset’s weight times its shock; the bars add up to the portfolio return in the tiles above.',
        read: [
          'Positive bars are the hedges. If none appear in Equity crash, nothing offsets the stock losses.',
          'Rate shock usually removes the bond hedge, as in 2022.',
        ],
        try: 'Click Everything falls: with no hedge left, the portfolio loses the same 15% whatever the weights.',
      },
    ],
  },
  {
    id: 'risk-crises',
    path: '/risk/crises',
    title: 'Crisis replay',
    purpose:
      'Hold today’s weights through seven historical sell-offs, from the dot-com bust to the 2025 tariff shock, to see how the mix behaved under stress that actually happened.',
    workflow: [
      'Pick a portfolio.',
      'Scan the table for the deepest drawdowns and the longest recoveries.',
      'Select a crisis to chart its path and drawdown.',
      'Check the badges: which assets had not listed yet, and how much weight moved.',
    ],
    regions: [
      {
        key: 'panel',
        label: 'Portfolio and method',
        what: 'The portfolio, and how replays work: full price histories, today’s weights bought and held (drifting with prices), missing assets redistributed, and a hindsight note for crises inside the research window.',
        read: [
          'Replays use each asset’s whole history, so a short research window can still replay 2008.',
          'A crisis inside the research window also shaped the weights, so that row is partly hindsight.',
        ],
      },
      {
        key: 'Historical crises, replayed',
        label: 'Crisis table',
        what: 'One row per crisis: dates, total return, max drawdown, worst single day, and recovery in trading days. Crisis names are buttons that select the charts below.',
        read: [
          'Recovery counts from the trough until the holdings regain their pre-crisis peak, following them past the window.',
          'A badge means an asset had not listed yet; its weight was spread over the others, so that row tests a slightly different portfolio.',
        ],
        try: 'With a Treasury fund such as TLT in the universe, pick Risk Parity and compare the 2008 and 2022 rows: the same hedge helps in one and hurts in the other.',
      },
      {
        key: 'stats',
        label: 'Selected crisis',
        what: 'Total return, max drawdown with the worst day, annualised volatility during the episode, and how many assets could be replayed.',
        read: [
          'Volatility during a crisis is often two or three times the full-sample figure.',
          'Fewer assets replayed than held means part of the weight was redistributed.',
        ],
      },
      {
        key: 'Growth of $1: ',
        match: 'prefix',
        label: 'Growth of $1',
        what: 'Value of 1 dollar invested at the start of the selected crisis, day by day, with the current weights. The line at 1 is the starting value.',
        read: [
          'The shape matters: a sharp drop and a slow grind can end at the same total return but feel very different to hold.',
        ],
      },
      {
        key: 'Drawdown',
        label: 'Drawdown',
        what: 'Percentage below the running peak on each day of the episode.',
        read: [
          'Still below 0% at the end means the recovery came later; the table shows how long it took.',
        ],
      },
    ],
  },
  {
    id: 'risk-var',
    path: '/risk/var',
    title: 'VaR backtest',
    purpose:
      'Forecast each day’s Value at Risk with four models using only earlier data, then test whether the losses beat the forecasts as rarely, and as randomly, as promised.',
    workflow: [
      'Pick a portfolio, a confidence level and an estimation window.',
      'Read the model table: exception counts, the three tests and the Basel zone.',
      'Chart one model to see when its exceptions happened.',
      'Check which assets the tail risk comes from.',
    ],
    regions: [
      {
        key: 'panel',
        label: 'Test settings',
        what: 'The portfolio; the confidence (95%, 97.5%, 99%); the trailing estimation window (125, 250, 500 days); and a one-line description of each model.',
        read: [
          'Higher confidence looks further into the tail, where there are fewer observations to test with.',
          'Short windows react faster but are noisier; long windows remember old calm or old crises.',
        ],
      },
      {
        key: 'stats',
        label: 'Test summary',
        what: 'Days tested, the number of exceptions a correct model would expect, how many models pass all three tests, and the portfolio’s 1-day VaR and expected shortfall over the whole window.',
        read: [
          'At 99%, one exception in a hundred days is expected: about ten over four years.',
          'Expected shortfall is always at least the VaR: it averages the losses beyond it.',
        ],
      },
      {
        key: 'Four VaR models, tested out of sample',
        label: 'Model table',
        what: 'Per model: exceptions and their rate, exceptions in the last 250 days with the Basel zone (99% only), and p-values for Kupiec (count), independence (timing) and conditional coverage (both), with ✓ or ✕ at 5%.',
        read: [
          'A p-value below 5% rejects the model; above means no evidence against it, which is weaker than proof.',
          'At 99% the normal model often sees too many exceptions (Kupiec); slow-reacting models are the ones that fail independence (clusters).',
        ],
        try: 'Switch Confidence to 95%: more exceptions are expected and the tests have more data to work with.',
      },
      {
        key: 'Daily losses against the ',
        match: 'prefix',
        label: 'Exceptions chart',
        what: 'Grey bars: each day’s loss (gains point down). Blue line: the VaR forecast from the evening before. Orange dots: exceptions, days the loss beat the forecast. Model and period selectors at the top.',
        read: [
          'A good VaR line rises quickly when markets turn rough and falls back as they calm.',
          'Dots bunched right after a calm stretch are what the independence test detects.',
        ],
        try: 'Switch between Historical and EWMA around a sell-off: the EWMA line jumps within days, the historical one creeps.',
      },
      {
        key: 'Where the tail risk comes from',
        label: 'Tail risk by asset',
        what: 'For each asset: share of capital (blue), share of the 1-day VaR (orange) and share of expected shortfall (green).',
        read: [
          'Risk bars taller than the weight bar mark assets that add more to bad days than their size suggests.',
          'A negative share is a diversifier that tends to gain on the portfolio’s bad days.',
        ],
      },
      {
        key: 'Component VaR and ES',
        label: 'Component table',
        what: '1-day VaR and ES contributions per asset, as a share of capital, with the portfolio totals in the last row.',
        read: [
          'Rows add up to the totals (Euler allocation).',
          'VaR is parametric (normal) and ES historical, both over the whole window: the typical tail, not today’s.',
        ],
      },
    ],
  },
  {
    id: 'risk-simulation',
    path: '/risk/simulation',
    title: 'Monte Carlo simulation',
    purpose:
      'Simulate thousands of futures for the portfolio, asset by asset, under five return models, to see the range of wealth, losses and drawdowns over a chosen horizon.',
    workflow: [
      'Pick a portfolio and a return model.',
      'Set the horizon, the number of paths and the rebalancing rule.',
      'Read the headline numbers with their ± standard errors.',
      'Compare the fan and the histograms across models.',
    ],
    regions: [
      {
        key: 'panel',
        label: 'Simulation settings',
        what: 'The portfolio; the return model (Normal, Student-t, t-copula, Bootstrap, Regimes) with its degrees of freedom or block length; the horizon (3 months to 5 years); the number of paths; rebalancing (never, monthly, quarterly); and the random seed.',
        read: [
          'Lower degrees of freedom mean fatter, more often shared tails.',
          'Never rebalancing lets weights drift with prices (buy and hold).',
        ],
        try: 'Choose Regimes: a card appears with the calm and stressed regimes fitted to history and how long each tends to last.',
      },
      {
        key: 'stats',
        label: 'Headline numbers',
        what: 'Mean and median return, probability of a loss, 5th and 95th percentile returns, 95% VaR and expected shortfall at the horizon, median max drawdown and the probability of a 20% drawdown. Each has a ± Monte Carlo standard error.',
        read: [
          'The ± is simulation noise only; the error in the expected returns and covariance is much larger.',
          'The median is below the mean because volatility drags compounded growth.',
        ],
        try: 'Change the Random seed: the numbers move by about their ± values.',
      },
      {
        key: 'Range of simulated wealth',
        label: 'Fan chart',
        what: 'x: trading days ahead; y: wealth starting at 1. Blue line: median; dark band: 25–75% of paths; light band: 5–95%; grey lines: individual paths.',
        read: [
          'The fan widens with the horizon: uncertainty compounds.',
          'Single paths wander far more than the median suggests.',
        ],
      },
      {
        key: 'Return at the horizon',
        label: 'Terminal return',
        what: 'Histogram of total return at the horizon across paths, with dashed markers at break-even and the 5th percentile.',
        read: [
          'The tail left of the 5th percentile is what VaR and expected shortfall summarise.',
          'Fat-tailed models stretch this tail further than the normal model.',
        ],
      },
      {
        key: 'Worst drawdown along the way',
        label: 'Max drawdown',
        what: 'Histogram of each path’s deepest fall from a running peak, with a marker at 20%.',
        read: [
          'Even paths that end ahead usually pass through a sizeable drawdown.',
          'Models with joint crashes or lasting stressed spells (Student-t, Regimes) usually fatten the right side of this histogram.',
        ],
      },
    ],
  },
]
