from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.optimize import minimize


def annual_mean_standard_error(annual_variance: np.ndarray, observations: int) -> np.ndarray:
    """Standard error of an annualised mean estimated from `observations` daily returns.

    The annual mean is 252 × the daily mean, whose standard error is σ_daily/√T, so the
    annual standard error is 252·σ_daily/√T = √(252·σ²_annual/T).
    """
    return np.sqrt(252.0 * np.maximum(annual_variance, 0.0) / observations)


def robust_mean_variance(
    expected_returns: pd.Series,
    covariance: pd.DataFrame,
    observations: int,
    risk_aversion: float = 3.0,
    uncertainty_aversion: float = 2.0,
    min_weight: float = 0.0,
    max_weight: float = 1.0,
) -> pd.Series:
    """Mean-variance allocation with an explicit expected-return uncertainty penalty.

    The penalty uses approximate standard errors of the sample mean. It is a
    pragmatic robust-optimization formulation rather than a claim that the
    uncertainty set is known exactly.
    """
    assets = list(expected_returns.index)
    n = len(assets)
    if observations < 2:
        raise ValueError("observations must be >= 2")
    if risk_aversion < 0 or uncertainty_aversion < 0:
        raise ValueError("aversion parameters must be non-negative")
    if min_weight * n > 1.0 + 1e-9 or max_weight * n < 1.0 - 1e-9:
        raise ValueError("weight bounds are infeasible")
    mu = expected_returns.to_numpy(dtype=float)
    cov = covariance.reindex(index=assets, columns=assets).to_numpy(dtype=float)
    mean_se = annual_mean_standard_error(np.diag(cov), observations)

    def objective(w: np.ndarray) -> float:
        ret = float(w @ mu)
        var = float(w @ cov @ w)
        uncertainty = float(np.sqrt(np.sum((w * mean_se) ** 2)))
        utility = ret - risk_aversion * var - uncertainty_aversion * uncertainty
        return -utility

    result = minimize(
        objective,
        np.repeat(1.0 / n, n),
        method="SLSQP",
        bounds=tuple((min_weight, max_weight) for _ in range(n)),
        constraints=({"type": "eq", "fun": lambda w: float(np.sum(w) - 1.0)},),
        options={"maxiter": 2000, "ftol": 1e-10},
    )
    if not result.success:
        raise RuntimeError(f"robust optimization failed: {result.message}")
    return pd.Series(result.x, index=assets, name="weight", dtype=float)
