from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from .common import (
    Histogram,
    Performance,
    PortfolioKey,
    PortfolioRequest,
    TimeSeries,
    UniverseRequest,
)


class WalkForwardRequest(UniverseRequest):
    method: PortfolioKey = "min_variance"
    window: Literal["rolling", "expanding"] = "rolling"
    lookback: int = Field(default=252, ge=63, le=2520)
    rebalance_every: int = Field(default=21, ge=1, le=252)
    cost_bps: float = Field(default=5, ge=0, le=200)


class WalkForwardResponse(BaseModel):
    net: TimeSeries
    """Growth of 1 after costs."""
    gross: TimeSeries
    equal_weight: TimeSeries
    """Buy-and-hold equal weight over the same out-of-sample days: the passive benchmark."""
    cash: TimeSeries
    performance: Performance
    gross_performance: Performance
    equal_weight_performance: Performance
    predicted_volatility: TimeSeries
    realized_volatility: TimeSeries
    average_turnover: float
    total_cost: float
    rebalances: int
    targets: dict[str, TimeSeries]
    """Target weight of each asset at each rebalance date."""


class RebalancingRequest(PortfolioRequest):
    cost_bps: float = Field(default=5, ge=0, le=200)
    calendar_days: int = Field(default=21, ge=1, le=252)
    threshold: float = Field(default=0.05, gt=0, le=0.5)
    distance: float = Field(default=0.10, gt=0, le=1)


class PolicyResult(BaseModel):
    key: str
    label: str
    performance: Performance
    rebalances: int
    total_cost: float
    average_turnover: float
    tracking_error: float
    """Annualised volatility of the daily return gap to a costless daily-rebalanced target."""
    wealth: TimeSeries


class RebalancingResponse(BaseModel):
    policies: list[PolicyResult]


class BootstrapRequest(UniverseRequest):
    method: PortfolioKey = "max_sharpe"
    n_bootstrap: int = Field(default=150, ge=20, le=500)
    bootstrap_method: Literal["iid", "block"] = "block"
    block_size: int = Field(default=21, ge=2, le=126)


class BootstrapRow(BaseModel):
    asset: str
    full_sample: float
    mean: float
    std: float
    p05: float
    p25: float
    p50: float
    p75: float
    p95: float
    min: float
    max: float


class BootstrapResponse(BaseModel):
    rows: list[BootstrapRow]
    least_stable: str
    average_range: float
    """Mean width of the 5–95% weight range across assets."""


class CompareRequest(UniverseRequest):
    lookback: int = Field(default=252, ge=63, le=1260)
    rebalance_every: int = Field(default=21, ge=5, le=252)
    cost_bps: float = Field(default=5, ge=0, le=200)


class MethodResult(BaseModel):
    key: str
    label: str
    performance: Performance
    wealth: TimeSeries
    average_turnover: float
    total_cost: float
    sharpe_vs_equal_z: float | None
    sharpe_vs_equal_p: float | None
    """Memmel–Jobson–Korkie test of Sharpe(method) = Sharpe(equal weight)."""


class OverfittingOut(BaseModel):
    pbo: float
    splits: int
    logits: Histogram
    in_sample_sharpe: list[float]
    out_of_sample_sharpe: list[float]
    winners: dict[str, int]


class EstimatorResult(BaseModel):
    estimator: str
    realized_volatility: float
    predicted_volatility: float
    """Mean ex-ante volatility of the targets."""
    ratio: float
    """Realised ÷ predicted: above 1, the estimator understated risk."""
    sharpe: float | None


class MethodComparisonResponse(BaseModel):
    start: str
    end: str
    methods: list[MethodResult]
    errors: dict[str, str]
    overfitting: OverfittingOut | None
    estimators: list[EstimatorResult]
