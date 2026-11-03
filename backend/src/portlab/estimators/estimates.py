from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from portlab.estimators.covariance import estimate_covariance
from portlab.estimators.returns import historical_expected_returns


@dataclass(frozen=True)
class Estimates:
    """Everything an allocator may use, estimated from one window of daily returns."""

    returns: pd.DataFrame
    mu: pd.Series
    """Annualised expected returns."""
    cov: pd.DataFrame
    """Annualised covariance."""
    risk_free: float = 0.0
    """Annual cash rate over the same window."""

    @property
    def assets(self) -> list[str]:
        return [str(c) for c in self.returns.columns]


def estimate(
    returns: pd.DataFrame,
    return_method: str = "arithmetic",
    cov_method: str = "sample",
    risk_free: float = 0.0,
) -> Estimates:
    clean = returns.dropna(how="any")
    return Estimates(
        returns=clean,
        mu=historical_expected_returns(clean, method=return_method),
        cov=estimate_covariance(clean, method=cov_method),
        risk_free=risk_free,
    )
