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

from portlab.data.fundamentals import asset_groups
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
    groups: dict[str, str]
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
    est = estimate(universe.returns, spec.return_method, spec.cov_method, universe.risk_free)
    groups = asset_groups(universe.tickers)
    constraints = build_constraints(spec, universe.tickers, groups)
    portfolios: dict[str, pd.Series] = {}
    errors: dict[str, str] = {}
    for key in ALLOCATORS:
        try:
            portfolios[key] = allocate(key, est, constraints)
        except (ValueError, RuntimeError) as exc:
            errors[key] = str(exc)
    return Context(universe, est, constraints, groups, portfolios, errors)


def build_constraints(spec: UniverseIn, tickers: list[str], groups: dict[str, str]) -> Constraints:
    """Library constraints from the request, with feasibility errors the user can act on."""
    n, rules = len(tickers), spec.constraints
    if spec.max_weight is not None and spec.max_weight * n < 1 - 1e-9:
        raise ValueError(
            f"a {spec.max_weight:.0%} cap on {n} assets cannot add up to 100%; "
            f"raise it to at least {math.ceil(100 / n)}%"
        )
    group_max: dict[str, float] = {}
    if rules.group_cap is not None:
        distinct = sorted(set(groups.values()))
        if rules.group_cap * len(distinct) < 1 - 1e-9:
            raise ValueError(
                f"a {rules.group_cap:.0%} cap on each of {len(distinct)} groups "
                f"({', '.join(distinct)}) cannot add up to 100%; raise it or add assets"
            )
        group_max = dict.fromkeys(distinct, rules.group_cap)
    if rules.max_holdings is not None and rules.max_holdings > n:
        raise ValueError(f"at most {n} holdings are possible with {n} assets")
    return Constraints(
        max_weight=spec.max_weight,
        min_weight=-rules.max_short if rules.long_short else 0.0,
        gross_leverage=rules.gross_leverage if rules.long_short else None,
        groups=groups,
        group_max=group_max,
        benchmark=dict.fromkeys(tickers, 1.0 / n) if rules.max_tracking_error else None,
        max_tracking_error=rules.max_tracking_error,
        max_holdings=rules.max_holdings,
    )


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
