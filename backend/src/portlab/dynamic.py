"""Dynamic (tactical) allocation: move weight between the user's assets and cash on signals.

The user fixes the universe and a **base** portfolio (custom weights, or any allocator
re-estimated at each rebalance). On every rebalance date the strategy reads the signals
(`portlab.signals`) using data up to that day, turns them into target weights by one of
four methods, and trades through the shared engine (`portlab.backtest`: drift between
trades, costs per dollar traded, cash earning T-bills):

* **filter**: hold the base weights of assets whose timing signal is on. An asset that is
  off sends its weight to cash (`off_to_cash`) or to the other assets (the base allocator is
  re-run on the ones still on).
* **top_k**: rank assets by a ranking signal and hold the best `top_k`, weighted by the base
  allocator. With a timing signal too, only assets that are also "on" qualify, and each
  empty slot is held in cash (dual momentum, when timing is absolute momentum).
* **tilt**: lean the base weights toward high scores: wᵢ ∝ bᵢ·exp(s·zᵢ), where zᵢ is the
  asset's cross-sectional z-score (clipped to ±2) and s the tilt strength. Small s stays
  close to the base, large s concentrates. A timing signal can still move "off" assets to cash.
* **black_litterman**: express scores as views. Each asset's view is its implied (prior)
  return shifted by s·zᵢ·σᵢ, held with the given confidence. Black–Litterman blends them with
  the base portfolio's implied returns, and max Sharpe on the posterior gives the weights.
  This is the most principled way to combine signals with risk.

Honest evaluation is part of the result:
* The same base portfolio is also run **rebalanced on the same schedule without signals**.
  The gap between the two is what the signals added.
* Buy-and-hold of the base weights and cash are run over the same days too.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field, replace
from typing import Literal

import numpy as np
import pandas as pd

from portlab.backtest import CASH, BacktestResult, run_backtest
from portlab.estimators.estimates import estimate
from portlab.optimization.black_litterman import black_litterman_posterior, equilibrium_returns
from portlab.optimization.convex import Constraints, InfeasibleError, max_sharpe
from portlab.optimization.registry import allocate
from portlab.signals import SIGNALS, compute
from portlab.validation.sharpe_tests import annual_sharpe, deflated_sharpe, probabilistic_sharpe

Method = Literal["filter", "top_k", "tilt", "black_litterman"]


@dataclass(frozen=True)
class DynamicSpec:
    method: Method = "filter"
    timing: str | None = "trend"
    timing_params: dict[str, float] = field(default_factory=dict)
    ranking: str | None = None
    ranking_params: dict[str, float] = field(default_factory=dict)
    base: str = "equal_weight"
    """An allocator key, or "custom" to use `base_weights`."""
    base_weights: dict[str, float] | None = None
    off_to_cash: bool = True
    top_k: int = 3
    tilt_strength: float = 0.5
    view_confidence: float = 0.5
    rebalance_every: int = 21
    lookback: int = 252
    cost_bps: float = 5.0

    def validate(self, assets: list[str]) -> None:
        if self.timing is not None and SIGNALS.get(self.timing, None) is None:
            raise ValueError(f"unknown timing signal: {self.timing}")
        if self.timing is not None and SIGNALS[self.timing].kind != "timing":
            raise ValueError(f"{self.timing} is a ranking signal, not a timing signal")
        if self.ranking is not None and SIGNALS.get(self.ranking, None) is None:
            raise ValueError(f"unknown ranking signal: {self.ranking}")
        if self.ranking is not None and SIGNALS[self.ranking].kind != "ranking":
            raise ValueError(f"{self.ranking} is a timing signal, not a ranking signal")
        if self.method == "filter" and self.timing is None:
            raise ValueError("the filter method needs a timing signal")
        if self.method != "filter" and self.ranking is None:
            raise ValueError(f"the {self.method} method needs a ranking signal")
        if self.method == "top_k" and not 1 <= self.top_k <= len(assets):
            raise ValueError(f"top k must be between 1 and {len(assets)}")
        if self.base == "custom":
            w = self.base_weights or {}
            if sum(max(float(w.get(a, 0.0)), 0.0) for a in assets) <= 0:
                raise ValueError("custom base weights must have a positive total")
        if self.rebalance_every < 1 or self.lookback < 21:
            raise ValueError("rebalance every ≥ 1 day and a lookback of at least 21 days")


@dataclass(frozen=True)
class SignalFrames:
    timing: pd.DataFrame | None
    ranking: pd.DataFrame | None


@dataclass(frozen=True)
class Decision:
    date: pd.Timestamp
    target: pd.Series
    """Target weights including CASH."""
    on: dict[str, bool]
    score: dict[str, float | None]


@dataclass(frozen=True)
class DynamicResult:
    strategy: BacktestResult
    base_rebalanced: BacktestResult
    """The base portfolio on the same schedule with no signals: isolates the signals' value."""
    buy_and_hold: BacktestResult
    decisions: list[Decision]
    trials: list[dict]
    """Robustness grid: label, Sharpe and active Sharpe (vs the rebalanced base) per variant."""
    probability_beats_base: float
    """P(true active Sharpe > 0): PSR of the daily return gap to the rebalanced base."""
    deflated_probability: float
    """The same probability, deflated for the number of grid variants (DSR on active returns).

    It answers: does the signal beat simply holding the base, once we admit we picked the
    best of N variants?"""


