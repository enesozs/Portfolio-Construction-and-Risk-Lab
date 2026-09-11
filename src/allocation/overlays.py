from __future__ import annotations

import pandas as pd

from src.portfolio.metrics import portfolio_volatility


def volatility_target_allocation(
    risky_weights: pd.Series,
    covariance: pd.DataFrame,
    target_volatility: float,
    *,
    allow_leverage: bool = False,
    max_gross_risky_allocation: float = 2.0,
    cash_label: str = "CASH",
) -> pd.Series:
    """Scale a risky portfolio to a volatility target and place residual capital in cash.

    The covariance matrix is assumed to describe the risky assets only. Cash is treated
    as zero-volatility for this overlay. With leverage disabled, risky exposure is capped
    at 100%, so a target above the portfolio's estimated volatility simply leaves cash at 0%.
    """
    if target_volatility < 0:
        raise ValueError("target_volatility must be non-negative")
    if max_gross_risky_allocation <= 0:
        raise ValueError("max_gross_risky_allocation must be positive")

    risky = risky_weights.astype(float).reindex(covariance.columns).fillna(0.0)
    total = float(risky.sum())
    if total <= 0:
        result = pd.Series(0.0, index=list(covariance.columns) + [cash_label], dtype=float)
        result.loc[cash_label] = 1.0
        return result
    risky = risky / total

    current_vol = portfolio_volatility(risky, covariance)
    if current_vol <= 0:
        scale = 0.0 if target_volatility == 0 else 1.0
    else:
        scale = target_volatility / current_vol

    if allow_leverage:
        scale = min(scale, max_gross_risky_allocation)
    else:
        scale = min(scale, 1.0)
    scale = max(scale, 0.0)

    scaled = risky * scale
    result = pd.concat(
        [scaled, pd.Series({cash_label: 1.0 - scale}, dtype=float)]
    )
    result.name = "weight"
    return result
