from __future__ import annotations

import numpy as np
import pandas as pd

from src.portfolio.metrics import as_weights, portfolio_volatility
from src.risk.decomposition import concentration_hhi, diversification_ratio, effective_number_of_assets


def diversification_breakdown(weights: pd.Series, covariance: pd.DataFrame) -> dict[str, float]:
    w = as_weights(weights, covariance.columns)
    w_arr = w.to_numpy(dtype=float)
    positive = w_arr[w_arr > 0]
    entropy = float(-np.sum(positive * np.log(positive))) if len(positive) else 0.0
    entropy_effective = float(np.exp(entropy))
    cov = covariance.to_numpy(dtype=float)
    vol = np.sqrt(np.maximum(np.diag(cov), 0.0))
    denom = np.outer(vol, vol)
    corr = np.divide(cov, denom, out=np.zeros_like(cov), where=denom > 0)
    pair_weight = np.outer(w_arr, w_arr)
    np.fill_diagonal(pair_weight, 0.0)
    pair_den = float(pair_weight.sum())
    weighted_corr = float((pair_weight * corr).sum() / pair_den) if pair_den > 0 else float("nan")
    weighted_asset_vol = float(w_arr @ vol)
    port_vol = portfolio_volatility(w, covariance)
    return {
        "hhi": concentration_hhi(w),
        "effective_assets_hhi": effective_number_of_assets(w),
        "entropy": entropy,
        "effective_assets_entropy": entropy_effective,
        "weighted_average_correlation": weighted_corr,
        "diversification_ratio": diversification_ratio(w, covariance),
        "volatility_diversification_benefit": weighted_asset_vol - port_vol,
    }


def marginal_diversification_contribution(weights: pd.Series, covariance: pd.DataFrame) -> pd.Series:
    w = as_weights(weights, covariance.columns)
    base = diversification_ratio(w, covariance)
    out: dict[str, float] = {}
    for asset in covariance.columns:
        reduced = w.copy()
        reduced.loc[asset] = 0.0
        total = float(reduced.sum())
        if total <= 0:
            out[str(asset)] = float("nan")
            continue
        reduced /= total
        out[str(asset)] = base - diversification_ratio(reduced, covariance)
    return pd.Series(out, name="marginal_diversification_contribution", dtype=float).sort_values(ascending=False)
