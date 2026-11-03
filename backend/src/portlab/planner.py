"""Goal planning: will this portfolio fund a goal, or last through retirement?

A Monte Carlo simulation of wealth month by month over decades:

* **Saving phase**: monthly contributions until `retire_year`.
* **Spending phase**: monthly withdrawals from then on, kept constant in real terms (they
  rise with inflation).
* **Portfolio**: a growth mix (weights over the universe) blended with cash (T-bills at
  `cash_rate`) along a **glide path**: the growth share moves linearly from `glide_start` to
  `glide_end` over the plan, the usual way target-date funds de-risk.
* **Returns**: monthly asset returns. They are normal (or joint Student-t) from the annual μ
  and Σ, or a block bootstrap of the universe's historical monthly returns. The portfolio is
  rebalanced to the glide-path weights every month.

**Expected return**: a few years of history are a poor guide to the next forty, so
`expected_return` can set the growth portfolio's annual (arithmetic, nominal) mean directly.
Every asset's mean, and the bootstrapped history, is shifted by the same amount to hit it.
Volatilities and correlations still come from the data.

Everything is reported in today's money (deflated by `inflation`). **Ruin** is wealth hitting
zero while withdrawals are due. The **safe withdrawal** is the largest annual withdrawal (as a
share of wealth at retirement, in real terms) whose ruin probability stays below 1 − confidence,
found by bisection on the same simulated returns.

**Sequence-of-returns risk**: two retirements with the same average return can end very
differently if the bad years come first, because withdrawals then sell assets at low
prices. The result groups paths by their return over the first years of retirement and
reports the success rate of each group.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

MONTHS = 12
MODELS = ("normal", "student_t", "bootstrap")


@dataclass(frozen=True)
class Plan:
    initial: float
    monthly_contribution: float
    years: int
    retire_year: int
    """Contributions stop and withdrawals start at the beginning of this year (0 = now)."""
    annual_withdrawal: float
    """Real (today's money) withdrawal per year once retired."""
    inflation: float = 0.025
    goal: float | None = None
    """Target real wealth at `goal_year` (None = no goal)."""
    goal_year: int | None = None
    glide_start: float = 1.0
    glide_end: float = 1.0
    """Share in the growth portfolio at the start / end of the plan; the rest is cash."""

    def check(self) -> None:
        if self.years < 1 or self.years > 60:
            raise ValueError("the plan must last 1–60 years")
        if not 0 <= self.retire_year <= self.years:
            raise ValueError("retirement must fall within the plan")
        if not (0 <= self.glide_start <= 1 and 0 <= self.glide_end <= 1):
            raise ValueError("glide-path shares must be between 0% and 100%")
        if self.initial < 0 or self.monthly_contribution < 0 or self.annual_withdrawal < 0:
            raise ValueError("amounts must be non-negative")
        if self.goal is not None and (
            self.goal_year is None or not 0 < self.goal_year <= self.years
        ):
            raise ValueError("a goal needs a year within the plan")


@dataclass(frozen=True)
class PlanResult:
    years: np.ndarray
    """Year marks 0..plan length."""
    fan: dict[int, np.ndarray]
    """Real wealth percentiles (5, 25, 50, 75, 95) at each year mark."""
    sample_paths: np.ndarray
    probability_goal: float | None
    probability_ruin: float
    median_terminal: float
    ruin_year_share: np.ndarray
    """Share of paths ruined by each year mark (cumulative)."""
    safe_withdrawal_rate: float | None
    """Real annual withdrawal ÷ real wealth at retirement that keeps ruin ≤ 1 − confidence."""
    safe_withdrawal: float | None
    """The same, in today's money per year, at the median wealth at retirement."""
    sequence: list[dict]
    """Success rate by quintile of the first retirement years' return."""


def _monthly_returns(
    rng: np.random.Generator,
    n_paths: int,
    months: int,
    *,
    model: str,
    mu: np.ndarray,
    cov: np.ndarray,
    history_monthly: np.ndarray,
    student_df: float,
    block_months: int,
) -> np.ndarray:
    """Asset returns, shape (paths, months, assets)."""
    n_assets = len(mu)
    if model == "bootstrap":
        if len(history_monthly) < block_months * 2:
            raise ValueError("too little monthly history for the block bootstrap")
        blocks = -(-months // block_months)
        starts = rng.integers(0, len(history_monthly) - block_months + 1, size=(n_paths, blocks))
        idx = (starts[..., None] + np.arange(block_months)).reshape(n_paths, -1)[:, :months]
        return history_monthly[idx]
    chol = np.linalg.cholesky(cov / MONTHS + 1e-12 * np.eye(n_assets))
    z = rng.standard_normal((n_paths, months, n_assets))
    if model == "student_t":
        w = rng.chisquare(student_df, size=(n_paths, months, 1)) / student_df
        z = z / np.sqrt(w) * np.sqrt((student_df - 2) / student_df)
    return np.maximum(mu / MONTHS + z @ chol.T, -0.99)


def simulate_plan(
    plan: Plan,
    weights: pd.Series,
    *,
    mu: pd.Series,
    cov: pd.DataFrame,
    daily_history: pd.DataFrame,
    cash_rate: float,
    model: str = "bootstrap",
    n_paths: int = 4000,
    student_df: float = 5.0,
    block_months: int = 12,
    confidence: float = 0.9,
    seed: int = 7,
    expected_return: float | None = None,
) -> PlanResult:
    plan.check()
    if model not in MODELS:
        raise ValueError(f"model must be one of {', '.join(MODELS)}")
    assets = [str(c) for c in daily_history.columns]
    w = weights.reindex(assets).fillna(0.0).to_numpy(dtype=float)
    if w.sum() <= 0:
        raise ValueError("the growth portfolio has no weight")
    w = w / w.sum()
    monthly_hist = (1 + daily_history[assets].dropna(how="any")).resample("ME").prod().to_numpy(
        dtype=float
    ) - 1
    mu_arr = mu.reindex(assets).to_numpy(dtype=float)
    if expected_return is not None:
        mu_arr = mu_arr + (expected_return - float(w @ mu_arr))
        hist_mean = float(w @ monthly_hist.mean(axis=0)) * MONTHS
        monthly_hist = monthly_hist + (expected_return - hist_mean) / MONTHS
    months = plan.years * MONTHS
    rng = np.random.default_rng(seed)
    r = _monthly_returns(
        rng,
        n_paths,
        months,
        model=model,
        mu=mu_arr,
        cov=cov.reindex(index=assets, columns=assets).to_numpy(dtype=float),
        history_monthly=monthly_hist,
        student_df=student_df,
        block_months=block_months,
    )
    growth = r @ w  # (paths, months)
    share = np.linspace(plan.glide_start, plan.glide_end, months)
    cash_m = (1 + cash_rate) ** (1 / MONTHS) - 1
    port = share * growth + (1 - share) * cash_m
    deflator = (1 + plan.inflation) ** (np.arange(1, months + 1) / MONTHS)

    retire_month = plan.retire_year * MONTHS
    month_index = np.arange(months)
    contributions = np.where(month_index < retire_month, plan.monthly_contribution, 0.0)

    def run(withdrawal: float) -> tuple[np.ndarray, np.ndarray]:
        """Nominal wealth at each month end and a ruined flag, for a real annual withdrawal."""
        spend = np.where(month_index >= retire_month, withdrawal / MONTHS, 0.0) * deflator
        nominal_contrib = contributions * deflator
        wealth = np.empty((n_paths, months + 1))
        wealth[:, 0] = plan.initial
        ruined = np.zeros(n_paths, dtype=bool)
        ruin_month = np.full(n_paths, months + 1)
        for t in range(months):
            start = wealth[:, t] + nominal_contrib[t] - spend[t]
            broke = (start <= 0) & ~ruined
            ruin_month[broke] = t
            ruined |= start <= 0
            wealth[:, t + 1] = np.where(ruined, 0.0, start * (1 + port[:, t]))
        return wealth, ruin_month

    wealth, ruin_month = run(plan.annual_withdrawal)
    real = wealth / np.concatenate([[1.0], deflator])
    yearly = real[:, ::MONTHS]
    year_marks = np.arange(plan.years + 1)

    goal_prob = None
    if plan.goal is not None and plan.goal_year is not None:
        goal_prob = float(np.mean(yearly[:, plan.goal_year] >= plan.goal))

    # Safe withdrawal: bisection on the same returns (only meaningful with a spending phase).
    swr = swr_amount = None
    if plan.retire_year < plan.years:
        at_retire = real[:, retire_month]
        base = float(np.median(at_retire))
        if base > 0:
            lo, hi = 0.0, 0.5
            for _ in range(30):
                mid = (lo + hi) / 2
                _, ruin = run(mid * base)
                if np.mean(ruin <= months) <= 1 - confidence:
                    lo = mid
                else:
                    hi = mid
            swr, swr_amount = lo, lo * base

    sequence = []
    if plan.retire_year < plan.years:
        span = min(5 * MONTHS, months - retire_month)
        early = np.prod(1 + port[:, retire_month : retire_month + span], axis=1) - 1
        quintile = np.quantile(early, [0.2, 0.4, 0.6, 0.8])
        group = np.searchsorted(quintile, early)
        for g in range(5):
            m = group == g
            sequence.append(
                {
                    "quintile": g + 1,
                    "early_return": float(np.median(early[m])) if m.any() else float("nan"),
                    "success": float(np.mean(ruin_month[m] > months)) if m.any() else float("nan"),
                    "median_terminal": float(np.median(yearly[m, -1])) if m.any() else float("nan"),
                }
            )

    ruin_years = np.array([np.mean(ruin_month < y * MONTHS) for y in year_marks])
    return PlanResult(
        years=year_marks,
        fan={p: np.percentile(yearly, p, axis=0) for p in (5, 25, 50, 75, 95)},
        sample_paths=yearly[:30],
        probability_goal=goal_prob,
        probability_ruin=float(np.mean(ruin_month <= months)),
        median_terminal=float(np.median(yearly[:, -1])),
        ruin_year_share=ruin_years,
        safe_withdrawal_rate=swr,
        safe_withdrawal=swr_amount,
        sequence=sequence,
    )
