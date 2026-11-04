from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from portlab.portfolio.metrics import performance_summary

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
    """Buy today's weights at the start of a past period and hold them through it.

    Positions are not rebalanced: each grows with its own asset, so the weights drift.

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
    held = np.array([float(w.at[a]) for a in available])
    held = held / held.sum()
    # Buy and hold: each position grows with its own asset, so weights drift with prices.
    # The same holdings are followed past the window, so recovery can be measured.
    history = returns.loc[pd.Timestamp(start) :, available].dropna(how="any")
    growth = (1.0 + history).cumprod().to_numpy(dtype=float)
    full = growth @ held
    in_window = int((history.index <= pd.Timestamp(end)).sum())
    values = full[:in_window]
    wealth = pd.Series(values, index=history.index[:in_window])
    p = wealth.pct_change().fillna(float(values[0]) - 1.0)
    perf = performance_summary(p)
    peak = np.maximum.accumulate(np.concatenate([[1.0], values]))[1:]
    drawdown = pd.Series(values / peak - 1.0, index=wealth.index)
    trough = int(np.argmin(drawdown.to_numpy(dtype=float)))
    recovered = np.flatnonzero(full[trough:] >= peak[trough])
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
