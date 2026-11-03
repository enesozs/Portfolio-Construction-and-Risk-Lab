from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.optimize import minimize

from portlab.portfolio.metrics import portfolio_sharpe, portfolio_variance


def _bounds(n: int, allow_short: bool, max_weight: float | None):
    lo = -1.0 if allow_short else 0.0
    hi = 1.0 if max_weight is None else float(max_weight)
    if hi <= 0:
        raise ValueError("max_weight must be positive")
    return tuple((lo, hi) for _ in range(n))


def _solve(objective, assets, allow_short=False, max_weight=None):
    n = len(assets)
    x0 = np.repeat(1 / n, n)
    constraints = ({"type": "eq", "fun": lambda w: np.sum(w) - 1.0},)
    result = minimize(
        objective,
        x0,
        method="SLSQP",
        bounds=_bounds(n, allow_short, max_weight),
        constraints=constraints,
    )
    if not result.success:
        raise RuntimeError(f"optimization failed: {result.message}")
    return pd.Series(result.x, index=assets, name="weight")


def equal_weight(assets) -> pd.Series:
    assets = list(assets)
    return pd.Series(1 / len(assets), index=assets, name="weight")


def global_minimum_variance(
    covariance: pd.DataFrame, allow_short: bool = False, max_weight: float | None = None
) -> pd.Series:
    return _solve(
        lambda w: portfolio_variance(w, covariance), covariance.columns, allow_short, max_weight
    )


def maximum_sharpe(
    expected_returns: pd.Series,
    covariance: pd.DataFrame,
    risk_free_rate: float = 0.0,
    allow_short: bool = False,
    max_weight: float | None = None,
) -> pd.Series:
    assets = expected_returns.index
    cov = covariance.reindex(index=assets, columns=assets)
    return _solve(
        lambda w: -portfolio_sharpe(w, expected_returns, cov, risk_free_rate),
        assets,
        allow_short,
        max_weight,
    )


def risk_parity(
    covariance: pd.DataFrame, allow_short: bool = False, max_weight: float | None = None
) -> pd.Series:
    assets = covariance.columns
    n = len(assets)

    def objective(w):
        sigma_w = covariance.values @ w
        port_var = float(w @ sigma_w)
        if port_var <= 0:
            return 1e6
        rc = w * sigma_w / np.sqrt(port_var)
        target = np.repeat(np.sqrt(port_var) / n, n)
        return float(np.sum((rc - target) ** 2))

    return _solve(objective, assets, allow_short, max_weight)
