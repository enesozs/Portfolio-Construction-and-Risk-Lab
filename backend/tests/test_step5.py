"""Step 5: VaR backtests, component risk, new Monte Carlo models, denoising, factors, PBO."""

import numpy as np
import pandas as pd
import pytest

from portlab.estimators.covariance import marchenko_pastur_denoise
from portlab.research.factor_model import fit_factor_model, ols_newey_west
from portlab.risk.var_backtest import (
    backtest_var,
    christoffersen,
    component_risk,
    kupiec,
    var_forecasts,
)
from portlab.simulation.monte_carlo import fit_regimes, simulate_portfolio
from portlab.validation.compare import memmel_test, probability_of_overfitting

DAYS = pd.bdate_range("2010-01-01", periods=2000)


def test_var_forecasts_use_only_past_data() -> None:
    r = pd.Series(np.random.default_rng(0).normal(0, 0.01, 1500), index=DAYS[:1500])
    for model in ("historical", "normal", "ewma", "filtered_historical"):
        full = var_forecasts(r, model, 0.99, 250)
        cut = var_forecasts(r.iloc[:1000], model, 0.99, 250)
        pd.testing.assert_series_equal(full.iloc[: len(cut)], cut)


def test_a_correct_model_passes_and_a_wrong_one_fails() -> None:
    rng = np.random.default_rng(1)
    calm = pd.Series(rng.normal(0, 0.01, 2000), index=DAYS)
    good = backtest_var(calm, "normal", 0.99)
    assert good.rate == pytest.approx(0.01, abs=0.006)
    assert good.kupiec.p_value > 0.05
    # Volatility quadruples halfway: a 250-day window lags, the exceptions cluster.
    shocked = calm.copy()
    shocked.iloc[1000:] *= 4
    bad = backtest_var(shocked, "historical", 0.99)
    assert bad.kupiec.p_value < 0.01
    adaptive = backtest_var(shocked, "ewma", 0.99)
    assert adaptive.rate < bad.rate


def test_kupiec_and_christoffersen_closed_cases() -> None:
    exact = np.zeros(1000, dtype=bool)
    exact[::100] = True  # exactly 1%, evenly spaced
    assert kupiec(exact, 0.01).statistic == pytest.approx(0.0, abs=1e-9)
    clustered = np.zeros(1000, dtype=bool)
    clustered[500:510] = True
    assert christoffersen(clustered).p_value < 0.001


def test_component_risk_adds_up() -> None:
    rng = np.random.default_rng(2)
    r = pd.DataFrame(rng.normal(0, [0.01, 0.02, 0.015], (3000, 3)), columns=list("ABC"))
    w = pd.Series([0.5, 0.3, 0.2], index=list("ABC"))
    out = component_risk(r, w, r.cov(), 0.99)
    assert float(out.component_var.sum()) == pytest.approx(out.var)
    assert float(out.component_es.sum()) == pytest.approx(out.es)


