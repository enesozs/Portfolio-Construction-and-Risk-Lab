from __future__ import annotations

import numpy as np
import pandas as pd


def sample_covariance(returns: pd.DataFrame, periods_per_year: int = 252) -> pd.DataFrame:
    return returns.cov() * periods_per_year


def ewma_covariance(
    returns: pd.DataFrame, span: int = 126, periods_per_year: int = 252
) -> pd.DataFrame:
    if span < 2:
        raise ValueError("span must be >= 2")
    cov_panel = returns.ewm(span=span, adjust=False).cov()
    latest = cov_panel.loc[returns.index[-1]]
    return latest * periods_per_year


def ledoit_wolf_shrinkage(x: np.ndarray) -> tuple[np.ndarray, float]:
    """Ledoit–Wolf (2004) shrinkage of the sample covariance toward a scaled identity.

    Returns the shrunk covariance (per period) and the shrinkage intensity in [0, 1]. The
    intensity is the estimated optimal blend: noisy samples (few observations per asset)
    shrink more.
    """
    n, p = x.shape
    x = x - x.mean(axis=0)
    sample = x.T @ x / n
    mu = float(np.trace(sample)) / p
    x2 = x**2
    beta_sum = float(np.sum(x2.T @ x2)) / n
    delta_sum = float(np.sum(sample**2))
    beta = (beta_sum - delta_sum) / (p * n)
    delta = (delta_sum - 2.0 * mu * float(np.trace(sample)) + p * mu**2) / p
    beta = min(beta, delta)
    shrinkage = 0.0 if beta == 0 else beta / delta
    shrunk = (1.0 - shrinkage) * sample + shrinkage * mu * np.eye(p)
    return shrunk, shrinkage


def ledoit_wolf_covariance(returns: pd.DataFrame, periods_per_year: int = 252) -> pd.DataFrame:
    clean = returns.dropna(how="any")
    if clean.empty:
        raise ValueError("no complete observations available for Ledoit-Wolf covariance")
    shrunk, _ = ledoit_wolf_shrinkage(clean.to_numpy(dtype=float))
    return pd.DataFrame(shrunk * periods_per_year, index=clean.columns, columns=clean.columns)


def estimate_covariance(
    returns: pd.DataFrame, method: str = "sample", periods_per_year: int = 252
) -> pd.DataFrame:
    method = method.lower()
    if method == "sample":
        return sample_covariance(returns, periods_per_year)
    if method == "ewma":
        return ewma_covariance(returns, periods_per_year=periods_per_year)
    if method in {"ledoit_wolf", "shrinkage"}:
        return ledoit_wolf_covariance(returns, periods_per_year)
    raise ValueError(f"unknown covariance estimator: {method}")
