from __future__ import annotations

import sys
from collections.abc import Callable
from pathlib import Path
from typing import TypedDict, cast

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from src.allocation.overlays import volatility_target_allocation
from src.data.market_data import download_price_series, download_prices, simple_returns
from src.estimators.covariance import estimate_covariance
from src.estimators.returns import historical_expected_returns
from src.optimization.black_litterman import black_litterman_posterior, equilibrium_returns
from src.optimization.cvar import historical_var_cvar, minimum_cvar
from src.optimization.frontier import efficient_frontier
from src.optimization.hrp import hierarchical_risk_parity
from src.optimization.optimizers import equal_weight, global_minimum_variance, maximum_sharpe, risk_parity
from src.optimization.risk_budgeting import risk_budget_portfolio
from src.optimization.robust import robust_mean_variance
from src.optimization.turnover import one_way_turnover, turnover_aware_portfolio
from src.portfolio.attribution import annualized_asset_contributions, benchmark_statistics
from src.portfolio.metrics import performance_summary, portfolio_return, portfolio_returns_series, portfolio_sharpe, portfolio_volatility
from src.reporting.executive import build_research_report
from src.research.covariance_diagnostics import compare_covariance_estimators, covariance_diagnostics
from src.research.dependency_regimes import rolling_dependency_regimes
from src.research.diversification import diversification_breakdown, marginal_diversification_contribution
from src.research.estimator_comparison import compare_estimators
from src.research.factor_exposure import factor_proxy_returns, regress_factor_exposures
from src.research.objective_selection import rank_portfolios
from src.risk.decomposition import diversification_ratio, effective_number_of_assets, risk_contributions
from src.risk.scenarios import HISTORICAL_CRISES, apply_return_scenario, replay_historical_period
from src.risk.stress import stress_test_portfolio
from src.robustness.bootstrap import bootstrap_weight_stability
from src.simulation.monte_carlo import simulate_portfolio_paths
from src.validation.rebalancing import simulate_rebalancing_policy
from src.validation.walk_forward import WalkForwardResult, walk_forward_portfolio

Optimizer = Callable[..., pd.Series]


class ResearchConfig(TypedDict):
    tickers: list[str]
    start: str
    return_method: str
    cov_method: str
    max_weight: float


@st.cache_data(ttl=3600, show_spinner=False)
def load_returns(tickers: tuple[str, ...], start: str) -> pd.DataFrame:
    return simple_returns(download_prices(list(tickers), start)).dropna(how="any")


@st.cache_data(ttl=3600, show_spinner=False)
def load_single_return(ticker: str, start: str) -> pd.Series:
    price = download_price_series(ticker, start)
    return price.pct_change(fill_method=None).dropna().rename(ticker)


@st.cache_data(ttl=3600, show_spinner=False)
def load_factor_returns(start: str) -> pd.DataFrame:
    symbols = ["SPY", "IWM", "IWD", "IWF", "MTUM", "QUAL", "SPLV"]
    prices = download_prices(symbols, start)
    return simple_returns(prices).dropna(how="any")


def clear_secondary_results() -> None:
    keys = [key for key in st.session_state if key.endswith("_state")]
    for key in keys:
        st.session_state.pop(key, None)


def fmt_pct(value: float) -> str:
    return "—" if not np.isfinite(value) else f"{value:.2%}"


def optimizer_from_name(name: str) -> Optimizer:
    mapping: dict[str, Optimizer] = {
        "Maximum Sharpe": maximum_sharpe,
        "Minimum Variance": global_minimum_variance,
        "Risk Parity": risk_parity,
    }
    return mapping[name]


def build_summary(
    returns: pd.DataFrame,
    mu: pd.Series,
    cov: pd.DataFrame,
    methods: dict[str, pd.Series],
) -> pd.DataFrame:
    rows: list[dict[str, float | str]] = []
    for name, weights in methods.items():
        p_rets = portfolio_returns_series(returns, weights)
        perf = performance_summary(p_rets)
        _, cvar95 = historical_var_cvar(p_rets)
        rows.append(
            {
                "Portfolio": name,
                "Expected Return": portfolio_return(weights, mu),
                "Expected Volatility": portfolio_volatility(weights, cov),
                "Expected Sharpe": portfolio_sharpe(weights, mu, cov),
                "Historical CAGR": perf["annual_return"],
                "Max Drawdown": perf["max_drawdown"],
                "Historical CVaR 95%": cvar95,
                "Effective Assets": effective_number_of_assets(weights),
                "Diversification Ratio": diversification_ratio(weights, cov),
            }
        )
    return pd.DataFrame.from_records(rows).set_index("Portfolio")


st.set_page_config(page_title="Portfolio Construction & Risk Lab", layout="wide")
st.title("Portfolio Construction & Risk Lab")
st.caption("A multi-asset research environment for allocation, risk, robustness, validation, scenarios, and portfolio diagnostics.")

with st.sidebar:
    st.header("Research Universe")
    with st.form("research_form"):
        ticker_text = st.text_input("Assets", "AAPL,MSFT,NVDA,JNJ,XOM,TLT")
        parsed_tickers = [x.strip().upper() for x in ticker_text.split(",") if x.strip()]
        today = pd.Timestamp.today().date()
        try:
            default_start = today.replace(year=today.year - 5)
        except ValueError:
            default_start = today - pd.Timedelta(days=365 * 5)
        start_input = st.date_input("Start date", default_start)
        return_method_input = str(st.selectbox("Expected-return estimator", ["arithmetic", "geometric", "ewma"]))
        cov_method_input = str(st.selectbox("Covariance estimator", ["sample", "ledoit_wolf", "ewma"]))
        min_feasible = max(0.10, 1.0 / max(len(parsed_tickers), 1))
        max_weight_input = float(st.slider("Maximum asset weight", float(round(min_feasible, 2)), 1.0, 1.0, 0.05))
        run_research = st.form_submit_button("Run portfolio research", type="primary", use_container_width=True)

