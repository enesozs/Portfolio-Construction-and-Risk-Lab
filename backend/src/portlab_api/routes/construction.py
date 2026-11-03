"""Portfolio construction: compare allocators, estimators, views and constraints."""

from __future__ import annotations

import numpy as np
import pandas as pd
from fastapi import APIRouter

from portlab._pandas import column
from portlab.data.fundamentals import market_values
from portlab.optimization.black_litterman import black_litterman_posterior, equilibrium_returns
from portlab.optimization.cvar import historical_var_cvar, minimum_cvar
from portlab.optimization.frontier import efficient_frontier
from portlab.optimization.optimizers import maximum_sharpe
from portlab.optimization.registry import ALLOCATORS
from portlab.optimization.risk_budgeting import risk_budget_portfolio
from portlab.optimization.robust import robust_mean_variance
from portlab.optimization.turnover import one_way_turnover, turnover_aware_portfolio
from portlab.portfolio.metrics import (
    performance_summary,
    portfolio_return,
    portfolio_returns_series,
    portfolio_sharpe,
    portfolio_volatility,
)
from portlab.research.estimator_comparison import compare_estimators
from portlab.research.objective_selection import rank_portfolios
from portlab.risk.decomposition import (
    diversification_ratio,
    effective_number_of_assets,
    risk_contributions,
)

from ..schemas.common import UniverseRequest
from ..schemas.construction import (
    BlackLittermanRequest,
    BlackLittermanResponse,
    CompareResponse,
    EstimatorRow,
    EstimatorsRequest,
    EstimatorsResponse,
    FrontierPoint,
    PortfoliosResponse,
    PortfolioSummary,
    Ranking,
    RiskBudgetRequest,
    RiskBudgetResponse,
    RobustRequest,
    TailPortfolio,
    TailRiskRequest,
    TailRiskResponse,
    TurnoverRequest,
)
from ..services import Context, context, finite, weights_out

router = APIRouter(prefix="/construction", tags=["construction"])

OBJECTIVES = {
    "Maximum risk-adjusted return": ("sharpe", "Expected Sharpe"),
    "Minimum volatility": ("volatility", "Expected volatility"),
    "Tail-risk protection": ("drawdown", "Historical max drawdown"),
    "Diversification": ("diversification", "Diversification ratio"),
    "Low concentration": ("concentration", "Effective number of assets"),
}


def _compare(ctx: Context, labels: list[str], weights: list[pd.Series], ref=None):
    mu, cov, rf = ctx.estimates.mu, ctx.estimates.cov, ctx.universe.risk_free
    return CompareResponse(
        labels=labels,
        weights=[weights_out(w) for w in weights],
        expected_return=[portfolio_return(w, mu) for w in weights],
        volatility=[portfolio_volatility(w, cov) for w in weights],
        sharpe=[finite(portfolio_sharpe(w, mu, cov, rf)) for w in weights],
        turnover=[None if ref is None else one_way_turnover(w, ref) for w in weights],
    )


@router.post("/portfolios")
def portfolios(req: UniverseRequest) -> PortfoliosResponse:
    ctx = context(req.universe)
    u, est = ctx.universe, ctx.estimates
    rows: list[PortfolioSummary] = []
    table: dict[str, dict[str, float]] = {}
    for key, w in ctx.portfolios.items():
        daily = portfolio_returns_series(u.returns, w)
        perf = performance_summary(daily, cash_returns=u.cash_returns)
        _, cvar = historical_var_cvar(daily, 0.95)
        summary = PortfolioSummary(
            key=key,
            label=ALLOCATORS[key].label,
            weights=weights_out(w),
            expected_return=portfolio_return(w, est.mu),
            expected_volatility=portfolio_volatility(w, est.cov),
            expected_sharpe=finite(portfolio_sharpe(w, est.mu, est.cov, u.risk_free)),
            historical_return=perf["annual_return"],
            historical_volatility=perf["annual_volatility"],
            historical_sharpe=finite(perf["sharpe"]),
            max_drawdown=perf["max_drawdown"],
            cvar_95=cvar,
            effective_assets=effective_number_of_assets(w),
            diversification_ratio=diversification_ratio(w, est.cov),
            uses_expected_returns=ALLOCATORS[key].uses_expected_returns,
        )
        rows.append(summary)
        table[key] = {
            "Expected Sharpe": summary.expected_sharpe or float("nan"),
            "Expected Volatility": summary.expected_volatility,
            "Max Drawdown": summary.max_drawdown,
            "Diversification Ratio": summary.diversification_ratio,
            "Effective Assets": summary.effective_assets,
        }
    frame = pd.DataFrame(table).T
    rankings = [
        Ranking(
            objective=key,
            label=label,
            metric=metric,
            order=[str(k) for k in rank_portfolios(frame, label).index],
        )
        for label, (key, metric) in OBJECTIVES.items()
    ]
    try:
        cap = req.universe.max_weight
        curve = efficient_frontier(est.mu, est.cov, n_points=40, max_weight=cap)
        frontier = [
            FrontierPoint(expected_return=float(r), volatility=float(v))
            for r, v in zip(curve["return"], curve["volatility"], strict=True)
        ]
    except (ValueError, RuntimeError):
        frontier = []
    return PortfoliosResponse(
        portfolios=rows,
        errors=ctx.errors,
        frontier=frontier,
        risk_free=u.risk_free,
        rankings=rankings,
    )


