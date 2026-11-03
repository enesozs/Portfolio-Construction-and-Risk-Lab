import numpy as np
import pandas as pd
import pytest

from portlab.optimization.convex import Constraints, min_variance
from portlab.optimization.hierarchical import (
    _linkage,
    choose_clusters,
    herc,
    nco,
    resampled,
)

ASSETS = list("ABCDEF")


def _block_cov() -> pd.DataFrame:
    """Two independent blocks: {A,B,C} correlated 0.8, {D,E,F} correlated 0.6."""
    vols = np.array([0.20, 0.25, 0.30, 0.10, 0.12, 0.15])
    corr = np.eye(6)
    corr[:3, :3] = 0.8
    corr[3:, 3:] = 0.6
    np.fill_diagonal(corr, 1.0)
    return pd.DataFrame(corr * np.outer(vols, vols), index=ASSETS, columns=ASSETS)


def test_clustering_finds_the_two_blocks() -> None:
    dist, link = _linkage(_block_cov())
    labels = choose_clusters(dist, link)
    assert len(set(labels[:3])) == 1 and len(set(labels[3:])) == 1
    assert labels[0] != labels[3]


def test_nco_is_exact_for_block_diagonal_min_variance() -> None:
    # With independent clusters, optimising within then across clusters loses nothing.
    cov = _block_cov()
    mu = pd.Series(0.05, index=ASSETS)
    sigma = cov.to_numpy()
    best = min_variance(cov, Constraints()).to_numpy()
    w = nco(mu, cov, 0.0).to_numpy()
    # Same minimum (weights can differ by solver tolerance where one sits at zero).
    assert w @ sigma @ w == pytest.approx(best @ sigma @ best, rel=1e-5)


def test_herc_splits_risk_between_clusters_by_variance() -> None:
    w = herc(_block_cov())
    assert float(w.sum()) == pytest.approx(1.0)
    assert bool((w > 0).all())
    # The calmer block {D,E,F} gets more capital.
    assert float(w[["D", "E", "F"]].sum()) > float(w[["A", "B", "C"]].sum())


def test_resampled_weights_are_feasible_averages() -> None:
    rng = np.random.default_rng(3)
    r = pd.DataFrame(rng.normal(0.0005, 0.01, size=(500, 4)), columns=list("WXYZ"))
    w = resampled(r, 0.0, Constraints(max_weight=0.4), draws=30)
    assert float(w.sum()) == pytest.approx(1.0)
    assert float(w.max()) <= 0.4 + 1e-6
    # Averaging spreads weight: no single draw's corner solution survives intact.
    assert int((w > 0.01).sum()) >= 3
