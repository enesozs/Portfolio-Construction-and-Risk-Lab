from __future__ import annotations

import numpy as np
import pandas as pd

from src.portfolio.metrics import WeightLike, as_weights, portfolio_volatility


def risk_contributions(weights: WeightLike, covariance: pd.DataFrame) -> pd.DataFrame:
    w = as_weights(weights, covariance.columns)
    vol = portfolio_volatility(w, covariance)
    if vol <= 0:
        raise ValueError("portfolio volatility must be positive")

    w_arr = w.to_numpy(dtype=float)
    cov_arr = covariance.to_numpy(dtype=float)
    marginal = cov_arr @ w_arr / vol
    component = w_arr * marginal
    pct = component / component.sum()

    return pd.DataFrame(
        {
            "weight": w_arr,
            "marginal_risk": marginal,
            "component_risk": component,
            "risk_contribution_pct": pct,
        },
        index=covariance.columns,
    )


def effective_number_of_assets(weights: WeightLike) -> float:
    w = np.asarray(pd.Series(weights, dtype=float), dtype=float)
    return float(1.0 / np.sum(np.square(w)))


def concentration_hhi(weights: WeightLike) -> float:
    w = np.asarray(pd.Series(weights, dtype=float), dtype=float)
    return float(np.sum(np.square(w)))


def diversification_ratio(weights: WeightLike, covariance: pd.DataFrame) -> float:
    w = as_weights(weights, covariance.columns)
    w_arr = w.to_numpy(dtype=float)
    cov_arr = covariance.to_numpy(dtype=float)
    asset_vol = np.sqrt(np.diag(cov_arr))
    weighted_avg_vol = float(w_arr @ asset_vol)
    port_vol = portfolio_volatility(w, covariance)
    return weighted_avg_vol / port_vol if port_vol > 0 else float("nan")
