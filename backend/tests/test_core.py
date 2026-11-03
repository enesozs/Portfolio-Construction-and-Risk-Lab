import numpy as np
import pandas as pd
import pytest

from portlab._pandas import column
from portlab.estimators.covariance import sample_covariance
from portlab.estimators.returns import annualized_mean_return
from portlab.optimization import convex
from portlab.optimization.convex import Constraints, efficient_frontier
from portlab.optimization.hrp import hierarchical_risk_parity
from portlab.portfolio.metrics import portfolio_return, portfolio_volatility
from portlab.risk.decomposition import risk_contributions
from portlab.validation.walk_forward import walk_forward_portfolio


def sample_returns() -> pd.DataFrame:
    rng = np.random.default_rng(7)
    x = rng.normal(
        [0.0005, 0.0003, 0.0004],
        [0.01, 0.006, 0.008],
        size=(600, 3),
    )
    return pd.DataFrame(x, columns=["A", "B", "C"])


LONG_ONLY = Constraints()


def equal_weight(assets) -> pd.Series:
    assets = list(assets)
    return pd.Series(1 / len(assets), index=assets)


def test_equal_weight_sums_to_one() -> None:
    w = equal_weight(["A", "B", "C"])
    assert np.isclose(float(w.sum()), 1.0)


def test_gmv_is_feasible() -> None:
    cov = sample_covariance(sample_returns())
    w = convex.min_variance(cov, LONG_ONLY)
    assert np.isclose(float(w.sum()), 1.0, atol=1e-6)
    assert bool((w >= -1e-8).all())


def test_max_sharpe_is_feasible() -> None:
    r = sample_returns()
    mu, cov = annualized_mean_return(r), sample_covariance(r)
    w = convex.max_sharpe(mu, cov, 0.0, LONG_ONLY)
    assert np.isclose(float(w.sum()), 1.0, atol=1e-6)


def test_risk_parity_contributions_close() -> None:
    cov = sample_covariance(sample_returns())
    w = convex.risk_parity(cov, LONG_ONLY)
    rc = column(risk_contributions(w, cov), "risk_contribution_pct")
    assert float(rc.max()) - float(rc.min()) < 1e-4


def test_metrics_are_finite() -> None:
    r = sample_returns()
    mu, cov = annualized_mean_return(r), sample_covariance(r)
    w = equal_weight(r.columns)
    assert np.isfinite(portfolio_return(w, mu))
    assert portfolio_volatility(w, cov) > 0


def test_efficient_frontier_has_points() -> None:
    r = sample_returns()
    mu, cov = annualized_mean_return(r), sample_covariance(r)
    frontier = efficient_frontier(mu, cov, LONG_ONLY, n_points=12)
    assert len(frontier) >= 3
    assert {"return", "volatility"}.issubset(frontier.columns)


def test_walk_forward_produces_oos_returns() -> None:
    r = sample_returns()
    result = walk_forward_portfolio(r, "min_variance", lookback=252, rebalance_every=21)
    assert len(result.backtest.returns) == len(r) - 252
    row_sums = result.targets.sum(axis="columns").to_numpy(dtype=float)
    assert np.isclose(row_sums, 1.0, atol=1e-5).all()


def test_hrp_is_long_only_and_fully_invested() -> None:
    r = sample_returns()
    w = hierarchical_risk_parity(r)
    assert np.isclose(float(w.sum()), 1.0, atol=1e-6)
    assert bool((w >= 0).all())


def test_efficient_frontier_starts_at_gmv_and_is_monotonic():
    mu = pd.Series([0.08, 0.12, 0.18], index=["A", "B", "C"])
    cov = pd.DataFrame(
        [
            [0.04, 0.01, 0.005],
            [0.01, 0.06, 0.015],
            [0.005, 0.015, 0.12],
        ],
        index=mu.index,
        columns=mu.index,
    )
    frontier = efficient_frontier(mu, cov, LONG_ONLY, n_points=20)
    assert len(frontier) >= 10
    assert column(frontier, "return").is_monotonic_increasing
    # On the efficient branch, risk should not fall as target return increases.
    diffs = column(frontier, "volatility").diff().dropna()
    assert bool((diffs >= -1e-6).all())


def test_volatility_target_overlay_adds_cash_without_leverage() -> None:
    from portlab.allocation.overlays import volatility_target_allocation

    r = sample_returns()
    cov = sample_covariance(r)
    w = equal_weight(r.columns)
    current_vol = portfolio_volatility(w, cov)
    target = current_vol / 2.0
    overlaid = volatility_target_allocation(w, cov, target)
    assert np.isclose(float(overlaid.sum()), 1.0, atol=1e-8)
    assert np.isclose(float(overlaid.at["CASH"]), 0.5, atol=1e-3)


