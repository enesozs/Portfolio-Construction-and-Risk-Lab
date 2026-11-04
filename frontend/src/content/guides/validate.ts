import type { PageGuide } from './types'

export const VALIDATE: PageGuide[] = [
  {
    id: 'validate-walk-forward',
    path: '/validate',
    title: 'Walk-forward test',
    purpose:
      'Backtest an allocation method honestly: re-estimate and re-allocate on a schedule using only past data, pay costs on what is traded, and compare with equal weight and cash over the same days.',
    workflow: [
      'Pick the method to test.',
      'Choose a rolling or expanding window and its length.',
      'Set how often to rebalance and the cost per dollar traded.',
      'Compare the after-cost line and row with buy-and-hold equal weight, then check whether the risk estimates held up.',
    ],
    regions: [
      {
        key: 'universe-bar',
        label: 'Shared universe',
        what: 'The tickers, sample dates, cash rate and covariance estimator every page uses.',
        read: [
          'The test period starts one lookback after the sample start, so a short sample leaves few rebalances to judge by.',
        ],
      },
      {
        key: 'panel',
        label: 'Allocator, window, trading',
        what: 'The method re-run at every rebalance; the estimation window (rolling or expanding, and its length); the rebalance interval and the cost per dollar traded.',
        read: [
          'Rolling forgets old data and adapts faster; expanding keeps everything since the start and is steadier.',
          'With an expanding window the length is only the initial window; later decisions see more data.',
          'Costs are charged on the gap between the new target and the drifted holdings, not the previous target.',
        ],
        try: 'Switch Window type between Rolling and Expanding with Maximum Sharpe and watch the target weights calm down.',
      },
      {
        key: 'stats',
        label: 'Headline numbers',
        what: 'Annual return after costs (and its gap to equal weight), Sharpe over cash, the annual return lost to trading, and the number of rebalances in the test.',
        read: [
          'A negative gap to equal weight means the estimates did not pay for themselves over this period.',
          'Cost drag grows with rebalance frequency and with how jumpy the method is.',
        ],
      },
      {
        key: 'Growth of $1, out of sample',
        label: 'Growth out of sample',
        what: 'Wealth from one dollar: the method after costs (solid) and before costs (dashed), buy-and-hold equal weight, and cash.',
        read: [
          'Every point uses weights chosen with earlier data only: what following the rule live would have earned.',
          'The space between solid and dashed is trading cost.',
          'A lead built in one short stretch (a single rally or crash) is weaker evidence than a steady one.',
        ],
      },
      {
        key: 'Out-of-sample performance',
        label: 'Performance table',
        what: 'Return, volatility, Sharpe, Sortino, maximum drawdown and Calmar for the method after and before costs and for equal weight, with turnover, total cost and rebalances.',
        read: [
          'The method has to beat the equal-weight row after costs to justify its complexity.',
          'Turnover is one-way per rebalance: the share of the portfolio bought, equal to the share sold.',
        ],
      },
      {
        key: 'Predicted vs realised volatility',
        label: 'Predicted vs realised risk',
        what: 'At each rebalance, the volatility the estimates predicted for the new weights, and the volatility delivered until the next rebalance.',
        read: [
          'Realised persistently above predicted: the model was overconfident, typical when calm windows meet turbulence.',
          'A month of data makes realised volatility noisy, so look for persistent gaps rather than single spikes.',
        ],
      },
      {
        key: 'Target weights over time',
        label: 'Targets over time',
        what: 'The allocation chosen at each rebalance, stacked to 100% and held flat until the next one.',
        read: [
          'Large jumps between rebalances mean the method reacts strongly to a changing window, which costs turnover.',
          'A steady picture suggests the method is not chasing noise.',
        ],
      },
    ],
  },
  {
    id: 'validate-rebalancing',
    path: '/validate/rebalancing',
    title: 'Rebalancing rules',
    purpose:
      'Keep one target fixed and compare when to trade back to it: never, on a calendar, when one asset drifts too far, or when the whole portfolio does. The trade-off is cost against tracking error.',
    workflow: [
      'Choose the target portfolio.',
      'Set the cost per dollar traded.',
      'Set each rule: the calendar interval, the asset threshold, the portfolio distance.',
      'Read the table: tracking error against total cost and number of rebalances.',
    ],
    regions: [
      {
        key: 'universe-bar',
        label: 'Shared universe',
        what: 'The tickers and sample the target is estimated on.',
        read: ['The whole sample is used: this page isolates when to trade, not what to hold.'],
      },
      {
        key: 'panel',
        label: 'Target, costs, rules',
        what: 'The target (estimated once on the full sample), the cost per dollar traded, and the three rules: a calendar interval, an asset threshold, a portfolio distance.',
        read: [
          'Threshold trades when any single asset is that far from its target weight.',
          'Distance trades when half the sum of absolute weight gaps (the share you would have to trade) reaches the level.',
        ],
        try: 'Raise Cost per dollar traded to 20 bp and compare the 1 wk and 1 yr calendars.',
      },
      {
        key: 'stats',
        label: 'Headline numbers',
        what: 'The rule that stays closest to the target, the cheapest rule, and how far buy and hold drifts.',
        read: [
          'The closest and the cheapest rule are rarely the same: that is the trade-off.',
          'Buy-and-hold tracking error grows with the sample length and with how differently the assets performed.',
        ],
      },
      {
        key: 'Growth of $1 under each rule',
        label: 'Growth under each rule',
        what: 'Wealth from one dollar under each rule, same target and costs.',
        read: [
          'The lines usually stay close: rebalancing rarely changes the long-run return much.',
          'What differs is the portfolio held: buy and hold ends up concentrated in whatever went up most.',
        ],
      },
      {
        key: 'Policies side by side',
        label: 'Policy table',
        what: 'Return, volatility, Sharpe, drawdown, rebalances, total cost, average turnover and tracking error per rule.',
        read: [
          'Tracking error compares each rule with holding the target exactly (daily, at no cost).',
          'A good rule keeps tracking error low with few rebalances; drift-based rules often do this better than a fixed calendar.',
        ],
      },
    ],
  },
  {
    id: 'validate-bootstrap',
    path: '/validate/bootstrap',
    title: 'Bootstrap weight stability',
    purpose:
      'Resample the history many times and re-optimise on each copy. The spread of the resulting weights shows how much of an allocation is driven by noise in the estimates.',
    workflow: [
      'Pick a method (equal weight is left out: it never changes).',
      'Choose the number of resamples and the sampling scheme.',
      'For block sampling, pick the block length.',
      'Find the widest ranges, and compare the full-sample weight with the median.',
    ],
    regions: [
      {
        key: 'universe-bar',
        label: 'Shared universe',
        what: 'The history being resampled.',
        read: ['A longer sample gives tighter ranges: estimates get more precise with more data.'],
      },
      {
        key: 'panel',
        label: 'Allocator and resampling',
        what: 'The method, the number of resamples, day-by-day or block sampling, and the block length.',
        read: [
          'Day by day draws single days at random; blocks keep runs of consecutive days, so volatility clustering survives.',
          'More resamples give smoother percentiles, not narrower ones.',
        ],
        try: 'Compare Maximum Sharpe with Minimum Variance: the methods that use estimated means move the most.',
      },
      {
        key: 'stats',
        label: 'Headline numbers',
        what: 'The least stable weight with its spread, the average 5–95% width across assets, and the resampling settings.',
        read: [
          'An average range of tens of percentage points means the allocation is mostly an estimate, not an answer.',
        ],
      },
      {
        key: 'How much each weight moves across resamples',
        label: 'Weight ranges',
        what: 'For each asset: the middle 90% of re-optimised weights (line), the middle 50% (box), the median (tick), and the full-sample weight (dot).',
        read: [
          'Narrow boxes near the dot: the weight is robust to a slightly different history.',
          'A range from 0% to 40%: the weight mostly reflects noise in the estimates.',
          'Many assets piled at 0% with occasional large weights are typical of maximum Sharpe.',
        ],
      },
      {
        key: 'Weight distribution per asset',
        label: 'Percentile table',
        what: 'Full-sample weight, mean, median, 5/25/75/95% percentiles and standard deviation of each weight.',
        read: [
          'A full-sample weight far from the median means the actual history happened to favour or penalise that asset.',
        ],
      },
    ],
  },
  {
    id: 'validate-compare',
    path: '/validate/compare',
    title: 'Compare methods',
    purpose:
      'Walk every method forward on identical settings, test whether their Sharpe ratios really differ from equal weight, and measure how often picking the best backtest would have disappointed.',
    workflow: [
      'Set the lookback, rebalance interval and cost: they apply to every method.',
      'Read the table: Sharpe after costs, and the z and p of each test against equal weight.',
      'Draw up to four methods on the growth chart.',
      'Check the overfitting probability and the covariance estimators at the bottom.',
    ],
    regions: [
      {
        key: 'universe-bar',
        label: 'Shared universe',
        what: 'The universe and the covariance estimator every method uses.',
        read: [
          'The probability of overfitting needs enough test days (10 blocks of at least 20 days).',
        ],
      },
      {
        key: 'panel',
        label: 'Shared settings',
        what: 'The estimation window, rebalance interval and cost per dollar traded, identical for all methods.',
        read: ['Differences between rows then come from the weights alone.'],
        try: 'Change Lookback from 1 yr to 3 yr and see whether the ranking and the overfitting probability hold.',
      },
      {
        key: 'stats',
        label: 'Headline numbers',
        what: 'The highest Sharpe and its method, equal weight’s Sharpe, how many methods differ significantly from equal weight, and the probability of backtest overfitting.',
        read: [
          'With many tests at p < 0.05, one or two “significant” results can appear by chance.',
        ],
      },
      {
        key: 'Every method, out of sample',
        label: 'All methods',
        what: 'Each method’s return, volatility, Sharpe, drawdown, turnover and cost, sorted by Sharpe, with the Jobson–Korkie (Memmel) test against equal weight.',
        read: [
          'z is the Sharpe difference in standard errors; p the chance of a gap this large if the true Sharpe ratios were equal.',
          '“No significant difference” is the usual verdict over a few years: Sharpe gaps of 0.2–0.3 are within noise.',
        ],
      },
      {
        key: 'Growth of $1, out of sample',
        label: 'Growth of chosen methods',
        what: 'Wealth from one dollar after costs for up to four methods; by default equal weight, the best and worst by Sharpe, and minimum variance.',
        read: [
          'A method that leads only because of one stretch is less convincing than a steady lead.',
        ],
      },
      {
        key: 'Probability of backtest overfitting',
        label: 'PBO',
        what: 'The share of the 252 in-sample/out-of-sample splits where the in-sample winner landed in the bottom half out of sample.',
        read: [
          'Near 0: in-sample rankings carry over. Near 50%: picking the best backtest is a coin flip.',
          'The splits share blocks of data, so this is a frequency, not a p-value.',
        ],
      },
      {
        key: 'Where the in-sample winner landed',
        label: 'Rank logits',
        what: 'For each split, the in-sample winner’s out-of-sample rank as a logit λ; the bars left of zero are overfit splits.',
        read: [
          'Mass piled to the right: the winner stayed near the top on unseen data.',
          'A spread across both sides means the top of the ranking is unstable.',
        ],
      },
      {
        key: "How much of the winner's Sharpe survived",
        label: 'Sharpe decay',
        what: 'One dot per split: the winner’s Sharpe on the half it was picked on (x) and on the other half (y), with a no-decay diagonal.',
        read: [
          'Dots below the diagonal lost Sharpe out of sample, which is normal for a selected winner.',
          'A downward-sloping cloud means the halves where a method shone most are those where it did worst afterwards: regimes that reversed.',
        ],
      },
      {
        key: 'Who won in sample',
        label: 'In-sample winners',
        what: 'How often each method had the best in-sample Sharpe across the splits.',
        read: [
          'One method winning nearly every split means the top of the ranking is stable.',
          'Several methods sharing wins means the choice depends on which period you look at.',
        ],
      },
      {
        key: 'Covariance estimators, out of sample',
        label: 'Covariance estimators',
        what: 'Minimum variance walked forward with each covariance estimator, before costs: realised volatility, average predicted volatility, their ratio and Sharpe.',
        read: [
          'The lowest realised volatility marks the most useful estimator, since minimum variance only tries to lower it.',
          'A ratio above 1 means risk was understated; below 1, overstated.',
          'Differences of a few tenths of a point are within noise.',
        ],
      },
    ],
  },
]
