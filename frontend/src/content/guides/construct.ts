import type { PageGuide } from './types'

export const CONSTRUCT: PageGuide[] = [
  {
    id: 'construct-portfolios',
    path: '/construct',
    title: 'Portfolios',
    purpose:
      'Build eleven standard portfolios from the same universe and estimates, and compare how they split capital, where they sit against the efficient frontier, and how they would have done.',
    workflow: [
      'Set the universe, estimators and any constraints in the bar at the top.',
      'Compare the allocation bars: which methods concentrate and which spread out.',
      'Place them on the efficient frontier and pick an objective in Which portfolio fits the goal?',
      'Check the side-by-side table, comparing expected (estimate-based) columns with historical (realised) ones.',
    ],
    regions: [
      {
        key: 'universe-bar',
        label: 'Universe and constraints',
        what: 'The shared assets, sample, cash rate and covariance estimator, followed by any weight cap or constraint (long-short, group cap, max holdings, tracking error) set in Edit universe.',
        read: [
          'Constraints apply to every optimising method on every page. Equal weight, HRP, HERC and NCO ignore them and are flagged "unconstrained" in the table.',
        ],
        try: 'In Edit universe, switch on Cap single-asset weight at 30% and Apply: the concentrated portfolios spread out and the frontier shortens.',
      },
      {
        key: 'stats',
        label: 'Headline numbers',
        what: 'The best expected Sharpe and which portfolio has it, the lowest expected volatility, the highest diversification ratio, and the cash rate Sharpe is measured against.',
        read: [
          'The best expected Sharpe is almost always Maximum Sharpe: it is graded on the same estimates it optimised, so it wins by construction.',
        ],
      },
      {
        key: 'Allocations',
        label: 'Allocations',
        what: 'One horizontal bar per portfolio, one coloured segment per asset (colours follow universe order on every page). x: share of capital, 0–100%; shorts extend left of 0%.',
        read: [
          'Bars dominated by one or two colours are concentrated: typical of Maximum Sharpe and Kelly, which lean on expected returns.',
          'Minimum Variance tends to pile into the calmest asset; Risk Parity and the cluster methods spread more evenly.',
        ],
      },
      {
        key: 'Efficient frontier',
        label: 'Efficient frontier',
        what: 'x: expected annual volatility; y: expected annual return. Blue line: the frontier (lowest volatility for each return under the constraints). Dashed line: cash mixed with Maximum Sharpe (the capital market line). Orange dots: the standard portfolios; hover for unlabelled ones.',
        read: [
          'Maximum Sharpe is where the dashed line touches the frontier; Minimum Variance is the frontier’s left tip.',
          'Dots well below the frontier (Equal Weight, HRP) are not optimal for these estimates, which matters only if the estimates are right.',
        ],
      },
      {
        key: 'Which portfolio fits the goal?',
        label: 'Ranking by objective',
        what: 'Pick an Objective (risk-adjusted return, minimum volatility, tail-risk protection, diversification, low concentration) to rank every portfolio by the matching metric.',
        read: [
          'The order changes with the objective: there is no single best portfolio, only the best for a stated goal.',
          'Rankings are in-sample, a research view rather than a recommendation.',
        ],
      },
      {
        key: 'Side by side',
        label: 'Comparison table',
        what: 'Per portfolio: expected return, volatility and Sharpe from the estimates; historical return and Sharpe of the fixed weights over the same sample; maximum drawdown; daily CVaR 95%; effective number of assets (1/Σw²); diversification ratio. μ marks methods that use expected returns; ★ marks the best Sharpe.',
        read: [
          'A large gap between expected and historical Sharpe shows how much the method relied on its own estimates.',
          'Both columns use the same sample the weights were fitted on, so they flatter every method; the Validate area tests them out of sample.',
        ],
      },
    ],
  },
  {
    id: 'construct-estimators',
    path: '/construct/estimators',
    title: 'Estimators',
    purpose:
      'Run one allocator twelve times, once for each combination of return estimator and covariance estimator, to see how much the inputs, rather than the method, decide the portfolio.',
    workflow: [
      'Pick an Allocator in the panel (Maximum Sharpe shows the effect most clearly).',
      'Compare the twelve bars: similar bars mean the allocation is robust to the estimate choice.',
      'Find the assets with the widest weight range.',
      'Read the table for the turnover that switching estimator alone would cause.',
    ],
    regions: [
      {
        key: 'panel',
        label: 'Allocator and estimators',
        what: 'The method held fixed, with a one-line idea, and short definitions of the return and covariance estimators being varied.',
        read: [
          'For methods that ignore expected returns, rows sharing a covariance estimator are identical; only the covariance choice can move them.',
        ],
        try: 'Switch Allocator between Maximum Sharpe and Minimum Variance and watch the spread of the bars shrink.',
      },
      {
        key: 'stats',
        label: 'Spread across estimators',
        what: 'The range of expected Sharpe and volatility across the twelve combinations, the largest weight swing for any asset, and the largest switching trade from the estimator in use.',
        read: [
          'A weight swing of tens of percentage points means a modelling choice, not the data, is setting that position.',
        ],
      },
      {
        key: 'under each estimator',
        match: 'suffix',
        label: 'Allocation under each estimator',
        what: 'One horizontal bar per return / covariance combination (e.g. "Arithmetic / Ledoit–Wolf"), a segment per asset. x: share of capital. The row marked "(in use)" is what the other pages show.',
        read: [
          'Read down the bars: same data, same optimiser, only the estimators differ.',
          'Bars usually group in blocks of the same return estimator: for return-seeking methods the mean estimate matters more than the covariance.',
        ],
      },
      {
        key: "How far each asset's weight moves",
        label: 'Weight range per asset',
        what: 'x: asset; y: highest minus lowest weight across the twelve combinations, in percentage points.',
        read: [
          'Tall bars mark assets the estimators disagree on, often near-substitutes with similar risk and return, between which the optimiser flips.',
        ],
      },
      {
        key: 'Twelve estimate sets, one allocator',
        label: 'Estimator table',
        what: 'Per combination: expected return, volatility and Sharpe (each measured with its own estimates), effective number of assets, and one-way turnover from the estimator in use. ★ marks the highest expected Sharpe.',
        read: [
          'Every row looks good by its own yardstick, because an optimiser always believes its inputs.',
          'Turnover of 30% means switching estimator alone would trade almost a third of the portfolio with nothing in the world having changed.',
        ],
      },
    ],
  },
  {
    id: 'construct-black-litterman',
    path: '/construct/black-litterman',
    title: 'Black–Litterman',
    purpose:
      'Start from the returns the market itself implies, tilt them only where you state a view and only as far as your confidence allows, and compare the result with maximum Sharpe on raw history.',
    workflow: [
      'Choose the Prior portfolio (Market value or Equal weight) and the Risk aversion (δ).',
      'With no views, check that the Black–Litterman weights match the prior.',
      'Switch on a view for one asset, set its Expected return and Confidence.',
      'Watch the posterior return and the weights move, and compare with historical maximum Sharpe.',
    ],
    regions: [
      {
        key: 'panel',
        label: 'Prior and views',
        what: 'The prior portfolio and risk aversion δ, then one switch per asset to state a view: an annual total return and a confidence from 1% to 100%. Each asset shows its implied return next to its switch.',
        read: [
          'A new view starts at the asset’s historical average: "what if history repeats?"',
          'Confidence is the share of the gap closed: at 50% a single view moves that asset’s return halfway from implied to your view.',
        ],
      },
      {
        key: 'stats',
        label: 'Tilt and distance',
        what: 'Number of views, the largest change in an expected return (posterior minus implied), the one-way distance of the Black–Litterman weights from the prior, and the same distance for historical maximum Sharpe.',
        read: [
          'Compare the last two: raw history usually pulls the portfolio much further from the prior than a couple of moderate views do.',
        ],
      },
      {
        key: 'Expected returns',
        label: 'Expected returns',
        what: 'x: asset; y: annual total return (cash included). Three bars per asset: implied (equilibrium), posterior (implied blended with your views) and historical (the sample average).',
        read: [
          'The posterior sits between implied and your view; assets without a view shift a little through their correlation with one that has one.',
          'Historical bars are usually far more spread out than implied ones, which is why maximum Sharpe on them gives extreme weights.',
        ],
      },
      {
        key: 'Weights',
        label: 'Weights',
        what: 'x: asset; y: share of capital. Bars for the prior, maximum Sharpe on the posterior returns (Black–Litterman), and maximum Sharpe on historical averages.',
        read: [
          'With no views the first two match (unless a cap binds): the implied returns were built to make the prior optimal.',
          'Each view moves weight toward or away from its asset, and only that far; historical maximum Sharpe has no such anchor.',
        ],
      },
      {
        key: 'Where the prior comes from',
        label: 'Prior sources',
        what: 'Each asset’s prior weight and where its size came from: Live (Yahoo market cap or fund size today), Snapshot (bundled copy), Fallback (no size found, given the average) or Equal.',
        read: [
          'Market caps for stocks and fund sizes for ETFs are a practical shortcut: a fund’s size is not the size of its asset class, so treat a multi-asset prior as a rough anchor.',
        ],
      },
    ],
  },
  {
    id: 'construct-tail-risk',
    path: '/construct/tail-risk',
    title: 'Tail risk',
    purpose:
      'Find the mix whose worst days were least bad on average (minimum CVaR) and compare it with minimum variance and maximum Sharpe.',
    workflow: [
      'Choose a Confidence level: 95% looks at the worst 5% of days.',
      'Compare the three allocations and their tail losses.',
      'Optionally switch on Require a minimum expected return and set a floor.',
    ],
    regions: [
      {
        key: 'panel',
        label: 'Tail and return floor',
        what: 'The confidence level (90%, 95%, 97.5%, 99%) and an optional floor on the historical mean return for the minimum-CVaR portfolio.',
        read: [
          'Higher levels look at rarer days, so fewer observations go into each estimate and it gets noisier.',
          'Only minimum CVaR responds to the floor; the other two are references.',
        ],
        try: 'Switch on Require a minimum expected return and raise Minimum expected return step by step: the tail loss rises as the portfolio is forced to take more risk.',
      },
      {
        key: 'stats',
        label: 'Same tail, three portfolios',
        what: 'The daily CVaR (average loss on the worst days) of minimum CVaR, minimum variance and maximum Sharpe, each with its VaR and annual volatility.',
        read: [
          'Minimum CVaR and minimum variance are often close; maximum Sharpe shows how much tail loss a return-seeking portfolio accepts.',
        ],
      },
      {
        key: 'Allocations',
        label: 'Allocations',
        what: 'x: asset; y: share of capital, for the three portfolios side by side.',
        read: [
          'Where minimum CVaR and minimum variance differ, an asset’s crash behaviour differs from what its volatility suggests.',
        ],
      },
      {
        key: 'Tail loss versus volatility',
        label: 'Tail table',
        what: 'Per portfolio: daily VaR, daily CVaR, their ratio and annual volatility, measured on the historical daily returns of the fixed weights. ★ marks the lowest in each column.',
        read: [
          'A CVaR/VaR ratio well above that of a normal distribution (about 1.25 at 95%) signals a fat left tail: the bad days beyond VaR are much worse than VaR.',
          'Minimum CVaR is fitted to these same days, so its edge in this table is in-sample.',
        ],
      },
    ],
  },
  {
    id: 'construct-robust',
    path: '/construct/robust',
    title: 'Robust & turnover',
    purpose:
      'Two ways to stop an optimiser acting on noise: robust mean-variance discounts poorly measured expected returns, and turnover-aware rebalancing trades only when the improvement beats the cost.',
    workflow: [
      'Set Risk aversion and Uncertainty aversion for robust mean-variance, and compare with no penalty.',
      'For rebalancing, choose a Target objective and a Current portfolio.',
      'Raise the Cost of turnover and watch the turnover-aware weights stay closer to the current ones.',
      'Optionally cap turnover or volatility.',
    ],
    regions: [
      {
        key: 'panel',
        label: 'Two optimisers',
        what: 'Robust mean-variance: risk aversion and uncertainty aversion. Turnover-aware rebalancing: target objective (mean-variance or min volatility), the current portfolio, risk aversion, the cost of turnover (annual return given up per 100% one-way turnover) and optional turnover and volatility caps.',
        read: [
          'At 0 uncertainty aversion robust mean-variance is plain mean-variance.',
          'A cost of 0 jumps straight to the target; 1% means trading the whole portfolio must improve the objective by at least 1% a year.',
        ],
      },
      {
        key: 'Allocations',
        label: 'Robust: allocations',
        what: 'x: asset; y: share of capital, for robust mean-variance, the same objective with no uncertainty penalty, and maximum Sharpe.',
        read: [
          'The gap between the first two bars is the penalty at work: weight leaves the volatile assets whose means are least precise.',
        ],
        try: 'Raise Uncertainty aversion from 0 to 10 and watch the robust bars spread out.',
      },
      {
        key: 'Expected numbers',
        label: 'Robust: expected numbers',
        what: 'Expected return, volatility and Sharpe for the three robust-section portfolios, all measured with the shared estimates.',
        read: [
          'Judged by the estimates it distrusts, the robust portfolio can only look slightly worse; its payoff shows up out of sample.',
        ],
      },
      {
        key: 'Rebalancing allocations',
        label: 'Turnover: allocations',
        what: 'x: asset; y: share of capital, for the current portfolio, the cost-free target and the turnover-aware compromise.',
        read: [
          'The turnover-aware bars sit between current and target: the trades with the most improvement per unit traded are made first, small differences are left alone.',
        ],
      },
      {
        key: 'What the trade buys',
        label: 'Turnover: what the trade buys',
        what: 'Expected return, volatility, Sharpe and one-way turnover from the current portfolio, for current, cost-free target and turnover-aware.',
        read: [
          'If the turnover-aware portfolio keeps most of the Sharpe gain for much less turnover, the rest of the move to the target was mostly churn on estimation noise.',
        ],
        try: 'Set Cost of turnover to 0, then to 3%, and compare the turnover column.',
      },
    ],
  },
  {
    id: 'construct-risk-budget',
    path: '/construct/risk-budget',
    title: 'Risk budgets',
    purpose:
      'Decide what share of the portfolio’s risk each asset should carry and let the weights follow; equal budgets give risk parity.',
    workflow: [
      'Start with Equal budgets (risk parity) and read the gap between capital and risk.',
      'Give one asset a larger budget, or click the 60 / 40 button.',
      'Check that the realised risk shares match the budget, and how much capital each asset needs.',
    ],
    regions: [
      {
        key: 'panel',
        label: 'Risk budget',
        what: 'One budget per asset in relative units (only the proportions matter), with the resulting share. Equal resets to risk parity; 60 / 40 gives the first asset 60% of the risk and shares 40% among the rest.',
        read: [
          'A zero budget gives the asset no weight; a budget needs at least one positive entry.',
        ],
        try: 'Click 60 / 40 on the first asset and watch how little capital a volatile asset needs to carry 60% of the risk.',
      },
      {
        key: 'stats',
        label: 'Result',
        what: 'The portfolio’s annual volatility, the asset with the largest gap between capital weight and risk share, and the largest miss between realised risk share and budget.',
        read: [
          'A miss above about 1% means a cap or constraint in the universe stops the budget being met exactly.',
        ],
      },
      {
        key: 'Budget, risk share and capital',
        label: 'Budget, risk share and capital',
        what: 'x: asset; y: share. Three bars per asset: the target risk budget, the realised risk share (weight × marginal risk, summing to 100%), and the capital weight.',
        read: [
          'When the first two bars match, the budget is met.',
          'The gap to the capital bar is the point of the page: calm assets and diversifiers need a lot of capital to carry a given risk share, volatile ones very little.',
        ],
      },
    ],
  },
]
