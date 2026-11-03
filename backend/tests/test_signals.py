import numpy as np
import pandas as pd
import pytest

from portlab.signals import SIGNALS, compute, donchian, momentum, trend

DAYS = pd.bdate_range("2015-01-01", periods=900)


def _prices(seed: int = 0, n: int = 4) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    r = rng.normal(0.0003, 0.012, size=(len(DAYS), n))
    return pd.DataFrame(100 * np.exp(np.cumsum(r, axis=0)), index=DAYS, columns=list("ABCD")[:n])


@pytest.mark.parametrize("key", list(SIGNALS))
def test_no_signal_looks_ahead(key: str) -> None:
    # A value on day t must not change when everything after t is removed (or altered).
    prices = _prices(1)
    cash = pd.Series(0.0001, index=DAYS)
    full = compute(key, prices, cash=cash)
    cut = 600
    truncated = compute(key, prices.iloc[:cut], cash=cash.iloc[:cut])
    pd.testing.assert_frame_equal(full.iloc[:cut], truncated, check_freq=False)


def test_trend_is_on_above_the_average_and_off_below() -> None:
    up = np.linspace(100, 200, 300)
    down = np.linspace(200, 120, 300)
    prices = pd.DataFrame({"A": np.concatenate([up, down])}, index=DAYS[:600])
    s = trend(prices, 50)["A"]
    assert s.iloc[:49].isna().all()
    assert s.iloc[100:300].eq(1).all()
    assert s.iloc[-50:].eq(0).all()


def test_momentum_skips_the_latest_month() -> None:
    prices = _prices(2)
    m = momentum(prices, 252, 21)
    t = 400
    expected = prices.iloc[t - 21] / prices.iloc[t - 252] - 1
    pd.testing.assert_series_equal(m.iloc[t], expected, check_names=False)


def test_donchian_holds_its_state_between_the_channels() -> None:
    p = [100.0] * 30 + [110.0] + [105.0] * 10 + [90.0] + [95.0] * 5
    prices = pd.DataFrame({"A": p}, index=DAYS[: len(p)])
    s = donchian(prices, entry=20, exit=20)["A"]
    assert s.iloc[30] == 1  # breakout above the prior 20-day high
    assert s.iloc[35] == 1  # still in between the levels
    assert s.iloc[41] == 0  # broke below the prior 20-day low


def test_absolute_momentum_needs_to_beat_cash() -> None:
    flat_gain = pd.DataFrame({"A": 100 * 1.0002 ** np.arange(400)}, index=DAYS[:400])
    low_cash = pd.Series(0.0001, index=DAYS[:400])
    high_cash = pd.Series(0.0003, index=DAYS[:400])
    assert compute("absolute_momentum", flat_gain, cash=low_cash)["A"].iloc[-1] == 1
    assert compute("absolute_momentum", flat_gain, cash=high_cash)["A"].iloc[-1] == 0


def test_bad_parameters_are_rejected() -> None:
    with pytest.raises(ValueError, match="between"):
        compute("trend", _prices(), {"window": 5000})
    with pytest.raises(ValueError, match="shorter"):
        compute("sma_cross", _prices(), {"fast": 200, "slow": 100})
