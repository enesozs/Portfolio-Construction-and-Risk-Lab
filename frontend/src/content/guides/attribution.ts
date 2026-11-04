import type { PageGuide } from './types'

export const ATTRIBUTION: PageGuide[] = [
  {
    id: 'attribution-benchmark',
    path: '/attribution',
    title: 'Attribution',
    purpose:
      'Explain where a portfolio’s return came from: market exposure against a benchmark, the assets that did the work, and the broad styles (size, value, profitability, investment, momentum) it leans on.',
    workflow: [
      'Pick the portfolio and type a benchmark ticker.',
      'Read beta, alpha and the active-risk numbers, then the growth chart and the return contributions.',
      'Move to the Fama–French section: exposures with their intervals, then where the risk comes from.',
      'Check whether the exposures were steady over time and which assets bring them.',
    ],
    regions: [
      {
        key: 'universe-bar',
        label: 'Shared universe',
        what: 'The tickers and sample dates; the benchmark and factors are compared over these dates.',
        read: [
          'All numbers here are in-sample: the weights were chosen on the same data, so they flatter the portfolio.',
        ],
      },
      {
        key: 'panel',
        label: 'Portfolio and benchmark',
        what: 'The portfolio (fixed weights from the full sample) and the benchmark ticker: any Yahoo Finance symbol.',
        read: [
          'Choose what you would otherwise hold: SPY for US large caps, ACWI for global equities, AGG for US bonds.',
        ],
        try: 'Change the Ticker from SPY to AGG: for a stock-heavy portfolio beta falls toward zero and tracking error rises, because a bond index explains little of it.',
      },
      {
        key: 'stats',
        label: 'Benchmark statistics',
        what: 'Jensen’s alpha (annual, over cash), beta, tracking error with active return, information ratio, and upside and downside capture.',
        read: [
          'Beta below 1 with positive alpha: more return than the market exposure alone explains.',
          'Information ratio is active return per unit of tracking error; 0.5 sustained is considered good.',
          'Upside capture above downside capture is the shape of a defensive portfolio that still keeps up.',
        ],
      },
      {
        key: 'Growth of $1: ',
        match: 'prefix',
        label: 'Growth vs benchmark',
        what: 'Wealth from one dollar in the portfolio at its fixed weights and in the benchmark, over the same dates.',
        read: [
          'The gap between the lines is the accumulated active return.',
          'Periods where the lines run parallel are where beta did the work; diverging stretches are where alpha or other exposures did.',
        ],
      },
      {
        key: 'Return contribution by asset',
        label: 'Return contributions',
        what: 'Each asset’s weight times its annualised return; the bars add up to the portfolio’s arithmetic return.',
        read: [
          'One tall bar means the result depends on a single holding.',
          'Compare with risk contributions on the decomposition page: an asset adding far more risk than return deserves a look.',
        ],
      },
      {
        key: 'Factor exposures',
        label: 'Factor exposures',
        what: 'The portfolio’s beta to each of the six Fama–French factors, with 95% intervals from Newey–West standard errors. Blue betas are significant at 5%.',
        read: [
          'Market near 1: moves with US stocks. Value positive: behaves like cheap minus expensive stocks. Size negative: like large companies.',
          'A whisker crossing zero means the data cannot tell the exposure apart from none.',
        ],
      },
      {
        key: 'Exposure statistics',
        label: 'Exposure table',
        what: 'Beta, 95% interval, t-statistic and p-value per factor.',
        read: [
          '|t| above about 2 corresponds to p below 5%.',
          'Read the size too: a significant beta of 0.05 is real but barely moves the portfolio.',
        ],
      },
      {
        key: 'Where the risk comes from',
        label: 'Factor risk split',
        what: 'The variance of the excess return split into each factor’s Euler contribution and the idiosyncratic rest; the bars add up to 100%.',
        read: [
          'A large market bar is normal for a stock portfolio.',
          'A large idiosyncratic bar means the result depends on the particular assets, or on assets the US-stock factors do not describe (bonds, commodities).',
          'A negative bar is a hedge: that exposure lowers total variance.',
        ],
      },
      {
        key: 'Exposures over time',
        label: 'Rolling betas',
        what: 'Betas re-estimated on each trailing year, every week, for up to four factors at once.',
        read: [
          'A steady line is a dependable tilt; one that flips sign is not.',
          'One year of daily data still gives some wobble from noise alone.',
        ],
      },
      {
        key: 'Exposures by asset',
        label: 'Per-asset exposures',
        what: 'The same regression on each asset alone, coloured by sign, with each asset’s R².',
        read: [
          'The portfolio’s betas are the weighted average of these rows, so this shows which holdings bring each tilt.',
          'Bonds, commodities and foreign assets usually have a low R²: their risk lies outside these US-stock factors.',
        ],
      },
    ],
  },
]
