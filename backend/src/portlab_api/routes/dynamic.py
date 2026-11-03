"""Dynamic allocation: signal-driven weights across the universe and cash."""

from __future__ import annotations

import numpy as np
import pandas as pd
from fastapi import APIRouter

from portlab._pandas import column
from portlab.backtest import CASH, BacktestResult
from portlab.data.prices import load_prices
from portlab.dynamic import DynamicSpec, run_dynamic
from portlab.signals import SIGNALS

from ..schemas.dynamic import (
    CurrentSignal,
    DynamicRequest,
    DynamicResponse,
    ParamOut,
    SignalOut,
    SignalsResponse,
    StrategyStats,
    Trial,
)
from ..services import context, finite, realised, series_out, weights_out

router = APIRouter(prefix="/dynamic", tags=["dynamic"])


@router.get("/signals")
def signals() -> SignalsResponse:
    return SignalsResponse(
        signals=[
            SignalOut(
                key=s.key,
                label=s.label,
                kind="timing" if s.kind == "timing" else "ranking",
                idea=s.idea,
                params=[
                    ParamOut(
                        name=p.name,
                        label=p.label,
                        default=p.default,
                        min=p.min,
                        max=p.max,
                        integer=p.integer,
                    )
                    for p in s.params
                ],
            )
            for s in SIGNALS.values()
        ]
    )


def _drawdown(wealth: pd.Series) -> pd.Series:
    values = wealth.to_numpy(dtype=float)
    peak = np.maximum.accumulate(np.concatenate([[1.0], values]))[1:]
    return pd.Series(values / peak - 1.0, index=wealth.index)


@router.post("/backtest")
def backtest(req: DynamicRequest) -> DynamicResponse:
    ctx = context(req.universe)
    u = ctx.universe
    spec = DynamicSpec(
        method=req.method,
        timing=req.timing,
        timing_params=req.timing_params,
        ranking=req.ranking,
        ranking_params=req.ranking_params,
        base=req.base,
        base_weights=req.base_weights,
        off_to_cash=req.off_to_cash,
        top_k=req.top_k,
        tilt_strength=req.tilt_strength,
        view_confidence=req.view_confidence,
        rebalance_every=req.rebalance_every,
        lookback=req.lookback,
        cost_bps=req.cost_bps,
    )
    # Signals read each asset's full history, so long windows are ready at the sample start.
    history = load_prices(u.tickers).prices
    result = run_dynamic(
        spec,
        u.returns,
        history,
        u.cash_returns,
        ctx.constraints,
        return_method=req.universe.return_method,
        cov_method=req.universe.cov_method,
    )

    def stats(bt: BacktestResult) -> StrategyStats:
        turnover = column(bt.rebalances, "turnover")
        return StrategyStats(
            performance=realised(bt.returns, ctx),
            average_turnover=float(turnover.mean()) if len(turnover) else 0.0,
            total_cost=float(column(bt.rebalances, "cost").sum()) if len(turnover) else 0.0,
            rebalances=len(turnover),
            average_cash=float(column(bt.weights, CASH).mean()),
        )

    s, b, h = result.strategy, result.base_rebalanced, result.buy_and_hold
    gap = (s.returns - b.returns).to_numpy(dtype=float)
    weekly = s.weights.resample("W-FRI").last()
    last = result.decisions[-1]
    dates = [pd.Timestamp(d.date).strftime("%Y-%m-%d") for d in result.decisions]
    return DynamicResponse(
        start=dates[0],
        end=pd.Timestamp(s.returns.index[-1]).strftime("%Y-%m-%d"),
        strategy=series_out(s.wealth),
        base_rebalanced=series_out(b.wealth),
        buy_and_hold=series_out(h.wealth),
        cash=series_out((1 + s.cash_returns).cumprod()),
        strategy_stats=stats(s),
        base_stats=stats(b),
        hold_stats=stats(h),
        strategy_drawdown=series_out(_drawdown(s.wealth)),
        base_drawdown=series_out(_drawdown(b.wealth)),
        holdings={str(c): series_out(column(weekly, c)) for c in weekly.columns},
        decision_dates=dates,
        signal_on=(
            {a: [d.on[a] for d in result.decisions] for a in u.tickers} if req.timing else {}
        ),
        active_return=float(np.mean(gap) * 252),
        tracking_error=float(np.std(gap, ddof=1) * np.sqrt(252)),
        probability_beats_base=finite(result.probability_beats_base),
        deflated_probability=finite(result.deflated_probability),
        trials=[
            Trial(
                label=t["label"],
                sharpe=finite(t["sharpe"]),
                active_sharpe=finite(t["active_sharpe"]),
                annual_return=t["annual_return"],
                chosen=t["chosen"],
            )
            for t in result.trials
        ],
        current=CurrentSignal(
            date=pd.Timestamp(last.date).strftime("%Y-%m-%d"),
            target=weights_out(last.target),
            on=last.on,
            score=last.score,
        ),
    )
