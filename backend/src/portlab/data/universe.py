"""The research universe: aligned daily returns plus the cash (T-bill) return beside them.

Every analysis needs returns on *common* dates, so the sample starts when the youngest asset
started trading. That truncation used to happen silently; `Universe` now records each
ticker's first price and which tickers pushed the start date later than requested.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

import pandas as pd

from portlab._pandas import column, to_date
from portlab.data.prices import DataError, PriceHistory, load_prices, normalise_ticker

RISK_FREE_TICKER = "^IRX"
"""13-week US Treasury bill yield (percent, discount basis): the cash rate."""
TRADING_DAYS = 252
MIN_OBSERVATIONS = 60


@dataclass(frozen=True)
class Universe:
    tickers: list[str]
    prices: pd.DataFrame
    returns: pd.DataFrame
    """Daily simple returns on dates where every asset traded."""
    cash_returns: pd.Series
    """Daily return of holding T-bills on the same dates."""
    risk_free: float
    """Annualised average cash rate over the sample (used for Sharpe ratios and max Sharpe)."""
    risk_free_source: str
    inception: dict[str, date]
    requested_start: date
    limiting: list[str]
    """Tickers whose first trade came after `requested_start`, moving the sample start."""
    stale: list[str] = field(default_factory=list)

    @property
    def start(self) -> date:
        return to_date(self.returns.index[0])

    @property
    def end(self) -> date:
        return to_date(self.returns.index[-1])


def parse_tickers(raw: list[str] | str) -> list[str]:
    items = raw.replace(";", ",").replace(" ", ",").split(",") if isinstance(raw, str) else raw
    return list(dict.fromkeys(normalise_ticker(t) for t in items if str(t).strip()))


def cash_rate_series(history: PriceHistory, index: pd.DatetimeIndex) -> pd.Series | None:
    """Annual T-bill yield (decimal) on `index`, or None when unavailable."""
    if RISK_FREE_TICKER not in history.prices.columns:
        return None
    rate = column(history.prices, RISK_FREE_TICKER).dropna() / 100.0
    if rate.empty:
        return None
    aligned = rate.reindex(rate.index.union(index)).ffill().reindex(index)
    return aligned.bfill().clip(lower=0.0)


def build_universe(
    tickers: list[str] | str,
    start: date | str,
    end: date | str | None = None,
    *,
    risk_free: float | None = None,
    history: PriceHistory | None = None,
) -> Universe:
    """Load and align `tickers` between `start` and `end`.

    `risk_free` (annual, decimal) overrides the T-bill series with a constant cash rate.
    """
    symbols = parse_tickers(tickers)
    if len(symbols) < 2:
        raise DataError("enter at least two tickers")
    requested_start = to_date(start)
    history = history or load_prices([*symbols, RISK_FREE_TICKER])

    prices = history.prices.loc[:, symbols]
    inception = {t: to_date(column(prices, t).first_valid_index()) for t in symbols}
    window = prices.loc[pd.Timestamp(start) : pd.Timestamp(end) if end else None]
    # Fill short gaps (exchange holidays that differ between listings), never leading NaNs.
    window = window.ffill(limit=5)
    returns = window.pct_change(fill_method=None).dropna(how="any")
    if len(returns) < MIN_OBSERVATIONS:
        raise DataError(
            f"only {len(returns)} common trading days between the start date and today; "
            f"need at least {MIN_OBSERVATIONS}. Move the start date earlier."
        )
    limiting = sorted(
        (t for t in symbols if inception[t] > requested_start), key=lambda t: inception[t]
    )

    index = pd.DatetimeIndex(returns.index)
    if risk_free is not None:
        annual = pd.Series(float(risk_free), index=index)
        source = "manual"
    else:
        series = cash_rate_series(history, index)
        if series is None:
            annual = pd.Series(0.0, index=index)
            source = "unavailable (0%)"
        else:
            annual = series
            source = "13-week T-bill (^IRX)"
    cash_returns = (annual / TRADING_DAYS).rename("CASH")

    return Universe(
        tickers=symbols,
        prices=window.loc[returns.index[0] - pd.Timedelta(days=7) :].dropna(how="any"),
        returns=returns,
        cash_returns=cash_returns,
        risk_free=float(annual.mean()),
        risk_free_source=source,
        inception=inception,
        requested_start=requested_start,
        limiting=limiting,
        stale=sorted(history.stale.intersection(symbols)),
    )
