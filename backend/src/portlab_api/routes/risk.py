"""Risk: where volatility comes from, what stress does to it, and simulated outcomes."""

from __future__ import annotations

import numpy as np
import pandas as pd
from fastapi import APIRouter

from portlab.allocation.overlays import volatility_target_allocation
from portlab.data.prices import load_prices
from portlab.portfolio.metrics import portfolio_return, portfolio_volatility
from portlab.research.diversification import (
    diversification_breakdown,
    marginal_diversification_contribution,
)
from portlab.risk.decomposition import risk_contributions
from portlab.risk.scenarios import (
    HISTORICAL_CRISES,
    apply_return_scenario,
    replay_historical_period,
)
from portlab.risk.stress import stress_test_portfolio, stressed_covariance
from portlab.simulation.monte_carlo import simulate_portfolio

from ..schemas.common import PortfolioRequest
from ..schemas.risk import (
    ContributionRow,
    CrisesResponse,
    CrisisOut,
    DecompositionResponse,
    Estimate,
    ScenarioRequest,
    ScenarioResponse,
    SimulationRequest,
    SimulationResponse,
    StressRequest,
    StressResponse,
    VolTargetRequest,
    VolTargetResponse,
)
from ..services import context, finite, histogram_out, series_out, weights_out

router = APIRouter(prefix="/risk", tags=["risk"])


@router.post("/decomposition")
def decomposition(req: PortfolioRequest) -> DecompositionResponse:
    ctx = context(req.universe)
    w, cov = ctx.weights(req.portfolio), ctx.estimates.cov
    rc = risk_contributions(w, cov)
    div = diversification_breakdown(w, cov)
    mdc = marginal_diversification_contribution(w, cov)
    return DecompositionResponse(
        volatility=portfolio_volatility(w, cov),
        rows=[
            ContributionRow(
                asset=str(a),
                weight=float(r.at["weight"]),
                marginal_risk=float(r.at["marginal_risk"]),
                component_risk=float(r.at["component_risk"]),
                risk_contribution=float(r.at["risk_contribution_pct"]),
            )
            for a, r in rc.iterrows()
        ],
        hhi=div["hhi"],
        effective_assets_hhi=div["effective_assets_hhi"],
        effective_assets_entropy=div["effective_assets_entropy"],
        weighted_average_correlation=div["weighted_average_correlation"],
        diversification_ratio=div["diversification_ratio"],
        diversification_benefit=div["volatility_diversification_benefit"],
        marginal_diversification={str(k): finite(v) for k, v in mdc.items()},
    )


@router.post("/vol-target")
def vol_target(req: VolTargetRequest) -> VolTargetResponse:
    ctx = context(req.universe)
    base, cov, mu = ctx.weights(req.portfolio), ctx.estimates.cov, ctx.estimates.mu
    w = volatility_target_allocation(
        base,
        cov,
        req.target_volatility,
        allow_leverage=req.allow_leverage,
        max_gross_risky_allocation=req.max_gross,
    )
    risky = w.drop("CASH")
    cash = float(w.at["CASH"])
    rf = ctx.universe.risk_free
    return VolTargetResponse(
        weights=weights_out(w),
        risky_volatility=portfolio_volatility(base, cov),
        volatility=portfolio_volatility(risky, cov),
        expected_return=portfolio_return(risky, mu) + cash * rf,
        risky_expected_return=portfolio_return(base, mu),
        cash_rate=rf,
    )


@router.post("/stress")
def stress(req: StressRequest) -> StressResponse:
    ctx = context(req.universe)
    w, cov = ctx.weights(req.portfolio), ctx.estimates.cov

    def vol(rho: float, mult: float) -> float:
        return stress_test_portfolio(w, cov, correlation_stress=rho, volatility_multiplier=mult)[
            "stressed_volatility"
        ]

    grid = [round(float(x), 2) for x in np.linspace(0, 1, 21)]
    return StressResponse(
        base=portfolio_volatility(w, cov),
        correlation_only=vol(req.correlation_stress, 1.0),
        volatility_only=vol(0.0, req.volatility_multiplier),
        combined=vol(req.correlation_stress, req.volatility_multiplier),
        grid=grid,
        curve_base_vol=[
            portfolio_volatility(w, stressed_covariance(cov, correlation_stress=g)) for g in grid
        ],
        curve_stressed_vol=[vol(g, req.volatility_multiplier) for g in grid],
    )


@router.post("/scenario")
def scenario(req: ScenarioRequest) -> ScenarioResponse:
    ctx = context(req.universe)
    result = apply_return_scenario(ctx.weights(req.portfolio), pd.Series(req.shocks, dtype=float))
    return ScenarioResponse(
        portfolio_return=result.portfolio_return,
        contributions=weights_out(result.contributions),
    )


@router.post("/crises")
def crises(req: PortfolioRequest) -> CrisesResponse:
    ctx = context(req.universe)
    w = ctx.weights(req.portfolio)
    # Full histories, independent of the research window: a 5-year sample can still replay 2008.
    returns = load_prices(ctx.universe.tickers).prices.pct_change(fill_method=None)
    out: list[CrisisOut] = []
    for name, (start, end) in HISTORICAL_CRISES.items():
        try:
            replay = replay_historical_period(returns, w, start, end)
        except ValueError as exc:
            out.append(
                CrisisOut(name=name, start=start, end=end, error=str(exc), missing=list(w.index))
            )
            continue
        out.append(
            CrisisOut(
                name=name,
                start=start,
                end=end,
                total_return=replay.stats["total_return"],
                max_drawdown=replay.stats["max_drawdown"],
                worst_day=replay.stats["worst_day"],
                annual_volatility=replay.stats["annual_volatility"],
                recovery_days=finite(replay.stats["recovery_trading_days"]),
                available=replay.available,
                missing=replay.missing,
                missing_weight=replay.missing_weight,
                wealth=series_out(replay.wealth),
                drawdown=series_out(replay.drawdown),
            )
        )
    return CrisesResponse(crises=out)


@router.post("/simulation")
def simulation(req: SimulationRequest) -> SimulationResponse:
    ctx = context(req.universe)
    result = simulate_portfolio(
        ctx.universe.returns,
        ctx.weights(req.portfolio),
        mu=ctx.estimates.mu,
        cov=ctx.estimates.cov,
        model=req.model,
        horizon_days=req.horizon_days,
        n_paths=req.n_paths,
        rebalance_every=req.rebalance_every,
        student_df=req.student_df,
        block_size=req.block_size,
        seed=req.seed,
        sample_paths=30,
    )
    # At most ~260 points per line keeps the payload small for multi-year horizons.
    step = max(1, req.horizon_days // 260)
    idx = np.unique(np.append(np.arange(0, req.horizon_days + 1, step), req.horizon_days))
    return SimulationResponse(
        days=idx.tolist(),
        p05=result.fan[5][idx].tolist(),
        p25=result.fan[25][idx].tolist(),
        p50=result.fan[50][idx].tolist(),
        p75=result.fan[75][idx].tolist(),
        p95=result.fan[95][idx].tolist(),
        sample_paths=result.sample_paths[:, idx].tolist(),
        terminal=histogram_out(result.terminal - 1.0),
        max_drawdown=histogram_out(result.max_drawdown),
        metrics={k: Estimate(value=v.value, stderr=v.stderr) for k, v in result.metrics.items()},
    )
