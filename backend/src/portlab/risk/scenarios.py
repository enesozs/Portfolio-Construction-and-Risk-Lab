from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from portlab.portfolio.metrics import performance_summary, portfolio_returns_series

HISTORICAL_CRISES: dict[str, tuple[str, str]] = {
    "Dot-com bust": ("2000-03-24", "2002-10-09"),
    "Global Financial Crisis": ("2008-09-01", "2009-03-31"),
    "Eurozone / US downgrade": ("2011-07-01", "2011-10-31"),
    "Q4 2018 selloff": ("2018-10-01", "2018-12-31"),
    "COVID crash": ("2020-02-19", "2020-03-23"),
    "2022 rate shock": ("2022-01-03", "2022-10-14"),
    "2025 tariff shock": ("2025-02-19", "2025-04-08"),
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


@dataclass(frozen=True)
class CrisisReplay:
    wealth: pd.Series
    """Growth of 1 through the period (daily)."""
    drawdown: pd.Series
    stats: dict[str, float]
    available: list[str]
    missing: list[str]
    """Assets with no prices during the period (listed later); their weight is redistributed."""
    missing_weight: float


def replay_historical_period(
    returns: pd.DataFrame,
    weights: pd.Series,
    start: str,
    end: str,
) -> CrisisReplay:
    """Apply today's static weights to the assets' actual returns during a past period.

    `recovery_trading_days` counts days from the trough until the portfolio regains its
    pre-crisis peak, continuing past the period end with the same drifting holdings (NaN if
    it never did within the available data).

    `returns` should cover each asset's full history (NaN before it listed), independent of
    the research sample. Assets that did not trade for the whole period are dropped and the
    remaining weights rescaled to sum to one, and the result reports which ones were missing.
    """
    period = returns.loc[pd.Timestamp(start) : pd.Timestamp(end)]
    if period.empty:
        raise ValueError("no market data covers the selected period")
    w = weights.astype(float)
    names = [str(a) for a in w.index]
    complete = period.notna().all()
    available = [a for a in names if a in period.columns and bool(complete[a])]
    missing = [a for a in names if a not in available]
    if not available or float(w[available].sum()) <= 0:
        raise ValueError(
            "none of the portfolio's assets traded through this period: " + ", ".join(missing)
        )
    rescaled = w[available] / float(w[available].sum())
    p = portfolio_returns_series(period[available], rescaled)
    perf = performance_summary(p)
    wealth = (1.0 + p).cumprod()
    peak = np.maximum.accumulate(np.concatenate([[1.0], wealth.to_numpy(dtype=float)]))[1:]
    drawdown = pd.Series(wealth.to_numpy(dtype=float) / peak - 1.0, index=wealth.index)
    trough = int(np.argmin(drawdown.to_numpy(dtype=float)))
    # Crisis windows usually end near the bottom, so recovery is measured on the data that
    # follows: the same holdings, left to drift, until they regain the pre-crisis peak.
    after = returns.loc[pd.Timestamp(end) + pd.Timedelta(days=1) :, available].dropna(how="any")
    drifted = rescaled * (1.0 + period[available]).prod()
    tail = (
        float(wealth.iloc[-1])
        * (1.0 + portfolio_returns_series(after, drifted / drifted.sum())).cumprod()
        if len(after)
        else pd.Series(dtype=float)
    )
    path = np.concatenate([wealth.to_numpy(dtype=float)[trough:], tail.to_numpy(dtype=float)])
    recovered = np.flatnonzero(path >= peak[trough])
    return CrisisReplay(
        wealth=wealth,
        drawdown=drawdown,
        stats={
            "total_return": float(wealth.iloc[-1] - 1.0),
            "max_drawdown": float(drawdown.min()),
            "worst_day": float(p.min()),
            "annual_volatility": perf["annual_volatility"],
            "recovery_trading_days": float(recovered[0]) if len(recovered) else float("nan"),
        },
        available=available,
        missing=missing,
        missing_weight=float(w[missing].sum()) if missing else 0.0,
    )
