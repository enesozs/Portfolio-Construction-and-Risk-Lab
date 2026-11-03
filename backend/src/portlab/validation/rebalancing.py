"""When to rebalance back to a fixed target: on the calendar, or when weights drift too far."""

from __future__ import annotations

import pandas as pd

from portlab.backtest import CASH, BacktestResult, run_backtest
from portlab.portfolio.metrics import as_weights

POLICIES = ("calendar", "threshold", "distance")


def simulate_rebalancing_policy(
    returns: pd.DataFrame,
    target_weights: pd.Series,
    policy: str = "calendar",
    rebalance_every: int = 21,
    threshold: float = 0.05,
    distance_threshold: float = 0.10,
    cost_bps: float = 0.0,
    cash_returns: pd.Series | None = None,
) -> BacktestResult:
    """Hold `target_weights`, trading back to them whenever `policy` triggers.

    * calendar: every `rebalance_every` trading days;
    * threshold: when any single asset is `threshold` or more away from its target;
    * distance: when one-way distance from the target, sum(|w - target|) / 2, reaches
      `distance_threshold`.
    """
    if policy not in POLICIES:
        raise ValueError(f"policy must be one of {', '.join(POLICIES)}")
    clean = returns.dropna(how="any").astype(float)
    target = as_weights(target_weights, clean.columns)
    target = target / float(target.sum())
    every = max(int(rebalance_every), 1)

    def decide(i: int, drifted: pd.Series) -> pd.Series | None:
        gap = (drifted.drop(CASH) - target).abs()
        if policy == "calendar":
            trigger = (i + 1) % every == 0
        elif policy == "threshold":
            trigger = bool(gap.max() >= threshold)
        else:
            trigger = float(gap.sum() / 2.0) >= distance_threshold
        return target if trigger else None

    return run_backtest(clean, target, decide, cash_returns=cash_returns, cost_bps=cost_bps)
