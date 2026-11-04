import type { Term } from './types'

const DECOMPOSITION = { to: '/risk', label: 'Risk decomposition' }
const STRESS = { to: '/risk/stress', label: 'Stress & scenarios' }
const CRISES = { to: '/risk/crises', label: 'Crisis replay' }
const VAR = { to: '/risk/var', label: 'VaR backtest' }
const MONTE_CARLO = { to: '/risk/simulation', label: 'Monte Carlo' }

export const TERMS: Term[] = [
  {
    term: 'Marginal risk',
    definition:
      'How much portfolio volatility rises per unit of extra weight in an asset: (Σw)ᵢ / σₚ. It depends on the asset’s volatility and its correlation with the rest of the portfolio.',
    see: DECOMPOSITION,
  },
  {
    term: 'Component risk',
    definition:
      'An asset’s weight times its marginal risk. The components add up exactly to the portfolio volatility (Euler allocation); divided by it, they are the risk shares.',
    see: DECOMPOSITION,
  },
  {
    term: 'Diversification ratio',
    definition:
      'The weighted average of the assets’ volatilities divided by the portfolio’s volatility. 1 means no diversification (everything moves together); higher means correlations are doing more work.',
    see: DECOMPOSITION,
  },
  {
    term: 'Effective number of assets',
    definition:
      'How many assets the weights are really spread over: 1/Σw² (the inverse Herfindahl index) or the exponential of the weights’ entropy. Both equal n for equal weights and count capital, not risk.',
    see: DECOMPOSITION,
  },
  {
    term: 'Volatility targeting',
    definition:
      'Scaling a portfolio’s risky weights by one factor, with the remainder in cash (or borrowed), so its volatility matches a target. Expected return moves along a straight line toward the cash rate.',
    see: DECOMPOSITION,
  },
  {
    term: 'Stress test',
    definition:
      'Recomputing risk under harsher assumptions than the estimates: in the lab, correlations pushed toward +1 and volatilities multiplied, or one-off return shocks per asset.',
    see: STRESS,
  },
  {
    term: 'Crisis replay',
    definition:
      'Applying today’s weights to the assets’ actual returns during a past sell-off. Assets not yet listed are dropped and their weight redistributed; recovery is followed past the window.',
    see: CRISES,
  },
  {
    term: 'Value at Risk (VaR)',
    definition:
      'The loss exceeded with a small probability over a horizon: a 1-day 99% VaR of 2% means losing more than 2% on about one day in a hundred. It says where the tail starts, not how bad it is.',
    see: VAR,
  },
  {
    term: 'Expected shortfall (ES)',
    definition:
      'The average loss on the days beyond the VaR, also called CVaR. It looks inside the tail and never exceeds the sum of its parts when portfolios are combined.',
    see: VAR,
  },
  {
    term: 'VaR exception',
    definition:
      'A day whose loss is larger than the VaR forecast made the evening before. A correct 99% model shows exceptions on about 1% of days, scattered at random.',
    see: VAR,
  },
  {
    term: 'Kupiec test',
    definition:
      'The proportion-of-failures test: is the number of VaR exceptions consistent with the confidence level? Too many means risk was understated, far too few that it was overstated.',
    see: VAR,
  },
  {
    term: 'Christoffersen test',
    definition:
      'The independence test for VaR exceptions: is an exception more likely the day after another one? Clusters mean the model reacts too slowly when volatility rises.',
    see: VAR,
  },
  {
    term: 'Basel traffic light',
    definition:
      'Bank regulators’ rule for a 99% VaR model: count exceptions over the last 250 days. 0–4 is green, 5–9 yellow (higher capital), 10 or more red.',
    see: VAR,
  },
  {
    term: 'EWMA (RiskMetrics)',
    definition:
      'A volatility estimate that weights recent days most: σ²ₜ = λσ²ₜ₋₁ + (1 − λ)r²ₜ₋₁ with λ = 0.94, a memory of about 16 days. It adapts within days when markets turn.',
    see: VAR,
  },
  {
    term: 'Filtered historical simulation',
    definition:
      'A VaR model that divides past returns by their EWMA volatility, takes the tail quantile of those, and rescales by today’s volatility: the fat tails of history with a volatility that adapts.',
    see: VAR,
  },
  {
    term: 'Monte Carlo simulation',
    definition:
      'Simulating many possible futures from a model of returns and reading statistics (percentiles, drawdowns, loss probabilities) off the simulated paths.',
    see: MONTE_CARLO,
  },
  {
    term: 'Student-t distribution',
    definition:
      'A bell-shaped distribution with fatter tails than the normal, set by its degrees of freedom (lower is fatter). In the joint version every asset shares one random scale per day, so extreme days hit all assets together.',
    see: MONTE_CARLO,
  },
  {
    term: 'Copula',
    definition:
      'A function that joins separate distributions into a joint one, separating how each asset behaves on its own from how assets move together. A t-copula adds tail dependence: shared crashes.',
    see: MONTE_CARLO,
  },
  {
    term: 'Regime-switching model',
    definition:
      'A model in which the market moves between states (here calm and stressed), each with its own means and covariance, by a Markov chain. Sticky regimes make crises last weeks rather than days.',
    see: MONTE_CARLO,
  },
  {
    term: 'Block bootstrap',
    definition:
      'Simulating by resampling blocks of consecutive historical days. No distribution is assumed and short-run clustering survives within blocks, but the future can only replay the past.',
    see: MONTE_CARLO,
  },
  {
    term: 'Monte Carlo standard error',
    definition:
      'How much a simulated number would change with a different random seed, because only finitely many paths were drawn. It shrinks like 1/√paths and ignores the larger error in the model’s inputs.',
    see: MONTE_CARLO,
  },
]