def signal_frames(spec: DynamicSpec, prices: pd.DataFrame, cash: pd.Series | None) -> SignalFrames:
    """Signals on full price history (so warm-up never eats the research sample)."""
    timing = compute(spec.timing, prices, spec.timing_params, cash) if spec.timing else None
    ranking = compute(spec.ranking, prices, spec.ranking_params, cash) if spec.ranking else None
    return SignalFrames(timing, ranking)


def _zscores(scores: pd.Series) -> pd.Series:
    valid = scores.dropna()
    if len(valid) < 2 or float(np.std(valid.to_numpy(dtype=float))) == 0:
        return pd.Series(0.0, index=scores.index)
    z = (scores - valid.mean()) / valid.std(ddof=0)
    return z.fillna(0.0).clip(-2, 2)


def _with_cash(risky: pd.Series, assets: list[str]) -> pd.Series:
    w = risky.reindex(assets).fillna(0.0).astype(float)
    return pd.concat([w, pd.Series({CASH: 1.0 - float(w.sum())})])


def _base(
    spec: DynamicSpec,
    train: pd.DataFrame,
    risk_free: float,
    constraints: Constraints,
    return_method: str,
    cov_method: str,
    subset: list[str] | None = None,
) -> pd.Series:
    """Base weights (summing to one) over `subset` (default: every asset)."""
    assets = subset or [str(c) for c in train.columns]
    if spec.base == "custom":
        raw = pd.Series({a: max(float((spec.base_weights or {}).get(a, 0.0)), 0.0) for a in assets})
        total = float(raw.sum())
        return raw / total if total > 0 else pd.Series(1.0 / len(assets), index=assets)
    if len(assets) == 1:
        return pd.Series(1.0, index=assets)
    est = estimate(train.loc[:, assets], return_method, cov_method, risk_free)
    c = constraints
    if c.max_weight is not None and c.max_weight * len(assets) < 1:
        c = replace(c, max_weight=None)  # a cap meant for the full universe can't bind a subset
    if c.max_holdings is not None and c.max_holdings > len(assets):
        c = replace(c, max_holdings=None)
    return allocate(spec.base, est, c)


BaseCache = dict[tuple, pd.Series]