if run_research:
    if len(parsed_tickers) < 2:
        st.sidebar.error("Enter at least two assets.")
    elif max_weight_input * len(parsed_tickers) < 1.0 - 1e-9:
        st.sidebar.error("The maximum weight is infeasible for this universe.")
    else:
        st.session_state["research_config"] = ResearchConfig(
            tickers=parsed_tickers,
            start=str(start_input),
            return_method=return_method_input,
            cov_method=cov_method_input,
            max_weight=max_weight_input,
        )
        clear_secondary_results()

if "research_config" not in st.session_state:
    st.info("Choose an asset universe in the sidebar and run the research analysis.")
    st.stop()

config = cast(ResearchConfig, st.session_state["research_config"])
tickers = config["tickers"]
return_method = config["return_method"]
cov_method = config["cov_method"]
max_weight = config["max_weight"]

with st.sidebar:
    st.divider()
    st.caption(f"Active: {', '.join(tickers)}")
    st.caption(f"{config['start']} · {return_method} returns · {cov_method} covariance")

try:
    with st.spinner("Loading market data and estimating portfolio inputs..."):
        returns = load_returns(tuple(tickers), config["start"])
        mu = historical_expected_returns(returns, method=return_method)
        cov = estimate_covariance(returns, method=cov_method)
except Exception as exc:
    st.error(str(exc))
    st.stop()

portfolio_methods: dict[str, pd.Series] = {
    "Equal Weight": equal_weight(returns.columns),
    "Minimum Variance": global_minimum_variance(cov, max_weight=max_weight),
    "Maximum Sharpe": maximum_sharpe(mu, cov, max_weight=max_weight),
    "Risk Parity": risk_parity(cov, max_weight=max_weight),
    "Hierarchical Risk Parity": hierarchical_risk_parity(returns, covariance=cov),
}
try:
    portfolio_methods["Minimum CVaR"] = minimum_cvar(returns, max_weight=max_weight)
except Exception:
    pass
summary = build_summary(returns, mu, cov, portfolio_methods)

# A concise top strip stays visible while the detailed functions live in labs.
k1, k2, k3, k4 = st.columns(4)
k1.metric("Assets", len(tickers))
k2.metric("Observations", len(returns))
k3.metric("Best expected Sharpe", f"{float(summary['Expected Sharpe'].max()):.2f}")
k4.metric("Lowest expected vol", fmt_pct(float(summary["Expected Volatility"].min())))

tabs = st.tabs([
    "Overview",
    "Construction Lab",
    "Risk Lab",
    "Robustness Lab",
    "Validation Lab",
    "Scenario Lab",
    "Advanced Allocation",
    "Attribution & Simulation",
    "Research Report",
])

# ----------------------------- OVERVIEW ---------------------------------
with tabs[0]:
    st.header("Asset Universe & Dependency Analysis")
    left, right = st.columns(2)
    corr = returns.corr()
    with left:
        fig = px.imshow(corr, text_auto=True, aspect="auto", title="Return Correlation Matrix")
        fig.update_traces(texttemplate="%{z:.2f}")
        st.plotly_chart(fig, use_container_width=True)
    with right:
        asset_stats = pd.DataFrame({
            "Expected Return": mu.astype(float),
            "Volatility": np.sqrt(np.diag(cov.to_numpy(dtype=float))),
        }, index=mu.index)
        st.plotly_chart(px.scatter(asset_stats, x="Volatility", y="Expected Return", text=asset_stats.index, title="Asset Risk / Return Map"), use_container_width=True)

    corr_values = corr.to_numpy(dtype=float)
    upper_mask = np.triu(np.ones(corr_values.shape, dtype=bool), k=1)
    upper_values = corr_values[upper_mask]
    avg_corr = float(np.mean(upper_values))
    max_flat = int(np.argmax(np.where(upper_mask, corr_values, -np.inf)))
    row_idx, col_idx = np.unravel_index(max_flat, corr_values.shape)
    names = [str(x) for x in corr.columns]
    st.info(f"**Interpretation.** Average pairwise correlation is **{avg_corr:.2f}**. The strongest pair is **{names[row_idx]} / {names[col_idx]} ({corr_values[row_idx, col_idx]:.2f})**. Correlation matters because diversification depends on joint movement, not standalone volatility alone.")

    st.subheader("Rolling Dependency & Correlation Regimes")
    regime_window = int(st.selectbox("Rolling window", [21, 63, 126, 252], index=1, format_func=lambda x: f"{x} trading days", key="overview_regime_window"))
    try:
        dependency = rolling_dependency_regimes(returns, window=regime_window)
        dep_fig = px.line(dependency, y="average_correlation", title=f"Rolling Average Pairwise Correlation — {regime_window}d")
        st.plotly_chart(dep_fig, use_container_width=True)
        latest = float(dependency["average_correlation"].iloc[-1])
        regime = str(dependency["correlation_regime"].iloc[-1])
        percentile = float((dependency["average_correlation"] <= latest).mean())
        st.info(f"**Regime interpretation.** Latest average correlation is **{latest:.2f}**, near the **{percentile:.0%} percentile** of the sample and classified as **{regime}**. High-correlation regimes can sharply reduce realized diversification.")
    except ValueError as exc:
        st.warning(str(exc))

    st.subheader("Covariance Stability Diagnostics")
    cov_diag_table = compare_covariance_estimators(returns)
    st.dataframe(cov_diag_table.style.format({"Condition Number": "{:.1f}", "Effective Rank": "{:.2f}", "Minimum Eigenvalue": "{:.6f}", "Distance vs Sample": "{:.1%}"}), use_container_width=True)
    active_diag = covariance_diagnostics(cov)
    condition_number = float(active_diag["condition_number"])
    label = "well-conditioned" if condition_number < 100 else ("moderately ill-conditioned" if condition_number < 1000 else "highly ill-conditioned")
    st.info(f"**Covariance interpretation.** The active matrix has condition number **{condition_number:.1f}** and effective rank **{float(active_diag['effective_rank']):.2f}**. It is **{label}**; higher condition numbers imply greater sensitivity of optimized weights to estimation error.")

