"""Convex portfolio problems solved exactly with cvxpy.

Every allocator here shares one constraint set (`Constraints`) and turns it into cvxpy
constraints in one place (`_feasible`), so "long-only with a 30% cap", "130/30 long-short",
"at most 40% in Technology" or "within 4% tracking error of equal weight" mean the same thing
to every method.

Max Sharpe is not convex in the weights, but it becomes convex after the change of
variables of Cornuéjols & Tütüncü (*Optimization Methods in Finance*, §8.2): with
y = κ·w and κ > 0 chosen so that (μ − r_f)ᵀy = 1, maximising the Sharpe ratio is the same as
minimising yᵀΣy. Linear constraints Aw ≤ b become Ay ≤ κb, so they carry over exactly.
The same trick with μ replaced by asset volatilities gives the maximum-diversification
portfolio (Choueifaty & Coignard, 2008).

A cap on the number of holdings makes the problem combinatorial (mixed-integer). Instead of
an integer solver, `max_holdings` uses a standard two-pass heuristic: solve, keep the
`max_holdings` largest positions, and solve again on those assets only.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass, field, replace
from typing import Any, Literal

import cvxpy as cp
import numpy as np
import pandas as pd
from cvxpy.error import SolverError

SOLVERS = ("CLARABEL", "ECOS", "SCS")


class InfeasibleError(ValueError):
    """No portfolio satisfies the constraints (reported to the user, not a crash)."""


@dataclass(frozen=True)
class Constraints:
    """Restrictions every allocator respects. Defaults: long-only, fully invested."""

    max_weight: float | None = None
    """Upper bound on any single asset; None = 100% (or the gross limit when shorting)."""
    min_weight: float = 0.0
    """Lower bound on any single asset; negative values allow short positions."""
    gross_leverage: float | None = None
    """Bound on Σ|wᵢ| (e.g. 1.6 for 130/30). Only meaningful when shorting is allowed."""
    groups: Mapping[str, str] = field(default_factory=dict)
    """Asset → group label (sector, asset class)."""
    group_max: Mapping[str, float] = field(default_factory=dict)
    """Group label → maximum total weight."""
    benchmark: Mapping[str, float] | None = None
    """Weights for the tracking-error limit (missing assets count as 0)."""
    max_tracking_error: float | None = None
    """Annualised ex-ante tracking error to `benchmark`."""
    max_holdings: int | None = None

    @property
    def long_only(self) -> bool:
        return self.min_weight >= 0

    def check(self, n: int) -> None:
        upper = 1.0 if self.max_weight is None else self.max_weight
        if self.min_weight > upper:
            raise InfeasibleError("the minimum weight is above the maximum weight")
        if upper * n < 1 - 1e-9:
            raise InfeasibleError(
                f"a {upper:.0%} cap on {n} assets cannot add up to 100%; "
                f"raise it to at least {np.ceil(100 / n):.0f}%"
            )
        if self.min_weight * n > 1 + 1e-9:
            raise InfeasibleError("the minimum weight on every asset adds up to more than 100%")
        if self.max_holdings is not None and self.max_holdings < 1:
            raise InfeasibleError("max_holdings must be at least 1")
        if self.max_tracking_error is not None and self.benchmark is None:
            raise InfeasibleError("a tracking-error limit needs a benchmark")


def _feasible(
    y: cp.Variable, scale: cp.Expression | float, assets: list[str], cov: np.ndarray, c: Constraints
) -> list[Any]:
    """Constraints on y = scale·w (scale = 1 for problems solved directly in w)."""
    upper = 1.0 if c.max_weight is None else c.max_weight
    if not c.long_only and c.max_weight is None:
        upper = c.gross_leverage or 2.0
    out: list[Any] = [
        cp.sum(y) == scale,
        y >= c.min_weight * scale,
        y <= upper * scale,
    ]
    if not c.long_only:
        out.append(cp.norm1(y) <= (c.gross_leverage or 2.0) * scale)
    for group, limit in c.group_max.items():
        members = [i for i, a in enumerate(assets) if c.groups.get(a) == group]
        if members:
            out.append(cp.sum(y[members]) <= limit * scale)
    if c.max_tracking_error is not None and c.benchmark is not None:
        bench = np.array([float(c.benchmark.get(a, 0.0)) for a in assets])
        root = np.linalg.cholesky(cov + 1e-12 * np.eye(len(assets)))
        out.append(cp.norm(root.T @ (y - scale * bench)) <= c.max_tracking_error * scale)
    return out


def _solve(problem: cp.Problem, what: str) -> None:
    last: Exception | None = None
    for solver in SOLVERS:
        if solver not in cp.installed_solvers():
            continue
        try:
            problem.solve(solver=solver)
        except SolverError as exc:
            last = exc
            continue
        if problem.status in (cp.OPTIMAL, cp.OPTIMAL_INACCURATE):
            return
        if problem.status in (cp.INFEASIBLE, cp.INFEASIBLE_INACCURATE):
            raise InfeasibleError(f"no portfolio satisfies the constraints for {what}")
        if problem.status in (cp.UNBOUNDED, cp.UNBOUNDED_INACCURATE):
            raise InfeasibleError(f"{what} is unbounded under these constraints; add a cap")
    raise RuntimeError(f"{what}: the solver did not converge ({last or problem.status})")


def _clean(w: np.ndarray, assets: list[str]) -> pd.Series:
    """Round away solver dust (|w| < 1e-7) and renormalise to sum to exactly one."""
    w = np.where(np.abs(w) < 1e-7, 0.0, w)
    return pd.Series(w / w.sum(), index=assets, name="weight", dtype=float)


Solver = Callable[[list[str], Constraints], pd.Series]


def _with_holdings_limit(assets: list[str], c: Constraints, solve: Solver) -> pd.Series:
    """Apply `max_holdings` with the solve → keep largest → re-solve heuristic."""
    c.check(len(assets))
    first = solve(assets, c)
    if c.max_holdings is None or int((first.abs() > 1e-6).sum()) <= c.max_holdings:
        return first
    keep = list(first.abs().sort_values(ascending=False).index[: c.max_holdings])
    kept = [a for a in assets if a in keep]
    c.check(len(kept))
    second = solve(kept, c)
    return second.reindex(assets).fillna(0.0).rename("weight")


def _sub(cov: pd.DataFrame, assets: list[str]) -> np.ndarray:
    return cov.loc[assets, assets].to_numpy(dtype=float)


def min_variance(cov: pd.DataFrame, c: Constraints) -> pd.Series:
    def solve(assets: list[str], c: Constraints) -> pd.Series:
        sigma = _sub(cov, assets)
        w = cp.Variable(len(assets))
        problem = cp.Problem(
            cp.Minimize(cp.quad_form(w, cp.psd_wrap(sigma))), _feasible(w, 1.0, assets, sigma, c)
        )
        _solve(problem, "minimum variance")
        return _clean(np.asarray(w.value), assets)

    return _with_holdings_limit([str(a) for a in cov.columns], c, solve)


def _ratio_portfolio(
    numerator: pd.Series, cov: pd.DataFrame, c: Constraints, what: str
) -> pd.Series:
    """Maximise numeratorᵀw / √(wᵀΣw) via y = κw (see module docstring)."""

    def solve(assets: list[str], c: Constraints) -> pd.Series:
        excess = numerator.reindex(assets).to_numpy(dtype=float)
        if c.long_only and (excess <= 0).all():
            raise InfeasibleError(
                f"{what}: no asset is expected to beat cash, so every long-only portfolio has a "
                "negative ratio; use minimum variance instead or lower the cash rate"
            )
        sigma = _sub(cov, assets)
        y = cp.Variable(len(assets))
        kappa = cp.Variable(nonneg=True)
        constraints = [excess @ y == 1, *_feasible(y, kappa, assets, sigma, c)]
        problem = cp.Problem(cp.Minimize(cp.quad_form(y, cp.psd_wrap(sigma))), constraints)
        try:
            _solve(problem, what)
        except InfeasibleError as exc:
            # (μ − r_f)ᵀy = 1 is unreachable: every allowed portfolio has a negative ratio.
            raise InfeasibleError(
                f"{what}: every portfolio the constraints allow is expected to trail cash, so "
                "the ratio cannot be made positive; relax the caps or use minimum variance"
            ) from exc
        if kappa.value is None or float(kappa.value) <= 1e-12:
            raise RuntimeError(f"{what}: degenerate solution")
        return _clean(np.asarray(y.value) / float(kappa.value), assets)

    return _with_holdings_limit([str(a) for a in cov.columns], c, solve)


def max_sharpe(mu: pd.Series, cov: pd.DataFrame, risk_free: float, c: Constraints) -> pd.Series:
    return _ratio_portfolio(mu - risk_free, cov, c, "maximum Sharpe")


def max_diversification(cov: pd.DataFrame, c: Constraints) -> pd.Series:
    """Maximise Σwᵢσᵢ / σ_p: the portfolio whose volatility is most reduced by correlation."""
    vols = pd.Series(np.sqrt(np.diag(cov.to_numpy(dtype=float))), index=cov.columns)
    return _ratio_portfolio(vols, cov, c, "maximum diversification")


def mean_variance(
    mu: pd.Series, cov: pd.DataFrame, risk_aversion: float, c: Constraints
) -> pd.Series:
    """Maximise μᵀw − (λ/2)·wᵀΣw."""

    def solve(assets: list[str], c: Constraints) -> pd.Series:
        sigma = _sub(cov, assets)
        m = mu.reindex(assets).to_numpy(dtype=float)
        w = cp.Variable(len(assets))
        objective = m @ w - risk_aversion / 2 * cp.quad_form(w, cp.psd_wrap(sigma))
        problem = cp.Problem(cp.Maximize(objective), _feasible(w, 1.0, assets, sigma, c))
        _solve(problem, "mean-variance")
        return _clean(np.asarray(w.value), assets)

    return _with_holdings_limit([str(a) for a in cov.columns], c, solve)


def min_cvar(
    returns: pd.DataFrame,
    cov: pd.DataFrame,
    confidence: float,
    c: Constraints,
    min_return: float | None = None,
) -> pd.Series:
    """Rockafellar–Uryasev: minimise α + E[(loss − α)⁺]/(1 − β) over historical days (an LP)."""
    if not 0.5 < confidence < 1:
        raise ValueError("confidence must be between 0.5 and 1")

    def solve(assets: list[str], c: Constraints) -> pd.Series:
        r = returns[assets].dropna(how="any").to_numpy(dtype=float)
        sigma = _sub(cov, assets)
        w = cp.Variable(len(assets))
        alpha = cp.Variable()
        excess_loss = cp.pos(-r @ w - alpha)
        objective = alpha + cp.sum(excess_loss) / ((1 - confidence) * len(r))
        constraints = _feasible(w, 1.0, assets, sigma, c)
        if min_return is not None:
            constraints.append(r.mean(axis=0) @ w * 252 >= min_return)
        _solve(cp.Problem(cp.Minimize(objective), constraints), "minimum CVaR")
        return _clean(np.asarray(w.value), assets)

    return _with_holdings_limit([str(a) for a in cov.columns], c, solve)


def growth_optimal(returns: pd.DataFrame, cov: pd.DataFrame, c: Constraints) -> pd.Series:
    """Kelly: maximise the average log growth (1/T)·Σ log(1 + rₜᵀw) over historical days.

    It maximises long-run compound growth if the historical days are representative, but it
    is aggressive and very sensitive to estimated means. Practitioners hold a fraction of
    it with the rest in cash ("half Kelly"), which the volatility-target page can show.
    """

    def solve(assets: list[str], c: Constraints) -> pd.Series:
        r = returns[assets].dropna(how="any").to_numpy(dtype=float)
        sigma = _sub(cov, assets)
        w = cp.Variable(len(assets))
        growth = cp.sum(cp.log1p(r @ w)) / len(r)
        problem = cp.Problem(cp.Maximize(growth), _feasible(w, 1.0, assets, sigma, c))
        _solve(problem, "growth-optimal (Kelly)")
        return _clean(np.asarray(w.value), assets)

    return _with_holdings_limit([str(a) for a in cov.columns], c, solve)


def risk_parity(cov: pd.DataFrame, c: Constraints, budgets: pd.Series | None = None) -> pd.Series:
    """Equal (or budgeted) risk contributions via Spinu's convex problem.

    min ½xᵀΣx − Σ bᵢ log xᵢ has a unique solution whose normalised weights give risk
    contributions exactly proportional to b (Spinu, 2013). It is long-only by construction.
    Extra constraints (caps, groups) are enforced on the normalised weights when they bind,
    at which point contributions can only be as close to the budget as the caps allow.
    """
    assets = [str(a) for a in cov.columns]
    sigma = cov.to_numpy(dtype=float)
    b = (
        np.full(len(assets), 1 / len(assets))
        if budgets is None
        else (budgets.reindex(assets).fillna(0.0).to_numpy(dtype=float))
    )
    if (b <= 0).any():
        raise InfeasibleError("every asset needs a positive risk budget")
    b = b / b.sum()
    x = cp.Variable(len(assets), pos=True)
    problem = cp.Problem(cp.Minimize(0.5 * cp.quad_form(x, cp.psd_wrap(sigma)) - b @ cp.log(x)))
    _solve(problem, "risk parity")
    w = _clean(np.asarray(x.value), assets)
    if _satisfies(w, c, sigma):
        return w
    return _capped_risk_parity(w, b, sigma, assets, c)


def _capped_risk_parity(
    start: pd.Series, b: np.ndarray, sigma: np.ndarray, assets: list[str], c: Constraints
) -> pd.Series:
    """Closest feasible risk shares when caps bind: min Σ(rcᵢ/σ_p² − bᵢ)², by SLSQP.

    Not convex, so it starts from the unconstrained (Spinu) solution clipped to the bounds.
    """
    from scipy.optimize import minimize

    upper = 1.0 if c.max_weight is None else c.max_weight
    lower = max(c.min_weight, 0.0)

    def gap(w: np.ndarray) -> float:
        marginal = sigma @ w
        var = float(w @ marginal)
        return float(np.sum((w * marginal / var - b) ** 2)) if var > 0 else 1e6

    constraints: list[dict] = [{"type": "eq", "fun": lambda w: float(np.sum(w) - 1.0)}]
    for group, limit in c.group_max.items():
        idx = [i for i, a in enumerate(assets) if c.groups.get(a) == group]
        if idx:
            constraints.append(
                {"type": "ineq", "fun": lambda w, idx=idx, lim=limit: lim - w[idx].sum()}
            )
    if c.max_tracking_error is not None and c.benchmark is not None:
        bench = np.array([float(c.benchmark.get(a, 0.0)) for a in assets])
        te2 = c.max_tracking_error**2
        constraints.append(
            {"type": "ineq", "fun": lambda w: te2 - (w - bench) @ sigma @ (w - bench)}
        )
    x0 = np.clip(start.to_numpy(dtype=float), lower, upper)
    result = minimize(
        gap,
        x0 / x0.sum(),
        method="SLSQP",
        bounds=[(lower, upper)] * len(assets),
        constraints=constraints,
        options={"maxiter": 1000, "ftol": 1e-12},
    )
    if not result.success:
        raise RuntimeError(
            f"risk parity under these constraints did not converge: {result.message}"
        )
    return _clean(result.x, assets)


def _satisfies(w: pd.Series, c: Constraints, sigma: np.ndarray) -> bool:
    v = w.to_numpy(dtype=float)
    if c.max_weight is not None and v.max() > c.max_weight + 1e-6:
        return False
    if v.min() < c.min_weight - 1e-6:
        return False
    for group, limit in c.group_max.items():
        if float(w[[a for a in w.index if c.groups.get(str(a)) == group]].sum()) > limit + 1e-6:
            return False
    if c.max_tracking_error is not None and c.benchmark is not None:
        gap = v - np.array([float(c.benchmark.get(str(a), 0.0)) for a in w.index])
        if np.sqrt(gap @ sigma @ gap) > c.max_tracking_error + 1e-6:
            return False
    return c.max_holdings is None or int((np.abs(v) > 1e-6).sum()) <= c.max_holdings


def annual_mean_standard_error(annual_variance: np.ndarray, observations: int) -> np.ndarray:
    """Standard error of an annualised mean estimated from `observations` daily returns.

    The annual mean is 252 × the daily mean, whose standard error is σ_daily/√T, so the
    annual standard error is 252·σ_daily/√T = √(252·σ²_annual/T).
    """
    return np.sqrt(252.0 * np.maximum(annual_variance, 0.0) / observations)


def robust_mean_variance(
    mu: pd.Series,
    cov: pd.DataFrame,
    observations: int,
    risk_aversion: float,
    uncertainty_aversion: float,
    c: Constraints,
) -> pd.Series:
    """Maximise μᵀw − (λ/2)·wᵀΣw − κ·‖diag(se)·w‖₂ (a second-order cone program).

    The last term is the standard error of the portfolio's expected return when the
    estimation errors of the asset means are treated as independent: it charges weight on
    assets whose average return is least precisely known. κ = 0 is plain mean-variance.
    """
    if observations < 2:
        raise ValueError("observations must be >= 2")
    if risk_aversion < 0 or uncertainty_aversion < 0:
        raise ValueError("aversion parameters must be non-negative")

    def solve(assets: list[str], c: Constraints) -> pd.Series:
        sigma = _sub(cov, assets)
        m = mu.reindex(assets).to_numpy(dtype=float)
        se = annual_mean_standard_error(np.diag(sigma), observations)
        w = cp.Variable(len(assets))
        objective = (
            m @ w
            - risk_aversion / 2 * cp.quad_form(w, cp.psd_wrap(sigma))
            - uncertainty_aversion * cp.norm(cp.multiply(se, w))
        )
        _solve(cp.Problem(cp.Maximize(objective), _feasible(w, 1.0, assets, sigma, c)), "robust MV")
        return _clean(np.asarray(w.value), assets)

    return _with_holdings_limit([str(a) for a in cov.columns], c, solve)


def one_way_turnover(weights: pd.Series, reference: pd.Series) -> float:
    """Half the total absolute change: moving 10% from A to B is 10% turnover."""
    assets = weights.index.union(reference.index)
    gap = weights.reindex(assets).fillna(0.0) - reference.reindex(assets).fillna(0.0)
    return float(gap.abs().sum() / 2.0)


def turnover_aware(
    mu: pd.Series,
    cov: pd.DataFrame,
    reference: pd.Series,
    c: Constraints,
    *,
    objective: Literal["mean_variance", "min_volatility"] = "mean_variance",
    risk_aversion: float = 3.0,
    cost: float = 0.01,
    max_turnover: float | None = None,
    max_volatility: float | None = None,
) -> pd.Series:
    """Rebalance from `reference` only where it pays for its trading cost.

    Both objectives are in annual-return units, and so is `cost`: the expected return given
    up per 100% of one-way turnover (0.01 = 1%). mean_variance maximises
    μᵀw − (λ/2)·wᵀΣw − cost·TO; min_volatility minimises σ_p + cost·TO.
    """
    if cost < 0:
        raise ValueError("cost must be non-negative")
    assets = [str(a) for a in cov.columns]
    c.check(len(assets))
    sigma = cov.to_numpy(dtype=float)
    ref = reference.reindex(assets).fillna(0.0).to_numpy(dtype=float)
    root = np.linalg.cholesky(sigma + 1e-12 * np.eye(len(assets)))
    w = cp.Variable(len(assets))
    turnover = cp.norm1(w - ref) / 2
    if objective == "mean_variance":
        m = mu.reindex(assets).to_numpy(dtype=float)
        goal = cp.Maximize(
            m @ w - risk_aversion / 2 * cp.quad_form(w, cp.psd_wrap(sigma)) - cost * turnover
        )
    else:
        goal = cp.Minimize(cp.norm(root.T @ w) + cost * turnover)
    constraints = _feasible(w, 1.0, assets, sigma, c)
    if max_turnover is not None:
        constraints.append(turnover <= max_turnover)
    if max_volatility is not None:
        constraints.append(cp.norm(root.T @ w) <= max_volatility)
    _solve(cp.Problem(goal, constraints), "turnover-aware rebalancing")
    return _clean(np.asarray(w.value), assets)


def efficient_frontier(
    mu: pd.Series, cov: pd.DataFrame, c: Constraints, n_points: int = 40
) -> pd.DataFrame:
    """Minimum volatility at each target return, from the minimum-variance portfolio up to
    the highest return the constraints allow (the efficient branch only)."""
    assets = [str(a) for a in cov.columns]
    c.check(len(assets))
    sigma = cov.to_numpy(dtype=float)
    m = mu.reindex(assets).to_numpy(dtype=float)
    # A holdings cap is not convex, so the frontier is drawn without it.
    c = replace(c, max_holdings=None)
    low = float(min_variance(cov, c).to_numpy(dtype=float) @ m)
    w = cp.Variable(len(assets))
    top = cp.Problem(cp.Maximize(m @ w), _feasible(w, 1.0, assets, sigma, c))
    _solve(top, "maximum return")
    high = float(np.asarray(w.value) @ m)
    target = cp.Parameter()
    problem = cp.Problem(
        cp.Minimize(cp.quad_form(w, cp.psd_wrap(sigma))),
        [*_feasible(w, 1.0, assets, sigma, c), m @ w >= target],
    )
    rows = []
    for t in np.linspace(low, high, n_points):
        target.value = float(t)
        try:
            _solve(problem, "frontier point")
        except (InfeasibleError, RuntimeError):
            continue
        x = np.asarray(w.value)
        rows.append({"return": float(x @ m), "volatility": float(np.sqrt(max(x @ sigma @ x, 0)))})
    return pd.DataFrame(rows)
