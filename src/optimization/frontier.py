from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.optimize import minimize

from src.portfolio.metrics import portfolio_return, portfolio_volatility


def _weight_bounds(
    n_assets: int,
    allow_short: bool,
    max_weight: float | None,
) -> tuple[tuple[float, float], ...]:
    lo = -1.0 if allow_short else 0.0
    hi = 1.0 if max_weight is None else float(max_weight)
    if not allow_short and hi * n_assets < 1.0 - 1e-12:
        raise ValueError(
            "maximum asset weight is infeasible: max_weight * number_of_assets must be at least 1"
        )
    return tuple((lo, hi) for _ in range(n_assets))


def _feasible_start(n_assets: int) -> np.ndarray:
    return np.repeat(1.0 / n_assets, n_assets)


def efficient_frontier(
    expected_returns: pd.Series,
    covariance: pd.DataFrame,
    n_points: int = 40,
    allow_short: bool = False,
    max_weight: float | None = None,
) -> pd.DataFrame:
    """Return the *efficient* (upper) branch of the mean-variance frontier.

    The lower-return branch below the global minimum-variance portfolio is
    feasible but inefficient, so it is deliberately excluded.
    """
    assets = expected_returns.index
    cov = covariance.reindex(index=assets, columns=assets)
    n_assets = len(assets)
    if n_assets < 2:
        raise ValueError("at least two assets are required for an efficient frontier")

    mu = expected_returns.to_numpy(dtype=float)
    bounds = _weight_bounds(n_assets, allow_short, max_weight)
    x0 = _feasible_start(n_assets)
    budget_constraint = {"type": "eq", "fun": lambda w: np.sum(w) - 1.0}

    # First locate the global minimum-variance portfolio. Its expected return is
    # the left-most point of the efficient branch.
    gmv_result = minimize(
        lambda w: portfolio_volatility(w, cov),
        x0,
        method="SLSQP",
        bounds=bounds,
        constraints=(budget_constraint,),
    )
    if not gmv_result.success:
        raise RuntimeError(
            f"global minimum-variance optimization failed: {gmv_result.message}"
        )
    gmv_return = float(gmv_result.x @ mu)

    # Find the maximum feasible expected return under the same constraints.
    max_return_result = minimize(
        lambda w: -float(w @ mu),
        x0,
        method="SLSQP",
        bounds=bounds,
        constraints=(budget_constraint,),
    )
    if not max_return_result.success:
        raise RuntimeError(
            f"maximum-return optimization failed: {max_return_result.message}"
        )
    max_feasible_return = float(max_return_result.x @ mu)

    if max_feasible_return < gmv_return - 1e-10:
        raise RuntimeError("could not determine a valid efficient-frontier return range")

    targets = np.linspace(gmv_return, max_feasible_return, n_points)
    rows: list[dict[str, float]] = []
    previous_solution = gmv_result.x.copy()

    for target in targets:
        constraints = (
            budget_constraint,
            {
                "type": "eq",
                "fun": lambda w, t=float(target): float(w @ mu) - t,
            },
        )
        result = minimize(
            lambda w: portfolio_volatility(w, cov),
            previous_solution,
            method="SLSQP",
            bounds=bounds,
            constraints=constraints,
            options={"ftol": 1e-10, "maxiter": 1000},
        )
        if not result.success:
            continue

        previous_solution = result.x.copy()
        row: dict[str, float] = {
            "return": portfolio_return(result.x, expected_returns),
            "volatility": portfolio_volatility(result.x, cov),
        }
        row.update(
            {f"weight_{asset}": float(weight) for asset, weight in zip(assets, result.x)}
        )
        rows.append(row)

    if len(rows) < 2:
        raise RuntimeError("no usable efficient-frontier portfolios were found")

    # Target returns are monotonic by construction; preserving that order avoids
    # visually connecting unrelated feasible points after sorting by volatility.
    return pd.DataFrame(rows).reset_index(drop=True)