@router.post("/estimators")
def estimators(req: EstimatorsRequest) -> EstimatorsResponse:
    ctx = context(req.universe)
    table, weights = compare_estimators(
        ctx.universe.returns,
        req.method,
        constraints=ctx.constraints,
        risk_free=ctx.universe.risk_free,
        baseline_weights=ctx.portfolios.get(req.method),
    )
    rows = []
    for record in table.to_dict("records"):
        combo = (str(record["return_method"]), str(record["covariance_method"]))
        rows.append(
            EstimatorRow(
                return_method=combo[0],
                covariance_method=combo[1],
                weights=weights_out(weights[combo]),
                expected_return=float(record["expected_return"]),
                expected_volatility=float(record["expected_volatility"]),
                expected_sharpe=finite(float(record["expected_sharpe"])),
                effective_assets=float(record["effective_assets"]),
                turnover_vs_active=float(record["turnover_vs_active"]),
                active=combo == (req.universe.return_method, req.universe.cov_method),
            )
        )
    frame = pd.DataFrame(weights).T
    spread = (frame.max() - frame.min()).astype(float)
    return EstimatorsResponse(rows=rows, max_weight_spread=weights_out(spread))


@router.post("/black-litterman")
def black_litterman(req: BlackLittermanRequest) -> BlackLittermanResponse:
    ctx = context(req.universe)
    tickers, cov, rf = ctx.universe.tickers, ctx.estimates.cov, ctx.universe.risk_free
    if req.prior == "market":
        values, sources = market_values(tickers)
    else:
        values, sources = pd.Series(1.0, index=tickers), dict.fromkeys(tickers, "equal")
    prior = values.reindex(tickers) / float(values.reindex(tickers).sum())
    # Black–Litterman works in returns *in excess of cash*; views and outputs are shown as
    # total returns, so the cash rate is removed going in and added back coming out.
    views = {
        v.asset: (v.expected_return - rf, v.confidence) for v in req.views if v.asset in tickers
    }
    pi = equilibrium_returns(cov, prior, req.risk_aversion)
    posterior = black_litterman_posterior(cov, prior, views, req.risk_aversion)
    total = posterior + rf
    weights = maximum_sharpe(total, cov, rf, max_weight=req.universe.max_weight)
    return BlackLittermanResponse(
        prior_weights=weights_out(prior),
        prior_sources=sources,
        equilibrium=weights_out(pi + rf),
        posterior=weights_out(total),
        historical=weights_out(ctx.estimates.mu),
        weights=weights_out(weights),
        historical_max_sharpe=weights_out(ctx.weights("max_sharpe")),
    )


@router.post("/tail-risk")
def tail_risk(req: TailRiskRequest) -> TailRiskResponse:
    ctx = context(req.universe)
    returns = ctx.universe.returns
    cap = req.universe.max_weight or 1.0
    candidates = {
        "min_cvar": minimum_cvar(
            returns,
            confidence=req.confidence,
            max_weight=cap,
            minimum_expected_return=req.min_return,
        ),
        "min_variance": ctx.weights("min_variance"),
        "max_sharpe": ctx.weights("max_sharpe"),
    }
    out = []
    for key, w in candidates.items():
        var, cvar = historical_var_cvar(portfolio_returns_series(returns, w), req.confidence)
        out.append(
            TailPortfolio(
                key=key,
                label=ALLOCATORS[key].label,
                weights=weights_out(w),
                var=var,
                cvar=cvar,
                volatility=portfolio_volatility(w, ctx.estimates.cov),
            )
        )
    return TailRiskResponse(confidence=req.confidence, portfolios=out)


@router.post("/robust")
def robust(req: RobustRequest) -> CompareResponse:
    ctx = context(req.universe)
    w = robust_mean_variance(
        ctx.estimates.mu,
        ctx.estimates.cov,
        observations=len(ctx.universe.returns),
        risk_aversion=req.risk_aversion,
        uncertainty_aversion=req.uncertainty_aversion,
        max_weight=req.universe.max_weight or 1.0,
    )
    return _compare(ctx, ["Robust mean-variance", "Maximum Sharpe"], [w, ctx.weights("max_sharpe")])


@router.post("/turnover")
def turnover(req: TurnoverRequest) -> CompareResponse:
    ctx = context(req.universe)
    reference = ctx.weights(req.reference)
    aware = turnover_aware_portfolio(
        ctx.estimates.mu,
        ctx.estimates.cov,
        reference,
        objective="maximum_sharpe" if req.objective == "max_sharpe" else "minimum_variance",
        turnover_penalty=req.penalty,
        max_turnover=req.max_turnover,
        min_weight=req.min_weight,
        max_weight=req.max_weight,
        target_volatility=req.max_volatility,
        risk_free=ctx.universe.risk_free,
    )
    labels = [
        f"Current ({ALLOCATORS[req.reference].label})",
        "Unconstrained target",
        "Turnover-aware",
    ]
    return _compare(ctx, labels, [reference, ctx.weights(req.objective), aware], ref=reference)


@router.post("/risk-budget")
def risk_budget(req: RiskBudgetRequest) -> RiskBudgetResponse:
    ctx = context(req.universe)
    tickers = ctx.universe.tickers
    budgets = pd.Series({t: float(req.budgets.get(t, 0.0)) for t in tickers})
    w = risk_budget_portfolio(ctx.estimates.cov, budgets, max_weight=req.universe.max_weight or 1.0)
    rc = column(risk_contributions(w, ctx.estimates.cov), "risk_contribution_pct")
    return RiskBudgetResponse(
        weights=weights_out(w),
        risk_contribution=weights_out(rc),
        budgets=weights_out(budgets / float(np.sum(budgets.to_numpy(dtype=float)))),
        volatility=portfolio_volatility(w, ctx.estimates.cov),
    )