def target_weights(
    spec: DynamicSpec,
    day: pd.Timestamp,
    train: pd.DataFrame,
    signals: SignalFrames,
    risk_free: float,
    constraints: Constraints,
    return_method: str = "arithmetic",
    cov_method: str = "ledoit_wolf",
    cache: BaseCache | None = None,
) -> Decision:
    """Target weights (incl. CASH) for a decision at `day`'s close, from `train` returns.

    `cache` memoises base weights by (day, asset subset): the strategy, its rebalanced-base
    benchmark and every robustness variant need the same ones.
    """
    assets = [str(c) for c in train.columns]
    on = (
        signals.timing.loc[day].reindex(assets).fillna(0.0) > 0.5
        if signals.timing is not None
        else pd.Series(True, index=assets)
    )
    score = (
        signals.ranking.loc[day].reindex(assets).astype(float)
        if signals.ranking is not None
        else pd.Series(np.nan, index=assets)
    )
    is_on = dict(zip(assets, on.to_numpy(dtype=bool).tolist(), strict=True))
    scored = {
        a: None if np.isnan(v) else float(v)
        for a, v in zip(assets, score.to_numpy(dtype=float), strict=True)
    }

    def base(subset: list[str] | None = None) -> pd.Series:
        key = (day, tuple(subset or assets))
        if cache is not None and key in cache:
            return cache[key]
        w = _base(spec, train, risk_free, constraints, return_method, cov_method, subset)
        if cache is not None:
            cache[key] = w
        return w

    if spec.method == "filter":
        active = [a for a in assets if is_on[a]]
        if not active:
            target = _with_cash(pd.Series(dtype=float), assets)
        elif spec.off_to_cash:
            target = _with_cash(base() * on.astype(float), assets)
        else:
            target = _with_cash(base(active), assets)
    elif spec.method == "top_k":
        eligible = sorted(
            (a for a in assets if is_on[a] and scored[a] is not None),
            key=lambda a: scored[a] or 0.0,
            reverse=True,
        )
        picks = eligible[: spec.top_k]
        if not picks:
            target = _with_cash(pd.Series(dtype=float), assets)
        else:
            # With a timing filter, each of the k slots is worth 1/k; unfilled slots are cash.
            invested = len(picks) / spec.top_k if signals.timing is not None else 1.0
            target = _with_cash(base(picks) * invested, assets)
    else:
        b = base()
        z = _zscores(score)
        if spec.method == "tilt":
            tilted = b * np.exp(spec.tilt_strength * z)
            risky = tilted / float(tilted.sum())
        else:
            est = estimate(train, return_method, cov_method, risk_free)
            prior = b.clip(lower=0)
            prior = prior / float(prior.sum())
            pi = equilibrium_returns(est.cov, prior)
            vols = pd.Series(np.sqrt(np.diag(est.cov.to_numpy(dtype=float))), index=assets)
            views = {
                a: (
                    float(pi.at[a] + spec.tilt_strength * z.at[a] * vols.at[a]),
                    spec.view_confidence,
                )
                for a in assets
                if scored[a] is not None
            }
            posterior = black_litterman_posterior(est.cov, prior, views) + risk_free
            try:
                risky = max_sharpe(posterior, est.cov, risk_free, constraints)
            except InfeasibleError:
                # No portfolio is expected to beat cash on these views: keep the base weights.
                risky = b
        if signals.timing is not None and spec.off_to_cash:
            risky = risky * on.astype(float)
        target = _with_cash(risky, assets)

    return Decision(
        date=day,
        target=target,
        on=is_on,
        score=scored,
    )


def _schedule(
    returns: pd.DataFrame,
    lookback: int,
    rebalance_every: int,
    decide_at: Callable[[int], pd.Series],
    cash: pd.Series,
    cost_bps: float,
) -> BacktestResult:
    """Run the engine over returns[lookback:], deciding at the first close and every k days."""
    test = returns.iloc[lookback:]
    last = len(test) - 1

    def decide(i: int, _: pd.Series) -> pd.Series | None:
        if (i + 1) % rebalance_every == 0 and i < last:
            return decide_at(lookback + i + 1)
        return None

    initial = decide_at(lookback)
    return run_backtest(test, initial, decide, cash_returns=cash.iloc[lookback:], cost_bps=cost_bps)


@dataclass
class _Run:
    """One universe's inputs, shared by the strategy, its benchmarks and the grid."""

    returns: pd.DataFrame
    prices: pd.DataFrame
    cash: pd.Series
    constraints: Constraints
    return_method: str
    cov_method: str
    cache: BaseCache = field(default_factory=dict)

    @property
    def assets(self) -> list[str]:
        return [str(c) for c in self.returns.columns]

    def train_at(self, end: int, lookback: int) -> tuple[pd.DataFrame, float]:
        start = max(0, end - lookback)
        return self.returns.iloc[start:end], float(self.cash.iloc[start:end].mean() * 252)

    def strategy(
        self, spec: DynamicSpec, decisions: list[Decision] | None = None
    ) -> BacktestResult:
        frames = signal_frames(spec, self.prices, self.cash)

        def at(end: int) -> pd.Series:
            train, rf = self.train_at(end, spec.lookback)
            day = self.returns.index[end - 1]
            d = target_weights(
                spec,
                day,
                train,
                frames,
                rf,
                self.constraints,
                self.return_method,
                self.cov_method,
                self.cache,
            )
            if decisions is not None:
                decisions.append(d)
            return d.target

        return _schedule(
            self.returns, spec.lookback, spec.rebalance_every, at, self.cash, spec.cost_bps
        )

    def base_weights(self, spec: DynamicSpec, end: int) -> pd.Series:
        day = self.returns.index[end - 1]
        key = (day, tuple(self.assets))
        if key not in self.cache:
            train, rf = self.train_at(end, spec.lookback)
            self.cache[key] = _base(
                spec, train, rf, self.constraints, self.return_method, self.cov_method
            )
        return _with_cash(self.cache[key], self.assets)


