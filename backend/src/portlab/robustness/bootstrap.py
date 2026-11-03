from __future__ import annotations

import numpy as np
import pandas as pd

from portlab.estimators.estimates import estimate
from portlab.optimization.registry import Constraints, allocate


def _iid_sample(clean: pd.DataFrame, rng: np.random.Generator) -> pd.DataFrame:
    idx = rng.integers(0, len(clean), len(clean))
    return clean.iloc[idx].reset_index(drop=True)


def _moving_block_sample(
    clean: pd.DataFrame,
    rng: np.random.Generator,
    block_size: int,
) -> pd.DataFrame:
    n = len(clean)
    if block_size < 2:
        raise ValueError("block_size must be >= 2 for block bootstrap")
    if block_size > n:
        raise ValueError("block_size cannot exceed the sample length")
    pieces: list[pd.DataFrame] = []
    while sum(len(x) for x in pieces) < n:
        start = int(rng.integers(0, n - block_size + 1))
        pieces.append(clean.iloc[start : start + block_size])
    return pd.concat(pieces, axis="index").iloc[:n].reset_index(drop=True)


def bootstrap_weight_stability(
    returns: pd.DataFrame,
    method: str,
    *,
    constraints: Constraints | None = None,
    n_bootstrap: int = 200,
    random_state: int = 42,
    return_method: str = "arithmetic",
    covariance_method: str = "sample",
    bootstrap_method: str = "iid",
    block_size: int = 21,
    risk_free: float = 0.0,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Re-run allocator `method` on resampled histories: how much do its weights move?

    IID resampling treats days as independent; the moving-block bootstrap keeps runs of
    `block_size` consecutive days together, preserving volatility clustering.
    """
    rng = np.random.default_rng(random_state)
    clean = returns.dropna(how="any")
    if len(clean) < 30:
        raise ValueError("at least 30 complete observations are required")
    if bootstrap_method not in {"iid", "block"}:
        raise ValueError("bootstrap_method must be 'iid' or 'block'")
    constraints = constraints or Constraints()

    draws: list[pd.Series] = []
    for _ in range(n_bootstrap):
        sample = (
            _iid_sample(clean, rng)
            if bootstrap_method == "iid"
            else _moving_block_sample(clean, rng, block_size)
        )
        est = estimate(sample, return_method, covariance_method, risk_free)
        draws.append(allocate(method, est, constraints))

    weights = pd.DataFrame(draws).reset_index(drop=True)
    summary = pd.DataFrame(
        {
            "mean": weights.mean(),
            "std": weights.std(),
            "p05": weights.quantile(0.05),
            "p50": weights.quantile(0.50),
            "p95": weights.quantile(0.95),
            "min": weights.min(),
            "max": weights.max(),
        }
    )
    return weights, summary