def test_stress_increases_volatility() -> None:
    from portlab.risk.stress import stress_test_portfolio

    r = sample_returns()
    cov = sample_covariance(r)
    w = equal_weight(r.columns)
    result = stress_test_portfolio(
        w,
        cov,
        correlation_stress=0.4,
        volatility_multiplier=1.25,
    )
    assert result["stressed_volatility"] > result["base_volatility"]


def test_walk_forward_transaction_costs_reduce_returns() -> None:
    r = sample_returns()
    result = walk_forward_portfolio(
        r, "max_sharpe", lookback=252, rebalance_every=21, cost_bps=25.0
    )
    bt = result.backtest
    assert float(column(bt.rebalances, "cost").sum()) > 0.0
    assert float(bt.returns.sum()) < float(bt.gross_returns.sum())


def test_estimator_comparison_returns_twelve_combinations() -> None:
    from portlab.research.estimator_comparison import compare_estimators

    r = sample_returns()
    baseline = convex.max_sharpe(annualized_mean_return(r), sample_covariance(r), 0.0, LONG_ONLY)
    table, weights = compare_estimators(r, "max_sharpe", baseline_weights=baseline)
    assert len(table) == 12
    assert len(weights) == 12
    assert bool(np.isfinite(table["expected_volatility"].to_numpy(dtype=float)).all())


def test_rolling_dependency_regimes_produces_classifications() -> None:
    from portlab.research.dependency_regimes import rolling_dependency_regimes

    r = sample_returns()
    result = rolling_dependency_regimes(r, window=63)
    assert len(result) == len(r) - 63 + 1
    assert {
        "average_correlation",
        "equal_weight_volatility",
        "correlation_regime",
    }.issubset(result.columns)
    assert set(result["correlation_regime"].unique()).issubset(
        {"Low correlation", "Normal correlation", "High correlation"}
    )


def test_covariance_diagnostics_are_finite() -> None:
    from portlab.research.covariance_diagnostics import (
        compare_covariance_estimators,
        covariance_diagnostics,
    )

    r = sample_returns()
    cov = sample_covariance(r)
    diag = covariance_diagnostics(cov)
    assert np.isfinite(diag["condition_number"])
    assert diag["effective_rank"] > 0
    table = compare_covariance_estimators(r)
    assert len(table) == 4
    assert bool(np.isfinite(table["Condition Number"].to_numpy(dtype=float)).all())


def test_block_bootstrap_weight_stability() -> None:
    from portlab.robustness.bootstrap import bootstrap_weight_stability

    r = sample_returns()
    draws, summary = bootstrap_weight_stability(
        r, "min_variance", n_bootstrap=20, bootstrap_method="block", block_size=21
    )
    assert draws.shape == (20, 3)
    assert bool(np.isclose(draws.sum(axis="columns").to_numpy(dtype=float), 1.0, atol=1e-5).all())
    assert {"mean", "std", "p05", "p95"}.issubset(summary.columns)


def test_turnover_aware_respects_the_cap_and_trades_less_as_cost_rises() -> None:
    r = sample_returns()
    mu, cov = annualized_mean_return(r), sample_covariance(r)
    reference = equal_weight(r.columns)
    capped = convex.turnover_aware(mu, cov, reference, LONG_ONLY, max_turnover=0.10)
    assert np.isclose(float(capped.sum()), 1.0, atol=1e-6)
    assert convex.one_way_turnover(capped, reference) <= 0.10 + 1e-6
    free = convex.turnover_aware(mu, cov, reference, LONG_ONLY, cost=0.0)
    costly = convex.turnover_aware(mu, cov, reference, LONG_ONLY, cost=0.05)
    assert convex.one_way_turnover(costly, reference) < convex.one_way_turnover(free, reference)


def test_black_litterman_posterior_moves_toward_view():
    from portlab.optimization.black_litterman import black_litterman_posterior, equilibrium_returns

    cov = pd.DataFrame([[0.04, 0.01], [0.01, 0.09]], index=["A", "B"], columns=["A", "B"])
    prior = equilibrium_returns(cov)
    posterior = black_litterman_posterior(cov, views={"A": (0.20, 0.8)})
    assert posterior.index.tolist() == ["A", "B"]
    assert float(posterior.at["A"]) > float(prior.at["A"])


def test_minimum_cvar_weights_sum_to_one():
    rng = np.random.default_rng(10)
    returns = pd.DataFrame(rng.normal(0.0004, 0.01, size=(200, 3)), columns=list("ABC"))
    w = convex.min_cvar(returns, sample_covariance(returns), 0.95, LONG_ONLY)
    assert np.isclose(float(w.sum()), 1.0, atol=1e-6)
    assert (w >= -1e-9).all()


