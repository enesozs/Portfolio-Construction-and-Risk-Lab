from datetime import date

import pandas as pd
import pytest

from portlab.data.prices import DataError, load_prices
from portlab.data.universe import build_universe
from portlab.risk.scenarios import HISTORICAL_CRISES, replay_historical_period


def test_universe_reports_the_ticker_that_shortened_the_sample() -> None:
    universe = build_universe(["AAPL", "TSLA", "TLT"], "2005-01-01")
    assert universe.limiting == ["TSLA"]
    assert universe.start >= date(2010, 6, 29)
    assert universe.inception["AAPL"] < date(2000, 1, 1)


def test_cash_rate_comes_from_treasury_bills_unless_overridden() -> None:
    universe = build_universe(["AAPL", "MSFT"], "2015-01-01")
    assert universe.risk_free_source.startswith("13-week T-bill")
    assert 0.0 < universe.risk_free < 0.06
    assert universe.cash_returns.index.equals(universe.returns.index)
    manual = build_universe(["AAPL", "MSFT"], "2015-01-01", risk_free=0.03)
    assert manual.risk_free == pytest.approx(0.03)


def test_unknown_ticker_is_a_clear_error() -> None:
    with pytest.raises(DataError, match="NOTATICKER"):
        build_universe(["AAPL", "NOTATICKER"], "2015-01-01")


def test_crisis_replay_redistributes_assets_that_did_not_exist_yet() -> None:
    returns = load_prices(["AAPL", "TSLA"]).prices.pct_change(fill_method=None)
    start, end = HISTORICAL_CRISES["Global Financial Crisis"]
    replay = replay_historical_period(returns, pd.Series({"AAPL": 0.5, "TSLA": 0.5}), start, end)
    assert replay.missing == ["TSLA"]
    assert replay.missing_weight == pytest.approx(0.5)
    assert replay.stats["max_drawdown"] < -0.3
