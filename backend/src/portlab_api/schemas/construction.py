from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from .common import PortfolioKey, UniverseRequest, Weights


class PortfolioSummary(BaseModel):
    key: str
    label: str
    weights: Weights
    expected_return: float
    expected_volatility: float
    expected_sharpe: float | None
    historical_return: float
    historical_volatility: float
    historical_sharpe: float | None
    max_drawdown: float
    cvar_95: float
    """Average loss on the worst 5% of days (historical, daily)."""
    effective_assets: float
    diversification_ratio: float
    uses_expected_returns: bool


class FrontierPoint(BaseModel):
    expected_return: float
    volatility: float


class Ranking(BaseModel):
    objective: str
    label: str
    metric: str
    order: list[str]
    """Portfolio keys, best first."""


class PortfoliosResponse(BaseModel):
    portfolios: list[PortfolioSummary]
    errors: dict[str, str]
    frontier: list[FrontierPoint]
    risk_free: float
    rankings: list[Ranking]


class EstimatorsRequest(UniverseRequest):
    method: PortfolioKey = "max_sharpe"


class EstimatorRow(BaseModel):
    return_method: str
    covariance_method: str
    weights: Weights
    expected_return: float
    expected_volatility: float
    expected_sharpe: float | None
    effective_assets: float
    turnover_vs_active: float
    active: bool


class EstimatorsResponse(BaseModel):
    rows: list[EstimatorRow]
    max_weight_spread: dict[str, float]
    """Per asset: highest minus lowest weight across the nine combinations."""


class View(BaseModel):
    asset: str
    expected_return: float
    """Annual total return the user expects."""
    confidence: float = Field(gt=0, le=1)


class BlackLittermanRequest(UniverseRequest):
    prior: Literal["market", "equal"] = "market"
    risk_aversion: float = Field(default=2.5, gt=0, le=20)
    views: list[View] = Field(default_factory=list)


class BlackLittermanResponse(BaseModel):
    prior_weights: Weights
    prior_sources: dict[str, str]
    equilibrium: Weights
    """Implied expected returns of the prior (total, i.e. including the cash rate)."""
    posterior: Weights
    historical: Weights
    weights: Weights
    """Max-Sharpe weights using the posterior returns."""
    historical_max_sharpe: Weights


class TailRiskRequest(UniverseRequest):
    confidence: float = Field(default=0.95, ge=0.9, le=0.995)
    min_return: float | None = Field(default=None, ge=-0.5, le=1)


class TailPortfolio(BaseModel):
    key: str
    label: str
    weights: Weights
    var: float
    cvar: float
    volatility: float


class TailRiskResponse(BaseModel):
    confidence: float
    portfolios: list[TailPortfolio]


class RobustRequest(UniverseRequest):
    risk_aversion: float = Field(default=3.0, ge=0, le=20)
    uncertainty_aversion: float = Field(default=2.0, ge=0, le=20)


class CompareResponse(BaseModel):
    """Several named allocations with their headline ex-ante numbers."""

    labels: list[str]
    weights: list[Weights]
    expected_return: list[float]
    volatility: list[float]
    sharpe: list[float | None]
    turnover: list[float | None] = Field(default_factory=list)


class TurnoverRequest(UniverseRequest):
    objective: Literal["max_sharpe", "min_variance"] = "max_sharpe"
    reference: PortfolioKey = "equal_weight"
    penalty: float = Field(default=0.25, ge=0, le=5)
    min_weight: float = Field(default=0.0, ge=0, le=0.5)
    max_weight: float = Field(default=1.0, gt=0, le=1)
    max_turnover: float | None = Field(default=None, ge=0, le=1)
    max_volatility: float | None = Field(default=None, gt=0, le=1)


class RiskBudgetRequest(UniverseRequest):
    budgets: dict[str, float]


class RiskBudgetResponse(BaseModel):
    weights: Weights
    risk_contribution: Weights
    budgets: Weights
    volatility: float
