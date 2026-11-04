import type { Chapter } from './types'

export const CHAPTER: Chapter = {
  id: '03-dynamic',
  title: 'Dynamic allocation',
  summary:
    'Timing signals that step in and out of assets, ranking signals that pick winners, four ways to turn them into weights, and an honest test: the same base rebalanced on the same schedule, with the probability deflated for the settings tried.',
  area: '/dynamic',
  areaLabel: 'Dynamic',
  experiments: [
    {
      title: 'A trend filter trades return for shallower drawdowns',
      to: '/dynamic',
      steps: [
        'Click the preset Trend filter → cash.',
        'Compare the Drawdown chart and the Max drawdown tile with the base.',
        'Look at When each asset was in and the Average in cash tile.',
        'Compare P(beats the base) with After trying neighbours.',
      ],
      notice:
        'The filter sits partly in cash after prices fall below their 200-day average, so in long declines its drawdown is shallower. In rising markets it gives up return during dips that recover, and every flip pays costs. The deflated probability is lower than the raw one because the best of several windows looks good partly by luck.',
    },
    {
      title: 'Dual momentum leaves empty slots in cash',
      to: '/dynamic',
      steps: [
        'Click the preset Dual momentum (top 3).',
        'Watch the grey cash band in Holdings over time.',
        'Read the Robustness: the neighbours you could have picked chart, which also varies Assets held (k).',
      ],
      notice:
        'Each of the three slots is worth a third of the portfolio, and only assets that also beat T-bills over the past year qualify. When fewer than three pass, the rest is held in cash, so the strategy de-risks on its own in broad sell-offs. If top 2 and top 4 tell a different story from top 3, the result depends on a lucky k.',
    },
    {
      title: 'Tilt strength is a dial from the base to a bet',
      to: '/dynamic',
      steps: [
        'Click the preset Momentum tilt.',
        'Set Tilt strength to 0 and read Side by side.',
        'Raise Tilt strength to 2 and compare the tracking error in the Side by side description.',
      ],
      notice:
        'At strength 0 the weights are exactly the base, so the strategy and the rebalanced base coincide. Raising the strength multiplies each weight by exp(strength × z-score), so the portfolio concentrates in the highest-scoring assets and wanders further from the base: tracking error rises, and the active return has to rise with it to be worth having.',
    },
    {
      title: 'Black–Litterman weighs the signal against risk',
      to: '/dynamic',
      steps: [
        'Click the preset Momentum as BL views.',
        'Move View confidence from 5% to 100%.',
        'Set View size (σ per z-score) to 0.',
      ],
      notice:
        'Low confidence keeps the posterior close to the base’s implied returns, so the weights stay near the base; full confidence lets the momentum views drive the optimiser. With a view size of 0 the views equal the prior and max Sharpe returns the base. Unlike the tilt, a strong score on a volatile or highly correlated asset moves its weight less, because the optimiser prices its risk.',
    },
  ],
}