# -------------------------- CONSTRUCTION LAB -----------------------------
with tabs[1]:
    st.header("Portfolio Construction & Comparison")
    st.dataframe(summary.style.format("{:.2%}", subset=["Expected Return", "Expected Volatility", "Historical CAGR", "Max Drawdown", "Historical CVaR 95%"]).format("{:.2f}", subset=["Expected Sharpe", "Effective Assets", "Diversification Ratio"]), use_container_width=True)
    st.plotly_chart(px.bar(pd.DataFrame(portfolio_methods).T, barmode="stack", title="Portfolio Allocations"), use_container_width=True)
    best_sharpe = str(summary["Expected Sharpe"].idxmax())
    most_div = str(summary["Diversification Ratio"].idxmax())
    st.info(f"**Interpretation.** **{best_sharpe}** maximizes model-implied risk-adjusted return, while **{most_div}** has the highest diversification ratio. These are different portfolio objectives and need not produce similar allocations.")

    st.subheader("Efficient Frontier")
    try:
        frontier = efficient_frontier(mu, cov, n_points=45, max_weight=max_weight)
        fig_frontier = px.line(frontier, x="volatility", y="return", title="Efficient Mean-Variance Frontier")
        for name, weights in portfolio_methods.items():
            fig_frontier.add_scatter(x=[portfolio_volatility(weights, cov)], y=[portfolio_return(weights, mu)], mode="markers+text", text=[name], textposition="top center", name=name)
        st.plotly_chart(fig_frontier, use_container_width=True)
    except Exception as exc:
        st.warning(f"Efficient frontier could not be generated: {exc}")

    st.subheader("Estimator Comparison Lab")
    with st.form("estimator_compare_form"):
        est_optimizer = str(st.selectbox("Optimizer", ["Maximum Sharpe", "Minimum Variance", "Risk Parity"], key="est_compare_optimizer"))
        run_est = st.form_submit_button("Compare estimator combinations")
    if run_est:
        table, weights = compare_estimators(returns, optimizer_name=est_optimizer, max_weight=max_weight, baseline_weights=portfolio_methods[est_optimizer])
        st.session_state["estimator_compare_state"] = (est_optimizer, table, weights)
    if "estimator_compare_state" in st.session_state:
        est_optimizer, table, weights = st.session_state["estimator_compare_state"]
        st.dataframe(table, use_container_width=True)
        weight_table = pd.DataFrame({f"{a} / {b}": w for (a, b), w in weights.items()}).T
        st.plotly_chart(px.imshow(weight_table, aspect="auto", title=f"Allocation Sensitivity — {est_optimizer}"), use_container_width=True)

    st.subheader("Objective Selection")
    objective = str(st.selectbox("Primary portfolio objective", ["Maximum risk-adjusted return", "Minimum volatility", "Tail-risk protection", "Diversification", "Low concentration"], key="objective_selection"))
    ranking = rank_portfolios(summary, objective)
    st.dataframe(ranking.style.format({"Objective Score": "{:.2f}"}), use_container_width=True)
    st.success(f"**Objective match.** Under **{objective.lower()}**, the highest-ranked portfolio in the current sample is **{ranking.index[0]}**. This is a research ranking, not an investment recommendation.")

