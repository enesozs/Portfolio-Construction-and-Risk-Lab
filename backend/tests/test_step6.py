"""Step 6: holdings, trade lists and the goal planner."""

import numpy as np
import pandas as pd
import pytest

from portlab.holdings import Holding, parse_holdings, trade_list, value_holdings
from portlab.planner import Plan, simulate_plan

PRICES = pd.Series({"AAPL": 200.0, "MSFT": 400.0, "TLT": 90.0})


def test_parse_accepts_common_formats_and_reports_bad_lines() -> None:
    text = "ticker,shares\naapl 10\nMSFT,\t5\nTLT,$9000\nAAPL,2\nXOM\nJNJ,abc"
    holdings, problems = parse_holdings(text)
    by = {h.ticker: h for h in holdings}
    assert by["AAPL"].shares == 12 and by["MSFT"].shares == 5
    assert by["TLT"].value == 9000 and by["TLT"].shares is None
    assert problems == ["line 6: expected a ticker and an amount", "line 7: 'abc' is not a number"]


def test_values_turn_dollar_lines_into_shares() -> None:
    v = value_holdings([Holding("AAPL", shares=10), Holding("TLT", value=9000)], PRICES, cash=1000)
    assert v.shares.at["TLT"] == pytest.approx(100)
    assert v.total == pytest.approx(2000 + 9000 + 1000)
    assert float(v.weights.sum()) == pytest.approx(1.0)


def test_whole_share_trades_never_overdraw_and_land_near_target() -> None:
    current = value_holdings([Holding("AAPL", shares=100)], PRICES, cash=5000)
    target = pd.Series({"AAPL": 0.4, "MSFT": 0.4, "TLT": 0.2})
    plan = trade_list(current, target, PRICES, cost_bps=10)
    assert plan.cash_after >= 0
    assert bool((plan.orders["target_shares"] % 1 == 0).all())
    assert plan.tracking_gap < 0.02
    assert plan.total_cost == pytest.approx(0.001 * plan.orders["trade_value"].abs().sum())


def test_fractional_trades_hit_the_target_and_small_ones_are_skipped() -> None:
    current = value_holdings([Holding("AAPL", shares=50), Holding("MSFT", shares=25)], PRICES)
    exact = trade_list(current, pd.Series({"AAPL": 0.5, "MSFT": 0.5}), PRICES, fractional=True)
    assert exact.weights_after.at["AAPL"] == pytest.approx(0.5, abs=1e-9)
    nudge = trade_list(current, pd.Series({"AAPL": 0.49, "MSFT": 0.51}), PRICES, min_trade=500)
    assert bool((nudge.orders["trade_shares"] == 0).all())


def test_cash_buffer_is_kept() -> None:
    current = value_holdings([Holding("AAPL", shares=100)], PRICES)
    plan = trade_list(current, pd.Series({"AAPL": 1.0}), PRICES, fractional=True, cash_buffer=0.1)
    assert plan.weights_after.at["CASH"] == pytest.approx(0.1, abs=1e-6)


DAYS = pd.bdate_range("2005-01-03", periods=5000)


def _inputs(drift: float = 0.0004, vol: float = 0.01):
    rng = np.random.default_rng(0)
    hist = pd.DataFrame(rng.normal(drift, vol, (5000, 2)), index=DAYS, columns=["A", "B"])
    w = pd.Series({"A": 0.5, "B": 0.5})
    return hist, w


def test_zero_volatility_matches_the_annuity_formula() -> None:
    hist, w = _inputs()
    annual = 0.06
    mu = pd.Series(annual, index=["A", "B"])
    cov = pd.DataFrame(np.eye(2) * 1e-14, index=mu.index, columns=mu.index)
    plan = Plan(
        initial=10_000,
        monthly_contribution=500,
        years=10,
        retire_year=10,
        annual_withdrawal=0,
        inflation=0.0,
    )
    out = simulate_plan(
        plan, w, mu=mu, cov=cov, daily_history=hist, cash_rate=0.0, model="normal", n_paths=50
    )
    m = annual / 12
    n = 120
    # Contributions are made at the start of each month, then the month's return applies.
    expected = 10_000 * (1 + m) ** n + 500 * (1 + m) * ((1 + m) ** n - 1) / m
    assert out.median_terminal == pytest.approx(expected, rel=1e-6)
    assert out.probability_ruin == 0.0


