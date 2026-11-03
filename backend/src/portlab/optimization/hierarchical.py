"""Cluster-based allocators: HERC and NCO.

Both start from the same observation as HRP: a covariance matrix of n assets has
n(n+1)/2 noisy entries, and an optimiser that inverts it treats noise as signal. Grouping
assets that move together (clusters) and allocating in two stages limits how far noise in one
corner of the matrix can push weights around elsewhere.

* **HERC** (Raffinot, 2017, "Hierarchical Clustering-Based Asset Allocation"): build the
  correlation dendrogram, cut it into k clusters (k chosen by the silhouette score), then
  walk down the tree splitting risk between the two branches of each node in inverse
  proportion to their variance. Inside a cluster, weights are inverse-variance. Unlike HRP,
  splits follow the tree's actual branches rather than halving a sorted list.
* **NCO** (López de Prado, 2019, "A Robust Estimator of the Efficient Frontier"): run a
  convex optimiser *inside* each cluster, treat each cluster's optimal mix as a single
  synthetic asset, then optimise across those synthetic assets. The final weight of an asset
  is its intra-cluster weight times its cluster's weight.

Neither enforces caps or group limits on the final weights: the two-stage structure is the
regulariser. The registry reports them as not respecting caps.
"""

from __future__ import annotations

from typing import Literal

import numpy as np
import pandas as pd
from scipy.cluster.hierarchy import fcluster, linkage, to_tree
from scipy.spatial.distance import squareform

from portlab.optimization.convex import Constraints, max_sharpe, min_variance

Objective = Literal["min_variance", "max_sharpe"]


def correlation_distance(cov: pd.DataFrame) -> np.ndarray:
    """d = √(½(1 − ρ)): 0 for perfectly correlated assets, 1 for perfectly opposed."""
    vols = np.sqrt(np.diag(cov.to_numpy(dtype=float)))
    corr = cov.to_numpy(dtype=float) / np.outer(vols, vols)
    return np.sqrt(np.clip((1.0 - corr) / 2.0, 0.0, 1.0))


def _silhouette(dist: np.ndarray, labels: np.ndarray) -> float:
    """Mean silhouette: how much closer each asset is to its own cluster than the next one."""
    scores = []
    for i, label in enumerate(labels):
        own = labels == label
        own[i] = False
        if not own.any():
            scores.append(0.0)
            continue
        a = dist[i, own].mean()
        b = min(dist[i, labels == other].mean() for other in set(labels) if other != label)
        scores.append((b - a) / max(a, b) if max(a, b) > 0 else 0.0)
    return float(np.mean(scores))


def choose_clusters(dist: np.ndarray, link: np.ndarray) -> np.ndarray:
    """Cluster labels for the cut (2 ≤ k ≤ n−1) with the best silhouette score."""
    n = len(dist)
    if n <= 2:
        return np.arange(1, n + 1)
    best, best_score = np.ones(n, dtype=int), -np.inf
    for k in range(2, n):
        labels = fcluster(link, t=k, criterion="maxclust")
        if len(set(labels)) < 2:
            continue
        score = _silhouette(dist, labels)
        if score > best_score:
            best, best_score = labels, score
    return best


def _linkage(cov: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    dist = correlation_distance(cov)
    return dist, linkage(squareform(dist, checks=False), method="ward")


def _inverse_variance(cov: np.ndarray) -> np.ndarray:
    iv = 1.0 / np.diag(cov)
    return iv / iv.sum()


def herc(cov: pd.DataFrame) -> pd.Series:
    """Hierarchical equal risk contribution (see module docstring)."""
    assets = [str(a) for a in cov.columns]
    sigma = cov.to_numpy(dtype=float)
    if len(assets) < 2:
        return pd.Series(1.0, index=assets, name="weight")
    dist, link = _linkage(cov)
    labels = choose_clusters(dist, link)
    weights = np.zeros(len(assets))

    def variance(members: list[int]) -> float:
        sub = sigma[np.ix_(members, members)]
        w = _inverse_variance(sub)
        return float(w @ sub @ w)

    def allocate(node, budget: float) -> None:
        members = node.pre_order()
        if node.is_leaf() or len(set(labels[members])) == 1:
            # One cluster: inverse-variance inside it.
            sub = sigma[np.ix_(members, members)]
            weights[members] = budget * _inverse_variance(sub)
            return
        left, right = node.get_left(), node.get_right()
        v_left, v_right = variance(left.pre_order()), variance(right.pre_order())
        alpha = 1.0 - v_left / (v_left + v_right)
        allocate(left, budget * alpha)
        allocate(right, budget * (1.0 - alpha))

    allocate(to_tree(link), 1.0)
    return pd.Series(weights / weights.sum(), index=assets, name="weight")


def nco(
    mu: pd.Series, cov: pd.DataFrame, risk_free: float, objective: Objective = "min_variance"
) -> pd.Series:
    """Nested clustered optimisation (see module docstring); long-only."""
    assets = [str(a) for a in cov.columns]
    long_only = Constraints()
    dist, link = _linkage(cov)
    labels = choose_clusters(dist, link)
    clusters = [[assets[i] for i in np.flatnonzero(labels == k)] for k in sorted(set(labels))]

    def solve(m: pd.Series, s: pd.DataFrame) -> pd.Series:
        if len(s) == 1:
            return pd.Series(1.0, index=s.columns)
        if objective == "max_sharpe" and (m - risk_free > 0).any():
            return max_sharpe(m, s, risk_free, long_only)
        return min_variance(s, long_only)

    intra = pd.DataFrame(0.0, index=assets, columns=range(len(clusters)))
    for k, members in enumerate(clusters):
        intra.loc[members, k] = solve(mu.loc[members], cov.loc[members, members]).to_numpy()
    w = intra.to_numpy()
    names = [f"cluster {k + 1}" for k in range(len(clusters))]
    reduced_cov = pd.DataFrame(w.T @ cov.to_numpy(dtype=float) @ w, index=names, columns=names)
    reduced_mu = pd.Series(w.T @ mu.reindex(assets).to_numpy(dtype=float), index=names)
    inter = solve(reduced_mu, reduced_cov).to_numpy()
    final = w @ inter
    return pd.Series(final / final.sum(), index=assets, name="weight")


def resampled(
    returns: pd.DataFrame,
    risk_free: float,
    constraints: Constraints,
    *,
    draws: int = 100,
    seed: int = 7,
) -> pd.Series:
    """Michaud resampled max-Sharpe: average the optimum over bootstrap histories.

    Each draw resamples days with replacement, re-estimates means and covariance, and solves
    max Sharpe under `constraints`. Averaging smooths away the corner solutions a single
    noisy sample produces. Linear constraints survive averaging (the average of feasible
    portfolios is feasible); a holdings cap does not, so it is applied per draw only.
    Draws where no portfolio beats cash are skipped.
    """
    rng = np.random.default_rng(seed)
    data = returns.dropna(how="any").to_numpy(dtype=float)
    assets = [str(c) for c in returns.columns]
    total = np.zeros(len(assets))
    used = 0
    for _ in range(draws):
        sample = data[rng.integers(0, len(data), len(data))]
        mu = pd.Series(sample.mean(axis=0) * 252, index=assets)
        cov = pd.DataFrame(np.cov(sample, rowvar=False) * 252, index=assets, columns=assets)
        try:
            total += max_sharpe(mu, cov, risk_free, constraints).to_numpy()
        except ValueError:
            continue
        used += 1
    if used == 0:
        raise ValueError("resampled max Sharpe: no resample had a portfolio beating cash")
    return pd.Series(total / used, index=assets, name="weight")
