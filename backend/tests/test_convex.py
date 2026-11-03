"""Convex allocators: closed forms where they exist, and every constraint actually holds."""

import numpy as np
import pandas as pd
import pytest

from portlab.estimators.estimates import estimate
from portlab.optimization.convex import (
    Constraints,
    InfeasibleError,
    growth_optimal,
    max_diversification,
    max_sharpe,
    min_cvar,
    min_variance,
    risk_parity,
)
from portlab.risk.decomposition import risk_contributions

ASSETS = list("ABCDE")
UNBOUNDED = Constraints(min_weight=-10, max_weight=10, gross_leverage=100)


@pytest.fixture(scope="module")
def est():
    rng = np.random.default_rng(11)
    mix = rng.normal(size=(5, 5)) * 0.004 + np.eye(5) * 0.008
    r = rng.normal(0, 1, size=(3000, 5)) @ mix + np.array([9, 4, 7, 3, 6]) * 1e-4
    return estimate(pd.DataFrame(r, columns=ASSETS), risk_free=0.02)


def test_unconstrained_min_variance_matches_closed_form(est) -> None:
    inv = np.linalg.inv(est.cov.to_numpy())
    expected = inv @ np.ones(5) / (np.ones(5) @ inv @ np.ones(5))
    w = min_variance(est.cov, UNBOUNDED)
    assert w.to_numpy() == pytest.approx(expected, abs=1e-6)


def test_unconstrained_max_sharpe_is_the_tangency_portfolio(est) -> None:
    inv = np.linalg.inv(est.cov.to_numpy())
    raw = inv @ (est.mu.to_numpy() - est.risk_free)
    w = max_sharpe(est.mu, est.cov, est.risk_free, UNBOUNDED)
    assert w.to_numpy() == pytest.approx(raw / raw.sum(), abs=1e-5)


def test_no_random_feasible_portfolio_beats_the_optimum(est) -> None:
    # Solver-independent check: 20,000 random long-only portfolios under a 50% cap.
    rng = np.random.default_rng(0)
    w = rng.dirichlet(np.ones(5) * 0.7, size=20_000)
    w = w[w.max(axis=1) <= 0.5]
    sigma, mu = est.cov.to_numpy(), est.mu.to_numpy()
    c = Constraints(max_weight=0.5)
    mv = min_variance(est.cov, c).to_numpy()
    assert (np.einsum("ij,jk,ik->i", w, sigma, w) >= mv @ sigma @ mv - 1e-12).all()
    ms = max_sharpe(est.mu, est.cov, est.risk_free, c).to_numpy()
    sharpe = (w @ mu - est.risk_free) / np.sqrt(np.einsum("ij,jk,ik->i", w, sigma, w))
    assert (sharpe <= (ms @ mu - est.risk_free) / np.sqrt(ms @ sigma @ ms) + 1e-9).all()


def test_risk_parity_equalises_risk_contributions(est) -> None:
    w = risk_parity(est.cov, Constraints())
    rc = risk_contributions(w, est.cov)["risk_contribution_pct"].to_numpy()
    assert rc == pytest.approx(np.full(5, 0.2), abs=1e-5)


def test_capped_risk_parity_respects_the_cap(est) -> None:
    free = risk_parity(est.cov, Constraints())
    cap = float(free.max()) - 0.03
    w = risk_parity(est.cov, Constraints(max_weight=cap))
    assert float(w.max()) <= cap + 1e-6
    assert float(w.sum()) == pytest.approx(1.0)


def test_long_short_respects_gross_leverage(est) -> None:
    c = Constraints(min_weight=-0.3, max_weight=1.0, gross_leverage=1.6)
    w = max_sharpe(est.mu, est.cov, est.risk_free, c)
    assert float(w.abs().sum()) <= 1.6 + 1e-6
    assert float(w.min()) >= -0.3 - 1e-6
    assert float(w.sum()) == pytest.approx(1.0)


def test_group_limit_and_tracking_error_hold(est) -> None:
    groups = {"A": "g1", "B": "g1", "C": "g2", "D": "g2", "E": "g2"}
    bench = dict.fromkeys(ASSETS, 0.2)
    c = Constraints(groups=groups, group_max={"g1": 0.3}, benchmark=bench, max_tracking_error=0.03)
    w = max_sharpe(est.mu, est.cov, est.risk_free, c)
    assert float(w[["A", "B"]].sum()) <= 0.3 + 1e-6
    gap = w.to_numpy() - 0.2
    assert np.sqrt(gap @ est.cov.to_numpy() @ gap) <= 0.03 + 1e-6


def test_max_holdings_keeps_the_largest_positions(est) -> None:
    w = min_variance(est.cov, Constraints(max_holdings=3))
    assert int((w > 1e-6).sum()) <= 3
    assert float(w.sum()) == pytest.approx(1.0)


def test_max_diversification_beats_equal_weight_on_its_ratio(est) -> None:
    vols = np.sqrt(np.diag(est.cov.to_numpy()))

    def ratio(w: np.ndarray) -> float:
        return float(w @ vols / np.sqrt(w @ est.cov.to_numpy() @ w))

    w = max_diversification(est.cov, Constraints()).to_numpy()
    assert ratio(w) >= ratio(np.full(5, 0.2)) - 1e-9


def test_cvar_and_kelly_are_optimal_in_sample(est) -> None:
    r = est.returns.to_numpy()
    ew = np.full(5, 0.2)

    def cvar(w: np.ndarray) -> float:
        loss = -(r @ w)
        return float(loss[loss >= np.quantile(loss, 0.95)].mean())

    w_cvar = min_cvar(est.returns, est.cov, 0.95, Constraints()).to_numpy()
    assert cvar(w_cvar) <= cvar(ew) + 1e-6
    w_kelly = growth_optimal(est.returns, est.cov, Constraints(max_weight=0.6)).to_numpy()
    assert np.log1p(r @ w_kelly).mean() >= np.log1p(r @ ew).mean() - 1e-9


def test_infeasible_constraints_are_reported(est) -> None:
    with pytest.raises(InfeasibleError, match="cannot add up"):
        min_variance(est.cov, Constraints(max_weight=0.1))
    no_edge = pd.Series(-0.05, index=ASSETS)
    with pytest.raises(InfeasibleError, match="beat cash"):
        max_sharpe(no_edge, est.cov, 0.0, Constraints())
