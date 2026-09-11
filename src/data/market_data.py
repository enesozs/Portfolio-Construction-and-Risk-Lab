from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, cast

import pandas as pd


@dataclass(frozen=True)
class ReturnData:
    prices: pd.DataFrame
    returns: pd.DataFrame


def clean_prices(prices: pd.DataFrame) -> pd.DataFrame:
    if not isinstance(prices, pd.DataFrame) or prices.empty:
        raise ValueError("prices must be a non-empty DataFrame")
    out = prices.copy().sort_index()
    out = out.loc[:, ~out.columns.duplicated()]
    out = out.apply(pd.to_numeric, errors="coerce")
    out = out.dropna(axis=1, how="all").ffill().dropna(how="all")
    if out.shape[1] < 2:
        raise ValueError("at least two usable assets are required")
    if (out <= 0).any().any():
        raise ValueError("prices must be strictly positive")
    return out


def simple_returns(prices: pd.DataFrame) -> pd.DataFrame:
    px = clean_prices(prices)
    rets = px.pct_change(fill_method=None).dropna(how="all")
    return rets.dropna(axis=1, how="all")


def prepare_returns(prices: pd.DataFrame) -> ReturnData:
    px = clean_prices(prices)
    return ReturnData(prices=px, returns=simple_returns(px))


def download_prices(
    tickers: Iterable[str], start: str, end: str | None = None
) -> pd.DataFrame:
    try:
        import yfinance as yf
    except ImportError as exc:
        raise ImportError("Install yfinance to download market data") from exc

    symbols = [str(t).strip().upper() for t in tickers if str(t).strip()]
    if len(symbols) < 2:
        raise ValueError("provide at least two tickers")

    # yfinance's type hints are intentionally broad, while download() returns a
    # DataFrame for this call shape. Narrow it once here so the rest of the
    # module remains statically typed.
    raw = cast(
        pd.DataFrame,
        yf.download(symbols, start=start, end=end, auto_adjust=True, progress=False),
    )
    if raw.empty:
        raise ValueError("no price data returned")

    if isinstance(raw.columns, pd.MultiIndex):
        if "Close" in raw.columns.get_level_values(0):
            raw = raw["Close"]
        elif "Close" in raw.columns.get_level_values(1):
            raw = raw.xs("Close", level=1, axis=1)
    elif "Close" in raw.columns:
        raw = raw[["Close"]]

    if isinstance(raw, pd.Series):
        raw = raw.to_frame()
    return clean_prices(raw)


def download_price_series(ticker: str, start: str, end: str | None = None) -> pd.Series:
    try:
        import yfinance as yf
    except ImportError as exc:
        raise ImportError("Install yfinance to download market data") from exc
    symbol = str(ticker).strip().upper()
    if not symbol:
        raise ValueError("ticker is required")
    raw = cast(
        pd.DataFrame,
        yf.download(symbol, start=start, end=end, auto_adjust=True, progress=False),
    )
    if raw.empty:
        raise ValueError(f"no price data returned for {symbol}")
    if isinstance(raw.columns, pd.MultiIndex):
        if "Close" in raw.columns.get_level_values(0):
            close = raw["Close"]
        elif "Close" in raw.columns.get_level_values(1):
            close = raw.xs("Close", level=1, axis=1)
        else:
            raise ValueError("download did not contain Close prices")
    elif "Close" in raw.columns:
        close = raw[["Close"]]
    else:
        close = raw
    if isinstance(close, pd.DataFrame):
        if close.shape[1] == 0:
            raise ValueError("download did not contain usable prices")
        series = close.iloc[:, 0]
    else:
        series = close
    series = pd.to_numeric(series, errors="coerce").dropna().astype(float)
    series.name = symbol
    return series
