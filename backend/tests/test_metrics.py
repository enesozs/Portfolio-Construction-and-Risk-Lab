import numpy as np
import pandas as pd
import pytest

from portlab.portfolio.metrics import performance_summary


def test_sharpe_and_sortino_are_measured_against_cash() -> None:
    rng = np.random.default_rng(0)
    r = pd.Series(rng.normal(0.0006, 0.01, size=1000))
    cash = 0.04 / 252
    stats = performance_summary(r, cash_returns=cash)
    excess = r.to_numpy() - cash
    expected_sharpe = excess.mean() * 252 / (r.std(ddof=1) * np.sqrt(252))
    downside = np.sqrt(np.mean(np.minimum(excess, 0) ** 2)) * np.sqrt(252)
    assert stats["sharpe"] == pytest.approx(expected_sharpe)
    assert stats["sortino"] == pytest.approx(excess.mean() * 252 / downside)
    assert stats["sharpe"] < performance_summary(r)["sharpe"]


def test_drawdown_counts_a_loss_on_the_first_day() -> None:
    stats = performance_summary(pd.Series([-0.10, 0.05]))
    assert stats["max_drawdown"] == pytest.approx(-0.10)
