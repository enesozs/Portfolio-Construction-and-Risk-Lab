import type { PortfolioKey } from '@/lib/api'

interface PortfolioInfo {
  label: string
  idea: string
  /** Enforces the universe constraints (caps, shorting, groups, tracking error, holdings). */
  constrained: boolean
}

// Mirrors the backend registry (portlab.optimization.registry). Typed as a Record so adding an
// allocator to the API without listing it here is a compile error.
const INFO: Record<PortfolioKey, PortfolioInfo> = {
  equal_weight: {
    label: 'Equal Weight',
    idea: '1/n in every asset: no estimates at all.',
    constrained: false,
  },
  min_variance: {
    label: 'Minimum Variance',
    idea: 'The least volatile mix; uses only the covariance matrix.',
    constrained: true,
  },
  max_sharpe: {
    label: 'Maximum Sharpe',
    idea: 'Best expected return per unit of risk over cash; the most estimate-sensitive.',
    constrained: true,
  },
  risk_parity: {
    label: 'Risk Parity',
    idea: 'Each asset contributes the same share of portfolio volatility.',
    constrained: true,
  },
  max_diversification: {
    label: 'Maximum Diversification',
    idea: 'Gets the most volatility reduction out of correlations; no expected returns.',
    constrained: true,
  },
  min_cvar: {
    label: 'Minimum CVaR',
    idea: 'Smallest average loss on the worst 5% of historical days.',
    constrained: true,
  },
  kelly: {
    label: 'Growth-Optimal (Kelly)',
    idea: 'Highest average log growth on the historical days; aggressive by design.',
    constrained: true,
  },
  resampled: {
    label: 'Resampled Max Sharpe',
    idea: 'Max Sharpe averaged over resampled histories: smoother, less extreme.',
    constrained: true,
  },
  hrp: {
    label: 'Hierarchical Risk Parity',
    idea: 'Clusters similar assets, then splits risk between clusters; no matrix inversion.',
    constrained: false,
  },
  herc: {
    label: 'Hierarchical ERC',
    idea: 'Like HRP, but splits risk along the actual cluster tree.',
    constrained: false,
  },
  nco: {
    label: 'Nested Clustered (NCO)',
    idea: 'Minimum variance inside each cluster, then across clusters.',
    constrained: false,
  },
}

/** The standard allocators in backend registry order. */
export const PORTFOLIOS: ({ value: PortfolioKey } & PortfolioInfo)[] = (
  Object.keys(INFO) as PortfolioKey[]
).map((value) => ({ value, ...INFO[value] }))

export function portfolioLabel(key: string): string {
  return INFO[key as PortfolioKey]?.label ?? key
}
