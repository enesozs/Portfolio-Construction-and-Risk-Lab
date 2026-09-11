from __future__ import annotations

import numpy as np
import pandas as pd

from src.portfolio.metrics import portfolio_volatility


def stressed_covariance(
    covariance: pd.DataFrame,
    *,
    correlation_stress: float = 0.0,
    volatility_multiplier: float = 1.0,
) -> pd.DataFrame:
    """Create a covariance stress by increasing common correlation and/or volatility.

    correlation_stress is a blend weight in [0, 1]: 0 leaves the correlation matrix
    unchanged and 1 moves every off-diagonal correlation to +1. A convex blend with the
    all-ones correlation matrix preserves positive semidefiniteness up to numerical noise.
    """
    if not 0.0 <= correlation_stress <= 1.0:
        raise ValueError("correlation_stress must lie between 0 and 1")
    if volatility_multiplier <= 0:
        raise ValueError("volatility_multiplier must be positive")

    cov = covariance.astype(float)
    arr = cov.to_numpy(dtype=float)
    vols = np.sqrt(np.clip(np.diag(arr), 0.0, None))
    denom = np.outer(vols, vols)
    corr = np.divide(arr, denom, out=np.eye(len(vols)), where=denom > 0)
    corr = np.clip(corr, -1.0, 1.0)

    stressed_corr = (1.0 - correlation_stress) * corr + correlation_stress * np.ones_like(corr)
    np.fill_diagonal(stressed_corr, 1.0)
    stressed_vols = vols * volatility_multiplier
    stressed = stressed_corr * np.outer(stressed_vols, stressed_vols)
    stressed = (stressed + stressed.T) / 2.0
    return pd.DataFrame(stressed, index=cov.index, columns=cov.columns)


def stress_test_portfolio(
    weights: pd.Series,
    covariance: pd.DataFrame,
    *,
    correlation_stress: float = 0.0,
    volatility_multiplier: float = 1.0,
) -> dict[str, float]:
    base_vol = portfolio_volatility(weights, covariance)
    stressed_cov = stressed_covariance(
        covariance,
        correlation_stress=correlation_stress,
        volatility_multiplier=volatility_multiplier,
    )
    stressed_vol = portfolio_volatility(weights, stressed_cov)
    increase = stressed_vol / base_vol - 1.0 if base_vol > 0 else float("nan")
    return {
        "base_volatility": base_vol,
        "stressed_volatility": stressed_vol,
        "volatility_increase": increase,
    }
