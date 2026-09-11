from __future__ import annotations

from collections.abc import Callable

import numpy as np
import pandas as pd

from src.estimators.covariance import estimate_covariance
from src.estimators.returns import historical_expected_returns


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
        raise ValueError('block_size must be >= 2 for block bootstrap')
    if block_size > n:
        raise ValueError('block_size cannot exceed the sample length')
    pieces: list[pd.DataFrame] = []
    while sum(len(x) for x in pieces) < n:
        start = int(rng.integers(0, n - block_size + 1))
        pieces.append(clean.iloc[start : start + block_size])
    return pd.concat(pieces, axis='index').iloc[:n].reset_index(drop=True)


def bootstrap_weight_stability(
    returns: pd.DataFrame,
    optimizer: Callable,
    n_bootstrap: int = 200,
    random_state: int = 42,
    return_method: str = 'arithmetic',
    covariance_method: str = 'sample',
    bootstrap_method: str = 'iid',
    block_size: int = 21,
    **optimizer_kwargs,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    rng = np.random.default_rng(random_state)
    clean = returns.dropna(how='any')
    if len(clean) < 30:
        raise ValueError('at least 30 complete observations are required')
    if bootstrap_method not in {'iid', 'block'}:
        raise ValueError("bootstrap_method must be 'iid' or 'block'")

    draws: list[pd.Series] = []
    for _ in range(n_bootstrap):
        sample = (
            _iid_sample(clean, rng)
            if bootstrap_method == 'iid'
            else _moving_block_sample(clean, rng, block_size)
        )
        mu = historical_expected_returns(sample, method=return_method)
        cov = estimate_covariance(sample, method=covariance_method)
        try:
            w = optimizer(expected_returns=mu, covariance=cov, **optimizer_kwargs)
        except TypeError:
            w = optimizer(covariance=cov, **optimizer_kwargs)
        draws.append(w.reindex(clean.columns).fillna(0.0).astype(float))

    weights = pd.DataFrame(draws)
    summary = pd.DataFrame({
        'mean': weights.mean(),
        'std': weights.std(),
        'p05': weights.quantile(0.05),
        'p50': weights.quantile(0.50),
        'p95': weights.quantile(0.95),
        'min': weights.min(),
        'max': weights.max(),
    })
    return weights, summary
