from __future__ import annotations

import numpy as np
import pandas as pd


def benchmark_statistics(
    portfolio_returns: pd.Series,
    benchmark_returns: pd.Series,
    periods_per_year: int = 252,
) -> dict[str, float]:
    joined = pd.concat(
        [portfolio_returns.rename("portfolio"), benchmark_returns.rename("benchmark")], axis=1
    ).dropna()
    if len(joined) < 20:
        raise ValueError("insufficient overlapping observations with benchmark")
    p = joined["portfolio"].to_numpy(dtype=float)
    b = joined["benchmark"].to_numpy(dtype=float)
    b_var = float(np.var(b, ddof=1))
    beta = float(np.cov(p, b, ddof=1)[0, 1] / b_var) if b_var > 0 else float("nan")
    alpha_daily = float(np.mean(p) - beta * np.mean(b)) if np.isfinite(beta) else float("nan")
    alpha = alpha_daily * periods_per_year
    active = p - b
    tracking_error = float(np.std(active, ddof=1) * np.sqrt(periods_per_year))
    active_return = float(np.mean(active) * periods_per_year)
    information_ratio = active_return / tracking_error if tracking_error > 0 else float("nan")
    up = b > 0
    down = b < 0
    upside_capture = float(np.mean(p[up]) / np.mean(b[up])) if up.any() and np.mean(b[up]) != 0 else float("nan")
    downside_capture = float(np.mean(p[down]) / np.mean(b[down])) if down.any() and np.mean(b[down]) != 0 else float("nan")
    return {
        "alpha": alpha,
        "beta": beta,
        "active_return": active_return,
        "tracking_error": tracking_error,
        "information_ratio": information_ratio,
        "upside_capture": upside_capture,
        "downside_capture": downside_capture,
    }


def annualized_asset_contributions(returns: pd.DataFrame, weights: pd.Series) -> pd.Series:
    w = weights.reindex(returns.columns).fillna(0.0).astype(float)
    contrib = returns.mean() * 252.0 * w
    return contrib.sort_values(ascending=False).rename("annualized_return_contribution")
