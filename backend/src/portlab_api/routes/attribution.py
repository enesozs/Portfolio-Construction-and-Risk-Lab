"""Attribution: performance against a benchmark, and exposure to style factors."""

from __future__ import annotations

import pandas as pd
from fastapi import APIRouter

from portlab._pandas import column
from portlab.data.factors import FACTORS, LABELS, load_factors
from portlab.data.prices import load_prices, normalise_ticker
from portlab.portfolio.attribution import annualized_asset_contributions, benchmark_statistics
from portlab.portfolio.metrics import portfolio_returns_series
from portlab.research.factor_model import fit_factor_model, rolling_betas

from ..schemas.attribution import (
    AssetExposure,
    BenchmarkRequest,
    BenchmarkResponse,
    FactorOut,
    FactorResponse,
)
from ..schemas.common import PortfolioRequest
from ..services import context, finite, series_out, weights_out

router = APIRouter(prefix="/attribution", tags=["attribution"])


@router.post("/benchmark")
def benchmark(req: BenchmarkRequest) -> BenchmarkResponse:
    ctx = context(req.universe)
    u = ctx.universe
    symbol = normalise_ticker(req.benchmark)
    bench = column(load_prices([symbol]).prices, symbol).pct_change(fill_method=None)
    bench = bench.reindex(u.returns.index).dropna()
    w = ctx.weights(req.portfolio)
    port = portfolio_returns_series(u.returns, w).reindex(bench.index)
    stats = benchmark_statistics(port, bench, cash_returns=u.cash_returns)
    return BenchmarkResponse(
        benchmark=symbol,
        alpha=finite(stats["alpha"]),
        beta=finite(stats["beta"]),
        active_return=stats["active_return"],
        tracking_error=stats["tracking_error"],
        information_ratio=finite(stats["information_ratio"]),
        upside_capture=finite(stats["upside_capture"]),
        downside_capture=finite(stats["downside_capture"]),
        contributions=weights_out(annualized_asset_contributions(u.returns, w)),
        portfolio=series_out((1 + port).cumprod()),
        benchmark_wealth=series_out((1 + bench).cumprod()),
    )


@router.post("/factors")
def factors(req: PortfolioRequest) -> FactorResponse:
    ctx = context(req.universe)
    u = ctx.universe
    data = load_factors()
    keys = FACTORS
    port = portfolio_returns_series(u.returns, ctx.weights(req.portfolio))
    fit = fit_factor_model(port, data.returns, keys)
    t, p = fit.t_stat(), fit.p_values()
    rolling = rolling_betas(port, data.returns, keys)
    overlap = port.index.intersection(data.returns.index)
    assets = []
    for ticker in u.tickers:
        asset_fit = fit_factor_model(column(u.returns, ticker), data.returns, keys)
        assets.append(
            AssetExposure(
                ticker=ticker,
                betas={k: float(b) for k, b in zip(keys, asset_fit.beta, strict=True)},
                alpha=asset_fit.alpha,
                r_squared=asset_fit.r_squared,
            )
        )
    return FactorResponse(
        factors=[
            FactorOut(
                key=k,
                label=LABELS[k],
                beta=float(fit.beta[i]),
                stderr=float(fit.beta_se[i]),
                t_stat=float(t[i]),
                p_value=float(p[i]),
                risk_share=fit.risk_share[k],
            )
            for i, k in enumerate(keys)
        ],
        alpha=fit.alpha,
        alpha_t=finite(fit.alpha_t),
        r_squared=fit.r_squared,
        observations=fit.observations,
        lags=fit.lags,
        idiosyncratic_share=fit.idiosyncratic_share,
        start=pd.Timestamp(overlap[0]).strftime("%Y-%m-%d"),
        end=pd.Timestamp(overlap[-1]).strftime("%Y-%m-%d"),
        stale=data.stale,
        rolling={k: series_out(column(rolling, k)) for k in keys},
        assets=assets,
    )
