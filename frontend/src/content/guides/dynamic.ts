import type { PageGuide } from './types'

export const DYNAMIC: PageGuide[] = [
  {
    id: 'dynamic-allocation',
    path: '/dynamic',
    title: 'Dynamic allocation',
    purpose:
      'Let timing and ranking signals move weight between your assets and cash, then check whether the signals beat simply holding the same base portfolio on the same schedule.',
    workflow: [
      'Start from a preset, or pick a base portfolio, a method and the signals yourself.',
      'Read the verdict tiles: return, Sharpe and drawdown against the base, then the two probabilities.',
      'Compare the strategy with the rebalanced base in Growth of $1, Drawdown and Side by side.',
      'Check the robustness chart: do the neighbouring settings tell the same story?',
      'Look at today’s target and signals to see what the rules say now.',
    ],
    regions: [
      {
        key: 'universe-bar',
        label: 'Universe',
        what: 'The assets and the research window shared by every page. The strategy can only hold these assets and cash.',
        read: [
          'The universe was chosen today, so it carries hindsight: famous winners make momentum look better than it could have been in real time.',
          'Moving the start date earlier lets the test cover more market regimes.',
        ],
      },
      {
        key: 'panel',
        label: 'Strategy settings',
        what: 'Presets; the base portfolio (a method re-estimated at each rebalance, or fixed weights); the method (Filter, Top-k, Tilt, BL views) with its strength; the timing and ranking signals with their windows; and the trading rules (rebalance frequency, estimation window, cost per dollar traded).',
        read: [
          'The base is both what the signals adjust and the benchmark they must beat.',
          'Filter needs a timing signal; Top-k, Tilt and BL views need a ranking signal, and can add a timing signal on top.',
          'Each signal shows its idea in one line below the picker; its window controls appear underneath.',
        ],
        try: 'Switch Out-of-signal weight goes to cash off with the trend filter: the portfolio stays invested and the average cash share drops.',
      },
      {
        key: 'stats',
        label: 'Verdict',
        what: 'Annual return, Sharpe vs cash, max drawdown and average cash share of the strategy, each with the base’s value underneath; then P(beats the base) and the same probability after trying neighbours.',
        read: [
          'P(beats the base) is the probabilistic Sharpe ratio of the daily return gap to the rebalanced base.',
          'After trying neighbours deflates it for the grid of settings tried. That is the number to trust.',
          'A timing strategy can have a lower return and a shallower drawdown at the same time; both tiles matter.',
        ],
      },
      {
        key: 'Growth of $1',
        label: 'Growth of $1',
        what: 'After costs (log scale once growth passes 10×). Strategy (blue), the base rebalanced on the same schedule (orange), the base bought and held (green), and cash (dashed).',
        read: [
          'The blue–orange gap is the signals’ contribution: both trade on the same days, only the targets differ.',
          'Timing strategies usually lag in steady bull markets and catch up in long sell-offs.',
        ],
      },
      {
        key: 'Drawdown',
        label: 'Drawdown',
        what: 'How far below its previous peak each portfolio was on each day: strategy (blue) and rebalanced base (orange).',
        read: [
          'A trend filter mostly earns its keep here: in long declines its drawdown is shallower than the base’s.',
          'In sharp, quick crashes a filter often reacts too late to help.',
        ],
      },
      {
        key: 'Holdings over time',
        label: 'Holdings over time',
        what: 'Share of wealth in each asset (coloured bands) and in cash (grey), at the end of each week.',
        read: [
          'Grey swelling in sell-offs is a filter or dual momentum stepping into cash.',
          'Bands change at rebalances and drift with prices in between.',
        ],
      },
      {
        key: 'When each asset was in',
        label: 'Timing signal strip',
        what: 'One row per asset, one column per rebalance: blue means the timing signal was on, grey off. Shown only when a timing signal is set.',
        read: [
          'Long blue runs are trends the signal stayed with; short alternating stretches are whipsaws that pay costs each time.',
          'Columns turning grey together are market-wide sell-offs.',
        ],
      },
      {
        key: 'Side by side',
        label: 'Side by side',
        what: 'Return, volatility, Sharpe, Sortino, max drawdown, Calmar, average cash, average one-way turnover per rebalance and total costs for the strategy, the rebalanced base and buy-and-hold, over the same test period.',
        read: [
          'The description gives the active return and tracking error: the yearly gap to the base and how much it wanders.',
          'Compare turnover and costs: a signal that trades much more must earn more to break even.',
        ],
        try: 'Raise Cost per dollar traded and watch the strategy row fall while the buy-and-hold row stays put.',
      },
      {
        key: 'Robustness: the neighbours you could have picked',
        label: 'Robustness grid',
        what: 'Active Sharpe vs the rebalanced base for the strategy with its main window scaled from half to double (and one holding more or fewer for top-k). The chosen setting is blue.',
        read: [
          'A broad plateau of similar bars suggests a real effect; a lone good bar among poor neighbours suggests a lucky parameter.',
          'The spread of these bars sets how far the deflated probability is lowered.',
        ],
      },
      {
        key: 'What the strategy holds now (',
        match: 'prefix',
        label: 'Today’s target',
        what: 'Target weights after the latest rebalance date, cash included, one bar per asset.',
        read: [
          'This is what the rules say today, not a recommendation.',
          'Running the strategy forward would hold these weights until the next rebalance.',
        ],
      },
      {
        key: "Today's signals",
        label: 'Today’s signals',
        what: 'For each asset: in or out from the timing signal, the ranking score (higher ranks first), and the target weight.',
        read: [
          'Explains the target: an asset that is out holds nothing (or its weight moved to the others).',
          'Scores are only meaningful relative to each other.',
        ],
      },
    ],
  },
]
