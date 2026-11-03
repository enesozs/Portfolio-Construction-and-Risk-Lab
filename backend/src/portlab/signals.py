"""Trading signals for dynamic allocation, computed per asset from daily closes.

Two kinds, with different jobs inside a portfolio:

* **Timing signals** say whether to hold an asset at all (1 = in, 0 = out). They are the
  close-based strategies of project 02, applied to every asset at once. In a portfolio they act
  as a filter: an asset whose trend is off hands its weight to cash or to the others.
* **Ranking signals** score assets *against each other* (higher = more attractive). Rotation
  strategies run on these: they answer "which of my assets should I overweight?" rather than
  "should I own this one?".

Every value on day t uses closes up to and including t. The backtest trades at t's close and
earns from t + 1 (see `portlab.backtest`), so there is no look-ahead. Windows are in trading
days. Values are NaN until a signal has enough history; the allocator treats NaN as "no
signal" (out, for timing; unranked, for ranking).
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, cast

import numpy as np
import pandas as pd

TRADING_DAYS = 252


@dataclass(frozen=True)
class Param:
    name: str
    label: str
    default: float
    min: float
    max: float
    integer: bool = True


@dataclass(frozen=True)
class SignalSpec:
    key: str
    label: str
    kind: str
    """"timing" (0/1) or "ranking" (score)."""
    idea: str
    params: tuple[Param, ...]
    fn: Callable[..., pd.DataFrame]
    primary: str
    """The parameter varied by the robustness grid."""

    def defaults(self) -> dict[str, float]:
        return {p.name: p.default for p in self.params}

    def resolve(self, given: dict[str, float] | None) -> dict[str, float]:
        out = self.defaults()
        for name, value in (given or {}).items():
            spec = next((p for p in self.params if p.name == name), None)
            if spec is None:
                raise ValueError(f"{self.label} has no parameter '{name}'")
            if not spec.min <= value <= spec.max:
                raise ValueError(f"{spec.label} must be between {spec.min:g} and {spec.max:g}")
            out[name] = round(value) if spec.integer else float(value)
        return out


def _w(value: float) -> int:
    return max(round(value), 1)


def _f(x: Any) -> pd.DataFrame:
    """pandas types rolling/ewm results broadly; these are always frames here."""
    return cast(pd.DataFrame, x)


def _as_signal(condition: pd.DataFrame, ready: pd.DataFrame) -> pd.DataFrame:
    """1.0 where the condition holds, 0.0 where it fails, NaN while history is too short."""
    return condition.astype(float).where(ready)


# ── Timing signals (project 02's strategies, close-based) ────────────────────────────────


def trend(prices: pd.DataFrame, window: float = 200) -> pd.DataFrame:
    """In while the close is above its `window`-day simple moving average."""
    average = _f(prices.rolling(_w(window)).mean())
    return _as_signal(_f(prices > average), _f(average.notna()))


def sma_cross(prices: pd.DataFrame, fast: float = 50, slow: float = 200) -> pd.DataFrame:
    """In while the fast moving average is above the slow one ("golden cross")."""
    if fast >= slow:
        raise ValueError("the fast window must be shorter than the slow window")
    f, s = _f(prices.rolling(_w(fast)).mean()), _f(prices.rolling(_w(slow)).mean())
    return _as_signal(_f(f > s), _f(s.notna()))


def ema_cross(prices: pd.DataFrame, fast: float = 20, slow: float = 100) -> pd.DataFrame:
    """Exponential averages react faster than simple ones to a turn in trend."""
    if fast >= slow:
        raise ValueError("the fast window must be shorter than the slow window")
    f = prices.ewm(span=_w(fast), adjust=False).mean()
    s = prices.ewm(span=_w(slow), adjust=False).mean()
    ready = prices.notna() & (prices.notna().cumsum() >= _w(slow))
    return _as_signal(_f(f > s), _f(ready))


def macd(
    prices: pd.DataFrame, fast: float = 12, slow: float = 26, signal: float = 9
) -> pd.DataFrame:
    """In while the MACD line (fast EMA − slow EMA) is above its own signal-line EMA."""
    line = (
        prices.ewm(span=_w(fast), adjust=False).mean()
        - prices.ewm(span=_w(slow), adjust=False).mean()
    )
    trigger = line.ewm(span=_w(signal), adjust=False).mean()
    ready = prices.notna() & (prices.notna().cumsum() >= _w(slow) + _w(signal))
    return _as_signal(_f(line > trigger), _f(ready))


def donchian(prices: pd.DataFrame, entry: float = 50, exit: float = 20) -> pd.DataFrame:
    """Enter on a close above the prior `entry`-day high; exit below the prior `exit`-day low.

    Between the two levels the previous state carries on, as in 02 (closes stand in for
    the intraday highs and lows 02 used, which the price store does not keep).
    """
    high = prices.rolling(_w(entry)).max().shift(1)
    low = prices.rolling(_w(exit)).min().shift(1)
    state = pd.DataFrame(np.nan, index=prices.index, columns=prices.columns)
    state = state.mask(prices > high, 1.0).mask(prices < low, 0.0)
    return state.ffill().fillna(0.0).where(high.notna())


def absolute_momentum(
    prices: pd.DataFrame, window: float = 252, cash: pd.Series | None = None
) -> pd.DataFrame:
    """In while the asset's trailing `window`-day return beats cash over the same period.

    This is the "absolute" half of dual momentum (Antonacci): an asset that could not beat
    Treasury bills over the past year is not worth the risk.
    """
    n = _w(window)
    past = prices.pct_change(n, fill_method=None)
    if cash is None:
        hurdle = pd.Series(0.0, index=prices.index)
    else:
        growth = (1 + cash.reindex(prices.index).fillna(0.0)).cumprod()
        hurdle = growth / growth.shift(n) - 1
    return _as_signal(past.gt(hurdle, axis=0), past.notna())


def regime(
    prices: pd.DataFrame, window: float = 100, vol_window: float = 20, max_vol: float = 0.35
) -> pd.DataFrame:
    """In while above the `window`-day average *and* realised volatility is below `max_vol`."""
    average = _f(prices.rolling(_w(window)).mean())
    vol = _f(
        prices.pct_change(fill_method=None).rolling(_w(vol_window)).std() * np.sqrt(TRADING_DAYS)
    )
    return _as_signal(_f((prices > average) & (vol <= max_vol)), _f(average.notna() & vol.notna()))


# ── Ranking signals (cross-sectional) ────────────────────────────────────────────────────


def momentum(prices: pd.DataFrame, window: float = 252, skip: float = 21) -> pd.DataFrame:
    """Return from `window` to `skip` days ago ("12-1 momentum").

    Skipping the latest month avoids its well-documented short-term reversal, which works
    against momentum (Jegadeesh & Titman, 1993).
    """
    if skip >= window:
        raise ValueError("the skipped period must be shorter than the window")
    return prices.shift(_w(skip)) / prices.shift(_w(window)) - 1


def vol_adjusted_momentum(
    prices: pd.DataFrame, window: float = 252, skip: float = 21
) -> pd.DataFrame:
    """12-1 momentum divided by volatility over the same window: return per unit of risk,
    so a volatile asset needs a bigger move to rank first."""
    vol = prices.pct_change(fill_method=None).rolling(_w(window)).std() * np.sqrt(TRADING_DAYS)
    return momentum(prices, window, skip) / vol


def reversal(prices: pd.DataFrame, window: float = 21) -> pd.DataFrame:
    """Minus the last `window`-day return: last month's losers rank first."""
    return -prices.pct_change(_w(window), fill_method=None)


