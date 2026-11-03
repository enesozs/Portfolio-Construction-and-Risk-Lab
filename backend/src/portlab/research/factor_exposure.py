from __future__ import annotations

import numpy as np
import pandas as pd


def factor_proxy_returns(proxy_returns: pd.DataFrame) -> pd.DataFrame:
    """Create transparent ETF-based factor proxies, not Fama-French factors."""
    needed = {"SPY", "IWM", "IWD", "IWF", "MTUM", "QUAL", "SPLV"}
    missing = needed.difference(proxy_returns.columns)
    if missing:
        raise ValueError(f"missing factor proxy series: {', '.join(sorted(missing))}")
    r = proxy_returns.astype(float)
    return pd.DataFrame(
        {
            "Market": r["SPY"],
            "Size": r["IWM"] - r["SPY"],
            "Value": r["IWD"] - r["IWF"],
            "Momentum": r["MTUM"] - r["SPY"],
            "Quality": r["QUAL"] - r["SPY"],
            "Low Volatility": r["SPLV"] - r["SPY"],
        }
    ).dropna()


def regress_factor_exposures(
    portfolio_returns: pd.Series,
    factors: pd.DataFrame,
    periods_per_year: int = 252,
) -> tuple[pd.Series, dict[str, float]]:
    joined = pd.concat([portfolio_returns.rename("portfolio"), factors], axis=1, sort=True).dropna()
    if len(joined) < max(30, factors.shape[1] + 5):
        raise ValueError("insufficient overlapping observations for factor regression")
    y = joined["portfolio"].to_numpy(dtype=float)
    x = joined[factors.columns].to_numpy(dtype=float)
    design = np.column_stack([np.ones(len(x)), x])
    coefs, *_ = np.linalg.lstsq(design, y, rcond=None)
    fitted = design @ coefs
    resid = y - fitted
    ss_res = float(np.sum(resid**2))
    ss_tot = float(np.sum((y - y.mean()) ** 2))
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else float("nan")
    exposures = pd.Series(coefs[1:], index=factors.columns, name="beta", dtype=float)
    stats = {"alpha": float(coefs[0] * periods_per_year), "r_squared": r2}
    return exposures, stats
