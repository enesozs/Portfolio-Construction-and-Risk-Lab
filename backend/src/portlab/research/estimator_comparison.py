from __future__ import annotations

import pandas as pd

from portlab.estimators.estimates import estimate
from portlab.optimization.registry import Constraints, allocate
from portlab.portfolio.metrics import portfolio_return, portfolio_sharpe, portfolio_volatility
from portlab.risk.decomposition import effective_number_of_assets

RETURN_METHODS = ("arithmetic", "geometric", "ewma")
COVARIANCE_METHODS = ("sample", "ledoit_wolf", "ewma")


def compare_estimators(
    returns: pd.DataFrame,
    method: str,
    *,
    constraints: Constraints | None = None,
    risk_free: float = 0.0,
    baseline_weights: pd.Series | None = None,
) -> tuple[pd.DataFrame, dict[tuple[str, str], pd.Series]]:
    """Run allocator `method` under every return × covariance estimator combination."""
    constraints = constraints or Constraints()
    records: list[dict[str, str | float]] = []
    weights_by_model: dict[tuple[str, str], pd.Series] = {}

    for return_method in RETURN_METHODS:
        for covariance_method in COVARIANCE_METHODS:
            est = estimate(returns, return_method, covariance_method, risk_free)
            weights = allocate(method, est, constraints)
            weights_by_model[(return_method, covariance_method)] = weights

            turnover_vs_baseline = float("nan")
            if baseline_weights is not None:
                base = baseline_weights.reindex(weights.index).fillna(0.0).astype(float)
                turnover_vs_baseline = float((weights - base).abs().sum() / 2.0)

            records.append(
                {
                    "return_method": return_method,
                    "covariance_method": covariance_method,
                    "expected_return": portfolio_return(weights, est.mu),
                    "expected_volatility": portfolio_volatility(weights, est.cov),
                    "expected_sharpe": portfolio_sharpe(weights, est.mu, est.cov, risk_free),
                    "effective_assets": effective_number_of_assets(weights),
                    "turnover_vs_active": turnover_vs_baseline,
                }
            )

    return pd.DataFrame.from_records(records), weights_by_model
