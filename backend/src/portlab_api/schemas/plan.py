from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from .common import PortfolioKey, UniverseRequest, Weights


class HoldingsRequest(UniverseRequest):
    holdings: str = Field(max_length=20_000)
    """One holding per line: "AAPL 25" (shares) or "AAPL $5000" (value)."""
    cash: float = Field(default=0.0, ge=0)
    target: PortfolioKey = "max_sharpe"
    fractional: bool = False
    min_trade: float = Field(default=0.0, ge=0)
    cost_bps: float = Field(default=5.0, ge=0, le=200)
    cash_buffer: float = Field(default=0.0, ge=0, lt=1)


class OrderOut(BaseModel):
    ticker: str
    price: float
    current_shares: float
    target_shares: float
    trade_shares: float
    trade_value: float
    cost: float
    current_weight: float
    target_weight: float
    weight_after: float


class RiskSnapshot(BaseModel):
    expected_return: float
    volatility: float
    sharpe: float | None


class HoldingsResponse(BaseModel):
    problems: list[str]
    outside_universe: list[str]
    """Held tickers not in the research universe: priced and sold if the target excludes them."""
    price_date: str
    total: float
    cash_before: float
    cash_after: float
    orders: list[OrderOut]
    turnover: float
    total_cost: float
    tracking_gap: float
    current: RiskSnapshot | None
    """Ex-ante risk of the current holdings (universe assets + cash), when all are in it."""
    target: RiskSnapshot
    after: RiskSnapshot


class PlanRequest(UniverseRequest):
    portfolio: PortfolioKey = "risk_parity"
    initial: float = Field(default=100_000, ge=0)
    monthly_contribution: float = Field(default=1_000, ge=0)
    years: int = Field(default=30, ge=1, le=60)
    retire_year: int = Field(default=20, ge=0, le=60)
    annual_withdrawal: float = Field(default=40_000, ge=0)
    inflation: float = Field(default=0.025, ge=-0.02, le=0.2)
    goal: float | None = Field(default=None, ge=0)
    goal_year: int | None = Field(default=None, ge=1, le=60)
    glide_start: float = Field(default=1.0, ge=0, le=1)
    glide_end: float = Field(default=0.6, ge=0, le=1)
    model: Literal["normal", "student_t", "bootstrap"] = "bootstrap"
    expected_return: float | None = Field(default=0.06, ge=-0.1, le=0.3)
    """Annual nominal mean of the growth portfolio; None = the sample's own estimate."""
    n_paths: int = Field(default=3_000, ge=200, le=10_000)
    confidence: float = Field(default=0.9, ge=0.5, le=0.99)


class SequenceBucket(BaseModel):
    quintile: int
    early_return: float | None
    success: float | None
    median_terminal: float | None


class PlanResponse(BaseModel):
    years: list[int]
    p05: list[float]
    p25: list[float]
    p50: list[float]
    p75: list[float]
    p95: list[float]
    sample_paths: list[list[float]]
    ruin_by_year: list[float]
    probability_goal: float | None
    probability_ruin: float
    median_terminal: float
    safe_withdrawal_rate: float | None
    safe_withdrawal: float | None
    sequence: list[SequenceBucket]
    weights: Weights
    cash_rate: float
    sample_expected_return: float
    """The growth portfolio's mean return in the research sample (for comparison)."""
