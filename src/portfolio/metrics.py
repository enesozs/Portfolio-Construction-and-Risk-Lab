from __future__ import annotations

from collections.abc import Iterable, Sequence
from typing import Hashable

import numpy as np
import pandas as pd
from numpy.typing import NDArray

WeightLike = pd.Series | Sequence[float] | NDArray[np.floating]


def as_weights(weights: WeightLike, assets: Iterable[Hashable]) -> pd.Series:
    asset_index = pd.Index(list(assets))
    if isinstance(weights, pd.Series):
        w = weights.astype(float).reindex(asset_index)
    else:
        w = pd.Series(weights, index=asset_index, dtype=float)
    if w.isna().any():
        raise ValueError("weights missing one or more assets")
    return w


def portfolio_return(weights: WeightLike, expected_returns: pd.Series) -> float:
    w = as_weights(weights, expected_returns.index)
    w_arr = w.to_numpy(dtype=float)
    mu_arr = expected_returns.to_numpy(dtype=float)
    return float(w_arr @ mu_arr)


def portfolio_variance(weights: WeightLike, covariance: pd.DataFrame) -> float:
    w = as_weights(weights, covariance.columns)
    w_arr = w.to_numpy(dtype=float)
    cov_arr = covariance.to_numpy(dtype=float)
    return float(w_arr @ cov_arr @ w_arr)


def portfolio_volatility(weights: WeightLike, covariance: pd.DataFrame) -> float:
    return float(np.sqrt(max(portfolio_variance(weights, covariance), 0.0)))


def portfolio_sharpe(
    weights: WeightLike,
    expected_returns: pd.Series,
    covariance: pd.DataFrame,
    risk_free_rate: float = 0.0,
) -> float:
    vol = portfolio_volatility(weights, covariance)
    if vol <= 0:
        return float("nan")
    return float((portfolio_return(weights, expected_returns) - risk_free_rate) / vol)


def portfolio_returns_series(returns: pd.DataFrame, weights: WeightLike) -> pd.Series:
    w = as_weights(weights, returns.columns)
    return returns.mul(w, axis=1).sum(axis=1)


def performance_summary(
    portfolio_returns: pd.Series,
    periods_per_year: int = 252,
    risk_free_rate: float = 0.0,
) -> dict[str, float]:
    r = portfolio_returns.dropna().astype(float)
    if r.empty:
        return {
            k: float("nan")
            for k in [
                "annual_return",
                "annual_volatility",
                "sharpe",
                "sortino",
                "max_drawdown",
                "calmar",
            ]
        }

    values = r.to_numpy(dtype=float)
    ann_ret = float(np.prod(1.0 + values) ** (periods_per_year / len(values)) - 1.0)
    ann_vol = float(np.std(values, ddof=1) * np.sqrt(periods_per_year))
    sharpe = float((ann_ret - risk_free_rate) / ann_vol) if ann_vol > 0 else float("nan")

    downside_values = values[values < 0]
    downside = (
        float(np.std(downside_values, ddof=1) * np.sqrt(periods_per_year))
        if len(downside_values) > 1
        else float("nan")
    )
    sortino = (
        float((ann_ret - risk_free_rate) / downside)
        if np.isfinite(downside) and downside > 0
        else float("nan")
    )

    wealth = np.cumprod(1.0 + values)
    running_max = np.maximum.accumulate(wealth)
    drawdowns = wealth / running_max - 1.0
    mdd = float(np.min(drawdowns))
    calmar = float(ann_ret / abs(mdd)) if mdd < 0 else float("nan")

    return {
        "annual_return": ann_ret,
        "annual_volatility": ann_vol,
        "sharpe": sharpe,
        "sortino": sortino,
        "max_drawdown": mdd,
        "calmar": calmar,
    }