def low_volatility(prices: pd.DataFrame, window: float = 63) -> pd.DataFrame:
    """Minus realised volatility: calmer assets rank first (the low-volatility anomaly)."""
    return -(prices.pct_change(fill_method=None).rolling(_w(window)).std() * np.sqrt(TRADING_DAYS))


def _window(label: str, default: float, lo: float = 5, hi: float = 504) -> Param:
    return Param("window", label, default, lo, hi)


SIGNALS: dict[str, SignalSpec] = {
    s.key: s
    for s in [
        SignalSpec(
            "trend",
            "Trend filter",
            "timing",
            "Hold while the price is above its moving average; step aside in downtrends.",
            (_window("Average (days)", 200, 20, 400),),
            trend,
            "window",
        ),
        SignalSpec(
            "sma_cross",
            "Moving-average crossover",
            "timing",
            "Hold while the fast average is above the slow one.",
            (Param("fast", "Fast (days)", 50, 5, 200), Param("slow", "Slow (days)", 200, 20, 400)),
            sma_cross,
            "slow",
        ),
        SignalSpec(
            "ema_cross",
            "EMA crossover",
            "timing",
            "Like the crossover, with exponential averages that turn faster.",
            (Param("fast", "Fast (days)", 20, 5, 200), Param("slow", "Slow (days)", 100, 20, 400)),
            ema_cross,
            "slow",
        ),
        SignalSpec(
            "macd",
            "MACD",
            "timing",
            "Hold while the MACD line is above its signal line: momentum is accelerating.",
            (
                Param("fast", "Fast (days)", 12, 3, 60),
                Param("slow", "Slow (days)", 26, 10, 120),
                Param("signal", "Signal (days)", 9, 3, 40),
            ),
            macd,
            "slow",
        ),
        SignalSpec(
            "donchian",
            "Donchian breakout",
            "timing",
            "Enter on a new high, exit on a new low; hold in between.",
            (
                Param("entry", "Entry high (days)", 50, 5, 252),
                Param("exit", "Exit low (days)", 20, 5, 252),
            ),
            donchian,
            "entry",
        ),
        SignalSpec(
            "absolute_momentum",
            "Absolute momentum",
            "timing",
            "Hold only assets whose trailing return beat Treasury bills.",
            (_window("Lookback (days)", 252, 21, 504),),
            absolute_momentum,
            "window",
        ),
        SignalSpec(
            "regime",
            "Trend + volatility regime",
            "timing",
            "Hold while in an uptrend and not in a high-volatility regime.",
            (
                _window("Average (days)", 100, 20, 400),
                Param("vol_window", "Volatility window (days)", 20, 5, 126),
                Param("max_vol", "Max volatility", 0.35, 0.05, 1.5, integer=False),
            ),
            regime,
            "window",
        ),
        SignalSpec(
            "momentum",
            "Momentum (12-1)",
            "ranking",
            "Past year's winners, skipping the last month.",
            (_window("Lookback (days)", 252, 42, 504), Param("skip", "Skip (days)", 21, 0, 63)),
            momentum,
            "window",
        ),
        SignalSpec(
            "vol_adjusted_momentum",
            "Volatility-adjusted momentum",
            "ranking",
            "Momentum per unit of risk.",
            (_window("Lookback (days)", 252, 42, 504), Param("skip", "Skip (days)", 21, 0, 63)),
            vol_adjusted_momentum,
            "window",
        ),
        SignalSpec(
            "reversal",
            "Short-term reversal",
            "ranking",
            "Last month's losers, betting on a bounce.",
            (_window("Lookback (days)", 21, 5, 63),),
            reversal,
            "window",
        ),
        SignalSpec(
            "low_volatility",
            "Low volatility",
            "ranking",
            "The calmest assets first.",
            (_window("Volatility window (days)", 63, 21, 252),),
            low_volatility,
            "window",
        ),
    ]
}


def compute(
    key: str,
    prices: pd.DataFrame,
    params: dict[str, float] | None = None,
    cash: pd.Series | None = None,
) -> pd.DataFrame:
    """Evaluate signal `key` on `prices` (one column per asset)."""
    if key not in SIGNALS:
        raise ValueError(f"unknown signal: {key}")
    spec = SIGNALS[key]
    resolved = spec.resolve(params)
    if key == "absolute_momentum":
        return absolute_momentum(prices, resolved["window"], cash)
    return spec.fn(prices, **resolved)
