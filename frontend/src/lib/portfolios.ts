import type { PortfolioKey } from '@/lib/api'

/** The standard allocators (backend registry order), with a one-line idea for each. */
export const PORTFOLIOS: { value: PortfolioKey; label: string; idea: string }[] = [
  {
    value: 'equal_weight',
    label: 'Equal Weight',
    idea: '1/n in every asset: no estimates at all.',
  },
  {
    value: 'min_variance',
    label: 'Minimum Variance',
    idea: 'The least volatile mix; uses only the covariance matrix.',
  },
  {
    value: 'max_sharpe',
    label: 'Maximum Sharpe',
    idea: 'Best expected return per unit of risk over cash; the most estimate-sensitive.',
  },
  {
    value: 'risk_parity',
    label: 'Risk Parity',
    idea: 'Each asset contributes the same share of portfolio volatility.',
  },
  {
    value: 'hrp',
    label: 'Hierarchical Risk Parity',
    idea: 'Clusters similar assets, then splits risk between clusters; no matrix inversion.',
  },
  {
    value: 'min_cvar',
    label: 'Minimum CVaR',
    idea: 'Smallest average loss on the worst 5% of historical days.',
  },
]

export function portfolioLabel(key: string): string {
  return PORTFOLIOS.find((p) => p.value === key)?.label ?? key
}
