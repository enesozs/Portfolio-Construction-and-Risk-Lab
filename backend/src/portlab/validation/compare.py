"""Out-of-sample comparison of every allocator, with the statistics that keep it honest.

* **Walk-forward for all methods** on identical settings (`validation.walk_forward`).
* **Sharpe difference vs equal weight**: the Jobson–Korkie test with Memmel's (2003)
  correction. Two Sharpe ratios estimated on the same days are correlated, which the test
  accounts for; a difference of 0.2 can easily be noise over five years.
* **Probability of backtest overfitting** (Bailey, Borwein, López de Prado & Zhu, 2017) by
  combinatorially symmetric cross-validation (CSCV). The test period is cut into S blocks.
  For every way of choosing S/2 blocks as "in sample", pick the method with the best
  in-sample Sharpe and record its rank among all methods on the other half. PBO is the share
  of splits where the in-sample winner lands in the bottom half out of sample: how often
  "pick the best backtest" would have picked a below-median method.
* **Covariance estimators out of sample**: minimum variance re-estimated with each estimator.
  The lowest *realised* volatility identifies the most useful estimator; realised ÷ predicted
  volatility shows which estimators are over- or under-confident.
"""

from __future__ import annotations

from dataclasses import dataclass
from itertools import combinations

import numpy as np
import pandas as pd
from scipy.stats import norm

from portlab.optimization.registry import Constraints
from portlab.validation.walk_forward import WalkForwardResult, walk_forward_portfolio


def memmel_test(a: np.ndarray, b: np.ndarray) -> tuple[float, float]:
    """z statistic and two-sided p-value for H₀: Sharpe(a) = Sharpe(b) (same days)."""
    n = len(a)
    sa, sb = a.mean() / a.std(ddof=1), b.mean() / b.std(ddof=1)
    rho = float(np.corrcoef(a, b)[0, 1])
    theta = (2 - 2 * rho + 0.5 * (sa**2 + sb**2 - 2 * sa * sb * rho**2)) / n
    if theta <= 0:
        return float("nan"), float("nan")
    z = (sa - sb) / np.sqrt(theta)
    return float(z), float(2 * norm.sf(abs(z)))


@dataclass(frozen=True)
class Overfitting:
    pbo: float
    logits: np.ndarray
    """λ = log(ω / (1 − ω)) of the in-sample winner's out-of-sample relative rank ω, per split."""
    in_sample_sharpe: np.ndarray
    out_of_sample_sharpe: np.ndarray
    """Annual Sharpe of the in-sample winner, in and out of sample, per split."""
    splits: int
    winners: dict[str, int]
    """How often each method was the in-sample winner."""


def probability_of_overfitting(excess: pd.DataFrame, blocks: int = 10) -> Overfitting:
    """CSCV over the columns of `excess` (daily returns over cash, one column per method)."""
    if excess.shape[1] < 2:
        raise ValueError("need at least two methods to measure overfitting")
    data = excess.dropna(how="any").to_numpy(dtype=float)
    n_obs, m = data.shape
    if n_obs < blocks * 20:
        raise ValueError(f"need at least {blocks * 20} common days for {blocks} blocks")
    edges = np.linspace(0, n_obs, blocks + 1).astype(int)
    # Per-block sums and sums of squares let every split's Sharpe be formed without copying.
    sums = np.array([data[edges[i] : edges[i + 1]].sum(axis=0) for i in range(blocks)])
    squares = np.array([(data[edges[i] : edges[i + 1]] ** 2).sum(axis=0) for i in range(blocks)])
    sizes = np.diff(edges)

    def sharpe(idx: list[int]) -> np.ndarray:
        n = sizes[idx].sum()
        mean = sums[idx].sum(axis=0) / n
        var = squares[idx].sum(axis=0) / n - mean**2
        return mean / np.sqrt(np.maximum(var, 1e-18)) * np.sqrt(252)

    logits, is_sr, oos_sr = [], [], []
    winners: dict[int, int] = {}
    for chosen in combinations(range(blocks), blocks // 2):
        rest = [i for i in range(blocks) if i not in chosen]
        s_in, s_out = sharpe(list(chosen)), sharpe(rest)
        best = int(np.argmax(s_in))
        winners[best] = winners.get(best, 0) + 1
        rank = float((s_out < s_out[best]).sum() + 1)  # 1 = worst … m = best
        omega = rank / (m + 1)
        logits.append(np.log(omega / (1 - omega)))
        is_sr.append(s_in[best])
        oos_sr.append(s_out[best])
    lam = np.array(logits)
    names = [str(c) for c in excess.columns]
    return Overfitting(
        pbo=float((lam <= 0).mean()),
        logits=lam,
        in_sample_sharpe=np.array(is_sr),
        out_of_sample_sharpe=np.array(oos_sr),
        splits=len(lam),
        winners={names[k]: v for k, v in sorted(winners.items(), key=lambda kv: -kv[1])},
    )


def compare_methods(
    returns: pd.DataFrame,
    methods: list[str],
    *,
    constraints: Constraints,
    cash_returns: pd.Series,
    lookback: int = 252,
    rebalance_every: int = 21,
    cost_bps: float = 5.0,
    return_method: str = "arithmetic",
    covariance_method: str = "ledoit_wolf",
) -> tuple[dict[str, WalkForwardResult], dict[str, str]]:
    """Walk-forward every method on the same settings; methods that fail are reported."""
    results: dict[str, WalkForwardResult] = {}
    errors: dict[str, str] = {}
    for method in methods:
        try:
            results[method] = walk_forward_portfolio(
                returns,
                method,
                constraints=constraints,
                lookback=lookback,
                rebalance_every=rebalance_every,
                return_method=return_method,
                covariance_method=covariance_method,
                cost_bps=cost_bps,
                cash_returns=cash_returns,
            )
        except (ValueError, RuntimeError) as exc:
            errors[method] = str(exc)
    return results, errors


COVARIANCE_METHODS = ("sample", "ledoit_wolf", "ewma", "denoised")


def compare_covariance_estimators(
    returns: pd.DataFrame,
    *,
    constraints: Constraints,
    cash_returns: pd.Series,
    lookback: int = 252,
    rebalance_every: int = 21,
) -> dict[str, WalkForwardResult]:
    """Minimum variance, re-estimated out of sample with each covariance estimator."""
    return {
        cov: walk_forward_portfolio(
            returns,
            "min_variance",
            constraints=constraints,
            lookback=lookback,
            rebalance_every=rebalance_every,
            covariance_method=cov,
            cash_returns=cash_returns,
        )
        for cov in COVARIANCE_METHODS
    }
