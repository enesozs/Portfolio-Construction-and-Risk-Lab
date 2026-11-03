"""Asset-level Monte Carlo simulation of portfolio wealth.

Each asset's daily return is simulated jointly with the others, then combined with the
portfolio weights, so correlations, joint crashes and rebalancing all matter:

* normal: r = mu/252 + L·z with z standard normal and L·Lᵀ the daily covariance.
* student_t: the same, but every asset on a given day shares one chi-square draw. That makes
  tails fat *and joint*: on a bad day, everything tends to fall together, which a normal
  model understates. Shocks are scaled so the covariance is unchanged.
* bootstrap: blocks of consecutive historical days, resampled with replacement. No
  distributional assumption, and volatility clustering survives within each block; but the
  future can only replay the past, and the mean is the historical one.

Weights either drift (`rebalance_every=0`, buy and hold) or are reset every
`rebalance_every` days. Headline numbers come with a Monte Carlo standard error from
`BATCHES` independent batches of paths: the error from simulating finitely many paths, not
the (much larger) error in the model's inputs.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

MODELS = ("normal", "student_t", "bootstrap")
BATCHES = 20
CHUNK = 1_000
PERCENTILES = (5, 25, 50, 75, 95)


@dataclass(frozen=True)
class Estimate:
    value: float
    stderr: float


@dataclass(frozen=True)
class SimulationResult:
    fan: dict[int, np.ndarray]
    """Wealth percentile (5, 25, 50, 75, 95) at each day 0..horizon."""
    sample_paths: np.ndarray
    """A few individual wealth paths, shape (paths, horizon + 1)."""
    terminal: np.ndarray
    max_drawdown: np.ndarray
    """Per path, as a positive fraction."""
    metrics: dict[str, Estimate]


def _asset_returns(
    rng: np.random.Generator,
    n: int,
    horizon: int,
    *,
    model: str,
    daily_mu: np.ndarray,
    chol: np.ndarray,
    history: np.ndarray,
    student_df: float,
    block_size: int,
) -> np.ndarray:
    """Simulated simple returns, shape (n paths, horizon, assets)."""
    n_assets = daily_mu.size
    if model == "bootstrap":
        blocks = -(-horizon // block_size)
        starts = rng.integers(0, len(history) - block_size + 1, size=(n, blocks))
        idx = (starts[..., None] + np.arange(block_size)).reshape(n, -1)[:, :horizon]
        return history[idx]
    z = rng.standard_normal((n, horizon, n_assets))
    if model == "student_t":
        w = rng.chisquare(student_df, size=(n, horizon, 1)) / student_df
        z = z / np.sqrt(w) * np.sqrt((student_df - 2.0) / student_df)
    return np.maximum(daily_mu + z @ chol.T, -0.99)


def _portfolio_wealth(r: np.ndarray, weights: np.ndarray, rebalance_every: int) -> np.ndarray:
    """Wealth paths, shape (n, horizon + 1), starting at 1."""
    n, horizon, _ = r.shape
    wealth = np.ones((n, horizon + 1))
    step = horizon if rebalance_every <= 0 else rebalance_every
    for start in range(0, horizon, step):
        stop = min(start + step, horizon)
        growth = np.cumprod(1.0 + r[:, start:stop], axis=1)
        wealth[:, start + 1 : stop + 1] = wealth[:, [start]] * (growth @ weights)
    return wealth


def _batched(values: np.ndarray, stat) -> Estimate:
    batches = np.array_split(values, BATCHES)
    per_batch = np.array([stat(b) for b in batches])
    return Estimate(float(stat(values)), float(per_batch.std(ddof=1) / np.sqrt(BATCHES)))


def simulate_portfolio(
    history: pd.DataFrame,
    weights: pd.Series,
    *,
    mu: pd.Series,
    cov: pd.DataFrame,
    model: str = "normal",
    horizon_days: int = 252,
    n_paths: int = 5_000,
    rebalance_every: int = 0,
    student_df: float = 5.0,
    block_size: int = 21,
    seed: int = 42,
    sample_paths: int = 60,
) -> SimulationResult:
    """Simulate wealth (starting at 1) for `weights` over `horizon_days` trading days.

    `mu` and `cov` are annual and drive the normal and Student-t models; `history` (daily
    returns of the same assets) drives the bootstrap.
    """
    if model not in MODELS:
        raise ValueError(f"model must be one of {', '.join(MODELS)}")
    if horizon_days < 2 or n_paths < 2 * BATCHES:
        raise ValueError(f"need a horizon of 2+ days and at least {2 * BATCHES} paths")
    if model == "student_t" and student_df <= 2:
        raise ValueError("student_df must exceed 2 (the variance is infinite otherwise)")
    assets = [str(c) for c in history.columns]
    hist = history[assets].dropna(how="any").to_numpy(dtype=float)
    if model == "bootstrap" and len(hist) < block_size * 2:
        raise ValueError("history is too short for the requested block size")
    w = weights.reindex(assets).fillna(0.0).to_numpy(dtype=float)
    daily_mu = mu.reindex(assets).to_numpy(dtype=float) / 252.0
    daily_cov = cov.reindex(index=assets, columns=assets).to_numpy(dtype=float) / 252.0
    # A tiny ridge keeps the Cholesky factor defined for (near-)singular covariances.
    chol = np.linalg.cholesky(daily_cov + 1e-12 * np.eye(len(assets)))

    rng = np.random.default_rng(seed)
    paths: list[np.ndarray] = []
    for start in range(0, n_paths, CHUNK):
        n = min(CHUNK, n_paths - start)
        r = _asset_returns(
            rng,
            n,
            horizon_days,
            model=model,
            daily_mu=daily_mu,
            chol=chol,
            history=hist,
            student_df=student_df,
            block_size=block_size,
        )
        paths.append(_portfolio_wealth(r, w, rebalance_every))
    wealth = np.vstack(paths)

    terminal = wealth[:, -1]
    peak = np.maximum.accumulate(wealth, axis=1)
    max_dd = -np.min(wealth / peak - 1.0, axis=1)
    loss = 1.0 - terminal

    def var95(x: np.ndarray) -> float:
        return float(np.quantile(1.0 - x, 0.95))

    def es95(x: np.ndarray) -> float:
        tail = 1.0 - x
        return float(tail[tail >= np.quantile(tail, 0.95)].mean())

    metrics = {
        "mean_terminal": _batched(terminal, np.mean),
        "median_terminal": _batched(terminal, np.median),
        "p05_terminal": _batched(terminal, lambda x: np.quantile(x, 0.05)),
        "p95_terminal": _batched(terminal, lambda x: np.quantile(x, 0.95)),
        "probability_of_loss": _batched(loss, lambda x: np.mean(x > 0)),
        "var_95": _batched(terminal, var95),
        "es_95": _batched(terminal, es95),
        "median_max_drawdown": _batched(max_dd, np.median),
        "probability_drawdown_20": _batched(max_dd, lambda x: np.mean(x > 0.20)),
    }
    return SimulationResult(
        fan={p: np.percentile(wealth, p, axis=0) for p in PERCENTILES},
        sample_paths=wealth[:sample_paths],
        terminal=terminal,
        max_drawdown=max_dd,
        metrics=metrics,
    )
