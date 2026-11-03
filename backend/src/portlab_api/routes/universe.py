"""Universe overview: what the selected assets look like and how they move together."""

from __future__ import annotations

import numpy as np
from fastapi import APIRouter

from portlab._pandas import column
from portlab.portfolio.metrics import performance_summary
from portlab.research.covariance_diagnostics import compare_covariance_estimators
from portlab.research.dependency_regimes import rolling_dependency_regimes

from ..schemas.common import UniverseRequest
from ..schemas.universe import (
    AssetStats,
    DependencyRequest,
    DependencyResponse,
    Diagnostics,
    OverviewResponse,
    Pair,
    UniverseMeta,
)
from ..services import context, finite, series_out

router = APIRouter(prefix="/universe", tags=["universe"])


@router.post("/overview")
def overview(req: UniverseRequest) -> OverviewResponse:
    ctx = context(req.universe)
    u, est = ctx.universe, ctx.estimates
    vols = np.sqrt(np.diag(est.cov.to_numpy(dtype=float)))
    assets = []
    for i, t in enumerate(u.tickers):
        perf = performance_summary(column(u.returns, t), cash_returns=u.cash_returns)
        mu = float(est.mu.at[t])
        assets.append(
            AssetStats(
                ticker=t,
                expected_return=mu,
                volatility=float(vols[i]),
                sharpe=finite((mu - u.risk_free) / vols[i]) if vols[i] > 0 else None,
                realised_return=perf["annual_return"],
                max_drawdown=perf["max_drawdown"],
            )
        )

    corr = u.returns.corr().to_numpy(dtype=float)
    upper = np.triu_indices(len(u.tickers), k=1)
    pairs = corr[upper]
    hi, lo = int(np.argmax(pairs)), int(np.argmin(pairs))

    def pair(k: int) -> Pair:
        return Pair(a=u.tickers[upper[0][k]], b=u.tickers[upper[1][k]], value=float(pairs[k]))

    table = compare_covariance_estimators(u.returns)
    growth = (1 + u.returns).cumprod().resample("W-FRI").last()
    return OverviewResponse(
        meta=UniverseMeta(
            tickers=u.tickers,
            start=u.start.isoformat(),
            end=u.end.isoformat(),
            observations=len(u.returns),
            requested_start=u.requested_start.isoformat(),
            inception={t: d.isoformat() for t, d in u.inception.items()},
            limiting=u.limiting,
            stale=u.stale,
            risk_free=u.risk_free,
            risk_free_source=u.risk_free_source,
            groups=ctx.groups,
        ),
        assets=assets,
        correlation=corr.tolist(),
        average_correlation=float(pairs.mean()),
        strongest_pair=pair(hi),
        weakest_pair=pair(lo),
        diagnostics=[
            Diagnostics(
                estimator=str(name),
                condition_number=float(row.at["Condition Number"]),
                effective_rank=float(row.at["Effective Rank"]),
                min_eigenvalue=float(row.at["Minimum Eigenvalue"]),
                distance_vs_sample=float(row.at["Distance vs Sample"]),
            )
            for name, row in table.iterrows()
        ],
        active_estimator=req.universe.cov_method,
        growth={t: series_out(column(growth, t)) for t in u.tickers},
    )


@router.post("/dependency")
def dependency(req: DependencyRequest) -> DependencyResponse:
    ctx = context(req.universe)
    frame = rolling_dependency_regimes(ctx.universe.returns, window=req.window)
    avg = column(frame, "average_correlation")
    latest = float(avg.iloc[-1])
    return DependencyResponse(
        average_correlation=series_out(avg),
        equal_weight_volatility=series_out(column(frame, "equal_weight_volatility")),
        regimes=[str(r) for r in column(frame, "correlation_regime")],
        low_threshold=float(avg.quantile(1 / 3)),
        high_threshold=float(avg.quantile(2 / 3)),
        latest=latest,
        latest_percentile=float((avg <= latest).mean()),
        latest_regime=str(frame["correlation_regime"].iloc[-1]),
    )