def test_more_spending_means_more_ruin_and_a_stricter_safe_rate() -> None:
    hist, w = _inputs()
    mu, cov = hist.mean() * 252, hist.cov() * 252

    def retire(withdrawal: float, confidence: float = 0.9):
        plan = Plan(
            initial=1_000_000,
            monthly_contribution=0,
            years=30,
            retire_year=0,
            annual_withdrawal=withdrawal,
            inflation=0.02,
        )
        return simulate_plan(
            plan,
            w,
            mu=mu,
            cov=cov,
            daily_history=hist,
            cash_rate=0.02,
            n_paths=1000,
            confidence=confidence,
        )

    low, high, strict = retire(30_000), retire(70_000), retire(30_000, confidence=0.99)
    assert high.probability_ruin > low.probability_ruin
    assert strict.safe_withdrawal_rate is not None and low.safe_withdrawal_rate is not None
    assert strict.safe_withdrawal_rate < low.safe_withdrawal_rate


def test_bad_early_years_hurt_retirement_most() -> None:
    hist, w = _inputs(drift=0.0003, vol=0.012)
    mu, cov = hist.mean() * 252, hist.cov() * 252
    plan = Plan(
        initial=1_000_000,
        monthly_contribution=0,
        years=30,
        retire_year=0,
        annual_withdrawal=55_000,
        inflation=0.02,
    )
    out = simulate_plan(
        plan, w, mu=mu, cov=cov, daily_history=hist, cash_rate=0.02, model="normal", n_paths=3000
    )
    success = [float(q["success"]) for q in out.sequence]
    assert success[0] < success[-1]


def test_goal_probability_and_glide_path() -> None:
    hist, w = _inputs()
    mu, cov = hist.mean() * 252, hist.cov() * 252
    risky = simulate_plan(
        Plan(
            initial=100_000,
            monthly_contribution=1000,
            years=20,
            retire_year=20,
            annual_withdrawal=0,
            goal=500_000,
            goal_year=20,
        ),
        w,
        mu=mu,
        cov=cov,
        daily_history=hist,
        cash_rate=0.02,
        n_paths=1000,
    )
    safe = simulate_plan(
        Plan(
            initial=100_000,
            monthly_contribution=1000,
            years=20,
            retire_year=20,
            annual_withdrawal=0,
            goal=500_000,
            goal_year=20,
            glide_start=0.0,
            glide_end=0.0,
        ),
        w,
        mu=mu,
        cov=cov,
        daily_history=hist,
        cash_rate=0.02,
        n_paths=1000,
    )
    assert risky.probability_goal is not None and 0 <= risky.probability_goal <= 1
    # All in cash: no spread at all.
    assert safe.fan[95][-1] == pytest.approx(safe.fan[5][-1])


def test_expected_return_override_moves_the_outcome() -> None:
    hist, w = _inputs(drift=0.001)  # a boom sample: about 25% a year
    mu, cov = hist.mean() * 252, hist.cov() * 252
    plan = Plan(
        initial=100_000,
        monthly_contribution=0,
        years=20,
        retire_year=20,
        annual_withdrawal=0,
        inflation=0.0,
    )

    def run(model: str, er: float | None):
        return simulate_plan(
            plan,
            w,
            mu=mu,
            cov=cov,
            daily_history=hist,
            cash_rate=0.0,
            n_paths=2000,
            model=model,
            expected_return=er,
        )

    assert run("bootstrap", 0.05).median_terminal < run("bootstrap", None).median_terminal / 3
    # Normal model: the median sits near the compounded geometric return.
    normal = run("normal", 0.05).median_terminal
    assert 100_000 * 1.03**20 < normal < 100_000 * 1.05**20
