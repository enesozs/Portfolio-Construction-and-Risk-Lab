from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.optimize import minimize

from portlab.portfolio.metrics import portfolio_sharpe


def turnover_aware_portfolio(
    expected_returns: pd.Series,
    covariance: pd.DataFrame,
    reference_weights: pd.Series,
    objective: str = "maximum_sharpe",
    turnover_penalty: float = 0.25,
    max_turnover: float | None = None,
    min_weight: float = 0.0,
    max_weight: float = 1.0,
    target_volatility: float | None = None,
    risk_free: float = 0.0,
) -> pd.Series:
    assets = list(expected_returns.index)
    n = len(assets)
    if n == 0:
        raise ValueError("no assets supplied")
    if min_weight < 0 or max_weight <= 0 or min_weight > max_weight:
        raise ValueError("invalid weight bounds")
    if min_weight * n > 1.0 + 1e-9 or max_weight * n < 1.0 - 1e-9:
        raise ValueError("weight bounds are infeasible for the number of assets")
    if max_turnover is not None and max_turnover < 0:
        raise ValueError("max_turnover must be non-negative")
    if turnover_penalty < 0:
        raise ValueError("turnover_penalty must be non-negative")

    mu = expected_returns.reindex(assets).astype(float)
    cov = covariance.reindex(index=assets, columns=assets).astype(float)
    ref = reference_weights.reindex(assets).fillna(0.0).astype(float)
    if float(ref.sum()) <= 0:
        ref = pd.Series(1.0 / n, index=assets, dtype=float)
    else:
        ref = ref / float(ref.sum())

    ref_arr = ref.to_numpy(dtype=float)
    cov_arr = cov.to_numpy(dtype=float)

    def split(x: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        return x[:n], x[n:]

    def base_objective(w: np.ndarray) -> float:
        if objective == "minimum_variance":
            return float(w @ cov_arr @ w)
        if objective == "maximum_sharpe":
            return -float(portfolio_sharpe(w, mu, cov, risk_free))
        raise ValueError("objective must be 'maximum_sharpe' or 'minimum_variance'")

    def objective_with_turnover(x: np.ndarray) -> float:
        w, u = split(x)
        return base_objective(w) + float(turnover_penalty) * float(u.sum() / 2.0)

    # Auxiliary variables u_i represent |w_i - reference_i|. This avoids using
    # a non-differentiable absolute-value function directly inside SLSQP.
    constraints: list[dict[str, object]] = [
        {"type": "eq", "fun": lambda x: float(np.sum(x[:n]) - 1.0)},
        {"type": "ineq", "fun": lambda x: x[n:] - (x[:n] - ref_arr)},
        {"type": "ineq", "fun": lambda x: x[n:] + (x[:n] - ref_arr)},
    ]
    if max_turnover is not None:
        constraints.append(
            {"type": "ineq", "fun": lambda x: float(max_turnover - np.sum(x[n:]) / 2.0)}
        )
    if target_volatility is not None:
        if target_volatility <= 0:
            raise ValueError("target_volatility must be positive")
        constraints.append(
            {
                "type": "ineq",
                "fun": lambda x: float(target_volatility**2 - (x[:n] @ cov_arr @ x[:n])),
            }
        )

    x0_w = ref_arr.copy()
    if bool((x0_w < min_weight - 1e-12).any()) or bool((x0_w > max_weight + 1e-12).any()):
        x0_w = np.repeat(1.0 / n, n)
    x0_u = np.abs(x0_w - ref_arr)
    x0 = np.concatenate([x0_w, x0_u])
    bounds = tuple((min_weight, max_weight) for _ in range(n)) + tuple((0.0, 2.0) for _ in range(n))

    result = minimize(
        objective_with_turnover,
        x0,
        method="SLSQP",
        bounds=bounds,
        constraints=tuple(constraints),
        options={"maxiter": 2000, "ftol": 1e-10},
    )
    if not result.success:
        raise RuntimeError(f"turnover-aware optimization failed: {result.message}")
    weights = result.x[:n]
    return pd.Series(weights, index=assets, name="weight", dtype=float)


def one_way_turnover(weights: pd.Series, reference_weights: pd.Series) -> float:
    assets = weights.index.union(reference_weights.index)
    w = weights.reindex(assets).fillna(0.0).astype(float)
    ref = reference_weights.reindex(assets).fillna(0.0).astype(float)
    return float((w - ref).abs().sum() / 2.0)
