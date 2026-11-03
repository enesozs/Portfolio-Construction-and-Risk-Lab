from __future__ import annotations

from collections.abc import Hashable, Iterable, Sequence

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
    cash_returns: pd.Series | float = 0.0,
) -> dict[str, float]:
    """Realised performance of a daily return series.

    `cash_returns` is the per-period cash (T-bill) return, as a series aligned by date or a
    constant. Sharpe and Sortino use returns *in excess of cash*: a portfolio only adds value
    beyond what risk-free bills would have paid. Sortino divides by the downside deviation,
    the root mean square of the negative excess returns over all periods.
    """
    r = portfolio_returns.dropna().astype(float)
    keys = ["annual_return", "annual_volatility", "sharpe", "sortino", "max_drawdown", "calmar"]
    if r.empty:
        return {k: float("nan") for k in keys}

    values = r.to_numpy(dtype=float)
    if isinstance(cash_returns, pd.Series):
        cash = cash_returns.reindex(r.index).fillna(0.0).to_numpy(dtype=float)
    else:
        cash = np.full(len(values), float(cash_returns))
    excess = values - cash

    ann_ret = float(np.prod(1.0 + values) ** (periods_per_year / len(values)) - 1.0)
    ann_vol = float(np.std(values, ddof=1) * np.sqrt(periods_per_year)) if len(values) > 1 else 0.0
    ann_excess = float(np.mean(excess) * periods_per_year)
    sharpe = ann_excess / ann_vol if ann_vol > 0 else float("nan")
    downside = float(np.sqrt(np.mean(np.minimum(excess, 0.0) ** 2)) * np.sqrt(periods_per_year))
    sortino = ann_excess / downside if downside > 0 else float("nan")

    wealth = np.cumprod(1.0 + values)
    running_max = np.maximum.accumulate(np.concatenate([[1.0], wealth]))[1:]
    mdd = float(np.min(wealth / running_max - 1.0))
    calmar = float(ann_ret / abs(mdd)) if mdd < 0 else float("nan")

    return {
        "annual_return": ann_ret,
        "annual_volatility": ann_vol,
        "sharpe": sharpe,
        "sortino": sortino,
        "max_drawdown": mdd,
        "calmar": calmar,
    }
