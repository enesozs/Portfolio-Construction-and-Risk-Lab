from __future__ import annotations

import numpy as np
import pandas as pd


def benchmark_statistics(
    portfolio_returns: pd.Series,
    benchmark_returns: pd.Series,
    periods_per_year: int = 252,
    cash_returns: pd.Series | None = None,
) -> dict[str, float]:
    """Beta, Jensen's alpha and active-risk statistics against a benchmark.

    Beta and alpha come from regressing the portfolio's returns in excess of cash on the
    benchmark's: rₚ − r_f = α + β(r_b − r_f). Without `cash_returns` the cash rate is taken
    as zero. Tracking error and the information ratio use the plain return gap rₚ − r_b,
    where cash cancels.
    """
    joined = pd.concat(
        [portfolio_returns.rename("portfolio"), benchmark_returns.rename("benchmark")],
        axis=1,
        sort=True,
    ).dropna()
    if len(joined) < 20:
        raise ValueError("insufficient overlapping observations with benchmark")
    cash = (
        np.zeros(len(joined))
        if cash_returns is None
        else cash_returns.reindex(joined.index).fillna(0.0).to_numpy(dtype=float)
    )
    raw_p = joined["portfolio"].to_numpy(dtype=float)
    raw_b = joined["benchmark"].to_numpy(dtype=float)
    p, b = raw_p - cash, raw_b - cash
    b_var = float(np.var(b, ddof=1))
    beta = float(np.cov(p, b, ddof=1)[0, 1] / b_var) if b_var > 0 else float("nan")
    alpha_daily = float(np.mean(p) - beta * np.mean(b)) if np.isfinite(beta) else float("nan")
    alpha = alpha_daily * periods_per_year
    active = p - b
    tracking_error = float(np.std(active, ddof=1) * np.sqrt(periods_per_year))
    active_return = float(np.mean(active) * periods_per_year)
    information_ratio = active_return / tracking_error if tracking_error > 0 else float("nan")
    # Capture ratios split on the benchmark's actual up and down days.
    up, down = raw_b > 0, raw_b < 0
    upside_capture = float(np.mean(raw_p[up]) / np.mean(raw_b[up])) if up.any() else float("nan")
    downside_capture = (
        float(np.mean(raw_p[down]) / np.mean(raw_b[down])) if down.any() else float("nan")
    )
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
