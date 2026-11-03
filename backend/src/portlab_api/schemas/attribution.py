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


class FactorResponse(BaseModel):
    exposures: Weights
    alpha: float
    r_squared: float
    observations: int
    proxies: dict[str, str]
