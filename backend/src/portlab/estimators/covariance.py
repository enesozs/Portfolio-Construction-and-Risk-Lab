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


def marchenko_pastur_denoise(returns: pd.DataFrame) -> tuple[np.ndarray, int]:
    """Denoised correlation by the constant-residual-eigenvalue method (López de Prado, 2020).

    For a correlation matrix of N assets estimated from T observations of pure noise, the
    eigenvalues spread over [σ²(1 − √q)², σ²(1 + √q)²] with q = N/T (Marchenko–Pastur). An
    eigenvalue below the upper edge λ₊ cannot be told apart from noise. Those eigenvalues are
    replaced by their average (keeping the trace), the matrix is rebuilt and rescaled to a unit
    diagonal. The residual variance σ² is the mean of the noise eigenvalues, iterated to a
    fixed point. Returns the denoised correlation and the number of eigenvalues kept as signal.
    """
    x = returns.dropna(how="any").to_numpy(dtype=float)
    n_obs, n = x.shape
    corr = np.corrcoef(x, rowvar=False)
    values, vectors = np.linalg.eigh(corr)
    q = n / n_obs
    sigma2 = 1.0
    for _ in range(50):
        edge = sigma2 * (1 + np.sqrt(q)) ** 2
        noise = values < edge
        if noise.all() or not noise.any():
            break
        updated = float(values[noise].mean())
        if abs(updated - sigma2) < 1e-10:
            break
        sigma2 = updated
    noise = values < sigma2 * (1 + np.sqrt(q)) ** 2
    signal = int((~noise).sum())
    if noise.sum() > 1:
        values = values.copy()
        values[noise] = values[noise].mean()
    rebuilt = vectors @ np.diag(values) @ vectors.T
    d = np.sqrt(np.diag(rebuilt))
    return rebuilt / np.outer(d, d), signal


def denoised_covariance(returns: pd.DataFrame, periods_per_year: int = 252) -> pd.DataFrame:
    clean = returns.dropna(how="any")
    corr, _ = marchenko_pastur_denoise(clean)
    vols = clean.std(ddof=1).to_numpy(dtype=float) * np.sqrt(periods_per_year)
    cov = corr * np.outer(vols, vols)
    return pd.DataFrame(cov, index=clean.columns, columns=clean.columns)


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
    if method == "denoised":
        return denoised_covariance(returns, periods_per_year)
    raise ValueError(f"unknown covariance estimator: {method}")
