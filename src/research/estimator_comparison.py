from __future__ import annotations

from collections.abc import Callable
from typing import Any

import pandas as pd

from src.estimators.covariance import estimate_covariance
from src.estimators.returns import historical_expected_returns
from src.optimization.optimizers import global_minimum_variance, maximum_sharpe, risk_parity
from src.portfolio.metrics import portfolio_return, portfolio_sharpe, portfolio_volatility
from src.risk.decomposition import effective_number_of_assets

Optimizer = Callable[..., pd.Series]

_OPTIMIZERS: dict[str, Optimizer] = {
    "Maximum Sharpe": maximum_sharpe,
    "Minimum Variance": global_minimum_variance,
    "Risk Parity": risk_parity,
}


def compare_estimators(
    returns: pd.DataFrame,
    *,
    optimizer_name: str = "Maximum Sharpe",
    return_methods: tuple[str, ...] = ("arithmetic", "geometric", "ewma"),
    covariance_methods: tuple[str, ...] = ("sample", "ledoit_wolf", "ewma"),
    max_weight: float | None = None,
    baseline_weights: pd.Series | None = None,
    **optimizer_kwargs: Any,
) -> tuple[pd.DataFrame, dict[tuple[str, str], pd.Series]]:
    if optimizer_name not in _OPTIMIZERS:
        raise ValueError(f"unknown optimizer: {optimizer_name}")

    optimizer = _OPTIMIZERS[optimizer_name]
    records: list[dict[str, str | float]] = []
    weights_by_model: dict[tuple[str, str], pd.Series] = {}

    for return_method in return_methods:
        mu = historical_expected_returns(returns, method=return_method)
        for covariance_method in covariance_methods:
            cov = estimate_covariance(returns, method=covariance_method)
            kwargs = dict(optimizer_kwargs)
            kwargs["max_weight"] = max_weight
            try:
                weights = optimizer(expected_returns=mu, covariance=cov, **kwargs)
            except TypeError:
                weights = optimizer(covariance=cov, **kwargs)
            weights = weights.reindex(returns.columns).fillna(0.0).astype(float)
            weights_by_model[(return_method, covariance_method)] = weights

            turnover_vs_baseline = float("nan")
            if baseline_weights is not None:
                base = baseline_weights.reindex(weights.index).fillna(0.0).astype(float)
                turnover_vs_baseline = float((weights - base).abs().sum() / 2.0)

            records.append(
                {
                    "Return Estimator": return_method,
                    "Covariance Estimator": covariance_method,
                    "Expected Return": portfolio_return(weights, mu),
                    "Expected Volatility": portfolio_volatility(weights, cov),
                    "Expected Sharpe": portfolio_sharpe(weights, mu, cov),
                    "Effective Assets": effective_number_of_assets(weights),
                    "Turnover vs Active Model": turnover_vs_baseline,
                }
            )

    table = pd.DataFrame.from_records(records)
    return table, weights_by_model
