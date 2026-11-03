"""Research report: one Markdown summary that runs its own supporting analyses.

The Streamlit version only included analyses the user had happened to run in the session.
This one always runs the same set (bootstrap, walk-forward, stress, crises, benchmark) for
the chosen portfolio, so two people with the same universe get the same report.
"""

from __future__ import annotations

import pandas as pd
from fastapi import APIRouter
from pydantic import BaseModel

from portlab._pandas import column
from portlab.data.prices import DataError, load_prices
from portlab.optimization.registry import ALLOCATORS
from portlab.portfolio.attribution import benchmark_statistics
from portlab.portfolio.metrics import (
    portfolio_returns_series,
    portfolio_sharpe,
    portfolio_volatility,
)
from portlab.reporting.executive import build_research_report
from portlab.research.diversification import diversification_breakdown
from portlab.risk.decomposition import diversification_ratio, risk_contributions
from portlab.risk.scenarios import HISTORICAL_CRISES, replay_historical_period
from portlab.risk.stress import stress_test_portfolio
from portlab.robustness.bootstrap import bootstrap_weight_stability
from portlab.validation.walk_forward import walk_forward_portfolio

from ..schemas.common import PortfolioRequest
from ..services import context

router = APIRouter(tags=["report"])


class ReportResponse(BaseModel):
    markdown: str


@router.post("/report")
def report(req: PortfolioRequest) -> ReportResponse:
    ctx = context(req.universe)
    u, est, key = ctx.universe, ctx.estimates, req.portfolio
    w = ctx.weights(key)
    label = ALLOCATORS[key].label

    summary = pd.DataFrame(
        {
            ALLOCATORS[k].label: {
                "Expected Sharpe": portfolio_sharpe(p, est.mu, est.cov, u.risk_free),
                "Expected Volatility": portfolio_volatility(p, est.cov),
                "Diversification Ratio": diversification_ratio(p, est.cov),
            }
            for k, p in ctx.portfolios.items()
        }
    ).T

    _, stability = bootstrap_weight_stability(
        u.returns,
        key,
        constraints=ctx.constraints,
        n_bootstrap=100,
        bootstrap_method="block",
        return_method=req.universe.return_method,
        covariance_method=req.universe.cov_method,
        risk_free=u.risk_free,
    )
    unstable = str(stability["std"].idxmax())
    robustness = (
        f"Re-optimising on 100 block-bootstrap resamples, **{unstable}** is the most "
        f"sample-sensitive weight (standard deviation {float(stability.at[unstable, 'std']):.1%}); "
        "treat its optimised weight as an estimate, not a precise answer."
    )

    validation = None
    if len(u.returns) > 252 + 21:
        wf = walk_forward_portfolio(
            u.returns,
            key,
            constraints=ctx.constraints,
            cost_bps=5,
            cash_returns=u.cash_returns,
            return_method=req.universe.return_method,
            covariance_method=req.universe.cov_method,
        ).backtest
        net, gross = wf.performance, wf.gross_performance
        validation = (
            f"Re-estimated monthly on a rolling year of data, {label} returned "
            f"**{net['annual_return']:.2%}** a year after 5 bp costs ({gross['annual_return']:.2%} "
            f"before), with a Sharpe ratio of {net['sharpe']:.2f} against cash."
        )

    s = stress_test_portfolio(w, est.cov, correlation_stress=0.3, volatility_multiplier=1.5)
    stress = (
        "Moving correlations 30% of the way to +1 and scaling volatilities by 1.5× raises "
        f"estimated volatility from **{s['base_volatility']:.2%}** to "
        f"**{s['stressed_volatility']:.2%}**."
    )
    history = load_prices(u.tickers).prices.pct_change(fill_method=None)
    worst: tuple[str, float] | None = None
    for name, (start, end) in HISTORICAL_CRISES.items():
        try:
            dd = replay_historical_period(history, w, start, end).stats["max_drawdown"]
        except ValueError:
            continue
        if worst is None or dd < worst[1]:
            worst = (name, dd)
    if worst:
        stress += f" The deepest historical drawdown replayed was **{worst[1]:.1%}** ({worst[0]})."

    attribution = None
    try:
        spy = column(load_prices(["SPY"]).prices, "SPY").pct_change(fill_method=None)
        stats = benchmark_statistics(
            portfolio_returns_series(u.returns, w), spy, cash_returns=u.cash_returns
        )
        attribution = (
            f"Against SPY the portfolio has beta **{stats['beta']:.2f}**, annualised alpha "
            f"**{stats['alpha']:.2%}** and information ratio {stats['information_ratio']:.2f}."
        )
    except (DataError, ValueError):
        pass

    markdown = build_research_report(
        u.tickers,
        summary,
        label,
        risk_contributions(w, est.cov),
        diversification_breakdown(w, est.cov),
        robustness,
        validation,
        stress,
        attribution,
    )
    return ReportResponse(markdown=markdown)
