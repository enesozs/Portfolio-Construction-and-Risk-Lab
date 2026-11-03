"""One calling convention for every allocation method.

Walk-forward validation, bootstrap stability, estimator comparison and dynamic allocation
all need "an allocator" as a parameter. Each one here takes the same two arguments, an
`Estimates` bundle and the user's `Constraints`, so callers never have to guess which keyword
arguments a method accepts.

The convex methods (`optimization.convex`) honour every constraint exactly. The
cluster-based ones (HRP, HERC, NCO) and equal weight are long-only by construction and ignore
caps, group limits and tracking error: `respects_constraints` says which is which, and the
API reports it next to the weights.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import pandas as pd

from portlab.estimators.estimates import Estimates
from portlab.optimization import convex, hierarchical
from portlab.optimization.convex import Constraints, InfeasibleError
from portlab.optimization.hrp import hierarchical_risk_parity

__all__ = ["ALLOCATORS", "AllocatorSpec", "Constraints", "InfeasibleError", "allocate"]

Allocator = Callable[[Estimates, Constraints], pd.Series]


@dataclass(frozen=True)
class AllocatorSpec:
    key: str
    label: str
    fn: Allocator
    uses_expected_returns: bool
    """Whether the method needs expected returns (and so inherits their estimation error)."""
    respects_constraints: bool
    """Whether caps, shorting, group limits and tracking error are enforced."""
    idea: str


def _equal_weight(e: Estimates, _: Constraints) -> pd.Series:
    return pd.Series(1.0 / len(e.assets), index=e.assets)


ALLOCATORS: dict[str, AllocatorSpec] = {
    spec.key: spec
    for spec in [
        AllocatorSpec(
            "equal_weight",
            "Equal Weight",
            _equal_weight,
            False,
            False,
            "1/n in every asset: no estimates at all.",
        ),
        AllocatorSpec(
            "min_variance",
            "Minimum Variance",
            lambda e, c: convex.min_variance(e.cov, c),
            False,
            True,
            "The least volatile mix; uses only the covariance matrix.",
        ),
        AllocatorSpec(
            "max_sharpe",
            "Maximum Sharpe",
            lambda e, c: convex.max_sharpe(e.mu, e.cov, e.risk_free, c),
            True,
            True,
            "Best expected return per unit of risk over cash; the most estimate-sensitive.",
        ),
        AllocatorSpec(
            "risk_parity",
            "Risk Parity",
            lambda e, c: convex.risk_parity(e.cov, c),
            False,
            True,
            "Each asset contributes the same share of portfolio volatility.",
        ),
        AllocatorSpec(
            "max_diversification",
            "Maximum Diversification",
            lambda e, c: convex.max_diversification(e.cov, c),
            False,
            True,
            "Gets the most volatility reduction out of correlations; no expected returns.",
        ),
        AllocatorSpec(
            "min_cvar",
            "Minimum CVaR",
            lambda e, c: convex.min_cvar(e.returns, e.cov, 0.95, c),
            False,
            True,
            "Smallest average loss on the worst 5% of historical days.",
        ),
        AllocatorSpec(
            "kelly",
            "Growth-Optimal (Kelly)",
            lambda e, c: convex.growth_optimal(e.returns, e.cov, c),
            True,
            True,
            "Highest average log growth on the historical days; aggressive by design.",
        ),
        AllocatorSpec(
            "resampled",
            "Resampled Max Sharpe",
            lambda e, c: hierarchical.resampled(e.returns, e.risk_free, c, draws=60),
            True,
            True,
            "Max Sharpe averaged over resampled histories: smoother, less extreme.",
        ),
        AllocatorSpec(
            "hrp",
            "Hierarchical Risk Parity",
            lambda e, c: hierarchical_risk_parity(e.returns, covariance=e.cov),
            False,
            False,
            "Clusters similar assets, then splits risk between clusters; no matrix inversion.",
        ),
        AllocatorSpec(
            "herc",
            "Hierarchical ERC",
            lambda e, c: hierarchical.herc(e.cov),
            False,
            False,
            "Like HRP, but splits risk along the actual cluster tree.",
        ),
        AllocatorSpec(
            "nco",
            "Nested Clustered (NCO)",
            lambda e, c: hierarchical.nco(e.mu, e.cov, e.risk_free, "min_variance"),
            False,
            False,
            "Minimum variance inside each cluster, then across clusters.",
        ),
    ]
}


def allocate(key: str, estimates: Estimates, constraints: Constraints) -> pd.Series:
    if key not in ALLOCATORS:
        raise ValueError(f"unknown allocation method: {key}")
    weights = ALLOCATORS[key].fn(estimates, constraints)
    return weights.reindex(estimates.assets).fillna(0.0).astype(float).rename("weight")
