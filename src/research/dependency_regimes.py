from __future__ import annotations

import numpy as np
import pandas as pd


def _average_pairwise_corr(frame: pd.DataFrame) -> float:
    corr = frame.corr().to_numpy(dtype=float)
    if corr.shape[0] < 2:
        return float("nan")
    mask = np.triu(np.ones_like(corr, dtype=bool), k=1)
    vals = corr[mask]
    return float(np.nanmean(vals))


def rolling_dependency_regimes(
    returns: pd.DataFrame,
    window: int = 63,
) -> pd.DataFrame:
    clean = returns.dropna(how="any").astype(float)
    if window < 10:
        raise ValueError("window must be at least 10 observations")
    if len(clean) < window:
        raise ValueError("insufficient observations for rolling dependency analysis")

    values: list[tuple[object, float, float]] = []
    equal_weight_returns = clean.mean(axis="columns")
    for end in range(window, len(clean) + 1):
        sample = clean.iloc[end - window : end]
        date = clean.index[end - 1]
        corr = _average_pairwise_corr(sample)
        realized_vol = float(
            equal_weight_returns.iloc[end - window : end].std(ddof=1) * np.sqrt(252)
        )
        values.append((date, corr, realized_vol))

    out = pd.DataFrame(
        values,
        columns=["date", "average_correlation", "equal_weight_volatility"],
    ).set_index("date")
    q33 = float(out["average_correlation"].quantile(1 / 3))
    q67 = float(out["average_correlation"].quantile(2 / 3))

    def regime(x: float) -> str:
        if x <= q33:
            return "Low correlation"
        if x >= q67:
            return "High correlation"
        return "Normal correlation"

    out["correlation_regime"] = out["average_correlation"].map(regime)
    return out
