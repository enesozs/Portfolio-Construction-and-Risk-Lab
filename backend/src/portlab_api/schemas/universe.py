from __future__ import annotations

from pydantic import BaseModel, Field

from .common import TimeSeries, UniverseRequest


class UniverseMeta(BaseModel):
    tickers: list[str]
    start: str
    end: str
    observations: int
    requested_start: str
    inception: dict[str, str]
    limiting: list[str]
    """Tickers that listed after the requested start and so moved the sample start."""
    stale: list[str]
    """Tickers served from an old cache copy or the bundled snapshot."""
    risk_free: float
    risk_free_source: str


class AssetStats(BaseModel):
    ticker: str
    expected_return: float
    volatility: float
    sharpe: float | None
    realised_return: float
    max_drawdown: float


class Diagnostics(BaseModel):
    estimator: str
    condition_number: float
    effective_rank: float
    min_eigenvalue: float
    distance_vs_sample: float


class Pair(BaseModel):
    a: str
    b: str
    value: float


class OverviewResponse(BaseModel):
    meta: UniverseMeta
    assets: list[AssetStats]
    correlation: list[list[float]]
    average_correlation: float
    strongest_pair: Pair
    weakest_pair: Pair
    diagnostics: list[Diagnostics]
    active_estimator: str
    growth: dict[str, TimeSeries]
    """Growth of 1 for each asset over the sample (weekly)."""


class DependencyRequest(UniverseRequest):
    window: int = Field(default=63, ge=10, le=504)


class DependencyResponse(BaseModel):
    average_correlation: TimeSeries
    equal_weight_volatility: TimeSeries
    regimes: list[str]
    low_threshold: float
    high_threshold: float
    latest: float
    latest_percentile: float
    latest_regime: str
