"""Validation: out-of-sample behaviour, rebalancing rules, and allocation stability."""

from __future__ import annotations

import numpy as np
import pandas as pd
from fastapi import APIRouter

from portlab._pandas import column
from portlab.backtest import BacktestResult, buy_and_hold
from portlab.portfolio.metrics import portfolio_returns_series
from portlab.robustness.bootstrap import bootstrap_weight_stability
from portlab.validation.rebalancing import simulate_rebalancing_policy
from portlab.validation.walk_forward import walk_forward_portfolio

from ..schemas.validation import (
    BootstrapRequest,
    BootstrapResponse,
    BootstrapRow,
    PolicyResult,
    RebalancingRequest,
    RebalancingResponse,
    WalkForwardRequest,
    WalkForwardResponse,
)
from ..services import context, realised, series_out

router = APIRouter(prefix="/validation", tags=["validation"])


@router.post("/walk-forward")
def walk_forward(req: WalkForwardRequest) -> WalkForwardResponse:
    ctx = context(req.universe)
    u = ctx.universe
    result = walk_forward_portfolio(
        u.returns,
        req.method,
        constraints=ctx.constraints,
        lookback=req.lookback,
        rebalance_every=req.rebalance_every,
        window=req.window,
        return_method=req.universe.return_method,
        covariance_method=req.universe.cov_method,
        cost_bps=req.cost_bps,
        cash_returns=u.cash_returns,
    )
    bt = result.backtest
    oos = u.returns.loc[bt.returns.index]
    equal = buy_and_hold(oos, pd.Series(1 / len(u.tickers), index=u.tickers), u.cash_returns)
    cash = (1 + u.cash_returns.loc[bt.returns.index]).cumprod()
    return WalkForwardResponse(
        net=series_out(bt.wealth),
        gross=series_out((1 + bt.gross_returns).cumprod()),
        equal_weight=series_out(equal.wealth),
        cash=series_out(cash),
        performance=realised(bt.returns, ctx),
        gross_performance=realised(bt.gross_returns, ctx),
        equal_weight_performance=realised(equal.returns, ctx),
        predicted_volatility=series_out(result.predicted_volatility),
        realized_volatility=series_out(result.realized_volatility),
        average_turnover=float(column(bt.rebalances, "turnover").mean())
        if len(bt.rebalances)
        else 0.0,
        total_cost=float(column(bt.rebalances, "cost").sum()) if len(bt.rebalances) else 0.0,
        rebalances=len(bt.rebalances),
        targets={str(c): series_out(column(result.targets, c)) for c in result.targets.columns},
    )


@router.post("/rebalancing")
def rebalancing(req: RebalancingRequest) -> RebalancingResponse:
    ctx = context(req.universe)
    u = ctx.universe
    target = ctx.weights(req.portfolio)
    ideal = portfolio_returns_series(u.returns, target)

    def summary(key: str, label: str, bt: BacktestResult) -> PolicyResult:
        gap = (bt.returns - ideal).to_numpy(dtype=float)
        turnover = column(bt.rebalances, "turnover")
        return PolicyResult(
            key=key,
            label=label,
            performance=realised(bt.returns, ctx),
            rebalances=len(bt.rebalances),
            total_cost=float(column(bt.rebalances, "cost").sum()) if len(bt.rebalances) else 0.0,
            average_turnover=float(turnover.mean()) if len(turnover) else 0.0,
            tracking_error=float(np.std(gap, ddof=1) * np.sqrt(252)),
            wealth=series_out(bt.wealth),
        )

    def run(policy: str) -> BacktestResult:
        return simulate_rebalancing_policy(
            u.returns,
            target,
            policy,
            rebalance_every=req.calendar_days,
            threshold=req.threshold,
            distance_threshold=req.distance,
            cost_bps=req.cost_bps,
            cash_returns=u.cash_returns,
        )

    return RebalancingResponse(
        policies=[
            summary(
                "never", "Never (buy and hold)", buy_and_hold(u.returns, target, u.cash_returns)
            ),
            summary("calendar", f"Every {req.calendar_days} days", run("calendar")),
            summary("threshold", f"Any asset ±{req.threshold:.0%} off", run("threshold")),
            summary("distance", f"Portfolio {req.distance:.0%} off", run("distance")),
        ]
    )


@router.post("/bootstrap")
def bootstrap(req: BootstrapRequest) -> BootstrapResponse:
    ctx = context(req.universe)
    draws, _ = bootstrap_weight_stability(
        ctx.universe.returns,
        req.method,
        constraints=ctx.constraints,
        n_bootstrap=req.n_bootstrap,
        return_method=req.universe.return_method,
        covariance_method=req.universe.cov_method,
        bootstrap_method=req.bootstrap_method,
        block_size=req.block_size,
        risk_free=ctx.universe.risk_free,
    )
    full = ctx.weights(req.method)
    q = draws.quantile([0.05, 0.25, 0.5, 0.75, 0.95])
    rows = [
        BootstrapRow(
            asset=str(a),
            full_sample=float(full.at[a]),
            mean=float(column(draws, a).mean()),
            std=float(np.std(column(draws, a).to_numpy(dtype=float), ddof=1)),
            p05=float(q.at[0.05, a]),
            p25=float(q.at[0.25, a]),
            p50=float(q.at[0.5, a]),
            p75=float(q.at[0.75, a]),
            p95=float(q.at[0.95, a]),
            min=float(column(draws, a).min()),
            max=float(column(draws, a).max()),
        )
        for a in draws.columns
    ]
    widths = [r.p95 - r.p05 for r in rows]
    return BootstrapResponse(
        rows=rows,
        least_stable=max(rows, key=lambda r: r.std).asset,
        average_range=float(np.mean(widths)),
    )
