import numpy as np
import pandas as pd

from portlab._pandas import column
from portlab.estimators.covariance import sample_covariance
from portlab.estimators.returns import annualized_mean_return
from portlab.optimization.frontier import efficient_frontier
from portlab.optimization.hrp import hierarchical_risk_parity
from portlab.optimization.optimizers import (
    equal_weight,
    global_minimum_variance,
    maximum_sharpe,
    risk_parity,
)
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


def test_equal_weight_sums_to_one() -> None:
    w = equal_weight(["A", "B", "C"])
    assert np.isclose(float(w.sum()), 1.0)


def test_gmv_is_feasible() -> None:
    cov = sample_covariance(sample_returns())
    w = global_minimum_variance(cov)
    assert np.isclose(float(w.sum()), 1.0, atol=1e-6)
    assert bool((w >= -1e-8).all())


def test_max_sharpe_is_feasible() -> None:
    r = sample_returns()
    mu, cov = annualized_mean_return(r), sample_covariance(r)
    w = maximum_sharpe(mu, cov)
    assert np.isclose(float(w.sum()), 1.0, atol=1e-6)


def test_risk_parity_contributions_close() -> None:
    cov = sample_covariance(sample_returns())
    w = risk_parity(cov)
    rc = column(risk_contributions(w, cov), "risk_contribution_pct")
    assert float(rc.max()) - float(rc.min()) < 0.03


def test_metrics_are_finite() -> None:
    r = sample_returns()
    mu, cov = annualized_mean_return(r), sample_covariance(r)
    w = equal_weight(r.columns)
    assert np.isfinite(portfolio_return(w, mu))
    assert portfolio_volatility(w, cov) > 0


def test_efficient_frontier_has_points() -> None:
    r = sample_returns()
    mu, cov = annualized_mean_return(r), sample_covariance(r)
    frontier = efficient_frontier(mu, cov, n_points=12)
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
    from portlab.optimization.frontier import efficient_frontier

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
    frontier = efficient_frontier(mu, cov, n_points=20)
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


def test_estimator_comparison_returns_nine_combinations() -> None:
    from portlab.research.estimator_comparison import compare_estimators

    r = sample_returns()
    mu = annualized_mean_return(r)
    cov = sample_covariance(r)
    baseline = maximum_sharpe(mu, cov)
    table, weights = compare_estimators(r, "max_sharpe", baseline_weights=baseline)
    assert len(table) == 9
    assert len(weights) == 9
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
    assert len(table) == 3
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


def test_turnover_aware_optimizer_respects_turnover_cap() -> None:
    from portlab.optimization.turnover import one_way_turnover, turnover_aware_portfolio

    r = sample_returns()
    mu, cov = annualized_mean_return(r), sample_covariance(r)
    reference = equal_weight(r.columns)
    w = turnover_aware_portfolio(
        mu,
        cov,
        reference,
        objective="maximum_sharpe",
        turnover_penalty=0.25,
        max_turnover=0.10,
        min_weight=0.0,
        max_weight=0.8,
    )
    assert np.isclose(float(w.sum()), 1.0, atol=1e-6)
    assert one_way_turnover(w, reference) <= 0.10001


def test_black_litterman_posterior_moves_toward_view():
    from portlab.optimization.black_litterman import black_litterman_posterior, equilibrium_returns

    cov = pd.DataFrame([[0.04, 0.01], [0.01, 0.09]], index=["A", "B"], columns=["A", "B"])
    prior = equilibrium_returns(cov)
    posterior = black_litterman_posterior(cov, views={"A": (0.20, 0.8)})
    assert posterior.index.tolist() == ["A", "B"]
    assert float(posterior.at["A"]) > float(prior.at["A"])


def test_minimum_cvar_weights_sum_to_one():
    from portlab.optimization.cvar import minimum_cvar

    rng = np.random.default_rng(10)
    returns = pd.DataFrame(rng.normal(0.0004, 0.01, size=(200, 3)), columns=list("ABC"))
    w = minimum_cvar(returns, confidence=0.95)
    assert np.isclose(float(w.sum()), 1.0, atol=1e-6)
    assert (w >= -1e-9).all()


def test_risk_budget_portfolio_matches_equal_budget():
    from portlab.optimization.risk_budgeting import risk_budget_portfolio
    from portlab.risk.decomposition import risk_contributions

    cov = pd.DataFrame(np.diag([0.04, 0.09, 0.16]), index=list("ABC"), columns=list("ABC"))
    budgets = pd.Series([1 / 3, 1 / 3, 1 / 3], index=list("ABC"))
    w = risk_budget_portfolio(cov, budgets)
    rc = risk_contributions(w, cov)["risk_contribution_pct"]
    assert np.isclose(float(w.sum()), 1.0, atol=1e-6)
    assert np.max(np.abs(rc.to_numpy() - 1 / 3)) < 1e-3


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


def test_factor_proxy_regression_recovers_known_beta():
    from portlab.research.factor_exposure import regress_factor_exposures

    rng = np.random.default_rng(5)
    factors = pd.DataFrame(rng.normal(0, 0.01, size=(300, 2)), columns=["F1", "F2"])
    portfolio = 0.7 * column(factors, "F1") - 0.2 * column(factors, "F2")
    exposures, stats = regress_factor_exposures(portfolio, factors)
    assert np.isclose(exposures["F1"], 0.7, atol=1e-6)
    assert np.isclose(exposures["F2"], -0.2, atol=1e-6)
    assert stats["r_squared"] > 0.999


def test_monte_carlo_shapes_and_metrics():
    from portlab.simulation.monte_carlo import simulate_portfolio

    mu = pd.Series([0.08, 0.05], index=["A", "B"])
    cov = pd.DataFrame([[0.04, 0.01], [0.01, 0.03]], index=["A", "B"], columns=["A", "B"])
    w = pd.Series([0.5, 0.5], index=["A", "B"])
    history = pd.DataFrame(np.zeros((100, 2)), columns=["A", "B"])
    result = simulate_portfolio(history, w, mu=mu, cov=cov, n_paths=200, horizon_days=20)
    assert result.sample_paths.shape[1] == 21
    assert 0 <= result.metrics["probability_of_loss"].value <= 1


def test_robust_portfolio_sums_to_one():
    from portlab.optimization.robust import robust_mean_variance

    mu = pd.Series([0.10, 0.06, 0.04], index=list("ABC"))
    cov = pd.DataFrame(np.diag([0.04, 0.03, 0.02]), index=list("ABC"), columns=list("ABC"))
    w = robust_mean_variance(mu, cov, observations=252)
    assert np.isclose(float(w.sum()), 1.0, atol=1e-6)


def test_diversification_breakdown_is_finite():
    from portlab.research.diversification import diversification_breakdown

    cov = pd.DataFrame([[0.04, 0.005], [0.005, 0.09]], index=["A", "B"], columns=["A", "B"])
    w = pd.Series([0.5, 0.5], index=["A", "B"])
    result = diversification_breakdown(w, cov)
    assert np.isclose(result["effective_assets_hhi"], 2.0)
    assert np.isfinite(result["diversification_ratio"])
