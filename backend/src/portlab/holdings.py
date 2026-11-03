"""A real portfolio: holdings in, trades out.

The research pages work in weights. An investor holds shares. This module bridges the two:

* `parse_holdings` reads a pasted list ("AAPL, 25" per line, or a CSV with a header). Each
  line is a share count, or a dollar value when written with "$".
* `value_holdings` prices the holdings at the latest close and gives current weights.
* `trade_list` turns target weights into orders.
  - Orders are whole shares unless `fractional`.
  - Buys are paid for by sells and the existing cash, so the account never goes negative after
    costs.
  - Trades smaller than `min_trade` dollars are skipped.
  - A `cash_buffer` share of the account is kept uninvested.

Rounding to whole shares leaves the result slightly off target. The function reports the
resulting weights and how far they are from the target, rather than hiding it.
"""

from __future__ import annotations

import csv
import io
import math
import re
from dataclasses import dataclass

import pandas as pd

from portlab.data.prices import normalise_ticker


@dataclass(frozen=True)
class Holding:
    ticker: str
    shares: float | None = None
    value: float | None = None
    """Dollar value, when the line gave one instead of a share count."""


def parse_holdings(text: str) -> tuple[list[Holding], list[str]]:
    """Holdings and a list of problems ("line 3: ..."), one holding per line.

    Accepted lines: "AAPL 25", "AAPL, 25", "AAPL,$5000", "MSFT\t12.5". A header line
    (e.g. "ticker,shares") is skipped. Repeated tickers are added together.
    """
    holdings: dict[str, Holding] = {}
    problems: list[str] = []
    rows = list(csv.reader(io.StringIO(text.replace("\t", ","))))
    for number, row in enumerate(rows, start=1):
        cells = [c.strip() for part in row for c in re.split(r"\s+", part.strip()) if c.strip()]
        if not cells:
            continue
        if len(cells) < 2:
            problems.append(f"line {number}: expected a ticker and an amount")
            continue
        ticker, raw = normalise_ticker(cells[0]), cells[1].replace(",", "")
        is_value = raw.startswith("$")
        try:
            amount = float(raw.lstrip("$"))
        except ValueError:
            if number == 1:
                continue  # a header such as "ticker,shares"
            problems.append(f"line {number}: '{cells[1]}' is not a number")
            continue
        if amount < 0 or not math.isfinite(amount):
            problems.append(f"line {number}: amounts must be positive")
            continue
        old = holdings.get(ticker, Holding(ticker))
        if is_value:
            holdings[ticker] = Holding(ticker, old.shares, (old.value or 0.0) + amount)
        else:
            holdings[ticker] = Holding(ticker, (old.shares or 0.0) + amount, old.value)
    return list(holdings.values()), problems


@dataclass(frozen=True)
class Valued:
    shares: pd.Series
    prices: pd.Series
    values: pd.Series
    cash: float
    total: float

    @property
    def weights(self) -> pd.Series:
        """Including CASH."""
        w = self.values / self.total
        return pd.concat([w, pd.Series({"CASH": self.cash / self.total})])


def value_holdings(holdings: list[Holding], prices: pd.Series, cash: float = 0.0) -> Valued:
    """Shares, prices and values at the given (latest) prices; dollar lines become shares."""
    missing = [h.ticker for h in holdings if h.ticker not in prices.index]
    if missing:
        raise ValueError(f"no price for {', '.join(missing)}")
    shares = pd.Series(
        {
            h.ticker: (h.shares or 0.0) + (h.value or 0.0) / float(prices.at[h.ticker])
            for h in holdings
        },
        dtype=float,
    )
    px = prices.reindex(shares.index).astype(float)
    values = shares * px
    total = float(values.sum()) + cash
    if total <= 0:
        raise ValueError("the portfolio is empty")
    return Valued(shares=shares, prices=px, values=values, cash=float(cash), total=total)


@dataclass(frozen=True)
class TradePlan:
    orders: pd.DataFrame
    """Per asset: price, current and target shares, shares to trade, trade value, cost."""
    cash_after: float
    weights_after: pd.Series
    """Including CASH."""
    target: pd.Series
    turnover: float
    """One-way, as a share of the account."""
    total_cost: float
    tracking_gap: float
    """Σ|weight after − target| / 2: how far rounding and skipped trades leave you."""


def trade_list(
    current: Valued,
    target_weights: pd.Series,
    prices: pd.Series,
    *,
    fractional: bool = False,
    min_trade: float = 0.0,
    cost_bps: float = 0.0,
    cash_buffer: float = 0.0,
) -> TradePlan:
    """Orders that move `current` toward `target_weights` (risky assets; the rest is cash)."""
    if not 0 <= cash_buffer < 1:
        raise ValueError("the cash buffer must be between 0% and 100%")
    k = cost_bps / 10_000
    held_names = {str(a) for a in current.shares.index}
    assets = sorted(held_names | {str(a) for a, w in target_weights.items() if w > 0})
    px = prices.reindex(assets).astype(float)
    if px.isna().any():
        raise ValueError(f"no price for {', '.join(a for a in assets if pd.isna(px.at[a]))}")
    held = current.shares.reindex(assets).fillna(0.0)
    raw = target_weights.reindex(assets).fillna(0.0).clip(lower=0.0)
    invest = 1.0 - cash_buffer
    target = raw / raw.sum() * invest if raw.sum() > 0 else raw
    budget = current.total * (1 - k)  # leave room for costs on roughly a full rebalance
    desired = target * budget / px

    new = desired.copy() if fractional else desired.round()
    trade = new - held
    # Skip trades too small to be worth placing.
    small = (trade * px).abs() < min_trade
    new[small] = held[small]

    def cash_after(shares: pd.Series) -> float:
        traded = (shares - held) * px
        return current.cash - float(traded.sum()) - k * float(traded.abs().sum())

    # Whole shares can overshoot the cash available: trim the buys that rounded up most.
    while cash_after(new) < -1e-9:
        buys = (new - held) > 0
        if not buys.any():
            break
        overshoot = ((new - desired) * px).where(buys, -float("inf"))
        a = str(overshoot.idxmax())
        step = 1.0 if not fractional else min(1.0, float(new.at[a] - held.at[a]))
        new[a] -= step
    traded = (new - held) * px
    cost = k * traded.abs()
    after_cash = cash_after(new)
    values_after = new * px
    total_after = float(values_after.sum()) + after_cash
    weights_after = pd.concat(
        [values_after / total_after, pd.Series({"CASH": after_cash / total_after})]
    )
    full_target = pd.concat([target, pd.Series({"CASH": 1.0 - float(target.sum())})])
    orders = pd.DataFrame(
        {
            "price": px,
            "current_shares": held,
            "target_shares": new,
            "trade_shares": new - held,
            "trade_value": traded,
            "cost": cost,
        }
    )
    return TradePlan(
        orders=orders,
        cash_after=after_cash,
        weights_after=weights_after,
        target=full_target,
        turnover=float(traded.abs().sum()) / 2 / current.total,
        total_cost=float(cost.sum()),
        tracking_gap=float(
            (weights_after - full_target.reindex(weights_after.index).fillna(0.0)).abs().sum() / 2
        ),
    )
