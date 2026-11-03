"""Value-at-Risk backtesting: would yesterday's VaR model have held up today?

Each day t, a model estimates the 1-day VaR from returns up to t − 1. An **exception** is a
day whose loss exceeds that VaR. A 99% VaR should be exceeded on about 1% of days, and the
exceptions should not bunch together. Three standard tests check this:

* **Kupiec POF** (proportion of failures, 1995): is the exception rate consistent with 1 − c?
  Too many exceptions means risk was understated; far too few means it was overstated.
* **Christoffersen independence** (1998): is an exception today more likely after one
  yesterday? Clusters mean the model reacts too slowly to changing volatility.
* **Conditional coverage**: both at once (the two statistics add up, with 2 degrees of freedom).

Models (all for daily returns, window = trailing days):
* historical: the empirical quantile of the window;
* normal: mean − z·σ of the window;
* ewma: RiskMetrics, σ²ₜ = λσ²ₜ₋₁ + (1 − λ)r²ₜ₋₁ with λ = 0.94 and normal quantiles. It
  adapts to volatility within days;
* filtered_historical: returns standardised by the EWMA σ, the empirical quantile of those,
  rescaled by today's σ. Fat tails from history plus a volatility that adapts.

The Basel traffic light counts exceptions of the 99% VaR over the last 250 days:
0–4 is green, 5–9 yellow, 10 or more red.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from scipy.stats import chi2, norm

MODELS = ("historical", "normal", "ewma", "filtered_historical")
LAMBDA = 0.94


@dataclass(frozen=True)
class Coverage:
    statistic: float
    p_value: float


@dataclass(frozen=True)
class ModelBacktest:
    model: str
    var: pd.Series
    """1-day VaR forecast for each day (positive loss), made with data before that day."""
    exceptions: pd.Series
    """True on days whose loss exceeded the forecast."""
    rate: float
    kupiec: Coverage
    independence: Coverage
    conditional: Coverage
    traffic_light: str | None
    """Basel zone over the last 250 days (99% VaR only)."""
    last_250_exceptions: int


def _ewma_sigma(r: np.ndarray, seed_var: float) -> np.ndarray:
    """σ forecast for each day from returns strictly before it."""
    out = np.empty(len(r))
    var = seed_var
    for i in range(len(r)):
        out[i] = np.sqrt(var)
        var = LAMBDA * var + (1 - LAMBDA) * r[i] ** 2
    return out


def var_forecasts(returns: pd.Series, model: str, confidence: float, window: int) -> pd.Series:
    """Out-of-sample VaR forecasts from day `window` on (each uses only earlier days)."""
    if model not in MODELS:
        raise ValueError(f"model must be one of {', '.join(MODELS)}")
    r = returns.dropna().to_numpy(dtype=float)
    if len(r) <= window + 20:
        raise ValueError(f"need more than {window + 20} days of returns for a {window}-day window")
    q = 1 - confidence
    z = norm.ppf(q)
    out = np.empty(len(r) - window)
    sigma = (
        _ewma_sigma(r, float(np.var(r[:window])))
        if model in ("ewma", "filtered_historical")
        else np.empty(0)
    )
    for k, t in enumerate(range(window, len(r))):
        past = r[t - window : t]
        if model == "historical":
            out[k] = -np.quantile(past, q)
        elif model == "normal":
            out[k] = -(past.mean() + z * past.std(ddof=1))
        elif model == "ewma":
            out[k] = -z * sigma[t]
        else:
            standardised = past / sigma[t - window : t]
            out[k] = -np.quantile(standardised, q) * sigma[t]
    return pd.Series(out, index=returns.dropna().index[window:], name=model)


def kupiec(exceptions: np.ndarray, q: float) -> Coverage:
    n, x = len(exceptions), int(exceptions.sum())
    p = x / n
    log_null = (n - x) * np.log(1 - q) + x * np.log(q)
    log_alt = (n - x) * np.log(1 - p) + x * np.log(p) if 0 < x < n else 0.0
    stat = float(-2 * (log_null - log_alt))
    return Coverage(stat, float(chi2.sf(stat, 1)))


def christoffersen(exceptions: np.ndarray) -> Coverage:
    e = exceptions.astype(int)
    prev, curr = e[:-1], e[1:]
    n00 = int(np.sum((prev == 0) & (curr == 0)))
    n01 = int(np.sum((prev == 0) & (curr == 1)))
    n10 = int(np.sum((prev == 1) & (curr == 0)))
    n11 = int(np.sum((prev == 1) & (curr == 1)))

    def ll(n_stay: int, n_move: int, p: float) -> float:
        out = 0.0
        if n_stay:
            out += n_stay * np.log(1 - p)
        if n_move:
            out += n_move * np.log(p)
        return out

    p01 = n01 / (n00 + n01) if n00 + n01 else 0.0
    p11 = n11 / (n10 + n11) if n10 + n11 else 0.0
    p = (n01 + n11) / (n00 + n01 + n10 + n11)
    if p in (0.0, 1.0):
        return Coverage(0.0, 1.0)
    stat = float(-2 * (ll(n00 + n10, n01 + n11, p) - ll(n00, n01, p01) - ll(n10, n11, p11)))
    return Coverage(stat, float(chi2.sf(stat, 1)))


def traffic_light(exceptions_250: int) -> str:
    return "green" if exceptions_250 <= 4 else "yellow" if exceptions_250 <= 9 else "red"


def backtest_var(
    returns: pd.Series, model: str, confidence: float = 0.99, window: int = 250
) -> ModelBacktest:
    var = var_forecasts(returns, model, confidence, window)
    realised = returns.reindex(var.index)
    exceptions = (-realised > var).rename("exception")
    e = exceptions.to_numpy(dtype=bool)
    q = 1 - confidence
    pof, ind = kupiec(e, q), christoffersen(e)
    cc_stat = pof.statistic + ind.statistic
    last = int(e[-250:].sum())
    return ModelBacktest(
        model=model,
        var=var,
        exceptions=exceptions,
        rate=float(e.mean()),
        kupiec=pof,
        independence=ind,
        conditional=Coverage(cc_stat, float(chi2.sf(cc_stat, 2))),
        traffic_light=traffic_light(last) if abs(confidence - 0.99) < 1e-9 else None,
        last_250_exceptions=last,
    )


@dataclass(frozen=True)
class ComponentRisk:
    var: float
    es: float
    component_var: pd.Series
    """Parametric (normal) Euler contributions: wᵢ(Σw)ᵢ/σₚ · z, summing to the portfolio VaR."""
    component_es: pd.Series
    """Historical contributions: −wᵢ·E[rᵢ | portfolio loss beyond VaR], summing to the ES."""


def component_risk(
    returns: pd.DataFrame, weights: pd.Series, cov_daily: pd.DataFrame, confidence: float
) -> ComponentRisk:
    """Split 1-day VaR and ES between assets (Euler allocation, both sum to the total)."""
    w = weights.reindex(returns.columns).fillna(0.0).to_numpy(dtype=float)
    r = returns.to_numpy(dtype=float)
    port = r @ w
    q = 1 - confidence
    threshold = np.quantile(port, q)
    tail = port <= threshold
    component_es = -(r[tail] * w).mean(axis=0)
    sigma = cov_daily.reindex(index=returns.columns, columns=returns.columns).to_numpy(dtype=float)
    vol = float(np.sqrt(w @ sigma @ w))
    z = -norm.ppf(q)
    component_var = w * (sigma @ w) / vol * z if vol > 0 else np.zeros_like(w)
    assets = [str(c) for c in returns.columns]
    return ComponentRisk(
        var=float(z * vol),
        es=float(-port[tail].mean()),
        component_var=pd.Series(component_var, index=assets),
        component_es=pd.Series(component_es, index=assets),
    )