# ----------------------------- RISK LAB ---------------------------------
with tabs[2]:
    st.header("Risk Decomposition & Diversification")
    selected_risk = str(st.selectbox("Portfolio to analyze", list(portfolio_methods), key="risk_portfolio"))
    selected_weights = portfolio_methods[selected_risk]
    rc = risk_contributions(selected_weights, cov)
    rc_view = rc[["weight", "risk_contribution_pct"]].rename(columns={"risk_contribution_pct": "risk contribution"})
    st.plotly_chart(px.bar(rc_view, barmode="group", title=f"Capital Weight vs Risk Contribution — {selected_risk}"), use_container_width=True)
    largest_risk = str(rc["risk_contribution_pct"].idxmax())
    st.info(f"**Interpretation.** **{largest_risk}** is the largest volatility contributor in the selected portfolio. Equal capital weights do not imply equal risk contributions because covariance matters.")

    div = diversification_breakdown(selected_weights, cov)
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Effective assets (HHI)", f"{div['effective_assets_hhi']:.2f}")
    c2.metric("Effective assets (entropy)", f"{div['effective_assets_entropy']:.2f}")
    c3.metric("Weighted avg. correlation", f"{div['weighted_average_correlation']:.2f}")
    c4.metric("Diversification ratio", f"{div['diversification_ratio']:.2f}")
    mdc = marginal_diversification_contribution(selected_weights, cov)
    st.plotly_chart(px.bar(mdc, title="Marginal Diversification Contribution"), use_container_width=True)

    st.subheader("Capital Allocation & Volatility Targeting")
    with st.form("vol_target_form"):
        overlay_method = str(st.selectbox("Base risky portfolio", list(portfolio_methods), key="overlay_method"))
        target_vol = float(st.slider("Target annualized volatility (%)", 2, 40, 12, 1, key="target_volatility")) / 100.0
        run_overlay = st.form_submit_button("Apply volatility-targeting overlay")
    if run_overlay:
        overlay = volatility_target_allocation(portfolio_methods[overlay_method], cov, target_volatility=target_vol)
        st.session_state["overlay_state"] = (overlay_method, target_vol, overlay)
    if "overlay_state" in st.session_state:
        method, target_vol, overlay = st.session_state["overlay_state"]
        st.dataframe(overlay.to_frame("weight").style.format("{:.1%}"), use_container_width=True)
        cash = float(overlay.get("CASH", 0.0))
        st.info(f"**Capital-allocation interpretation.** The volatility target scales the risky sleeve and leaves **{cash:.1%}** in cash when full risky exposure would exceed the selected target.")

    st.subheader("Custom Risk Budgeting")
    budget_df = pd.DataFrame({"Asset": tickers, "Risk Budget %": np.repeat(100 / len(tickers), len(tickers))})
    edited_budget = st.data_editor(budget_df, hide_index=True, key="risk_budget_editor", use_container_width=True)
    if st.button("Solve risk-budget portfolio", key="solve_risk_budget"):
        budgets = pd.Series(pd.to_numeric(edited_budget["Risk Budget %"], errors="coerce").fillna(0.0).to_numpy(dtype=float), index=edited_budget["Asset"].astype(str))
        try:
            rbw = risk_budget_portfolio(cov, budgets, max_weight=max_weight)
            st.session_state["risk_budget_state"] = rbw
        except Exception as exc:
            st.error(str(exc))
    if "risk_budget_state" in st.session_state:
        rbw = cast(pd.Series, st.session_state["risk_budget_state"])
        rb_rc = risk_contributions(rbw, cov)
        compare = pd.DataFrame({"Capital Weight": rbw, "Realized Risk Contribution": rb_rc["risk_contribution_pct"]})
        st.plotly_chart(px.bar(compare, barmode="group", title="Risk-Budget Solution"), use_container_width=True)

# -------------------------- ROBUSTNESS LAB -------------------------------
with tabs[3]:
    st.header("Optimizer Robustness Lab")
    with st.form("bootstrap_form"):
        robust_method = str(st.selectbox("Optimizer", ["Maximum Sharpe", "Minimum Variance", "Risk Parity"], key="bootstrap_optimizer"))
        boot_n = int(st.slider("Bootstrap samples", 50, 500, 150, 50))
        bootstrap_method = str(st.radio("Resampling method", ["iid", "block"], horizontal=True, format_func=lambda x: "IID bootstrap" if x == "iid" else "Moving-block bootstrap", key="bootstrap_method"))
        block_size = int(st.selectbox("Block size", [5, 10, 21, 42, 63], index=2, format_func=lambda x: f"{x} trading days", disabled=bootstrap_method != "block", key="bootstrap_block_size"))
        run_boot = st.form_submit_button("Run bootstrap stability analysis")
    if run_boot:
        with st.spinner("Resampling and re-optimizing..."):
            draws, stability = bootstrap_weight_stability(returns, optimizer=optimizer_from_name(robust_method), n_bootstrap=boot_n, return_method=return_method, covariance_method=cov_method, bootstrap_method=bootstrap_method, block_size=block_size, max_weight=max_weight)
        st.session_state["bootstrap_state"] = (robust_method, draws, stability, bootstrap_method, block_size)
    if "bootstrap_state" in st.session_state:
        method, draws, stability, method_boot, block = st.session_state["bootstrap_state"]
        st.dataframe(stability.style.format("{:.1%}"), use_container_width=True)
        st.plotly_chart(px.box(draws, points=False, title=f"Bootstrap Allocation Distributions — {method}"), use_container_width=True)
        width = (stability["p95"] - stability["p05"]).sort_values(ascending=False).to_frame("90% allocation range")
        st.plotly_chart(px.imshow(width.T, aspect="auto", title="Allocation Stability Map"), use_container_width=True)
        unstable = str(stability["std"].idxmax())
        st.warning(f"**Robustness interpretation.** **{unstable}** has the highest bootstrap allocation variability. Wide distributions indicate estimator sensitivity rather than a single stable optimum.")

    st.subheader("Robust Mean-Variance Optimization")
    with st.form("robust_mv_form"):
        ra = float(st.slider("Risk aversion", 0.0, 10.0, 3.0, 0.5))
        ua = float(st.slider("Expected-return uncertainty aversion", 0.0, 10.0, 2.0, 0.5))
        run_robust_mv = st.form_submit_button("Build robust portfolio")
    if run_robust_mv:
        try:
            rw = robust_mean_variance(mu, cov, observations=len(returns), risk_aversion=ra, uncertainty_aversion=ua, max_weight=max_weight)
            st.session_state["robust_mv_state"] = rw
        except Exception as exc:
            st.error(str(exc))
    if "robust_mv_state" in st.session_state:
        rw = cast(pd.Series, st.session_state["robust_mv_state"])
        comparison = pd.DataFrame({"Robust Mean-Variance": rw, "Maximum Sharpe": portfolio_methods["Maximum Sharpe"]})
        st.plotly_chart(px.bar(comparison, barmode="group", title="Robust vs Classical Allocation"), use_container_width=True)

    st.subheader("Constrained & Turnover-Aware Optimization")
    with st.form("turnover_form"):
        objective_name = str(st.selectbox("Objective", ["Maximum Sharpe", "Minimum Variance"], key="turnover_obj"))
        reference_name = str(st.selectbox("Reference/current portfolio", list(portfolio_methods), key="turnover_reference"))
        penalty = float(st.slider("Turnover penalty", 0.0, 2.0, 0.25, 0.05))
        min_w = float(st.slider("Minimum asset weight", 0.0, min(0.20, 1 / len(tickers)), 0.0, 0.01))
        max_w2 = float(st.slider("Maximum asset weight", max(1 / len(tickers), 0.10), 1.0, max_weight, 0.05, key="turnover_max_weight"))
        hard_cap_on = st.checkbox("Use hard turnover cap", value=False)
        hard_cap = float(st.slider("Maximum one-way turnover", 0.0, 1.0, 0.25, 0.05, disabled=not hard_cap_on))
        vol_cap_on = st.checkbox("Use volatility ceiling", value=False)
        vol_cap = float(st.slider("Volatility ceiling (%)", 2, 50, 15, 1, disabled=not vol_cap_on)) / 100.0
        run_turn = st.form_submit_button("Optimize with implementation constraints")
    if run_turn:
        try:
            tw = turnover_aware_portfolio(mu, cov, portfolio_methods[reference_name], objective="maximum_sharpe" if objective_name == "Maximum Sharpe" else "minimum_variance", turnover_penalty=penalty, max_turnover=hard_cap if hard_cap_on else None, min_weight=min_w, max_weight=max_w2, target_volatility=vol_cap if vol_cap_on else None)
            st.session_state["turnover_state"] = (objective_name, reference_name, tw)
        except Exception as exc:
            st.error(str(exc))
    if "turnover_state" in st.session_state:
        obj, ref_name, tw = st.session_state["turnover_state"]
        unconstrained = portfolio_methods[obj]
        compare = pd.DataFrame({"Current": portfolio_methods[ref_name], "Unconstrained target": unconstrained, "Turnover-aware": tw})
        st.plotly_chart(px.bar(compare, barmode="group", title="Implementation-Aware Allocation"), use_container_width=True)
        st.info(f"One-way turnover falls from **{one_way_turnover(unconstrained, portfolio_methods[ref_name]):.1%}** for the unconstrained target to **{one_way_turnover(tw, portfolio_methods[ref_name]):.1%}** for the implementation-aware portfolio.")

