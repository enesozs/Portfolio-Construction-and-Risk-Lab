import numpy as np
import pandas as pd
import pytest

from portlab.backtest import CASH
from portlab.dynamic import DynamicSpec, run_dynamic
from portlab.optimization.convex import Constraints

DAYS = pd.bdate_range("2015-01-01", periods=800)
ASSETS = list("ABCD")


def _market(
    drifts: list[float], seed: int = 0, noise: float = 0.01
) -> tuple[pd.DataFrame, pd.DataFrame, pd.Series]:
    rng = np.random.default_rng(seed)
    r = pd.DataFrame(
        rng.normal(drifts, noise, size=(len(DAYS), len(drifts))), index=DAYS, columns=ASSETS
    )
    prices = 100 * (1 + r).cumprod()
    return r, prices, pd.Series(0.0001, index=DAYS)


def _run(spec: DynamicSpec, drifts=(0.001, 0.0005, -0.001, 0.0002), grid=False, noise=0.01):
    r, p, cash = _market(list(drifts), noise=noise)
    return run_dynamic(spec, r, p, cash, Constraints(), grid=grid)


def test_filter_moves_assets_in_downtrends_to_cash() -> None:
    result = _run(DynamicSpec(method="filter", timing="trend", timing_params={"window": 100}))
    last = result.decisions[-1]
    assert last.on["A"] and not last.on["C"]  # C falls steadily
    assert last.target.at["C"] == 0.0
    assert last.target.at[CASH] == pytest.approx(0.25)


def test_redistributing_keeps_the_portfolio_invested() -> None:
    spec = DynamicSpec(method="filter", timing="trend", off_to_cash=False)
    last = _run(spec).decisions[-1]
    assert last.target.at[CASH] == pytest.approx(0.0, abs=1e-9)
    assert last.target.at["C"] == 0.0


def test_an_always_on_filter_is_exactly_the_rebalanced_base() -> None:
    # Every asset rises steadily, so the trend filter never switches anything off.
    spec = DynamicSpec(timing="trend", timing_params={"window": 50})
    result = _run(spec, drifts=(0.003,) * 4, noise=0.001)
    assert all(all(d.on.values()) for d in result.decisions)
    np.testing.assert_allclose(result.strategy.returns, result.base_rebalanced.returns)


def test_everything_off_earns_cash() -> None:
    spec = DynamicSpec(timing="trend", timing_params={"window": 50})
    result = _run(spec, drifts=(-0.003,) * 4, noise=0.001)
    tail = result.strategy.returns.iloc[-200:]
    np.testing.assert_allclose(tail, 0.0001)


def test_top_k_holds_the_strongest_momentum() -> None:
    spec = DynamicSpec(method="top_k", timing=None, ranking="momentum", top_k=2)
    last = _run(spec).decisions[-1]
    held = {a for a in ASSETS if last.target.at[a] > 0}
    assert held == {"A", "B"}


def test_dual_momentum_leaves_unfilled_slots_in_cash() -> None:
    spec = DynamicSpec(method="top_k", timing="absolute_momentum", ranking="momentum", top_k=3)
    last = _run(spec, drifts=(0.002, -0.002, -0.002, -0.002)).decisions[-1]
    assert last.target.at["A"] == pytest.approx(1 / 3)
    assert last.target.at[CASH] == pytest.approx(2 / 3)


def test_tilt_leans_toward_scores_and_zero_strength_is_the_base() -> None:
    base = _run(DynamicSpec(method="tilt", timing=None, ranking="momentum", tilt_strength=0.0))
    tilted = _run(DynamicSpec(method="tilt", timing=None, ranking="momentum", tilt_strength=1.0))
    assert base.decisions[-1].target.at["A"] == pytest.approx(0.25)
    assert tilted.decisions[-1].target.at["A"] > 0.25 > tilted.decisions[-1].target.at["C"]


def test_black_litterman_views_follow_the_scores() -> None:
    spec = DynamicSpec(method="black_litterman", timing=None, ranking="momentum", tilt_strength=1)
    last = _run(spec).decisions[-1].target
    assert last.at["A"] > last.at["C"]
    assert float(last.drop(CASH).sum()) == pytest.approx(1.0)


def test_decisions_never_use_future_data() -> None:
    r, p, cash = _market([0.001, 0.0005, -0.001, 0.0002], seed=3)
    spec = DynamicSpec(method="top_k", timing="trend", ranking="momentum", top_k=2)
    full = run_dynamic(spec, r, p, cash, Constraints(), grid=False)
    cut = 600
    early = run_dynamic(
        spec, r.iloc[:cut], p.iloc[:cut], cash.iloc[:cut], Constraints(), grid=False
    )
    for a, b in zip(early.decisions, full.decisions, strict=False):
        pd.testing.assert_series_equal(a.target, b.target)


def test_grid_and_deflated_sharpe() -> None:
    result = _run(DynamicSpec(timing="trend"), grid=True)
    assert len(result.trials) == 5
    assert sum(t["chosen"] for t in result.trials) == 1
    assert 0.0 <= result.deflated_probability <= result.probability_beats_base + 1e-12
    assert 0.0 <= result.probability_beats_base <= 1.0


def test_invalid_specs_are_explained() -> None:
    with pytest.raises(ValueError, match="needs a ranking"):
        _run(DynamicSpec(method="top_k", ranking=None))
    with pytest.raises(ValueError, match="ranking signal, not a timing"):
        _run(DynamicSpec(timing="momentum"))
