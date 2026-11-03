"""Daily portfolio simulator shared by walk-forward, rebalancing and dynamic allocation.

Conventions (one place, so every lab agrees):

* Holdings drift with the market between trades. Rebalancing to a target is a decision with
  a cost, not something that happens for free every day.
* A decision made at day t's close uses data up to and including day t and trades at that
  close, so the new weights earn day t+1's return. That is the same "signal at the close,
  position from the next day" convention as project 02.
* Trading costs are `cost_bps` per dollar bought or sold, on risky assets only. Turnover is
  reported one-way: half the dollars traded, so moving 10% from A to B is 10%.
* Weight not invested in risky assets sits in cash and earns the cash (T-bill) return.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import numpy as np
import pandas as pd

from portlab.portfolio.metrics import performance_summary

CASH = "CASH"

Decision = Callable[[int, pd.Series], pd.Series | None]
"""Called after each day's close with (day index, drifted weights incl. CASH).
Returns new target weights, or None to keep holding."""


@dataclass(frozen=True)
class BacktestResult:
    returns: pd.Series
    """Daily portfolio returns after trading costs."""
    gross_returns: pd.Series
    weights: pd.DataFrame
    """End-of-day holdings (after any trade), one column per asset plus CASH."""
    rebalances: pd.DataFrame
    """One row per trade date: one-way `turnover` and `cost` (fraction of wealth)."""
    cash_returns: pd.Series

    @property
    def performance(self) -> dict[str, float]:
        return performance_summary(self.returns, cash_returns=self.cash_returns)

    @property
    def gross_performance(self) -> dict[str, float]:
        return performance_summary(self.gross_returns, cash_returns=self.cash_returns)

    @property
    def wealth(self) -> pd.Series:
        return (1.0 + self.returns).cumprod()


def _vector(weights: pd.Series, assets: list[str]) -> np.ndarray:
    risky = weights.reindex(assets).fillna(0.0).to_numpy(dtype=float)
    cash = float(weights.at[CASH]) if CASH in weights.index else 1.0 - float(risky.sum())
    return np.append(risky, cash)


def run_backtest(
    returns: pd.DataFrame,
    initial: pd.Series,
    decide: Decision | None = None,
    *,
    cash_returns: pd.Series | None = None,
    cost_bps: float = 0.0,
) -> BacktestResult:
    """Hold `initial` from the first day, then follow `decide` (see module docstring)."""
    if returns.empty:
        raise ValueError("returns are empty")
    if cost_bps < 0:
        raise ValueError("cost_bps must be non-negative")
    clean = returns.astype(float)
    if clean.isna().any().any():
        raise ValueError("returns must not contain missing values")
    assets = [str(c) for c in clean.columns]
    columns = [*assets, CASH]
    cash = (
        np.zeros(len(clean))
        if cash_returns is None
        else cash_returns.reindex(clean.index).fillna(0.0).to_numpy(dtype=float)
    )
    r = np.column_stack([clean.to_numpy(dtype=float), cash])
    k = cost_bps / 10_000.0

    w = _vector(initial, assets)
    gross_out = np.empty(len(clean))
    net_out = np.empty(len(clean))
    held = np.empty((len(clean), len(columns)))
    trades: list[tuple[object, float, float]] = []

    for i, date in enumerate(clean.index):
        growth = w * (1.0 + r[i])
        total = float(growth.sum())
        gross = total - 1.0
        drifted = growth / total if total > 0 else w
        cost = 0.0
        target = decide(i, pd.Series(drifted, index=columns)) if decide else None
        if target is not None:
            new = _vector(target, assets)
            traded = float(np.abs(new[:-1] - drifted[:-1]).sum())
            cost = k * traded
            trades.append((date, traded / 2.0, cost))
            w = new
        else:
            w = drifted
        gross_out[i] = gross
        net_out[i] = (1.0 + gross) * (1.0 - cost) - 1.0
        held[i] = w

    index = clean.index
    rebalances = pd.DataFrame(trades, columns=["date", "turnover", "cost"]).set_index("date")
    return BacktestResult(
        returns=pd.Series(net_out, index=index, name="portfolio"),
        gross_returns=pd.Series(gross_out, index=index, name="portfolio_gross"),
        weights=pd.DataFrame(held, index=index, columns=columns),
        rebalances=rebalances,
        cash_returns=pd.Series(cash, index=index, name=CASH),
    )


def buy_and_hold(
    returns: pd.DataFrame, weights: pd.Series, cash_returns: pd.Series | None = None
) -> BacktestResult:
    """Invest once in `weights` and never trade again: the passive benchmark."""
    return run_backtest(returns, weights, None, cash_returns=cash_returns)
