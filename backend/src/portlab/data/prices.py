"""Daily adjusted close prices from Yahoo Finance, cached per ticker.

Every ticker is fetched once for its *full* history and sliced locally, so a crisis replay
from 2008 or a 20-year lookback never needs a second download. Lookups go through three
layers:

1. A fresh cache entry (memory, then disk) younger than `TTL_SECONDS`.
2. Yahoo Finance. Successful downloads refresh the cache.
3. If Yahoo fails: the last cached copy (even an old one), then the snapshot bundled with
   the package (`snapshot/prices.csv.gz`). Results from either are flagged `stale`, so the
   UI can say the data is not current instead of failing.

On a read-only file system (serverless) the disk layer switches itself off.
"""

from __future__ import annotations

import logging
import os
import threading
import time
import warnings
from dataclasses import dataclass
from functools import cache
from pathlib import Path
from typing import cast

import pandas as pd

from portlab._pandas import column

log = logging.getLogger(__name__)

TTL_SECONDS = 12 * 3600
SNAPSHOT_PATH = Path(__file__).with_name("snapshot") / "prices.csv.gz"
CACHE_DIR: Path | None = Path(
    os.environ.get("PORTLAB_CACHE_DIR") or Path(__file__).resolve().parents[4] / ".cache" / "prices"
)
# Tests and screenshots: never touch the network or the disk cache, serve the snapshot.
OFFLINE = bool(os.environ.get("PORTLAB_OFFLINE"))
if OFFLINE:
    CACHE_DIR = None

_memory: dict[str, tuple[float, pd.Series]] = {}
_lock = threading.Lock()


class DataError(ValueError):
    """A ticker has no usable price data (unknown symbol or provider failure)."""


@dataclass(frozen=True)
class PriceHistory:
    prices: pd.DataFrame
    """Adjusted closes, one column per ticker, NaN before each ticker's first trade."""
    stale: frozenset[str]
    """Tickers served from an old cache entry or the bundled snapshot."""


def normalise_ticker(raw: str) -> str:
    return str(raw).strip().upper()


@cache
def _snapshot() -> pd.DataFrame:
    if not SNAPSHOT_PATH.exists():
        return pd.DataFrame()
    frame = pd.read_csv(SNAPSHOT_PATH, index_col=0, parse_dates=True)
    return frame.astype(float)


def snapshot_tickers() -> list[str]:
    return [str(c) for c in _snapshot().columns]


def _disk_path(ticker: str) -> Path | None:
    if CACHE_DIR is None:
        return None
    safe = ticker.replace("^", "_").replace("/", "_")
    return CACHE_DIR / f"{safe}.csv"


def _read_disk(ticker: str) -> tuple[float, pd.Series] | None:
    path = _disk_path(ticker)
    if path is None or not path.exists():
        return None
    try:
        series = pd.read_csv(path, index_col=0, parse_dates=True).iloc[:, 0].astype(float)
    except (OSError, ValueError, IndexError):
        return None
    series.name = ticker
    return path.stat().st_mtime, series


def _write_disk(ticker: str, series: pd.Series) -> None:
    global CACHE_DIR
    path = _disk_path(ticker)
    if path is None:
        return
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        series.to_frame(ticker).to_csv(path)
    except OSError as exc:  # read-only file system: keep the memory layer only
        log.warning("disk price cache disabled: %s", exc)
        CACHE_DIR = None


def _download(tickers: list[str]) -> dict[str, pd.Series]:
    """Full adjusted-close history for each ticker that Yahoo returns data for."""
    import yfinance as yf

    with warnings.catch_warnings():  # yfinance trips pandas deprecation warnings
        warnings.simplefilter("ignore")
        raw = cast(
            pd.DataFrame,
            yf.download(
                tickers,
                period="max",
                auto_adjust=True,
                progress=False,
                group_by="column",
                threads=True,
            ),
        )
    if raw is None or raw.empty:
        return {}
    close = raw["Close"] if "Close" in raw.columns.get_level_values(0) else raw
    if isinstance(close, pd.Series):
        close = close.to_frame(tickers[0])
    out: dict[str, pd.Series] = {}
    for ticker in tickers:
        if ticker not in close.columns:
            continue
        values = cast(pd.Series, pd.to_numeric(column(close, ticker), errors="coerce")).dropna()
        positive = values.to_numpy(dtype=float) > 0
        if int(positive.sum()) >= 2:
            index = pd.DatetimeIndex(values.index[positive]).tz_localize(None).normalize()
            data = values.to_numpy(dtype=float)[positive]
            out[ticker] = pd.Series(data, index=index, name=ticker)
    return out


def load_prices(tickers: list[str]) -> PriceHistory:
    """Full price history for `tickers` (see the module docstring for the cache layers)."""
    symbols = list(dict.fromkeys(normalise_ticker(t) for t in tickers if str(t).strip()))
    if not symbols:
        raise DataError("no tickers given")

    now = time.time()
    found: dict[str, pd.Series] = {}
    stale: set[str] = set()
    fallbacks: dict[str, pd.Series] = {}
    with _lock:
        for ticker in symbols:
            entry = _memory.get(ticker) or _read_disk(ticker)
            if entry is None:
                continue
            stored_at, series = entry
            _memory[ticker] = entry
            if now - stored_at < TTL_SECONDS:
                found[ticker] = series
            else:
                fallbacks[ticker] = series

    missing = [t for t in symbols if t not in found]
    if missing and not OFFLINE:
        try:
            fetched = _download(missing)
        except Exception as exc:  # provider down or rate-limited: fall back below
            log.warning("Yahoo download failed for %s: %s", missing, exc)
            fetched = {}
        with _lock:
            for ticker, series in fetched.items():
                _memory[ticker] = (now, series)
                _write_disk(ticker, series)
        found.update(fetched)

    snapshot = _snapshot()
    unknown: list[str] = []
    for ticker in symbols:
        if ticker in found:
            continue
        if ticker in fallbacks:
            found[ticker] = fallbacks[ticker]
        elif ticker in snapshot.columns:
            found[ticker] = cast(pd.Series, snapshot[ticker]).dropna()
        else:
            unknown.append(ticker)
            continue
        stale.add(ticker)
    if unknown:
        raise DataError(f"no price data for {', '.join(unknown)} (check the ticker symbols)")

    prices = pd.concat([found[t] for t in symbols], axis=1, sort=True)
    prices.columns = symbols
    return PriceHistory(prices=prices, stale=frozenset(stale))


def clear_cache() -> None:
    with _lock:
        _memory.clear()
