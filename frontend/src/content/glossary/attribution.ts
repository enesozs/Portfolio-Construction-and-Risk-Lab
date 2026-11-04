import type { Term } from './types'

const ATTR = { to: '/attribution', label: 'Attribution' }

export const TERMS: Term[] = [
  {
    term: 'Benchmark',
    definition:
      'What you would otherwise hold, usually a broad index fund such as SPY. Beta, alpha and active risk are all measured against it.',
    see: ATTR,
  },
  {
    term: 'Beta',
    definition:
      'How much a portfolio moves per 1% move in the benchmark or a factor, from a regression of returns over cash. A beta of 0.7 typically loses about 7% when the market falls 10%.',
    see: ATTR,
  },
  {
    term: 'Alpha (Jensen’s)',
    definition:
      'The average annual return left over after paying for the portfolio’s beta exposure, with both sides measured over cash. Needs a long record to be distinguishable from luck.',
    see: ATTR,
  },
  {
    term: 'Information ratio',
    definition:
      'Active return divided by tracking error: extra return per unit of extra risk relative to the benchmark. The Sharpe ratio of the bet against it.',
    see: ATTR,
  },
  {
    term: 'Up/down capture',
    definition:
      'The portfolio’s average return on the benchmark’s up days (or down days) as a share of the benchmark’s. Capturing more of the up days than the down days is the goal.',
    see: ATTR,
  },
  {
    term: 'Factor model',
    definition:
      'A regression of returns on a few broad return sources (factors). The coefficients are the exposures; what is left over is alpha and idiosyncratic risk.',
    see: ATTR,
  },
  {
    term: 'Fama–French factors',
    definition:
      'Long-short portfolios of US stocks from Kenneth French’s data library: market, size, value, profitability and investment, used here with momentum (six in all).',
    see: ATTR,
  },
  {
    term: 'Size factor (SMB)',
    definition:
      'Small minus big: small companies’ return minus large ones’. A negative exposure means the portfolio behaves like large caps.',
    see: ATTR,
  },
  {
    term: 'Value factor (HML)',
    definition:
      'High minus low book-to-market: cheap stocks minus expensive ones. Growth-heavy portfolios have a negative exposure.',
    see: ATTR,
  },
  {
    term: 'Profitability factor (RMW)',
    definition: 'Robust minus weak: firms with high operating profitability minus those with low.',
    see: ATTR,
  },
  {
    term: 'Investment factor (CMA)',
    definition:
      'Conservative minus aggressive: firms that grow their assets slowly minus those that grow them fast.',
    see: ATTR,
  },
  {
    term: 'Momentum factor',
    definition:
      'Winners minus losers: stocks with the best returns over the past year (skipping the latest month) minus those with the worst.',
    see: ATTR,
  },
  {
    term: 'Newey–West standard errors',
    definition:
      'Standard errors that allow for residuals with changing variance and some autocorrelation, as daily returns have. Plain regression errors would make every estimate look more precise than it is.',
    see: ATTR,
  },
  {
    term: 't-statistic',
    definition:
      'An estimate divided by its standard error: how many standard errors it is from zero. |t| above about 2 corresponds to p below 0.05.',
    see: ATTR,
  },
  {
    term: 'R²',
    definition:
      'The share of a return series’ variance that a regression explains, from 0 to 1. A low R² means the factors or benchmark describe little of the asset’s behaviour.',
    see: ATTR,
  },
  {
    term: 'Idiosyncratic risk',
    definition:
      'The part of a portfolio’s variance not explained by the factors: risk tied to the specific holdings, or to assets the factors do not describe.',
    see: ATTR,
  },
  {
    term: 'Rolling beta',
    definition:
      'A beta re-estimated on a trailing window (one year here) as it moves through time, showing whether an exposure was steady or came and went.',
    see: ATTR,
  },
]
