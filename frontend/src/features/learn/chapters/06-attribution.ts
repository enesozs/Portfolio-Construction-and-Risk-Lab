import type { Chapter } from './types'

export const CHAPTER: Chapter = {
  id: '06-attribution',
  title: 'Attribution and reporting',
  summary:
    'Where the return came from: beta and Jensen’s alpha against a benchmark, tracking error and the information ratio, return contributions by asset, and Fama–French factor regressions with Newey–West errors, factor risk shares and rolling betas. Plus the reproducible research report.',
  area: '/attribution',
  areaLabel: 'Attribution',
  experiments: [
    {
      title: 'The benchmark decides the story',
      to: '/attribution',
      steps: [
        'Note Beta, Alpha (annual) and Tracking error against SPY.',
        'Change Ticker to ACWI, then to AGG.',
      ],
      notice:
        'Alpha is only defined relative to a benchmark. Against a broad stock index, a stock-heavy portfolio has a beta near its equity share and tracking error from its specific bets. Against a bond index, beta falls toward zero and almost all of the return shows up as alpha with a large tracking error: the benchmark no longer describes the portfolio, so that alpha means little.',
    },
    {
      title: 'Significant or within noise?',
      to: '/attribution',
      steps: [
        'In the Fama–French section, read Alpha (annual) and its t.',
        'In Exposure statistics, find the factors with p above 0.05.',
        'Compare the size of each significant beta with the market beta.',
      ],
      notice:
        'An annual alpha of a few percent often has |t| below 2: its standard error is roughly the residual volatility divided by the square root of the years observed. Betas are estimated much more precisely, so even small exposures can be significant, while barely moving the portfolio. Read the size of an estimate as well as its p-value.',
    },
    {
      title: 'Which holdings bring each tilt',
      to: '/attribution',
      steps: [
        'Set Portfolio to Minimum Variance, then to Maximum Sharpe.',
        'Compare Where the risk comes from and Exposures by asset.',
      ],
      notice:
        'The portfolio’s betas are the weighted average of the asset rows, so a large weight in a long Treasury fund or a commodity pulls the market beta down and raises the idiosyncratic share: those assets’ risk lies outside the US-stock factors. A concentrated stock portfolio shows a dominant market bar and the tilts of its biggest holdings.',
    },
    {
      title: 'A reproducible record',
      to: '/report',
      steps: [
        'Set Portfolio to Risk Parity and read the Out-of-Sample Validation section.',
        'Click Download .md, then switch Portfolio to Maximum Sharpe and compare.',
      ],
      notice:
        'The report always runs the same analyses with fixed settings and seeds, so the same universe and data give the same text. Compare the model-implied Sharpe in the summary with the walk-forward Sharpe: the gap between the two is the in-sample flattery the Validate area measures in detail.',
    },
  ],
}