# --------------------------- VALIDATION LAB ------------------------------
with tabs[4]:
    st.header("Walk-Forward Validation")
    with st.form("walk_forward_form"):
        wf_method = str(st.selectbox("Portfolio method", ["Maximum Sharpe", "Minimum Variance", "Risk Parity"], key="wf_method"))
        wf_window = str(st.radio("Estimation window", ["rolling", "expanding"], horizontal=True))
        lookback = int(st.selectbox("Lookback", [126, 252, 504, 756], index=1, format_func=lambda x: f"{x} trading days"))
        rebalance = int(st.selectbox("Rebalance frequency", [5, 21, 63, 126], index=1, format_func=lambda x: f"Every {x} trading days"))
        tc_bps = float(st.number_input("Transaction cost (bps per one-way turnover)", 0.0, 100.0, 5.0, 1.0))
        run_wf = st.form_submit_button("Run walk-forward validation")
    if run_wf:
        try:
            with st.spinner("Running out-of-sample portfolio sequence..."):
                result = walk_forward_portfolio(returns, optimizer=optimizer_from_name(wf_method), lookback=lookback, rebalance_every=rebalance, window=wf_window, return_method=return_method, covariance_method=cov_method, transaction_cost_bps=tc_bps, max_weight=max_weight)
            st.session_state["validation_state"] = (wf_method, wf_window, result)
        except Exception as exc:
            st.error(str(exc))
    if "validation_state" in st.session_state:
        wf_method, wf_window, result = cast(tuple[str, str, WalkForwardResult], st.session_state["validation_state"])
        gross = (1 + result["gross_returns"]).cumprod()
        net = (1 + result["returns"]).cumprod()
        wealth = pd.DataFrame({"Gross": gross, "Net after costs": net})
        st.plotly_chart(px.line(wealth, title=f"Walk-Forward Wealth — {wf_method}"), use_container_width=True)
        vol_compare = pd.concat([result["predicted_volatility"], result["realized_volatility"]], axis=1)
        st.plotly_chart(px.line(vol_compare, title="Predicted vs Realized Volatility"), use_container_width=True)
        p = result["performance"]
        gp = result["gross_performance"]
        st.info(f"**Validation interpretation.** Net CAGR is **{p['annual_return']:.2%}** versus **{gp['annual_return']:.2%}** gross. Average one-way turnover is **{result['turnover'].mean():.1%}** per rebalance.")

    st.subheader("Rebalancing Policy Lab")
    with st.form("rebalance_policy_form"):
        reb_port = str(st.selectbox("Target portfolio", list(portfolio_methods), key="rebalance_target"))
        reb_cost = float(st.number_input("Transaction cost (bps)", 0.0, 100.0, 5.0, 1.0, key="reb_cost"))
        calendar_days = int(st.selectbox("Calendar frequency", [5, 21, 63, 126], index=1, format_func=lambda x: f"Every {x} trading days"))
        band = float(st.slider("Single-asset drift threshold (%)", 1, 20, 5, 1)) / 100.0
        distance = float(st.slider("Portfolio distance threshold (%)", 2, 40, 10, 2)) / 100.0
        run_reb = st.form_submit_button("Compare rebalancing policies")
    if run_reb:
        target = portfolio_methods[reb_port]
        results = {
            "Calendar": simulate_rebalancing_policy(returns, target, "calendar", rebalance_every=calendar_days, transaction_cost_bps=reb_cost),
            "Asset threshold": simulate_rebalancing_policy(returns, target, "threshold", threshold=band, transaction_cost_bps=reb_cost),
            "Portfolio distance": simulate_rebalancing_policy(returns, target, "distance", distance_threshold=distance, transaction_cost_bps=reb_cost),
        }
        st.session_state["rebalancing_state"] = results
    if "rebalancing_state" in st.session_state:
        results = st.session_state["rebalancing_state"]
        rows = []
        wealth = {}
        for name, result in results.items():
            perf = result["performance"]
            rows.append({"Policy": name, "CAGR": perf["annual_return"], "Volatility": perf["annual_volatility"], "Sharpe": perf["sharpe"], "Max Drawdown": perf["max_drawdown"], "Rebalances": result["rebalance_count"], "Total Cost": result["total_cost"]})
            wealth[name] = (1 + result["returns"]).cumprod()
        reb_table = pd.DataFrame(rows).set_index("Policy")
        st.dataframe(reb_table.style.format("{:.2%}", subset=["CAGR", "Volatility", "Max Drawdown", "Total Cost"]).format("{:.2f}", subset=["Sharpe"]), use_container_width=True)
        st.plotly_chart(px.line(pd.DataFrame(wealth), title="Rebalancing Policy Wealth"), use_container_width=True)

