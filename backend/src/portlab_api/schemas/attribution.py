from __future__ import annotations

from pydantic import BaseModel, Field

from .common import PortfolioRequest, TimeSeries, Weights


class BenchmarkRequest(PortfolioRequest):
    benchmark: str = Field(default="SPY", min_length=1, max_length=12)


class BenchmarkResponse(BaseModel):
    benchmark: str
    alpha: float | None
    beta: float | None
    active_return: float
    tracking_error: float
    information_ratio: float | None
    upside_capture: float | None
    downside_capture: float | None
    contributions: Weights
    portfolio: TimeSeries
    benchmark_wealth: TimeSeries


class FactorOut(BaseModel):
    key: str
    label: str
    beta: float
    stderr: float
    t_stat: float
    p_value: float
    risk_share: float
    """Share of the excess return's variance from this factor."""


class AssetExposure(BaseModel):
    ticker: str
    betas: dict[str, float]
    alpha: float
    r_squared: float


class FactorResponse(BaseModel):
    factors: list[FactorOut]
    alpha: float
    alpha_t: float | None
    r_squared: float
    observations: int
    lags: int
    idiosyncratic_share: float
    start: str
    end: str
    stale: bool
    rolling: dict[str, TimeSeries]
    """Trailing one-year betas."""
    assets: list[AssetExposure]
