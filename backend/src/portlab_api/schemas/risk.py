from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from .common import Histogram, PortfolioRequest, TimeSeries, Weights


class ContributionRow(BaseModel):
    asset: str
    weight: float
    marginal_risk: float
    component_risk: float
    risk_contribution: float


class DecompositionResponse(BaseModel):
    volatility: float
    rows: list[ContributionRow]
    hhi: float
    effective_assets_hhi: float
    effective_assets_entropy: float
    weighted_average_correlation: float
    diversification_ratio: float
    diversification_benefit: float
    """Weighted average asset volatility minus portfolio volatility."""
    marginal_diversification: dict[str, float | None]


class VolTargetRequest(PortfolioRequest):
    target_volatility: float = Field(default=0.12, gt=0, le=1)
    allow_leverage: bool = False
    max_gross: float = Field(default=2.0, gt=0, le=5)


class VolTargetResponse(BaseModel):
    weights: Weights
    """Including CASH."""
    risky_volatility: float
    volatility: float
    expected_return: float
    risky_expected_return: float
    cash_rate: float


class StressRequest(PortfolioRequest):
    correlation_stress: float = Field(default=0.3, ge=0, le=1)
    volatility_multiplier: float = Field(default=1.5, ge=0.5, le=4)


class StressResponse(BaseModel):
    base: float
    correlation_only: float
    volatility_only: float
    combined: float
    grid: list[float]
    """Correlation-stress levels for the curves."""
    curve_base_vol: list[float]
    curve_stressed_vol: list[float]


class ScenarioRequest(PortfolioRequest):
    shocks: dict[str, float]
    """Return shock per asset (decimal, e.g. -0.2)."""


class ScenarioResponse(BaseModel):
    portfolio_return: float
    contributions: Weights


class CrisisOut(BaseModel):
    name: str
    start: str
    end: str
    error: str | None = None
    total_return: float | None = None
    max_drawdown: float | None = None
    worst_day: float | None = None
    annual_volatility: float | None = None
    recovery_days: float | None = None
    """Trading days from the trough back to the prior peak; None = not recovered in period."""
    available: list[str] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)
    missing_weight: float = 0.0
    wealth: TimeSeries | None = None
    drawdown: TimeSeries | None = None


class CrisesResponse(BaseModel):
    crises: list[CrisisOut]


class SimulationRequest(PortfolioRequest):
    model: Literal["normal", "student_t", "bootstrap", "t_copula", "regime"] = "student_t"
    horizon_days: int = Field(default=252, ge=5, le=2520)
    n_paths: int = Field(default=5_000, ge=200, le=20_000)
    rebalance_every: int = Field(default=0, ge=0, le=252)
    """0 = buy and hold (weights drift); k = reset to target every k days."""
    student_df: float = Field(default=5, gt=2, le=50)
    block_size: int = Field(default=21, ge=1, le=126)
    seed: int = 42


class Estimate(BaseModel):
    value: float
    stderr: float


class RegimeOut(BaseModel):
    share_stressed: float
    """Share of historical days labelled stressed."""
    starts_stressed: bool
    stay_calm: float
    stay_stressed: float
    """Daily probabilities of remaining in each regime."""
    calm_volatility: float
    stressed_volatility: float
    """Annualised volatility of an equal-weight mix within each regime."""
    calm_correlation: float
    stressed_correlation: float
    """Average pairwise correlation within each regime."""


class SimulationResponse(BaseModel):
    days: list[int]
    p05: list[float]
    p25: list[float]
    p50: list[float]
    p75: list[float]
    p95: list[float]
    sample_paths: list[list[float]]
    terminal: Histogram
    max_drawdown: Histogram
    metrics: dict[str, Estimate]
    regime: RegimeOut | None = None


class VarBacktestRequest(PortfolioRequest):
    confidence: float = Field(default=0.99, ge=0.9, le=0.999)
    window: int = Field(default=250, ge=60, le=1000)


class VarModelOut(BaseModel):
    model: str
    var: TimeSeries
    """Forecast 1-day VaR (positive loss) for each day."""
    exception_dates: list[str]
    rate: float
    kupiec_p: float
    independence_p: float
    conditional_p: float
    traffic_light: str | None
    last_250_exceptions: int


class ComponentOut(BaseModel):
    asset: str
    weight: float
    component_var: float
    component_es: float


class VarBacktestResponse(BaseModel):
    confidence: float
    expected_rate: float
    returns: TimeSeries
    """Daily portfolio returns over the backtest period."""
    models: list[VarModelOut]
    var: float
    es: float
    components: list[ComponentOut]