def _history(n=1500, seed=3) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    calm = rng.multivariate_normal([0.0004] * 3, np.eye(3) * 0.0001 + 0.00003, n // 2)
    storm = rng.multivariate_normal([-0.001] * 3, np.eye(3) * 0.0009 + 0.0006, n // 2)
    return pd.DataFrame(np.vstack([calm, storm, calm[:100]]), columns=list("ABC"))


def test_regimes_separate_calm_and_stress() -> None:
    model = fit_regimes(_history().to_numpy())
    vol = [np.sqrt(np.diag(c @ c.T)).mean() for c in model.chol]
    assert vol[1] > 2 * vol[0]
    assert np.diag(model.transition).min() > 0.9  # regimes persist
    assert model.start == 0


@pytest.mark.parametrize("model", ["t_copula", "regime"])
def test_new_simulation_models_run_and_report(model: str) -> None:
    h = _history()
    mu = pd.Series(0.08, index=h.columns)
    cov = h.cov() * 252
    w = pd.Series(1 / 3, index=h.columns)
    out = simulate_portfolio(h, w, mu=mu, cov=cov, model=model, n_paths=400, horizon_days=63)
    assert 0 < out.metrics["es_95"].value < 1
    assert out.sample_paths.shape[1] == 64


def test_t_copula_keeps_the_model_mean() -> None:
    h = _history()
    mu = pd.Series([0.10, 0.05, 0.00], index=h.columns)
    w = pd.Series([1.0, 0.0, 0.0], index=h.columns)
    out = simulate_portfolio(
        h, w, mu=mu, cov=h.cov() * 252, model="t_copula", n_paths=8000, horizon_days=21
    )
    expected = (1 + 0.10 / 252) ** 21
    mean = out.metrics["mean_terminal"]
    assert abs(mean.value - expected) < 4 * mean.stderr + 1e-3


def test_denoising_flattens_noise_and_keeps_the_factor() -> None:
    rng = np.random.default_rng(4)
    market = rng.normal(0, 0.01, (300, 1))
    x = pd.DataFrame(market + rng.normal(0, 0.01, (300, 20)))
    corr, signal = marchenko_pastur_denoise(x)
    assert signal == 1
    assert np.allclose(np.diag(corr), 1.0)
    off = corr[~np.eye(20, dtype=bool)]
    assert off.std() < np.corrcoef(x.to_numpy(), rowvar=False)[~np.eye(20, dtype=bool)].std()


def test_newey_west_matches_ols_when_there_is_no_lag() -> None:
    rng = np.random.default_rng(5)
    x = np.column_stack([np.ones(500), rng.normal(size=500)])
    y = 0.5 + 2 * x[:, 1] + rng.normal(size=500)
    coef, se = ols_newey_west(y, x, lags=0)
    assert coef == pytest.approx([0.5, 2.0], abs=0.15)
    # White (HC0) errors, rescaled by n/(n − k), for an i.i.d. sample ≈ classical OLS errors.
    resid = y - x @ coef
    classical = np.sqrt(np.diag(np.linalg.inv(x.T @ x)) * resid.var(ddof=2))
    assert se == pytest.approx(classical, rel=0.15)


def test_factor_model_recovers_exposures_and_risk_shares() -> None:
    rng = np.random.default_rng(6)
    f = pd.DataFrame(rng.normal(0, 0.01, (1500, 2)), index=DAYS[:1500], columns=["Mkt-RF", "HML"])
    f["RF"] = 0.0001
    noise = pd.Series(rng.normal(0, 0.002, 1500), index=f.index)
    p = 0.0001 + 1.2 * f["Mkt-RF"] - 0.4 * f["HML"] + noise + f["RF"]
    fit = fit_factor_model(pd.Series(p), f, ["Mkt-RF", "HML"])
    assert fit.beta == pytest.approx([1.2, -0.4], abs=0.03)
    assert abs(fit.t_stat()[0]) > 50
    assert sum(fit.risk_share.values()) + fit.idiosyncratic_share == pytest.approx(1.0)


def test_memmel_detects_a_real_difference_only() -> None:
    rng = np.random.default_rng(7)
    common = rng.normal(0, 0.01, 3000)
    a = common + rng.normal(0.0008, 0.003, 3000)
    b = common + rng.normal(0.0, 0.003, 3000)
    assert memmel_test(a, b)[1] < 0.01
    assert memmel_test(a, a + rng.normal(0, 1e-6, 3000))[1] > 0.5


def test_pbo_is_high_for_noise_and_low_for_a_real_edge() -> None:
    rng = np.random.default_rng(8)
    noise = pd.DataFrame(rng.normal(0, 0.01, (2000, 10)))
    assert probability_of_overfitting(noise).pbo > 0.3
    edge = noise.copy()
    edge[0] += 0.002
    assert probability_of_overfitting(edge).pbo < 0.05
