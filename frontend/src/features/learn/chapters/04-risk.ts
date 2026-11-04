import type { Chapter } from './types'

export const CHAPTER: Chapter = {
  id: '04-risk',
  title: 'Risk',
  summary:
    'Where volatility comes from (marginal and component risk, diversification), what stress and real crises do to a portfolio, Value at Risk and expected shortfall with backtests of four models, and Monte Carlo under five return models.',
  area: '/risk',
  areaLabel: 'Risk',
  experiments: [
    {
      title: 'Equal capital is not equal risk',
      to: '/risk',
      steps: [
        'Set Portfolio to Equal Weight and read Capital weight vs risk contribution.',
        'Switch Portfolio to Risk Parity.',
        'Compare the Effective assets (HHI) and Diversification ratio tiles between the two.',
      ],
      notice:
        'With equal weights, the volatile and correlated assets cause far more than their share of the volatility. Risk parity equalises the risk shares instead, which means less capital in those assets and more in calm ones. The effective number of assets falls, because it counts capital, while the diversification ratio usually rises.',
    },
    {
      title: 'Diversification disappears when correlations rise',
      to: '/risk/stress',
      steps: [
        'Set Push correlations toward +1 to 100% and Volatility multiplier to 1.0.',
        'Read the Correlation stress only tile and the curve in Portfolio volatility as correlations rise.',
        'Click the scenario presets Equity crash, then Rate shock.',
      ],
      notice:
        'At 100% every asset moves in lockstep and volatility becomes the weighted average of the asset volatilities: everything diversification removed comes back. In Equity crash, bonds and gold offset part of the loss; in Rate shock (2022-style) they fall too, and the hedge is gone exactly when stocks drop.',
    },
    {
      title: 'Fixed windows react slowly; EWMA reacts fast',
      to: '/risk/var',
      steps: [
        'Keep Confidence at 99% and Estimation window at 250 days.',
        'In Four VaR models, tested out of sample, compare the exception counts and Independence p.',
        'In the chart, switch the model between Historical and EWMA, with the period set to All.',
      ],
      notice:
        'The historical VaR moves only as days enter and leave its 250-day window, so after a calm year it is low when a sell-off arrives, and exceptions bunch together. The EWMA volatility weights the last few weeks most, so its line jumps within days. Filtered historical combines that speed with the fat tails of history.',
    },
    {
      title: 'Fat tails, and the two kinds of error',
      to: '/risk/simulation',
      steps: [
        'Set Return model to Normal and note VaR 95% and Probability of a 20% drawdown.',
        'Switch to Student-t and lower Degrees of freedom to 3.',
        'Set Paths to 1k, then 20k, and watch the ± values.',
      ],
      notice:
        'Shared fat-tailed shocks make bad days hit every asset together, so the tail numbers grow even though the covariance is the same. More paths shrink the ± (Monte Carlo error falls like 1/√paths), but the difference between models stays: model error is the larger uncertainty, and no number of paths removes it.',
    },
  ],
}
