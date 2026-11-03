"""Shared work behind every route: load the universe, estimate, build standard portfolios.

`context()` is memoised per universe spec (and day), so moving between pages that share a
universe does not reload prices or re-run the six standard optimisations.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date
from functools import lru_cache

import numpy as np
import pandas as pd

from portlab.data.universe import Universe, build_universe
from portlab.estimators.estimates import Estimates, estimate
from portlab.optimization.registry import ALLOCATORS, Constraints, allocate
from portlab.portfolio.metrics import performance_summary

from .schemas.common import Histogram, Performance, TimeSeries, UniverseIn


@dataclass(frozen=True)
class Context:
    universe: Universe
    estimates: Estimates
    constraints: Constraints
    portfolios: dict[str, pd.Series]
    """Standard portfolios by registry key (methods that failed are left out)."""
    errors: dict[str, str]

    def weights(self, key: str) -> pd.Series:
        if key not in self.portfolios:
            reason = self.errors.get(key, "not available")
            raise ValueError(f"{ALLOCATORS[key].label} could not be built: {reason}")
        return self.portfolios[key]


def context(spec: UniverseIn) -> Context:
    return _context(spec.model_dump_json(), date.today().isoformat())


@lru_cache(maxsize=32)
def _context(spec_json: str, _day: str) -> Context:
    spec = UniverseIn.model_validate_json(spec_json)
    universe = build_universe(spec.tickers, spec.start, spec.end, risk_free=spec.risk_free)
    n = len(universe.tickers)
    if spec.max_weight is not None and spec.max_weight * n < 1 - 1e-9:
        raise ValueError(
            f"a {spec.max_weight:.0%} cap on {n} assets cannot add up to 100%; "
            f"raise it to at least {math.ceil(100 / n)}%"
        )
    est = estimate(universe.returns, spec.return_method, spec.cov_method, universe.risk_free)
    constraints = Constraints(max_weight=spec.max_weight)
    portfolios: dict[str, pd.Series] = {}
    errors: dict[str, str] = {}
    for key in ALLOCATORS:
        try:
            portfolios[key] = allocate(key, est, constraints)
        except (ValueError, RuntimeError) as exc:
            errors[key] = str(exc)
    return Context(universe, est, constraints, portfolios, errors)


# ── Serialisation helpers ──────────────────────────────────────────────────────────────────


def finite(value: float) -> float | None:
    value = float(value)
    return value if math.isfinite(value) else None


def weights_out(weights: pd.Series) -> dict[str, float]:
    return {str(k): float(v) for k, v in weights.items()}


def series_out(series: pd.Series) -> TimeSeries:
    clean = series.dropna()
    return TimeSeries(
        dates=[pd.Timestamp(d).strftime("%Y-%m-%d") for d in clean.index],
        values=[float(v) for v in clean.to_numpy(dtype=float)],
    )


def histogram_out(values: np.ndarray, bins: int = 50) -> Histogram:
    counts, edges = np.histogram(values[np.isfinite(values)], bins=bins)
    share = counts / max(int(counts.sum()), 1) * 100
    return Histogram(edges=edges.tolist(), counts=share.tolist())


def performance_out(stats: Mapping[str, float]) -> Performance:
    return Performance(
        annual_return=float(stats["annual_return"]),
        annual_volatility=float(stats["annual_volatility"]),
        sharpe=finite(stats["sharpe"]),
        sortino=finite(stats["sortino"]),
        max_drawdown=float(stats["max_drawdown"]),
        calmar=finite(stats["calmar"]),
    )


def realised(returns: pd.Series, ctx: Context) -> Performance:
    return performance_out(performance_summary(returns, cash_returns=ctx.universe.cash_returns))
