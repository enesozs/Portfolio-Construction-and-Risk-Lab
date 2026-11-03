"""How much to believe a backtested Sharpe ratio (ported from project 02's metrics).

* **Probabilistic Sharpe ratio** (Bailey & López de Prado, 2012): the probability that the
  true Sharpe ratio exceeds a benchmark, given the track record's length, skewness and fat
  tails. A short, lumpy record earns less confidence than a long, smooth one with the same
  Sharpe.
* **Deflated Sharpe ratio** (Bailey & López de Prado, 2014): the same probability, but with
  the benchmark raised to the Sharpe ratio the *best* of N skill-less trials would show by
  luck. Trying many configurations and keeping the best inflates its Sharpe; this undoes it.
  Grid trials are correlated, so treating them as independent makes the DSR conservative.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.stats import norm

TRADING_DAYS = 252
EULER_GAMMA = 0.5772156649015329


def _excess(returns: pd.Series, cash: pd.Series | float) -> np.ndarray:
    r = returns.dropna().astype(float)
    if isinstance(cash, pd.Series):
        c = cash.reindex(r.index).fillna(0.0).to_numpy(dtype=float)
    else:
        c = np.full(len(r), float(cash))
    return r.to_numpy(dtype=float) - c


def annual_sharpe(returns: pd.Series, cash: pd.Series | float = 0.0) -> float:
    x = _excess(returns, cash)
    sd = float(np.std(x, ddof=1)) if len(x) > 1 else 0.0
    return float(np.mean(x) / sd * np.sqrt(TRADING_DAYS)) if sd > 0 else float("nan")


def probabilistic_sharpe(
    returns: pd.Series, benchmark_sharpe: float = 0.0, cash: pd.Series | float = 0.0
) -> float:
    """P(true annual Sharpe > `benchmark_sharpe`), on returns in excess of `cash`."""
    x = _excess(returns, cash)
    n = len(x)
    sd = float(np.std(x, ddof=1)) if n > 1 else 0.0
    if n < 3 or sd <= 0:
        return float("nan")
    sharpe = float(np.mean(x) / sd)  # per period, as the formula requires
    target = benchmark_sharpe / np.sqrt(TRADING_DAYS)
    centred = x - x.mean()
    skew = float(np.mean(centred**3) / sd**3)
    kurt = float(np.mean(centred**4) / sd**4)
    variance = 1 - skew * sharpe + (kurt - 1) / 4 * sharpe**2
    if variance <= 0:
        return float("nan")
    return float(norm.cdf((sharpe - target) * np.sqrt(n - 1) / np.sqrt(variance)))


def expected_max_sharpe(trial_sharpes: list[float] | np.ndarray) -> float:
    """Annual Sharpe the best of N zero-skill trials would show, given their dispersion."""
    s = np.asarray(trial_sharpes, dtype=float)
    s = s[np.isfinite(s)]
    if len(s) < 2:
        return 0.0
    n = len(s)
    spread = float(np.std(s, ddof=1))
    return float(
        spread
        * ((1 - EULER_GAMMA) * norm.ppf(1 - 1 / n) + EULER_GAMMA * norm.ppf(1 - 1 / (n * np.e)))
    )


def deflated_sharpe(
    returns: pd.Series, trial_sharpes: list[float] | np.ndarray, cash: pd.Series | float = 0.0
) -> float:
    return probabilistic_sharpe(returns, expected_max_sharpe(trial_sharpes), cash)
