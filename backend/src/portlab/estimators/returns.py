from __future__ import annotations

import pandas as pd


def annualized_mean_return(returns: pd.DataFrame, periods_per_year: int = 252) -> pd.Series:
    return returns.mean() * periods_per_year


def annualized_geometric_return(returns: pd.DataFrame, periods_per_year: int = 252) -> pd.Series:
    n = returns.count()
    growth = (1.0 + returns).prod()
    return growth.pow(periods_per_year / n) - 1.0


def ewma_expected_returns(
    returns: pd.DataFrame, span: int = 126, periods_per_year: int = 252
) -> pd.Series:
    if span < 2:
        raise ValueError("span must be >= 2")
    return returns.ewm(span=span, adjust=False).mean().iloc[-1] * periods_per_year


def historical_expected_returns(
    returns: pd.DataFrame, method: str = "arithmetic", periods_per_year: int = 252
) -> pd.Series:
    method = method.lower()
    if method == "arithmetic":
        return annualized_mean_return(returns, periods_per_year)
    if method == "geometric":
        return annualized_geometric_return(returns, periods_per_year)
    if method == "ewma":
        return ewma_expected_returns(returns, periods_per_year=periods_per_year)
    raise ValueError(f"unknown return estimator: {method}")
