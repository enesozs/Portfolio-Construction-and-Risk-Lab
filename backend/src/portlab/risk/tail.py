from __future__ import annotations

import numpy as np
import pandas as pd


def historical_var_cvar(
    portfolio_returns: pd.Series, confidence: float = 0.95
) -> tuple[float, float]:
    """Historical VaR and CVaR (expected shortfall) of daily returns, as positive losses.

    VaR is the loss exceeded on (1 − confidence) of days; CVaR is the average loss on those
    days, so it also says how bad the bad days are.
    """
    r = portfolio_returns.dropna().astype(float)
    if r.empty:
        return float("nan"), float("nan")
    loss = -r.to_numpy(dtype=float)
    var = float(np.quantile(loss, confidence))
    tail = loss[loss >= var]
    cvar = float(tail.mean()) if len(tail) else var
    return var, cvar
