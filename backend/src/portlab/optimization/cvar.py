from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.optimize import linprog


def minimum_cvar(
    returns: pd.DataFrame,
    confidence: float = 0.95,
    min_weight: float = 0.0,
    max_weight: float = 1.0,
    minimum_expected_return: float | None = None,
) -> pd.Series:
    """Historical-scenario minimum-CVaR portfolio via linear programming."""
    clean = returns.dropna(how="any").astype(float)
    if clean.empty:
        raise ValueError("returns must contain complete observations")
    if not 0.5 < confidence < 1.0:
        raise ValueError("confidence must be between 0.5 and 1")
    n_obs, n_assets = clean.shape
    if min_weight * n_assets > 1.0 + 1e-9 or max_weight * n_assets < 1.0 - 1e-9:
        raise ValueError("weight bounds are infeasible")

    # Variables: [w_1..w_n, alpha, u_1..u_T]
    n_vars = n_assets + 1 + n_obs
    c = np.zeros(n_vars, dtype=float)
    c[n_assets] = 1.0
    c[n_assets + 1 :] = 1.0 / ((1.0 - confidence) * n_obs)

    r = clean.to_numpy(dtype=float)
    a_ub = np.zeros((n_obs, n_vars), dtype=float)
    # u_t >= -r_t'w - alpha  => -r_t'w - alpha - u_t <= 0
    a_ub[:, :n_assets] = -r
    a_ub[:, n_assets] = -1.0
    a_ub[:, n_assets + 1 :] = -np.eye(n_obs)
    b_ub = np.zeros(n_obs, dtype=float)

    if minimum_expected_return is not None:
        mean_daily = clean.mean().to_numpy(dtype=float)
        row = np.zeros(n_vars, dtype=float)
        row[:n_assets] = -mean_daily
        a_ub = np.vstack([a_ub, row])
        b_ub = np.concatenate([b_ub, [-float(minimum_expected_return) / 252.0]])

    a_eq = np.zeros((1, n_vars), dtype=float)
    a_eq[0, :n_assets] = 1.0
    b_eq = np.array([1.0], dtype=float)
    bounds = [(min_weight, max_weight)] * n_assets + [(None, None)] + [(0.0, None)] * n_obs

    result = linprog(c, A_ub=a_ub, b_ub=b_ub, A_eq=a_eq, b_eq=b_eq, bounds=bounds, method="highs")
    if not result.success:
        raise RuntimeError(f"CVaR optimization failed: {result.message}")
    return pd.Series(result.x[:n_assets], index=clean.columns, name="weight", dtype=float)


def historical_var_cvar(
    portfolio_returns: pd.Series, confidence: float = 0.95
) -> tuple[float, float]:
    r = portfolio_returns.dropna().astype(float)
    if r.empty:
        return float("nan"), float("nan")
    loss = -r.to_numpy(dtype=float)
    var = float(np.quantile(loss, confidence))
    tail = loss[loss >= var]
    cvar = float(tail.mean()) if len(tail) else var
    return var, cvar