def run_dynamic(
    spec: DynamicSpec,
    returns: pd.DataFrame,
    prices: pd.DataFrame,
    cash: pd.Series,
    constraints: Constraints,
    *,
    return_method: str = "arithmetic",
    cov_method: str = "ledoit_wolf",
    grid: bool = True,
) -> DynamicResult:
    """Backtest `spec` on `returns` (aligned universe) using signals from full `prices`."""
    clean = returns.dropna(how="any").astype(float)
    assets = [str(c) for c in clean.columns]
    spec.validate(assets)
    if len(clean) <= spec.lookback + spec.rebalance_every:
        raise ValueError(
            f"need more than {spec.lookback + spec.rebalance_every} trading days for a "
            f"{spec.lookback}-day lookback; move the start date earlier or shorten the lookback"
        )
    run = _Run(
        returns=clean,
        prices=prices.loc[:, assets].ffill(limit=5),
        cash=cash.reindex(clean.index).fillna(0.0),
        constraints=constraints,
        return_method=return_method,
        cov_method=cov_method,
    )
    decisions: list[Decision] = []
    strategy = run.strategy(spec, decisions)
    rebalanced = _schedule(
        clean,
        spec.lookback,
        spec.rebalance_every,
        lambda end: run.base_weights(spec, end),
        run.cash,
        spec.cost_bps,
    )
    hold = run_backtest(
        clean.iloc[spec.lookback :],
        run.base_weights(spec, spec.lookback),
        cash_returns=run.cash.iloc[spec.lookback :],
    )
    trials = _grid(spec, run, rebalanced.returns) if grid else []
    active = strategy.returns - rebalanced.returns
    return DynamicResult(
        strategy=strategy,
        base_rebalanced=rebalanced,
        buy_and_hold=hold,
        decisions=decisions,
        trials=trials,
        probability_beats_base=probabilistic_sharpe(active, 0.0, 0.0),
        deflated_probability=(
            deflated_sharpe(active, [t["active_sharpe"] for t in trials], 0.0)
            if trials
            else float("nan")
        ),
    )


def _grid(spec: DynamicSpec, run: _Run, base_returns: pd.Series) -> list[dict]:
    """The same strategy with its main signal window scaled ×0.5 … ×2 (and top-k ±1).

    These are the neighbours a researcher would plausibly have tried. Their Sharpe ratios
    feed the deflated Sharpe ratio, and their spread shows how fragile the chosen setting is.
    """
    variants: list[tuple[str, DynamicSpec]] = []
    signal = spec.ranking if spec.method != "filter" else spec.timing
    assert signal is not None
    info = SIGNALS[signal]
    params_key = "ranking_params" if spec.method != "filter" else "timing_params"
    current = info.resolve(getattr(spec, params_key))
    primary = next(p for p in info.params if p.name == info.primary)
    seen: set[tuple] = set()
    for scale in (0.5, 0.75, 1.0, 1.5, 2.0):
        value = float(np.clip(current[primary.name] * scale, primary.min, primary.max))
        params = {**current, primary.name: round(value) if primary.integer else value}
        n = len(run.assets)
        ks = [spec.top_k]
        if spec.method == "top_k":
            ks = sorted({k for k in (spec.top_k - 1, spec.top_k, spec.top_k + 1) if 1 <= k <= n})
        for k in ks:
            key = (params[primary.name], k)
            if key in seen:
                continue
            seen.add(key)
            label = f"{primary.label.split(' (')[0]} {params[primary.name]:g}"
            if spec.method == "top_k":
                label += f", top {k}"
            variants.append((label, replace(spec, **{params_key: params}, top_k=k)))

    out = []
    for label, variant in variants:
        try:
            info.resolve(getattr(variant, params_key))
            result = run.strategy(variant)
        except ValueError:
            continue
        out.append(
            {
                "label": label,
                "sharpe": annual_sharpe(result.returns, result.cash_returns),
                "active_sharpe": annual_sharpe(result.returns - base_returns, 0.0),
                "annual_return": result.performance["annual_return"],
                "chosen": getattr(variant, params_key) == current and variant.top_k == spec.top_k,
            }
        )
    return out
