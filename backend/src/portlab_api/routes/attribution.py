"""Attribution: performance against a benchmark, and exposure to style factors."""

from __future__ import annotations

from fastapi import APIRouter

from portlab._pandas import column
from portlab.data.prices import load_prices, normalise_ticker
from portlab.portfolio.attribution import annualized_asset_contributions, benchmark_statistics
from portlab.portfolio.metrics import portfolio_returns_series
from portlab.research.factor_exposure import factor_proxy_returns, regress_factor_exposures

from ..schemas.attribution import BenchmarkRequest, BenchmarkResponse, FactorResponse
from ..schemas.common import PortfolioRequest
from ..services import context, finite, series_out, weights_out

router = APIRouter(prefix="/attribution", tags=["attribution"])

PROXIES = {
    "Market": "SPY",
    "Size": "IWM − SPY",
    "Value": "IWD − IWF",
    "Momentum": "MTUM − SPY",
    "Quality": "QUAL − SPY",
    "Low Volatility": "SPLV − SPY",
}


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
    proxies = load_prices(["SPY", "IWM", "IWD", "IWF", "MTUM", "QUAL", "SPLV"]).prices
    factor_returns = factor_proxy_returns(proxies.pct_change(fill_method=None))
    port = portfolio_returns_series(u.returns, ctx.weights(req.portfolio))
    exposures, stats = regress_factor_exposures(port, factor_returns)
    overlap = port.index.intersection(factor_returns.dropna().index)
    return FactorResponse(
        exposures=weights_out(exposures),
        alpha=stats["alpha"],
        r_squared=stats["r_squared"],
        observations=len(overlap),
        proxies=PROXIES,
    )
