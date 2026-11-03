import numpy as np
import pandas as pd

from portlab.simulation.monte_carlo import simulate_portfolio

ASSETS = ["A", "B"]
MU = pd.Series([0.08, 0.04], index=ASSETS)
COV = pd.DataFrame([[0.04, 0.012], [0.012, 0.02]], index=ASSETS, columns=ASSETS)
WEIGHTS = pd.Series([0.6, 0.4], index=ASSETS)
HISTORY = pd.DataFrame(np.random.default_rng(1).normal(0, 0.01, (500, 2)), columns=ASSETS)


def _run(**kwargs):
    return simulate_portfolio(HISTORY, WEIGHTS, mu=MU, cov=COV, **kwargs)


def test_buy_and_hold_mean_matches_the_model() -> None:
    result = _run(n_paths=20_000, horizon_days=63)
    expected = float((WEIGHTS * (1 + MU / 252) ** 63).sum())
    mean = result.metrics["mean_terminal"]
    assert abs(mean.value - expected) < 4 * mean.stderr


def test_joint_fat_tails_raise_expected_shortfall() -> None:
    normal = _run(model="normal", n_paths=20_000, horizon_days=5)
    fat = _run(model="student_t", student_df=3, n_paths=20_000, horizon_days=5)
    assert fat.metrics["es_95"].value > normal.metrics["es_95"].value


def test_standard_error_shrinks_with_more_paths() -> None:
    small = _run(n_paths=1_000, horizon_days=63).metrics["median_terminal"].stderr
    large = _run(n_paths=16_000, horizon_days=63).metrics["median_terminal"].stderr
    assert large < small / 2