def test_risk_budget_portfolio_matches_the_budget():
    cov = pd.DataFrame(np.diag([0.04, 0.09, 0.16]), index=list("ABC"), columns=list("ABC"))
    budgets = pd.Series([0.5, 0.3, 0.2], index=list("ABC"))
    w = convex.risk_parity(cov, LONG_ONLY, budgets)
    rc = risk_contributions(w, cov)["risk_contribution_pct"]
    assert np.isclose(float(w.sum()), 1.0, atol=1e-6)
    assert np.max(np.abs(rc.to_numpy() - budgets.to_numpy())) < 1e-5


def test_custom_scenario_is_weighted_sum():
    from portlab.risk.scenarios import apply_return_scenario

    w = pd.Series([0.6, 0.4], index=["A", "B"])
    shocks = pd.Series([-0.10, 0.05], index=["A", "B"])
    result = apply_return_scenario(w, shocks)
    assert np.isclose(result.portfolio_return, -0.04)


def test_rebalancing_policy_returns_valid_series():
    from portlab.validation.rebalancing import simulate_rebalancing_policy

    rng = np.random.default_rng(2)
    returns = pd.DataFrame(rng.normal(0.0003, 0.01, size=(100, 2)), columns=["A", "B"])
    target = pd.Series([0.5, 0.5], index=["A", "B"])
    result = simulate_rebalancing_policy(
        returns, target, policy="calendar", rebalance_every=21, cost_bps=5
    )
    assert len(result.returns) == len(returns)
    assert len(result.rebalances) == 4


def test_benchmark_statistics_beta_near_one_for_same_series():
    from portlab.portfolio.attribution import benchmark_statistics

    rng = np.random.default_rng(4)
    r = pd.Series(rng.normal(0.0004, 0.01, size=200))
    stats = benchmark_statistics(r, r)
    assert np.isclose(stats["beta"], 1.0, atol=1e-8)
    assert abs(stats["alpha"]) < 1e-8


def test_monte_carlo_shapes_and_metrics():
    from portlab.simulation.monte_carlo import simulate_portfolio

    mu = pd.Series([0.08, 0.05], index=["A", "B"])
    cov = pd.DataFrame([[0.04, 0.01], [0.01, 0.03]], index=["A", "B"], columns=["A", "B"])
    w = pd.Series([0.5, 0.5], index=["A", "B"])
    history = pd.DataFrame(np.zeros((100, 2)), columns=["A", "B"])
    result = simulate_portfolio(history, w, mu=mu, cov=cov, n_paths=200, horizon_days=20)
    assert result.sample_paths.shape[1] == 21
    assert 0 <= result.metrics["probability_of_loss"].value <= 1


def test_robust_penalty_moves_weight_away_from_uncertain_means():
    mu = pd.Series([0.10, 0.10, 0.10], index=list("ABC"))
    cov = pd.DataFrame(np.diag([0.09, 0.04, 0.01]), index=list("ABC"), columns=list("ABC"))
    plain = convex.robust_mean_variance(mu, cov, 252, 1.0, 0.0, LONG_ONLY)
    robust = convex.robust_mean_variance(mu, cov, 252, 1.0, 2.0, LONG_ONLY)
    assert np.isclose(float(robust.sum()), 1.0, atol=1e-6)
    # A has the noisiest mean (highest volatility): the penalty cuts it.
    assert float(robust.at["A"]) < float(plain.at["A"])


def test_diversification_breakdown_is_finite():
    from portlab.research.diversification import diversification_breakdown

    cov = pd.DataFrame([[0.04, 0.005], [0.005, 0.09]], index=["A", "B"], columns=["A", "B"])
    w = pd.Series([0.5, 0.5], index=["A", "B"])
    result = diversification_breakdown(w, cov)
    assert np.isclose(result["effective_assets_hhi"], 2.0)
    assert np.isfinite(result["diversification_ratio"])


def test_annual_mean_standard_error_matches_simulation():
    from portlab.optimization.convex import annual_mean_standard_error

    rng = np.random.default_rng(9)
    daily_vol, days = 0.01, 500
    annual_means = rng.normal(0.0, daily_vol, size=(4000, days)).mean(axis=1) * 252
    predicted = annual_mean_standard_error(np.array([daily_vol**2 * 252]), days)[0]
    assert np.std(annual_means) == pytest.approx(predicted, rel=0.05)


def test_jensen_alpha_is_measured_over_cash():
    from portlab.portfolio.attribution import benchmark_statistics

    rng = np.random.default_rng(12)
    bench = pd.Series(rng.normal(0.0004, 0.01, size=500))
    cash = pd.Series(0.0002, index=bench.index)
    # Half the benchmark, half cash: zero alpha once cash is accounted for.
    port = 0.5 * bench + 0.5 * cash
    stats = benchmark_statistics(port, bench, cash_returns=cash)
    assert stats["beta"] == pytest.approx(0.5)
    assert stats["alpha"] == pytest.approx(0.0, abs=1e-12)
    # Ignoring cash would misread the cash leg as alpha.
    assert benchmark_statistics(port, bench)["alpha"] == pytest.approx(0.5 * 0.0002 * 252)