# ---------------------------- SCENARIO LAB -------------------------------
with tabs[5]:
    st.header("Stress Testing & Scenario Analysis")
    with st.form("stress_form"):
        stress_method = str(st.selectbox("Portfolio to stress", list(portfolio_methods), key="stress_portfolio"))
        corr_stress = float(st.slider("Correlation stress toward +1 (%)", 0, 100, 30, 5)) / 100.0
        vol_mult = float(st.slider("Volatility multiplier", 1.0, 3.0, 1.5, 0.1))
        run_stress = st.form_submit_button("Run statistical stress test")
    if run_stress:
        result = stress_test_portfolio(portfolio_methods[stress_method], cov, correlation_stress=corr_stress, volatility_multiplier=vol_mult)
        st.session_state["stress_state"] = (stress_method, result)
    if "stress_state" in st.session_state:
        stress_method, result = st.session_state["stress_state"]
        stress_table = pd.Series(result, name="Annualized Volatility").to_frame()
        st.dataframe(stress_table.style.format("{:.2%}"), use_container_width=True)
        st.plotly_chart(px.bar(stress_table, title=f"Volatility Stress — {stress_method}"), use_container_width=True)

    st.subheader("Custom Economic Scenario")
    scen_port = str(st.selectbox("Portfolio", list(portfolio_methods), key="custom_scenario_portfolio"))
    scenario_seed = pd.DataFrame({"Asset": tickers, "Shock %": np.zeros(len(tickers))})
    scenario_edit = st.data_editor(scenario_seed, hide_index=True, key="scenario_editor", use_container_width=True)
    if st.button("Apply custom scenario", key="run_custom_scenario"):
        shocks = pd.Series(pd.to_numeric(scenario_edit["Shock %"], errors="coerce").fillna(0.0).to_numpy(dtype=float) / 100.0, index=scenario_edit["Asset"].astype(str))
        res = apply_return_scenario(portfolio_methods[scen_port], shocks)
        st.session_state["custom_scenario_state"] = (scen_port, res)
    if "custom_scenario_state" in st.session_state:
        scen_port, res = st.session_state["custom_scenario_state"]
        st.metric("Scenario portfolio return", f"{res.portfolio_return:.2%}")
        st.plotly_chart(px.bar(res.contributions, title="Scenario Return Contributions"), use_container_width=True)

    st.subheader("Historical Crisis Replay")
    crisis_port = str(st.selectbox("Portfolio to replay", list(portfolio_methods), key="crisis_portfolio"))
    crisis_name = str(st.selectbox("Historical period", list(HISTORICAL_CRISES), key="crisis_name"))
    if st.button("Replay historical crisis", key="run_crisis"):
        crisis_start, crisis_end = HISTORICAL_CRISES[crisis_name]
        try:
            crisis_returns = load_returns(tuple(tickers), "2007-01-01")
            result = replay_historical_period(crisis_returns, portfolio_methods[crisis_port], crisis_start, crisis_end)
            st.session_state["crisis_state"] = (crisis_name, crisis_port, result)
        except Exception as exc:
            st.error(str(exc))
    if "crisis_state" in st.session_state:
        crisis_name, crisis_port, result = st.session_state["crisis_state"]
        cols = st.columns(5)
        cols[0].metric("Period return", fmt_pct(result["total_return"]))
        cols[1].metric("Max drawdown", fmt_pct(result["max_drawdown"]))
        cols[2].metric("Worst day", fmt_pct(result["worst_day"]))
        cols[3].metric("Ann. volatility", fmt_pct(result["annual_volatility"]))
        recovery = result["recovery_trading_days"]
        cols[4].metric("Recovery days", "Not recovered" if not np.isfinite(recovery) else f"{int(recovery)}")
        st.info(f"Historical replay uses the selected assets' actual returns during **{crisis_name}** and applies the current static portfolio weights. It is a diagnostic, not a forecast of the next crisis.")

