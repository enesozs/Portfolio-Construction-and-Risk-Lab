from __future__ import annotations

import numpy as np
import pandas as pd

from src.portfolio.metrics import portfolio_return, portfolio_volatility


def simulate_portfolio_paths(
    expected_returns: pd.Series,
    covariance: pd.DataFrame,
    weights: pd.Series,
    n_simulations: int = 3000,
    horizon_days: int = 252,
    distribution: str = "normal",
    student_df: int = 5,
    initial_wealth: float = 1.0,
    random_state: int = 42,
) -> tuple[pd.DataFrame, dict[str, float]]:
    if n_simulations < 100 or horizon_days < 2:
        raise ValueError("increase simulations/horizon")
    ann_mu = portfolio_return(weights, expected_returns)
    ann_vol = portfolio_volatility(weights, covariance)
    daily_mu = ann_mu / 252.0
    daily_vol = ann_vol / np.sqrt(252.0)
    rng = np.random.default_rng(random_state)
    if distribution == "normal":
        draws = rng.normal(daily_mu, daily_vol, size=(horizon_days, n_simulations))
    elif distribution == "student_t":
        if student_df <= 2:
            raise ValueError("student_df must exceed 2")
        scale = daily_vol * np.sqrt((student_df - 2.0) / student_df)
        draws = daily_mu + scale * rng.standard_t(student_df, size=(horizon_days, n_simulations))
    else:
        raise ValueError("distribution must be normal or student_t")
    wealth = initial_wealth * np.cumprod(1.0 + draws, axis=0)
    paths = pd.DataFrame(wealth)
    terminal = wealth[-1]
    running_max = np.maximum.accumulate(wealth, axis=0)
    drawdowns = wealth / running_max - 1.0
    max_dd = np.min(drawdowns, axis=0)
    metrics = {
        "median_terminal_wealth": float(np.median(terminal)),
        "p05_terminal_wealth": float(np.quantile(terminal, 0.05)),
        "p95_terminal_wealth": float(np.quantile(terminal, 0.95)),
        "probability_of_loss": float(np.mean(terminal < initial_wealth)),
        "probability_drawdown_gt_20": float(np.mean(max_dd < -0.20)),
        "median_max_drawdown": float(np.median(max_dd)),
    }
    return paths, metrics
