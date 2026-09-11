from __future__ import annotations

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


def ledoit_wolf_covariance(returns: pd.DataFrame, periods_per_year: int = 252) -> pd.DataFrame:
    from sklearn.covariance import LedoitWolf

    clean = returns.dropna(how="any")
    if clean.empty:
        raise ValueError("no complete observations available for Ledoit-Wolf covariance")
    fit = LedoitWolf().fit(clean.values)
    return pd.DataFrame(
        fit.covariance_ * periods_per_year,
        index=clean.columns,
        columns=clean.columns,
    )


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
