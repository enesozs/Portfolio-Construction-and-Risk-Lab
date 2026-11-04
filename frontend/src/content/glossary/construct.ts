import type { Term } from './types'

const PORTFOLIOS = { to: '/construct', label: 'Portfolios' }
const RISK_BUDGETS = { to: '/construct/risk-budget', label: 'Risk budgets' }
const ROBUST = { to: '/construct/robust', label: 'Robust & turnover' }

export const TERMS: Term[] = [
  {
    term: 'Black–Litterman',
    definition:
      'Starts from the returns that make the market portfolio optimal (equilibrium returns), then blends in your views on individual assets, each pulling only as far as its confidence allows. With no views it gives the market portfolio back.',
    see: { to: '/construct/black-litterman', label: 'Black–Litterman' },
  },
  {
    term: 'Capital market line',
    definition:
      'The straight line from the cash rate through the maximum-Sharpe portfolio: every mix of cash and that portfolio. It beats every other frontier portfolio at the same volatility.',
    see: PORTFOLIOS,
  },
  {
    term: 'Constraint',
    definition:
      'A rule the weights must obey: a cap per asset, shorting limits, a group cap, a tracking-error limit or a maximum number of holdings. Set once in the universe editor and enforced exactly by every optimising method.',
    see: PORTFOLIOS,
  },
  {
    term: 'Convex optimisation',
    definition:
      'Optimisation problems shaped like a bowl, with no dents in the allowed region. Any local optimum is the global one, and solvers can prove it or prove no solution exists. The lab states its problems in cvxpy for that reason.',
    see: PORTFOLIOS,
  },
  {
    term: 'CVaR',
    definition:
      'Conditional value at risk (expected shortfall): the average loss on the worst days beyond a confidence level, e.g. the worst 5%. Unlike VaR it looks at how bad the tail is, not just where it starts.',
    see: { to: '/construct/tail-risk', label: 'Tail risk' },
  },
  {
    term: 'Efficient frontier',
    definition:
      'The lowest volatility achievable for each level of expected return under the constraints. Portfolios below it could earn more for the same risk, given the estimates used.',
    see: PORTFOLIOS,
  },
  {
    term: 'Gross exposure',
    definition:
      'The sum of the absolute weights, longs plus shorts. A long-only portfolio has 1×; a 130/30 fund (130% long, 30% short) has 1.6×. The universe editor caps it when shorting is allowed.',
    see: PORTFOLIOS,
  },
  {
    term: 'Group cap',
    definition:
      'A limit on the total weight in any one group of assets: Yahoo’s sector for stocks, fund category for ETFs. Stops an optimiser from loading up on one industry through several tickers.',
    see: PORTFOLIOS,
  },
  {
    term: 'HERC',
    definition:
      'Hierarchical equal risk contribution: clusters assets by correlation (the number of clusters chosen by silhouette score), splits risk along the cluster tree, and uses inverse-variance weights inside each cluster.',
    see: PORTFOLIOS,
  },
  {
    term: 'HRP',
    definition:
      'Hierarchical risk parity: orders assets so similar ones sit together, then repeatedly halves the list and splits capital between the halves in inverse proportion to their variance. Needs no matrix inversion.',
    see: PORTFOLIOS,
  },
  {
    term: 'Kelly criterion',
    definition:
      'The allocation that maximises long-run compound growth (the average log return). Very aggressive and sensitive to estimated means, so practitioners hold a fraction of it, often half, with the rest in cash.',
    see: PORTFOLIOS,
  },
  {
    term: 'Long-short',
    definition:
      'A portfolio allowed to hold negative weights (short sales), betting that some assets fall or using them to hedge others. In the lab it is limited by a largest short per asset and a gross exposure cap.',
    see: PORTFOLIOS,
  },
  {
    term: 'Maximum diversification',
    definition:
      'The portfolio with the highest diversification ratio: weighted average asset volatility divided by portfolio volatility. It gets the most volatility reduction out of correlations, without expected returns.',
    see: PORTFOLIOS,
  },
  {
    term: 'Maximum Sharpe',
    definition:
      'The portfolio with the highest expected excess return per unit of volatility: where the capital market line touches the frontier. The most sensitive method to errors in expected returns.',
    see: PORTFOLIOS,
  },
  {
    term: 'Minimum variance',
    definition:
      'The least volatile portfolio the constraints allow. It uses only the covariance matrix, so expected-return errors cannot affect it, but without caps it concentrates in the calmest assets.',
    see: PORTFOLIOS,
  },
  {
    term: 'NCO',
    definition:
      'Nested clustered optimisation: runs minimum variance inside each cluster of similar assets, treats each cluster’s mix as one asset, and runs minimum variance again across the clusters.',
    see: PORTFOLIOS,
  },
  {
    term: 'Resampled frontier',
    definition:
      'Michaud’s idea: re-estimate the inputs on many bootstrap copies of history, optimise each, and average the weights. The lab’s resampled maximum Sharpe uses 60 draws; the averaging smooths away corner solutions.',
    see: PORTFOLIOS,
  },
  {
    term: 'Risk budget',
    definition:
      'The share of total portfolio risk you want each asset to carry. The weights are then solved so the risk contributions match. Equal budgets give risk parity.',
    see: RISK_BUDGETS,
  },
  {
    term: 'Risk contribution',
    definition:
      'An asset’s share of portfolio volatility: its weight times how much it moves the portfolio’s volatility at the margin. Contributions add up to 100%, and can be far from the capital weights.',
    see: RISK_BUDGETS,
  },
  {
    term: 'Risk parity',
    definition:
      'Weights chosen so that every asset contributes the same share of portfolio risk. Calm assets get more capital, volatile ones less. Needs no expected returns.',
    see: RISK_BUDGETS,
  },
  {
    term: 'Robust optimisation',
    definition:
      'Optimising while accounting for errors in the inputs. The lab’s robust mean-variance subtracts a penalty for the standard error of the portfolio’s expected return, moving weight away from assets whose means are least precisely known.',
    see: ROBUST,
  },
  {
    term: 'Tracking error',
    definition:
      'The annual volatility of the return gap between a portfolio and a benchmark. In the universe editor it limits how far a portfolio may stray from equal weight.',
    see: PORTFOLIOS,
  },
  {
    term: 'Turnover',
    definition:
      'The share of the portfolio traded to move between two sets of weights, counted one way: moving 10% from one asset to another is 10% turnover.',
    see: ROBUST,
  },
]