# ------------------------- ADVANCED ALLOCATION ---------------------------
with tabs[6]:
    st.header("Black–Litterman Allocation Lab")
    equilibrium = equilibrium_returns(cov)
    bl_seed = pd.DataFrame({"Asset": tickers, "Equilibrium Return %": equilibrium.reindex(tickers).to_numpy(dtype=float) * 100, "View Return %": equilibrium.reindex(tickers).to_numpy(dtype=float) * 100, "Confidence %": np.repeat(50.0, len(tickers)), "Use View": np.repeat(False, len(tickers))})
    bl_edit = st.data_editor(bl_seed, hide_index=True, key="bl_editor", use_container_width=True)
    c1, c2 = st.columns(2)
    risk_aversion = c1.slider("Black–Litterman risk aversion", 0.5, 8.0, 2.5, 0.5)
    tau = c2.slider("Prior uncertainty (tau)", 0.01, 0.25, 0.05, 0.01)
    if st.button("Generate Black–Litterman portfolio", key="run_bl"):
        views: dict[str, tuple[float, float]] = {}
        for _, row in bl_edit.iterrows():
            if bool(row["Use View"]):
                views[str(row["Asset"])] = (float(row["View Return %"]) / 100.0, float(row["Confidence %"]) / 100.0)
        posterior = black_litterman_posterior(cov, views=views, risk_aversion=risk_aversion, tau=tau)
        bl_weights = maximum_sharpe(posterior, cov, max_weight=max_weight)
        st.session_state["bl_state"] = (posterior, bl_weights)
    if "bl_state" in st.session_state:
        posterior, bl_weights = st.session_state["bl_state"]
        returns_compare = pd.DataFrame({"Equilibrium": equilibrium, "Posterior": posterior, "Historical estimate": mu})
        st.plotly_chart(px.bar(returns_compare, barmode="group", title="Prior, Posterior, and Historical Expected Returns"), use_container_width=True)
        alloc_compare = pd.DataFrame({"Black–Litterman": bl_weights, "Maximum Sharpe": portfolio_methods["Maximum Sharpe"]})
        st.plotly_chart(px.bar(alloc_compare, barmode="group", title="Black–Litterman vs Historical Maximum Sharpe"), use_container_width=True)

    st.header("Tail-Risk Optimization")
    with st.form("cvar_form"):
        confidence = float(st.select_slider("CVaR confidence", [0.90, 0.95, 0.975, 0.99], value=0.95, format_func=lambda x: f"{x:.1%}"))
        use_floor = st.checkbox("Require minimum expected return", value=False)
        min_ret_floor = float(st.slider("Minimum expected return (%)", -10, 30, 5, 1, disabled=not use_floor)) / 100.0
        run_cvar = st.form_submit_button("Optimize minimum CVaR portfolio")
    if run_cvar:
        try:
            cvar_w = minimum_cvar(returns, confidence=confidence, max_weight=max_weight, minimum_expected_return=min_ret_floor if use_floor else None)
            st.session_state["cvar_state"] = (confidence, cvar_w)
        except Exception as exc:
            st.error(str(exc))
    if "cvar_state" in st.session_state:
        confidence, cvar_w = st.session_state["cvar_state"]
        compare = pd.DataFrame({"Minimum CVaR": cvar_w, "Minimum Variance": portfolio_methods["Minimum Variance"], "Maximum Sharpe": portfolio_methods["Maximum Sharpe"]})
        st.plotly_chart(px.bar(compare, barmode="group", title="Tail-Risk vs Variance-Based Allocation"), use_container_width=True)
        p = portfolio_returns_series(returns, cvar_w)
        var, cvar_val = historical_var_cvar(p, confidence)
        st.info(f"Historical daily VaR at **{confidence:.1%}** is **{var:.2%}** and Expected Shortfall/CVaR is **{cvar_val:.2%}** for the optimized portfolio.")

