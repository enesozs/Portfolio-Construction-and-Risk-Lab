import type { Chapter } from './types'

export const CHAPTER: Chapter = {
  id: '05-validation',
  title: 'Validation',
  summary:
    'How much to trust an allocation: walk-forward tests without look-ahead, after costs and against equal weight and cash; rebalancing rules; bootstrap stability of the weights; and, when many methods are compared, significance tests and the probability of backtest overfitting.',
  area: '/validate',
  areaLabel: 'Validate',
  experiments: [
    {
      title: 'In-sample winners, out-of-sample reality',
      to: '/validate',
      steps: [
        'Set Method to Maximum Sharpe.',
        'Compare the first and third rows of Out-of-sample performance (after costs vs equal weight).',
        'Switch Method to Minimum Variance, then Window type to Expanding.',
      ],
      notice:
        'Maximum Sharpe looks best on the Construct pages because it was fitted to the same data. Walked forward, it must rely on noisy mean estimates, and its targets jump between rebalances, so it often trails equal weight after costs. Minimum variance uses only the covariance, which is estimated far more precisely, so its targets are steadier and its predicted volatility tracks the realised one more closely. An expanding window calms the weights further.',
    },
    {
      title: 'Cost against tracking error',
      to: '/validate/rebalancing',
      steps: [
        'Set Cost per dollar traded to 20 bp.',
        'Under Calendar: every, compare 1 wk with 1 yr.',
        'Set Threshold: any asset off by to 10% and read Policies side by side.',
      ],
      notice:
        'Weekly rebalancing keeps tracking error lowest and pays the most; yearly is cheap but drifts. The threshold rule trades only when drift is large enough to matter, so it usually reaches a tracking error close to a monthly calendar with far fewer rebalances. The growth lines barely differ: rebalancing changes which portfolio you hold more than the long-run return.',
    },
    {
      title: 'How much of the allocation is noise?',
      to: '/validate/bootstrap',
      steps: [
        'With Method on Maximum Sharpe, read Average 5–95% range.',
        'Switch Method to Minimum Variance, then Risk Parity.',
        'Switch Sampling between Block and Day by day.',
      ],
      notice:
        'Maximum Sharpe’s weights swing widely across resamples, often from 0% to large positions, because small changes in estimated means move it a lot. Minimum variance and risk parity depend only on the covariance and stay in much narrower ranges. Block sampling keeps calm and turbulent stretches intact, which usually widens the ranges a little compared with day-by-day draws.',
    },
    {
      title: 'Is the best backtest really best?',
      to: '/validate/compare',
      steps: [
        'Read the p column of Every method, out of sample and the Significantly different tile.',
        'Read Probability of backtest overfitting.',
        'Change Lookback to 6 mo, then to 3 yr.',
      ],
      notice:
        'Most methods show no significant difference from equal weight: over a few years, Sharpe gaps of 0.2–0.3 are within noise. With many tests at 5%, one or two significant results can appear by chance. PBO measures how often the in-sample winner falls to the bottom half on unseen data; if it moves a lot with the lookback, the ranking depends on the settings, which is itself a sign of fragility.',
    },
  ],
}
