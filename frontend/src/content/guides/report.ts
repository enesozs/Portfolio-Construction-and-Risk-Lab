import type { PageGuide } from './types'

export const REPORT: PageGuide[] = [
  {
    id: 'report-research',
    path: '/report',
    title: 'Research report',
    purpose:
      'One written summary of a chosen portfolio, built from a fixed set of analyses on the current universe, ready to download as Markdown and compare with a later run.',
    workflow: [
      'Pick the portfolio.',
      'Wait for the analyses to run (bootstrap, walk-forward, stress, crises, benchmark).',
      'Read the summary and the sections below it.',
      'Download the .md file to keep a record of this universe and date.',
    ],
    regions: [
      {
        key: 'universe-bar',
        label: 'Shared universe',
        what: 'The tickers, dates and estimators the report is built on.',
        read: [
          'The same universe and price data always give the same report: nothing depends on what you ran before.',
        ],
      },
      {
        key: 'panel',
        label: 'Portfolio and download',
        what: 'The portfolio the report describes, and a button to download it as Markdown.',
        read: [
          'Markdown opens in any text editor and renders on GitHub, Notion or Obsidian.',
          'Dated file names make it easy to compare reports over time.',
        ],
        try: 'Download the report for Maximum Sharpe and for Risk Parity, and compare their robustness and validation sections.',
      },
      {
        key: 'Executive Summary',
        label: 'The report',
        what: 'The executive summary across all methods, then robustness (100 block-bootstrap resamples), out-of-sample validation (monthly walk-forward on a rolling year, 5 bp costs), stress and crisis replays, and attribution against SPY.',
        read: [
          'The summary compares methods on model-implied (in-sample) Sharpe, volatility and diversification.',
          'The validation section is the out-of-sample check: compare its Sharpe with the expected one above.',
          'The most sample-sensitive weight is the one to treat as an estimate rather than a precise answer.',
        ],
      },
    ],
  },
]
