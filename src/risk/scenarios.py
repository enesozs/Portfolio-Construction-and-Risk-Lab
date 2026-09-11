from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from src.portfolio.metrics import performance_summary, portfolio_returns_series


HISTORICAL_CRISES: dict[str, tuple[str, str]] = {
    "Global Financial Crisis": ("2008-09-01", "2009-03-31"),
    "Eurozone / US downgrade": ("2011-07-01", "2011-10-31"),
    "Q4 2018 selloff": ("2018-10-01", "2018-12-31"),
    "COVID crash": ("2020-02-19", "2020-03-23"),
    "2022 rate shock": ("2022-01-03", "2022-10-14"),
}


@dataclass(frozen=True)
class ScenarioResult:
    portfolio_return: float
    contributions: pd.Series


def apply_return_scenario(weights: pd.Series, shocks: pd.Series) -> ScenarioResult:
    assets = weights.index.union(shocks.index)
    w = weights.reindex(assets).fillna(0.0).astype(float)
    s = shocks.reindex(assets).fillna(0.0).astype(float)
    contributions = w * s
    return ScenarioResult(float(contributions.sum()), contributions)


def replay_historical_period(
    returns: pd.DataFrame,
    weights: pd.Series,
    start: str,
    end: str,
) -> dict[str, float]:
    period = returns.loc[pd.Timestamp(start) : pd.Timestamp(end)].dropna(how="any")
    if period.empty:
        raise ValueError("selected historical scenario is outside the available data")
    p = portfolio_returns_series(period, weights)
    perf = performance_summary(p)
    wealth = (1.0 + p).cumprod()
    total_return = float(wealth.iloc[-1] - 1.0)
    worst_day = float(p.min())
    peak = wealth.cummax()
    drawdown = wealth / peak - 1.0
    recovery_days = float("nan")
    trough_pos = int(np.argmin(drawdown.to_numpy(dtype=float)))
    prior_peak_value = float(peak.iloc[trough_pos])
    after = wealth.iloc[trough_pos:]
    recovered = np.flatnonzero(after.to_numpy(dtype=float) >= prior_peak_value)
    if len(recovered):
        recovery_days = float(recovered[0])
    return {
        "total_return": total_return,
        "max_drawdown": float(drawdown.min()),
        "worst_day": worst_day,
        "annual_volatility": perf["annual_volatility"],
        "recovery_trading_days": recovery_days,
    }
