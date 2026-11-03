"""One calling convention for every allocation method.

Walk-forward validation, bootstrap stability, estimator comparison and (later) dynamic
allocation all need "an allocator" as a parameter. Each one here takes the same two
arguments, an `Estimates` bundle and the user's `Constraints`, so callers never have to
guess which keyword arguments a method accepts.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import pandas as pd

from portlab.estimators.estimates import Estimates
from portlab.optimization.cvar import minimum_cvar
from portlab.optimization.hrp import hierarchical_risk_parity
from portlab.optimization.optimizers import (
    equal_weight,
    global_minimum_variance,
    maximum_sharpe,
    risk_parity,
)


@dataclass(frozen=True)
class Constraints:
    max_weight: float | None = None
    """Upper bound on any single asset's weight; None = no bound beyond 100%."""


Allocator = Callable[[Estimates, Constraints], pd.Series]


@dataclass(frozen=True)
class AllocatorSpec:
    key: str
    label: str
    fn: Allocator
    uses_expected_returns: bool
    """Whether the method needs expected returns (and so inherits their estimation error)."""


def _cap(c: Constraints) -> float:
    return 1.0 if c.max_weight is None else c.max_weight


ALLOCATORS: dict[str, AllocatorSpec] = {
    spec.key: spec
    for spec in [
        AllocatorSpec("equal_weight", "Equal Weight", lambda e, c: equal_weight(e.assets), False),
        AllocatorSpec(
            "min_variance",
            "Minimum Variance",
            lambda e, c: global_minimum_variance(e.cov, max_weight=c.max_weight),
            False,
        ),
        AllocatorSpec(
            "max_sharpe",
            "Maximum Sharpe",
            lambda e, c: maximum_sharpe(e.mu, e.cov, e.risk_free, max_weight=c.max_weight),
            True,
        ),
        AllocatorSpec(
            "risk_parity",
            "Risk Parity",
            lambda e, c: risk_parity(e.cov, max_weight=c.max_weight),
            False,
        ),
        AllocatorSpec(
            "hrp",
            "Hierarchical Risk Parity",
            lambda e, c: hierarchical_risk_parity(e.returns, covariance=e.cov),
            False,
        ),
        AllocatorSpec(
            "min_cvar",
            "Minimum CVaR",
            lambda e, c: minimum_cvar(e.returns, max_weight=_cap(c)),
            False,
        ),
    ]
}


def allocate(key: str, estimates: Estimates, constraints: Constraints) -> pd.Series:
    if key not in ALLOCATORS:
        raise ValueError(f"unknown allocation method: {key}")
    weights = ALLOCATORS[key].fn(estimates, constraints)
    return weights.reindex(estimates.assets).fillna(0.0).astype(float).rename("weight")
