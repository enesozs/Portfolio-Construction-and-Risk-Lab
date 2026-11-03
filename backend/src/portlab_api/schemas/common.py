"""Request/response pieces shared by every area."""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

ReturnMethod = Literal["arithmetic", "geometric", "ewma"]
CovMethod = Literal["sample", "ledoit_wolf", "ewma"]
PortfolioKey = Literal[
    "equal_weight", "min_variance", "max_sharpe", "risk_parity", "hrp", "min_cvar"
]


class UniverseIn(BaseModel):
    """The research universe every page shares (the frontend's universe bar)."""

    tickers: list[str] = Field(min_length=2, max_length=25)
    start: date
    end: date | None = None
    return_method: ReturnMethod = "arithmetic"
    cov_method: CovMethod = "ledoit_wolf"
    max_weight: float | None = Field(default=None, gt=0, le=1)
    """Cap on any single asset's weight; None = uncapped."""
    risk_free: float | None = Field(default=None, ge=-0.05, le=0.25)
    """Constant annual cash rate; None = the 13-week T-bill series."""


class UniverseRequest(BaseModel):
    universe: UniverseIn


class PortfolioRequest(UniverseRequest):
    portfolio: PortfolioKey = "max_sharpe"


class TimeSeries(BaseModel):
    dates: list[str]
    values: list[float]


class Histogram(BaseModel):
    edges: list[float]
    counts: list[float]
    """Share of observations per bin (%)."""


class Performance(BaseModel):
    annual_return: float
    annual_volatility: float
    sharpe: float | None
    sortino: float | None
    max_drawdown: float
    calmar: float | None


Weights = dict[str, float]
