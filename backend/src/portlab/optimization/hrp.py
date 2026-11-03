from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.cluster.hierarchy import leaves_list, linkage
from scipy.spatial.distance import squareform


def _cluster_variance(cov: pd.DataFrame, items: list[str]) -> float:
    sub = cov.loc[items, items]
    sub_values = sub.to_numpy(dtype=float)
    inv_diag = 1.0 / np.diag(sub_values)
    ivp = inv_diag / inv_diag.sum()
    return float(ivp @ sub_values @ ivp)


def hierarchical_risk_parity(
    returns: pd.DataFrame, covariance: pd.DataFrame | None = None
) -> pd.Series:
    clean = returns.dropna(how="any")
    if clean.shape[1] < 2:
        raise ValueError("HRP requires at least two assets")

    assets = [str(col) for col in clean.columns]
    clean = clean.copy()
    clean.columns = assets

    cov = (
        clean.cov() * 252
        if covariance is None
        else covariance.reindex(index=assets, columns=assets)
    )
    corr = clean.corr().clip(-1.0, 1.0)
    corr_values = corr.to_numpy(dtype=float)
    dist_values = np.sqrt(np.clip((1.0 - corr_values) / 2.0, 0.0, 1.0))
    condensed = squareform(dist_values, checks=False)
    link = linkage(condensed, method="single")
    order = leaves_list(link)
    ordered = [assets[int(i)] for i in order]

    weights = pd.Series(1.0, index=ordered, dtype=float)
    clusters: list[list[str]] = [ordered]
    while clusters:
        next_clusters: list[list[str]] = []
        for cluster in clusters:
            if len(cluster) <= 1:
                continue
            split = len(cluster) // 2
            left, right = cluster[:split], cluster[split:]
            var_left = _cluster_variance(cov, left)
            var_right = _cluster_variance(cov, right)
            alpha = 1.0 - var_left / (var_left + var_right)
            weights.loc[left] *= alpha
            weights.loc[right] *= 1.0 - alpha
            next_clusters.extend([left, right])
        clusters = next_clusters

    return weights.reindex(assets).rename("weight")