# ---------------------- ATTRIBUTION & SIMULATION -------------------------
with tabs[7]:
    st.header("Benchmark & Performance Attribution")
    with st.form("benchmark_form"):
        attrib_port = str(st.selectbox("Portfolio", list(portfolio_methods), key="attrib_portfolio"))
        benchmark = st.text_input("Benchmark ticker", "SPY").strip().upper()
        run_attrib = st.form_submit_button("Run benchmark attribution")
    if run_attrib:
        try:
            benchmark_returns = load_single_return(benchmark, config["start"])
            p_rets = portfolio_returns_series(returns, portfolio_methods[attrib_port])
            stats = benchmark_statistics(p_rets, benchmark_returns)
            contributions = annualized_asset_contributions(returns, portfolio_methods[attrib_port])
            st.session_state["attribution_state"] = (attrib_port, benchmark, stats, contributions)
        except Exception as exc:
            st.error(str(exc))
    if "attribution_state" in st.session_state:
        attrib_port, benchmark, stats, contributions = st.session_state["attribution_state"]
        cols = st.columns(4)
        cols[0].metric("Alpha", fmt_pct(stats["alpha"]))
        cols[1].metric("Beta", f"{stats['beta']:.2f}")
        cols[2].metric("Tracking error", fmt_pct(stats["tracking_error"]))
        cols[3].metric("Information ratio", f"{stats['information_ratio']:.2f}")
        st.plotly_chart(px.bar(contributions, title="Annualized Asset Return Contributions"), use_container_width=True)
        st.caption(f"Upside capture: {stats['upside_capture']:.2f} · Downside capture: {stats['downside_capture']:.2f}")

    st.subheader("Factor Proxy Exposure")
    factor_port = str(st.selectbox("Portfolio for factor regression", list(portfolio_methods), key="factor_portfolio"))
    if st.button("Estimate factor-proxy exposures", key="run_factor"):
        try:
            proxies = load_factor_returns(config["start"])
            factors = factor_proxy_returns(proxies)
            p_rets = portfolio_returns_series(returns, portfolio_methods[factor_port])
            exposures, stats = regress_factor_exposures(p_rets, factors)
            st.session_state["factor_state"] = (factor_port, exposures, stats)
        except Exception as exc:
            st.error(str(exc))
    if "factor_state" in st.session_state:
        factor_port, exposures, stats = st.session_state["factor_state"]
        st.plotly_chart(px.bar(exposures, title=f"ETF-Based Factor Proxy Exposures — {factor_port}"), use_container_width=True)
        st.info(f"Regression alpha is **{stats['alpha']:.2%}** annualized with **R² = {stats['r_squared']:.2f}**. These are transparent ETF-based proxies, not official Fama–French factor returns.")

    st.subheader("Monte Carlo Portfolio Simulation")
    with st.form("mc_form"):
        mc_port = str(st.selectbox("Portfolio", list(portfolio_methods), key="mc_portfolio"))
        sims = int(st.select_slider("Simulations", [1000, 3000, 5000, 10000], value=3000))
        horizon = int(st.selectbox("Horizon", [63, 126, 252, 504], index=2, format_func=lambda x: f"{x} trading days"))
        dist = str(st.radio("Distribution", ["normal", "student_t"], horizontal=True, format_func=lambda x: "Normal" if x == "normal" else "Student-t"))
        df = int(st.slider("Student-t degrees of freedom", 3, 20, 5, disabled=dist != "student_t"))
        run_mc = st.form_submit_button("Run Monte Carlo simulation")
    if run_mc:
        paths, metrics = simulate_portfolio_paths(mu, cov, portfolio_methods[mc_port], n_simulations=sims, horizon_days=horizon, distribution=dist, student_df=df)
        st.session_state["mc_state"] = (mc_port, paths, metrics)
    if "mc_state" in st.session_state:
        mc_port, paths, metrics = st.session_state["mc_state"]
        # Plot a manageable subset plus terminal distribution.
        subset = paths.iloc[:, : min(100, paths.shape[1])]
        st.plotly_chart(px.line(subset, title=f"Simulated Wealth Paths — {mc_port}").update_layout(showlegend=False), use_container_width=True)
        terminal = paths.iloc[-1]
        st.plotly_chart(px.histogram(terminal, nbins=60, title="Terminal Wealth Distribution"), use_container_width=True)
        cols = st.columns(5)
        cols[0].metric("Median terminal wealth", f"{metrics['median_terminal_wealth']:.2f}")
        cols[1].metric("5th percentile", f"{metrics['p05_terminal_wealth']:.2f}")
        cols[2].metric("95th percentile", f"{metrics['p95_terminal_wealth']:.2f}")
        cols[3].metric("Probability of loss", fmt_pct(metrics["probability_of_loss"]))
        cols[4].metric("P(drawdown >20%)", fmt_pct(metrics["probability_drawdown_gt_20"]))

# ----------------------------- REPORT ------------------------------------
with tabs[8]:
    st.header("Executive Portfolio Research Report")
    report_port = str(st.selectbox("Portfolio to anchor the report", list(portfolio_methods), key="report_portfolio"))
    report_rc = risk_contributions(portfolio_methods[report_port], cov)
    report_div = diversification_breakdown(portfolio_methods[report_port], cov)

    robustness_note = None
    if "bootstrap_state" in st.session_state:
        method, _, stability, _, _ = st.session_state["bootstrap_state"]
        unstable = str(stability["std"].idxmax())
        robustness_note = f"The latest bootstrap analysis for **{method}** identifies **{unstable}** as the most allocation-sensitive asset, with weight standard deviation of **{float(stability.loc[unstable, 'std']):.1%}** across resamples."

    validation_note = None
    if "validation_state" in st.session_state:
        method, window, result = st.session_state["validation_state"]
        validation_note = f"The latest **{window}** walk-forward validation for **{method}** produced net CAGR of **{result['performance']['annual_return']:.2%}** versus gross CAGR of **{result['gross_performance']['annual_return']:.2%}**, with average one-way turnover of **{float(result['turnover'].mean()):.1%}** per rebalance."

    stress_note = None
    if "stress_state" in st.session_state:
        method, result = st.session_state["stress_state"]
        base = float(result.get("base_volatility", np.nan))
        combined = float(result.get("stressed_volatility", np.nan))
        if np.isfinite(base) and np.isfinite(combined):
            stress_note = f"For **{method}**, the latest combined correlation/volatility stress raises estimated annualized volatility from **{base:.2%}** to **{combined:.2%}**."

    attribution_note = None
    if "attribution_state" in st.session_state:
        method, benchmark, stats, _ = st.session_state["attribution_state"]
        attribution_note = f"Relative to **{benchmark}**, the latest attribution for **{method}** estimates beta of **{stats['beta']:.2f}**, annualized alpha of **{stats['alpha']:.2%}**, and information ratio of **{stats['information_ratio']:.2f}**."

    report = build_research_report(tickers, summary, report_port, report_rc, report_div, robustness_note, validation_note, stress_note, attribution_note)
    st.markdown(report)
    st.download_button("Download report as Markdown", data=report.encode("utf-8"), file_name="portfolio_research_report.md", mime="text/markdown")
    st.caption("The report automatically incorporates completed robustness, validation, stress, and attribution analyses when available in the current session.")
