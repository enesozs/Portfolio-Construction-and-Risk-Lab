"""Fama–French factor regressions: exposures, alpha and where a portfolio's risk comes from.

The model regresses the portfolio's return over the T-bill rate on the factor returns:

    rₚ − r_f = α + Σₖ βₖ fₖ + ε

* βₖ is the exposure to factor k: β_Mkt ≈ 1 moves with the market, β_HML > 0 leans to value.
* α is the return the factors do not explain (annualised). A positive α that is not
  statistically significant is not evidence of skill.
* Standard errors are Newey–West (HAC). Daily returns are mildly autocorrelated and
  heteroskedastic, and plain OLS errors would overstate the precision of every estimate.

The variance decomposition splits var(rₚ − r_f) into βᵀΣ_f β (factor risk, attributed to each
factor by its Euler contribution βₖ(Σ_f β)ₖ) and var(ε) (idiosyncratic, asset-specific risk).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from scipy.stats import t as student_t

TRADING_DAYS = 252


@dataclass(frozen=True)
class FactorFit:
    factors: list[str]
    beta: np.ndarray
    beta_se: np.ndarray
    alpha: float
    """Annualised."""
    alpha_se: float
    r_squared: float
    observations: int
    lags: int
    risk_share: dict[str, float]
    """Share of the excess return's variance from each factor (Euler contributions).

    Together with `idiosyncratic_share` they sum to one."""
    idiosyncratic_share: float

    def t_stat(self) -> np.ndarray:
        return self.beta / self.beta_se

    def p_values(self) -> np.ndarray:
        dof = self.observations - len(self.factors) - 1
        return 2 * student_t.sf(np.abs(self.t_stat()), dof)

    @property
    def alpha_t(self) -> float:
        return self.alpha / self.alpha_se if self.alpha_se > 0 else float("nan")


def newey_west_lags(n: int) -> int:
    """The usual automatic bandwidth: ⌊4(n/100)^(2/9)⌋."""
    return int(np.floor(4 * (n / 100) ** (2 / 9)))


def ols_newey_west(y: np.ndarray, x: np.ndarray, lags: int) -> tuple[np.ndarray, np.ndarray]:
    """OLS coefficients and Newey–West standard errors (Bartlett kernel). `x` has the constant."""
    n = len(y)
    xtx_inv = np.linalg.inv(x.T @ x)
    coef = xtx_inv @ x.T @ y
    u = y - x @ coef
    scores = x * u[:, None]
    meat = scores.T @ scores
    for lag in range(1, lags + 1):
        weight = 1 - lag / (lags + 1)
        gamma = scores[lag:].T @ scores[:-lag]
        meat += weight * (gamma + gamma.T)
    cov = xtx_inv @ meat @ xtx_inv * n / (n - x.shape[1])
    return coef, np.sqrt(np.diag(cov))


def fit_factor_model(
    portfolio: pd.Series, factor_returns: pd.DataFrame, factors: list[str]
) -> FactorFit:
    """Regress `portfolio`'s return over RF on `factors` (columns of `factor_returns`)."""
    joined = pd.concat([portfolio.rename("p"), factor_returns], axis=1, sort=True).dropna()
    if len(joined) < max(60, 3 * len(factors)):
        raise ValueError(
            f"only {len(joined)} days overlap with the factor data; need at least 60 "
            "(the factor library lags by about a month)"
        )
    y = (joined["p"] - joined["RF"]).to_numpy(dtype=float)
    f = joined[factors].to_numpy(dtype=float)
    x = np.column_stack([np.ones(len(f)), f])
    lags = newey_west_lags(len(y))
    coef, se = ols_newey_west(y, x, lags)
    beta = coef[1:]
    resid = y - x @ coef
    r2 = 1 - float(np.var(resid)) / float(np.var(y)) if np.var(y) > 0 else float("nan")

    sigma_f = np.atleast_2d(np.cov(f, rowvar=False))
    systematic = sigma_f @ beta
    total = float(beta @ systematic) + float(np.var(resid, ddof=1))
    share = {k: float(beta[i] * systematic[i] / total) for i, k in enumerate(factors)}
    return FactorFit(
        factors=factors,
        beta=beta,
        beta_se=se[1:],
        alpha=float(coef[0] * TRADING_DAYS),
        alpha_se=float(se[0] * TRADING_DAYS),
        r_squared=r2,
        observations=len(y),
        lags=lags,
        risk_share=share,
        idiosyncratic_share=float(np.var(resid, ddof=1)) / total,
    )


def rolling_betas(
    portfolio: pd.Series, factor_returns: pd.DataFrame, factors: list[str], window: int = 252
) -> pd.DataFrame:
    """Plain OLS betas over a trailing window, sampled every 5 days (exposure drift)."""
    joined = pd.concat([portfolio.rename("p"), factor_returns], axis=1, sort=True).dropna()
    y = (joined["p"] - joined["RF"]).to_numpy(dtype=float)
    f = joined[factors].to_numpy(dtype=float)
    rows, dates = [], []
    for end in range(window, len(y) + 1, 5):
        x = np.column_stack([np.ones(window), f[end - window : end]])
        coef, *_ = np.linalg.lstsq(x, y[end - window : end], rcond=None)
        rows.append(coef[1:])
        dates.append(joined.index[end - 1])
    return pd.DataFrame(rows, index=pd.DatetimeIndex(dates), columns=factors)
