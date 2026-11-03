"""Market values (for the Black–Litterman prior) and groups (for sector/asset-class limits).

Black–Litterman starts from the portfolio the whole market holds, i.e. weights proportional
to market value. Yahoo reports market capitalisation for stocks and total net assets (fund
size) for ETFs; both are used as "size". Tickers with neither fall back to the average size,
and the response says which source each weight came from.
"""

from __future__ import annotations

import json
import logging
import threading
import time
import warnings
from functools import cache
from pathlib import Path

import pandas as pd

from portlab.data import prices as price_store

log = logging.getLogger(__name__)

TTL_SECONDS = 24 * 3600
SNAPSHOT_PATH = Path(__file__).with_name("snapshot") / "market_caps.json"

_memory: dict[str, tuple[float, float | None]] = {}
_lock = threading.Lock()


@cache
def _snapshot_file() -> dict:
    if not SNAPSHOT_PATH.exists():
        return {}
    return json.loads(SNAPSHOT_PATH.read_text())


def _snapshot() -> dict[str, float | None]:
    return _snapshot_file().get("market_caps", {})


_groups: dict[str, tuple[float, str]] = {}


def fetch_group(ticker: str) -> str | None:
    """Sector for a stock, fund category for an ETF (Yahoo's classification)."""
    import yfinance as yf

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        info = yf.Ticker(ticker).info or {}
    if info.get("quoteType") == "ETF":
        return info.get("category") or "ETF"
    return info.get("sector")


def asset_groups(tickers: list[str]) -> dict[str, str]:
    """Group label per ticker: live (cached 24 h), else the snapshot, else "Other"."""
    now = time.time()
    out: dict[str, str] = {}
    snapshot = _snapshot_file().get("groups", {})
    for ticker in tickers:
        with _lock:
            entry = _groups.get(ticker)
        if entry and now - entry[0] < TTL_SECONDS:
            out[ticker] = entry[1]
            continue
        label: str | None = None
        if not price_store.OFFLINE:
            try:
                label = fetch_group(ticker)
            except Exception as exc:
                log.warning("group lookup failed for %s: %s", ticker, exc)
        if label:
            with _lock:
                _groups[ticker] = (now, label)
        out[ticker] = label or snapshot.get(ticker) or "Other"
    return out


def _fetch(ticker: str) -> float | None:
    import yfinance as yf

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        handle = yf.Ticker(ticker)
        try:
            cap = handle.fast_info.get("marketCap")
        except Exception:
            cap = None
        if not cap:
            cap = (handle.info or {}).get("totalAssets")
    return float(cap) if cap else None


def market_values(tickers: list[str]) -> tuple[pd.Series, dict[str, str]]:
    """Size of each ticker (dollars) and where it came from: live, snapshot or fallback."""
    now = time.time()
    values: dict[str, float | None] = {}
    sources: dict[str, str] = {}
    for ticker in tickers:
        with _lock:
            entry = _memory.get(ticker)
        if entry and now - entry[0] < TTL_SECONDS and entry[1]:
            values[ticker], sources[ticker] = entry[1], "live"
            continue
        value: float | None = None
        if not price_store.OFFLINE:
            try:
                value = _fetch(ticker)
            except Exception as exc:
                log.warning("market value lookup failed for %s: %s", ticker, exc)
        if value:
            with _lock:
                _memory[ticker] = (now, value)
            values[ticker], sources[ticker] = value, "live"
        elif _snapshot().get(ticker):
            values[ticker], sources[ticker] = _snapshot()[ticker], "snapshot"
        else:
            values[ticker], sources[ticker] = None, "fallback"

    known = [v for v in values.values() if v]
    filler = sum(known) / len(known) if known else 1.0
    series = pd.Series({t: v or filler for t, v in values.items()}, dtype=float)
    return series, sources
