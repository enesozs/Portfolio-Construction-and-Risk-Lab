from __future__ import annotations

from typing import cast

import numpy as np
import pandas as pd


def _rank_score(series: pd.Series, higher_is_better: bool) -> pd.Series:
    s = series.astype(float).replace([np.inf, -np.inf], np.nan)
    if s.notna().sum() <= 1:
        return pd.Series(0.5, index=s.index, dtype=float)
    ranks = s.rank(pct=True, ascending=higher_is_better)
    # rank ascending=True gives highest percentile to large values; invert only
    # when lower values are preferable.
    return ranks if higher_is_better else 1.0 - ranks + 1.0 / len(ranks)


def rank_portfolios(summary: pd.DataFrame, objective: str) -> pd.DataFrame:
    objective_map = {
        "Maximum risk-adjusted return": ("Expected Sharpe", True),
        "Minimum volatility": ("Expected Volatility", False),
        "Tail-risk protection": ("Max Drawdown", True),
        "Diversification": ("Diversification Ratio", True),
        "Low concentration": ("Effective Assets", True),
    }
    if objective not in objective_map:
        raise ValueError("unknown objective")
    column, higher = objective_map[objective]
    score = _rank_score(cast(pd.Series, summary[column]), higher)
    out = summary[[column]].copy()
    out["Objective Score"] = score
    return out.iloc[np.argsort(-score.to_numpy(dtype=float), kind="stable")]
