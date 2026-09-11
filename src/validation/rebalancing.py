from __future__ import annotations

from typing import TypedDict

import numpy as np
import pandas as pd

from src.portfolio.metrics import as_weights, performance_summary


class RebalanceResult(TypedDict):
    returns: pd.Series
    weights: pd.DataFrame
    turnover: pd.Series
    performance: dict[str, float]
    rebalance_count: int
    total_cost: float


def simulate_rebalancing_policy(
    returns: pd.DataFrame,
    target_weights: pd.Series,
    policy: str = "calendar",
    rebalance_every: int = 21,
    threshold: float = 0.05,
    distance_threshold: float = 0.10,
    transaction_cost_bps: float = 0.0,
) -> RebalanceResult:
    clean = returns.dropna(how="any").astype(float)
    if clean.empty:
        raise ValueError("returns are empty")
    target = as_weights(target_weights, clean.columns)
    target = target / float(target.sum())
    w = target.copy()
    daily_returns: list[tuple[object, float]] = []
    weight_rows: list[pd.Series] = []
    turnover_rows: list[tuple[object, float]] = []
    rebalance_count = 0
    total_cost = 0.0

    for i, (date, row) in enumerate(clean.iterrows()):
        r = row.astype(float)
        p_ret = float(w.to_numpy(dtype=float) @ r.to_numpy(dtype=float))
        # drift weights after the day's move
        gross = w * (1.0 + r)
        denom = float(gross.sum())
        if denom > 0:
            drifted = gross / denom
        else:
            drifted = target.copy()

        do_rebalance = False
        if policy == "calendar":
            do_rebalance = (i + 1) % max(rebalance_every, 1) == 0
        elif policy == "threshold":
            do_rebalance = bool((drifted - target).abs().max() >= threshold)
        elif policy == "distance":
            do_rebalance = float((drifted - target).abs().sum() / 2.0) >= distance_threshold
        else:
            raise ValueError("policy must be calendar, threshold, or distance")

        turnover = 0.0
        cost = 0.0
        if do_rebalance:
            turnover = float((drifted - target).abs().sum() / 2.0)
            cost = turnover * transaction_cost_bps / 10_000.0
            p_ret -= cost
            w = target.copy()
            rebalance_count += 1
            total_cost += cost
        else:
            w = drifted

        daily_returns.append((date, p_ret))
        weight_rows.append(pd.Series(w, name=date, dtype=float))
        turnover_rows.append((date, turnover))

    out_returns = pd.Series(dict(daily_returns), name="portfolio_return", dtype=float)
    return {
        "returns": out_returns,
        "weights": pd.DataFrame(weight_rows),
        "turnover": pd.Series(dict(turnover_rows), name="turnover", dtype=float),
        "performance": performance_summary(out_returns),
        "rebalance_count": rebalance_count,
        "total_cost": float(total_cost),
    }
