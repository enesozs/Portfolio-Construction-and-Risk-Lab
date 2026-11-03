import numpy as np
import pandas as pd
import pytest

from portlab._pandas import column
from portlab.backtest import CASH, buy_and_hold, run_backtest
from portlab.validation.walk_forward import walk_forward_portfolio


def _frame(values: np.ndarray, columns: list[str]) -> pd.DataFrame:
    index = pd.bdate_range("2020-01-01", periods=len(values))
    return pd.DataFrame(values, index=index, columns=columns)


def test_buy_and_hold_weights_drift_with_the_market() -> None:
    r = _frame(np.tile([0.01, 0.0], (50, 1)), ["A", "B"])
    result = buy_and_hold(r, pd.Series({"A": 0.5, "B": 0.5}))
    expected_wealth = 0.5 * 1.01**50 + 0.5
    assert result.wealth.iloc[-1] == pytest.approx(expected_wealth)
    assert result.weights["A"].iloc[-1] == pytest.approx(0.5 * 1.01**50 / expected_wealth)
    assert result.rebalances.empty


def test_costs_are_charged_per_dollar_traded() -> None:
    r = _frame(np.zeros((3, 2)), ["A", "B"])
    switch = pd.Series({"A": 0.0, "B": 1.0})
    result = run_backtest(
        r, pd.Series({"A": 1.0, "B": 0.0}), lambda i, _: switch if i == 0 else None, cost_bps=10
    )
    # Selling all of A and buying all of B trades 200% of wealth at 10 bp per dollar.
    assert result.returns.iloc[0] == pytest.approx(-0.002)
    assert result.rebalances["turnover"].iloc[0] == pytest.approx(1.0)


def test_cash_earns_the_cash_rate() -> None:
    r = _frame(np.zeros((20, 2)), ["A", "B"])
    cash = pd.Series(0.0002, index=r.index)
    result = buy_and_hold(r, pd.Series({"A": 0.0, "B": 0.0, CASH: 1.0}), cash_returns=cash)
    assert result.wealth.iloc[-1] == pytest.approx(1.0002**20)


def test_walk_forward_turnover_counts_drift_back_to_target() -> None:
    # Equal weight always targets 1/n. The old engine held targets constant between
    # rebalances, so it reported zero turnover; with drift, rebalancing has a real cost.
    rng = np.random.default_rng(3)
    r = _frame(rng.normal(0.0005, 0.01, size=(400, 3)), ["A", "B", "C"])
    result = walk_forward_portfolio(r, "equal_weight", lookback=100, rebalance_every=21)
    turnover = column(result.backtest.rebalances, "turnover")
    assert len(turnover) == (300 - 1) // 21
    assert float(turnover.min()) > 0
    assert result.realized_volatility.notna().all()
