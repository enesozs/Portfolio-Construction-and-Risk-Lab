from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from .common import Performance, PortfolioKey, TimeSeries, UniverseRequest, Weights


class ParamOut(BaseModel):
    name: str
    label: str
    default: float
    min: float
    max: float
    integer: bool


class SignalOut(BaseModel):
    key: str
    label: str
    kind: Literal["timing", "ranking"]
    idea: str
    params: list[ParamOut]


class SignalsResponse(BaseModel):
    signals: list[SignalOut]


class DynamicRequest(UniverseRequest):
    method: Literal["filter", "top_k", "tilt", "black_litterman"] = "filter"
    timing: str | None = "trend"
    timing_params: dict[str, float] = Field(default_factory=dict)
    ranking: str | None = None
    ranking_params: dict[str, float] = Field(default_factory=dict)
    base: PortfolioKey | Literal["custom"] = "equal_weight"
    base_weights: dict[str, float] | None = None
    off_to_cash: bool = True
    top_k: int = Field(default=3, ge=1, le=25)
    tilt_strength: float = Field(default=0.5, ge=0, le=3)
    view_confidence: float = Field(default=0.5, gt=0, le=1)
    rebalance_every: int = Field(default=21, ge=1, le=252)
    lookback: int = Field(default=252, ge=21, le=1260)
    cost_bps: float = Field(default=5, ge=0, le=200)


class StrategyStats(BaseModel):
    performance: Performance
    average_turnover: float
    total_cost: float
    rebalances: int
    average_cash: float
    """Mean share of wealth held in cash."""


class Trial(BaseModel):
    label: str
    sharpe: float | None
    active_sharpe: float | None
    annual_return: float
    chosen: bool


class CurrentSignal(BaseModel):
    date: str
    target: Weights
    """Weights the strategy would hold after today's close (incl. CASH)."""
    on: dict[str, bool]
    score: dict[str, float | None]


class DynamicResponse(BaseModel):
    start: str
    end: str
    strategy: TimeSeries
    base_rebalanced: TimeSeries
    buy_and_hold: TimeSeries
    cash: TimeSeries
    strategy_stats: StrategyStats
    base_stats: StrategyStats
    hold_stats: StrategyStats
    strategy_drawdown: TimeSeries
    base_drawdown: TimeSeries
    holdings: dict[str, TimeSeries]
    """End-of-week holdings per asset and CASH."""
    decision_dates: list[str]
    signal_on: dict[str, list[bool]]
    """Per asset: whether its timing signal was on at each decision (empty without timing)."""
    active_return: float
    """Annualised mean of the daily return gap to the rebalanced base."""
    tracking_error: float
    probability_beats_base: float | None
    deflated_probability: float | None
    trials: list[Trial]
    current: CurrentSignal
