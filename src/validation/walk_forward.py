from __future__ import annotations

from collections.abc import Callable
from typing import Any, TypedDict

import numpy as np
import pandas as pd

from src.estimators.covariance import estimate_covariance
from src.estimators.returns import historical_expected_returns
from src.portfolio.metrics import performance_summary

Optimizer = Callable[..., pd.Series]


class WalkForwardResult(TypedDict):
    returns: pd.Series
    gross_returns: pd.Series
    weights: pd.DataFrame
    predicted_volatility: pd.Series
    realized_volatility: pd.Series
    turnover: pd.Series
    transaction_costs: pd.Series
    performance: dict[str, float]
    gross_performance: dict[str, float]


def walk_forward_portfolio(
    returns: pd.DataFrame,
    optimizer: Optimizer,
    lookback: int = 252,
    rebalance_every: int = 21,
    window: str = "rolling",
    return_method: str = "arithmetic",
    covariance_method: str = "sample",
    transaction_cost_bps: float = 0.0,
    **optimizer_kwargs: Any,
) -> WalkForwardResult:
    clean = returns.dropna(how="any").copy()
    if len(clean) <= lookback + rebalance_every:
        raise ValueError("insufficient observations for requested walk-forward settings")
    if window not in {"rolling", "expanding"}:
        raise ValueError("window must be 'rolling' or 'expanding'")
    if transaction_cost_bps < 0:
        raise ValueError("transaction_cost_bps must be non-negative")

    weight_rows: list[pd.Series] = []
    realized_gross: list[pd.Series] = []
    realized_net: list[pd.Series] = []
    predicted_vol: list[tuple[object, float]] = []
    realized_vol: list[tuple[object, float]] = []
    turnover_rows: list[tuple[object, float]] = []
    cost_rows: list[tuple[object, float]] = []
    previous_weights: pd.Series | None = None

    for start in range(lookback, len(clean), rebalance_every):
        train_start = 0 if window == "expanding" else max(0, start - lookback)
        train = clean.iloc[train_start:start]
        test = clean.iloc[start : min(start + rebalance_every, len(clean))]
        if test.empty:
            break

        mu = historical_expected_returns(train, method=return_method)
        cov = estimate_covariance(train, method=covariance_method)
        try:
            w = optimizer(expected_returns=mu, covariance=cov, **optimizer_kwargs)
        except TypeError:
            w = optimizer(covariance=cov, **optimizer_kwargs)
        w = w.reindex(clean.columns).fillna(0.0).astype(float)

        rebalance_date = test.index[0]
        turnover = (
            0.0
            if previous_weights is None
            else float((w - previous_weights).abs().sum() / 2.0)
        )
        cost = turnover * transaction_cost_bps / 10_000.0

        gross = test.mul(w, axis=1).sum(axis=1).astype(float)
        net = gross.copy()
        if len(net) > 0 and cost > 0:
            net.iloc[0] = float(net.iloc[0]) - cost

        realized_gross.append(gross)
        realized_net.append(net)
        weight_rows.append(pd.Series(w, name=rebalance_date, dtype=float))
        turnover_rows.append((rebalance_date, turnover))
        cost_rows.append((rebalance_date, cost))

        w_arr = w.to_numpy(dtype=float)
        cov_arr = cov.to_numpy(dtype=float)
        predicted_vol.append(
            (rebalance_date, float(np.sqrt(w_arr @ cov_arr @ w_arr)))
        )
        realized_vol.append(
            (
                rebalance_date,
                float(gross.std(ddof=1) * np.sqrt(252)) if len(gross) > 1 else float("nan"),
            )
        )
        previous_weights = w

    if not realized_net:
        raise RuntimeError("walk-forward produced no out-of-sample periods")

    gross_returns = pd.concat(realized_gross).sort_index()
    portfolio_returns = pd.concat(realized_net).sort_index()
    weights_df = pd.DataFrame(weight_rows)
    pred = pd.Series(dict(predicted_vol), name="predicted_volatility", dtype=float)
    real = pd.Series(dict(realized_vol), name="realized_volatility", dtype=float)
    turnover = pd.Series(dict(turnover_rows), name="turnover", dtype=float)
    costs = pd.Series(dict(cost_rows), name="transaction_cost", dtype=float)

    return {
        "returns": portfolio_returns,
        "gross_returns": gross_returns,
        "weights": weights_df,
        "predicted_volatility": pred,
        "realized_volatility": real,
        "turnover": turnover,
        "transaction_costs": costs,
        "performance": performance_summary(portfolio_returns),
        "gross_performance": performance_summary(gross_returns),
    }
