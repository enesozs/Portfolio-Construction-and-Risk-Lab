from __future__ import annotations

import numpy as np
import pandas as pd

from src.estimators.covariance import estimate_covariance


def covariance_diagnostics(covariance: pd.DataFrame) -> dict[str, float]:
    matrix = covariance.to_numpy(dtype=float)
    eigvals = np.linalg.eigvalsh(matrix)
    positive = eigvals[eigvals > 1e-12]
    condition = float(np.linalg.cond(matrix))
    if len(positive) == 0:
        effective_rank = 0.0
        min_eigenvalue = float(eigvals.min())
    else:
        probs = positive / positive.sum()
        effective_rank = float(np.exp(-np.sum(probs * np.log(probs))))
        min_eigenvalue = float(positive.min())
    return {
        'condition_number': condition,
        'effective_rank': effective_rank,
        'min_eigenvalue': min_eigenvalue,
        'max_eigenvalue': float(eigvals.max()),
    }


def compare_covariance_estimators(returns: pd.DataFrame) -> pd.DataFrame:
    rows: list[dict[str, float | str]] = []
    sample = estimate_covariance(returns, method='sample')
    sample_arr = sample.to_numpy(dtype=float)
    sample_norm = max(float(np.linalg.norm(sample_arr, ord='fro')), 1e-12)
    for method in ('sample', 'ledoit_wolf', 'ewma'):
        cov = estimate_covariance(returns, method=method)
        diag = covariance_diagnostics(cov)
        distance = float(np.linalg.norm(cov.to_numpy(dtype=float) - sample_arr, ord='fro') / sample_norm)
        rows.append({
            'Estimator': method,
            'Condition Number': diag['condition_number'],
            'Effective Rank': diag['effective_rank'],
            'Minimum Eigenvalue': diag['min_eigenvalue'],
            'Distance vs Sample': distance,
        })
    return pd.DataFrame(rows).set_index('Estimator')
