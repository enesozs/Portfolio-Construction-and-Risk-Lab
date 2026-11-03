from __future__ import annotations

import numpy as np
import pandas as pd


def equilibrium_returns(
    covariance: pd.DataFrame,
    market_weights: pd.Series | None = None,
    risk_aversion: float = 2.5,
) -> pd.Series:
    assets = covariance.columns
    n = len(assets)
    if market_weights is None:
        w = pd.Series(1.0 / n, index=assets, dtype=float)
    else:
        w = market_weights.reindex(assets).fillna(0.0).astype(float)
        total = float(w.sum())
        if total <= 0:
            raise ValueError("market_weights must sum to a positive value")
        w = w / total
    pi = risk_aversion * covariance.to_numpy(dtype=float) @ w.to_numpy(dtype=float)
    return pd.Series(pi, index=assets, name="equilibrium_return", dtype=float)


def black_litterman_posterior(
    covariance: pd.DataFrame,
    market_weights: pd.Series | None = None,
    views: dict[str, tuple[float, float]] | None = None,
    risk_aversion: float = 2.5,
    tau: float = 0.05,
) -> pd.Series:
    """Return Black-Litterman posterior expected returns.

    ``views`` maps an asset to ``(annual_expected_return, confidence)`` where
    confidence is in (0, 1]. Views are absolute views and intentionally simple
    enough for an interactive research application.
    """
    if tau <= 0:
        raise ValueError("tau must be positive")
    assets = list(covariance.columns)
    sigma = covariance.reindex(index=assets, columns=assets).to_numpy(dtype=float)
    pi = equilibrium_returns(covariance, market_weights, risk_aversion).to_numpy(dtype=float)
    if not views:
        return pd.Series(pi, index=assets, name="bl_posterior_return", dtype=float)

    p_rows: list[np.ndarray] = []
    q_values: list[float] = []
    omega_values: list[float] = []
    for asset, (view_return, confidence) in views.items():
        if asset not in assets:
            continue
        conf = float(np.clip(confidence, 1e-4, 1.0))
        row = np.zeros(len(assets), dtype=float)
        row[assets.index(asset)] = 1.0
        p_rows.append(row)
        q_values.append(float(view_return))
        view_variance = float(tau * (row @ sigma @ row))
        omega_values.append(max(view_variance * (1.0 - conf) / conf, 1e-12))

    if not p_rows:
        return pd.Series(pi, index=assets, name="bl_posterior_return", dtype=float)

    p = np.vstack(p_rows)
    q = np.asarray(q_values, dtype=float)
    omega = np.diag(omega_values)
    tau_sigma = tau * sigma
    inv_tau_sigma = np.linalg.pinv(tau_sigma)
    inv_omega = np.linalg.pinv(omega)
    posterior_cov_inv = inv_tau_sigma + p.T @ inv_omega @ p
    posterior = np.linalg.pinv(posterior_cov_inv) @ (inv_tau_sigma @ pi + p.T @ inv_omega @ q)
    return pd.Series(posterior, index=assets, name="bl_posterior_return", dtype=float)
