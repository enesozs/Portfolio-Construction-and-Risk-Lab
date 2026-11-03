"""Walk-forward validation: re-estimate and re-allocate on a schedule, using only past data.

At each rebalance date the allocator sees the trailing `lookback` days (or everything so far
with an expanding window) and its weights are held, drifting with the market, until the next
rebalance. Turnover is measured against those drifted weights, so trading costs reflect what
actually had to be bought and sold.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from portlab.backtest import BacktestResult, run_backtest
from portlab.estimators.estimates import estimate
from portlab.optimization.registry import Constraints, allocate


@dataclass(frozen=True)
class WalkForwardResult:
    backtest: BacktestResult
    targets: pd.DataFrame
    """Target weights chosen at each rebalance date (index = decision date)."""
    predicted_volatility: pd.Series
    """Ex-ante annualised volatility of each target, from the estimation window."""
    realized_volatility: pd.Series
    """Annualised volatility actually realised until the next rebalance."""


def walk_forward_portfolio(
    returns: pd.DataFrame,
    method: str,
    *,
    constraints: Constraints | None = None,
    lookback: int = 252,
    rebalance_every: int = 21,
    window: str = "rolling",
    return_method: str = "arithmetic",
    covariance_method: str = "sample",
    cost_bps: float = 0.0,
    cash_returns: pd.Series | None = None,
) -> WalkForwardResult:
    clean = returns.dropna(how="any").astype(float)
    if len(clean) <= lookback + rebalance_every:
        raise ValueError("insufficient observations for the requested lookback and frequency")
    if window not in {"rolling", "expanding"}:
        raise ValueError("window must be 'rolling' or 'expanding'")
    if rebalance_every < 1:
        raise ValueError("rebalance_every must be at least 1")
    constraints = constraints or Constraints()
    cash = (
        pd.Series(0.0, index=clean.index)
        if cash_returns is None
        else cash_returns.reindex(clean.index).fillna(0.0)
    )

    decisions: list[tuple[object, pd.Series, float]] = []

    def fit(end: int) -> pd.Series:
        """Allocate with data from days [start, end) of the full sample."""
        start = 0 if window == "expanding" else max(0, end - lookback)
        train = clean.iloc[start:end]
        est = estimate(
            train,
            return_method=return_method,
            cov_method=covariance_method,
            risk_free=float(cash.iloc[start:end].mean() * 252),
        )
        w = allocate(method, est, constraints)
        w_arr = w.to_numpy(dtype=float)
        predicted = float(np.sqrt(max(w_arr @ est.cov.to_numpy(dtype=float) @ w_arr, 0.0)))
        decisions.append((clean.index[end - 1], w, predicted))
        return w

    test = clean.iloc[lookback:]
    last = len(test) - 1

    def decide(i: int, _: pd.Series) -> pd.Series | None:
        if (i + 1) % rebalance_every == 0 and i < last:
            return fit(lookback + i + 1)
        return None

    initial = fit(lookback)
    result = run_backtest(
        test, initial, decide, cash_returns=cash.iloc[lookback:], cost_bps=cost_bps
    )

    dates = [d for d, _, _ in decisions]
    targets = pd.DataFrame([w for _, w, _ in decisions], index=dates)
    predicted = pd.Series([p for _, _, p in decisions], index=dates, name="predicted")
    # Each day is held under the latest decision made at an earlier close.
    active = np.searchsorted(pd.DatetimeIndex(dates).values, test.index.values, "left") - 1
    realized = result.gross_returns.groupby(active).std(ddof=1) * np.sqrt(252)
    realized.index = [dates[int(k)] for k in realized.index]
    realized = realized.reindex(dates).rename("realized")
    return WalkForwardResult(
        backtest=result,
        targets=targets,
        predicted_volatility=predicted,
        realized_volatility=realized,
    )
