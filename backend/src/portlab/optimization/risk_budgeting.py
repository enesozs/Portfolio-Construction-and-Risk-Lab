from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.optimize import minimize

from portlab.portfolio.metrics import portfolio_volatility


def risk_budget_portfolio(
    covariance: pd.DataFrame,
    budgets: pd.Series,
    min_weight: float = 0.0,
    max_weight: float = 1.0,
) -> pd.Series:
    assets = list(covariance.columns)
    n = len(assets)
    b = budgets.reindex(assets).fillna(0.0).astype(float)
    if (b < 0).any() or float(b.sum()) <= 0:
        raise ValueError("risk budgets must be non-negative and sum to a positive value")
    b = b / float(b.sum())
    if min_weight * n > 1.0 + 1e-9 or max_weight * n < 1.0 - 1e-9:
        raise ValueError("weight bounds are infeasible")
    cov = covariance.to_numpy(dtype=float)

    def objective(w: np.ndarray) -> float:
        variance = float(w @ cov @ w)
        if variance <= 0:
            return 1e6
        component = w * (cov @ w) / np.sqrt(variance)
        pct = component / float(component.sum())
        return float(np.sum((pct - b.to_numpy(dtype=float)) ** 2))

    x0 = np.repeat(1.0 / n, n)
    result = minimize(
        objective,
        x0,
        method="SLSQP",
        bounds=tuple((min_weight, max_weight) for _ in range(n)),
        constraints=({"type": "eq", "fun": lambda w: float(np.sum(w) - 1.0)},),
        options={"maxiter": 2000, "ftol": 1e-12},
    )
    if not result.success:
        raise RuntimeError(f"risk-budget optimization failed: {result.message}")
    out = pd.Series(result.x, index=assets, name="weight", dtype=float)
    # Force evaluation during tests and catch degenerate output early.
    if portfolio_volatility(out, covariance) <= 0:
        raise RuntimeError("risk-budget optimization produced zero volatility")
    return out
