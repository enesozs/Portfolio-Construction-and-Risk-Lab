"""My portfolio (holdings → trades) and the goal planner."""

from __future__ import annotations

import numpy as np
import pandas as pd
from fastapi import APIRouter

from portlab.data.prices import load_prices
from portlab.holdings import parse_holdings, trade_list, value_holdings
from portlab.planner import Plan, simulate_plan
from portlab.portfolio.metrics import portfolio_return, portfolio_volatility

from ..schemas.plan import (
    HoldingsRequest,
    HoldingsResponse,
    OrderOut,
    PlanRequest,
    PlanResponse,
    RiskSnapshot,
    SequenceBucket,
)
from ..services import Context, context, finite, weights_out

router = APIRouter(tags=["plan"])


def _risk(weights: pd.Series, ctx: Context) -> RiskSnapshot:
    """Ex-ante risk of a mix of universe assets and cash (cash earns the cash rate)."""
    est, rf = ctx.estimates, ctx.universe.risk_free
    risky = weights.reindex(est.assets).fillna(0.0)
    cash = 1.0 - float(risky.sum())
    ret = portfolio_return(risky, est.mu) + cash * rf
    vol = portfolio_volatility(risky, est.cov)
    return RiskSnapshot(
        expected_return=ret, volatility=vol, sharpe=finite((ret - rf) / vol) if vol > 0 else None
    )


def _at(series: pd.Series, key: object) -> float:
    return float(series.at[key]) if key in series.index else 0.0


@router.post("/portfolio/holdings")
def holdings(req: HoldingsRequest) -> HoldingsResponse:
    ctx = context(req.universe)
    parsed, problems = parse_holdings(req.holdings)
    if not parsed and req.cash <= 0:
        raise ValueError("enter at least one holding or some cash")
    tickers = sorted({h.ticker for h in parsed} | set(ctx.universe.tickers))
    history = load_prices(tickers).prices.ffill()
    latest = history.iloc[-1]
    current = value_holdings(parsed, latest, req.cash)
    target = ctx.weights(req.target)
    plan = trade_list(
        current,
        target,
        latest,
        fractional=req.fractional,
        min_trade=req.min_trade,
        cost_bps=req.cost_bps,
        cash_buffer=req.cash_buffer,
    )
    outside = sorted(set(current.shares.index) - set(ctx.universe.tickers))
    now = current.weights
    orders = [
        OrderOut(
            ticker=str(a),
            price=float(row.at["price"]),
            current_shares=float(row.at["current_shares"]),
            target_shares=float(row.at["target_shares"]),
            trade_shares=float(row.at["trade_shares"]),
            trade_value=float(row.at["trade_value"]),
            cost=float(row.at["cost"]),
            current_weight=_at(now, a),
            target_weight=_at(plan.target, a),
            weight_after=_at(plan.weights_after, a),
        )
        for a, row in plan.orders.iterrows()
    ]
    return HoldingsResponse(
        problems=problems,
        outside_universe=outside,
        price_date=pd.Timestamp(history.index[-1]).strftime("%Y-%m-%d"),
        total=current.total,
        cash_before=current.cash,
        cash_after=plan.cash_after,
        orders=orders,
        turnover=plan.turnover,
        total_cost=plan.total_cost,
        tracking_gap=plan.tracking_gap,
        current=None if outside else _risk(now.drop("CASH"), ctx),
        target=_risk(plan.target.drop("CASH"), ctx),
        after=_risk(plan.weights_after.drop("CASH").reindex(ctx.universe.tickers).fillna(0.0), ctx),
    )


@router.post("/planner")
def planner(req: PlanRequest) -> PlanResponse:
    ctx = context(req.universe)
    plan = Plan(
        initial=req.initial,
        monthly_contribution=req.monthly_contribution,
        years=req.years,
        retire_year=min(req.retire_year, req.years),
        annual_withdrawal=req.annual_withdrawal,
        inflation=req.inflation,
        goal=req.goal,
        goal_year=req.goal_year,
        glide_start=req.glide_start,
        glide_end=req.glide_end,
    )
    weights = ctx.weights(req.portfolio)
    long_only = weights.clip(lower=0.0)
    result = simulate_plan(
        plan,
        long_only / float(long_only.sum()),
        mu=ctx.estimates.mu,
        cov=ctx.estimates.cov,
        daily_history=ctx.universe.returns,
        cash_rate=ctx.universe.risk_free,
        model=req.model,
        n_paths=req.n_paths,
        confidence=req.confidence,
        expected_return=req.expected_return,
    )
    return PlanResponse(
        years=result.years.tolist(),
        p05=result.fan[5].tolist(),
        p25=result.fan[25].tolist(),
        p50=result.fan[50].tolist(),
        p75=result.fan[75].tolist(),
        p95=result.fan[95].tolist(),
        sample_paths=np.asarray(result.sample_paths).tolist(),
        ruin_by_year=result.ruin_year_share.tolist(),
        probability_goal=result.probability_goal,
        probability_ruin=result.probability_ruin,
        median_terminal=result.median_terminal,
        safe_withdrawal_rate=result.safe_withdrawal_rate,
        safe_withdrawal=result.safe_withdrawal,
        sequence=[
            SequenceBucket(
                quintile=s["quintile"],
                early_return=finite(s["early_return"]),
                success=finite(s["success"]),
                median_terminal=finite(s["median_terminal"]),
            )
            for s in result.sequence
        ],
        weights=weights_out(long_only / float(long_only.sum())),
        cash_rate=ctx.universe.risk_free,
        sample_expected_return=portfolio_return(
            long_only / float(long_only.sum()), ctx.estimates.mu
        ),
    )
