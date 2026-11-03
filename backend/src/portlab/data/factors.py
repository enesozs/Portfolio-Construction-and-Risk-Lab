"""Fama–French daily factors (5 factors + momentum) from Kenneth French's data library.

The factors are long-short portfolios of US stocks:
* Mkt-RF: the market's return over one-month T-bills;
* SMB (size): small minus big companies;
* HML (value): high minus low book-to-market;
* RMW (profitability): robust minus weak operating profitability;
* CMA (investment): conservative minus aggressive asset growth;
* Mom (momentum): past winners minus past losers.

They are downloaded once per day (cached in memory and on disk, like prices) and fall back to
the copy bundled in `snapshot/ff_factors.csv.gz` when the library is unreachable.
Returns are converted from percent to decimals.
"""

from __future__ import annotations

import io
import logging
import time
import urllib.request
import zipfile
from dataclasses import dataclass
from functools import cache
from pathlib import Path

import pandas as pd

from portlab.data import prices as price_store

log = logging.getLogger(__name__)

BASE_URL = "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/"
FILES = {
    "five": "F-F_Research_Data_5_Factors_2x3_daily_CSV.zip",
    "momentum": "F-F_Momentum_Factor_daily_CSV.zip",
}
FACTORS = ["Mkt-RF", "SMB", "HML", "RMW", "CMA", "Mom"]
LABELS = {
    "Mkt-RF": "Market",
    "SMB": "Size (small − big)",
    "HML": "Value (cheap − expensive)",
    "RMW": "Profitability (robust − weak)",
    "CMA": "Investment (conservative − aggressive)",
    "Mom": "Momentum (winners − losers)",
}
SNAPSHOT_PATH = Path(__file__).with_name("snapshot") / "ff_factors.csv.gz"
TTL_SECONDS = 24 * 3600

_memory: tuple[float, pd.DataFrame] | None = None


@dataclass(frozen=True)
class FactorData:
    returns: pd.DataFrame
    """Daily factor returns (decimals), columns FACTORS plus RF (the T-bill rate)."""
    stale: bool


def _parse(raw: bytes) -> pd.DataFrame:
    """The library's CSVs have free-text headers and footers around one daily table."""
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        text = z.read(z.namelist()[0]).decode("latin-1")
    lines = text.splitlines()
    start = next(i for i, line in enumerate(lines) if line.startswith(","))
    body = [lines[start]]
    for line in lines[start + 1 :]:
        if not line.strip() or not line.strip()[0].isdigit():
            break
        body.append(line)
    frame = pd.read_csv(io.StringIO("\n".join(body)), index_col=0)
    frame.index = pd.to_datetime(frame.index.astype(str), format="%Y%m%d")
    frame.columns = [c.strip() for c in frame.columns]
    frame = frame.astype(float).mask(frame <= -99.99)
    return frame / 100.0


def download() -> pd.DataFrame:
    parts = []
    for name in FILES.values():
        with urllib.request.urlopen(BASE_URL + name, timeout=20) as response:
            parts.append(_parse(response.read()))
    return pd.concat(parts, axis=1, join="inner", sort=True).loc[:, [*FACTORS, "RF"]]


@cache
def _snapshot() -> pd.DataFrame:
    if not SNAPSHOT_PATH.exists():
        return pd.DataFrame()
    return pd.read_csv(SNAPSHOT_PATH, index_col=0, parse_dates=True).astype(float)


def load_factors() -> FactorData:
    global _memory
    now = time.time()
    if _memory and now - _memory[0] < TTL_SECONDS:
        return FactorData(_memory[1], stale=False)
    if not price_store.OFFLINE:
        try:
            frame = download()
            _memory = (now, frame)
            return FactorData(frame, stale=False)
        except Exception as exc:  # library unreachable: use the last or bundled copy
            log.warning("Fama-French download failed: %s", exc)
    if _memory:
        return FactorData(_memory[1], stale=True)
    snapshot = _snapshot()
    if snapshot.empty:
        raise price_store.DataError("Fama–French factors are unavailable (no network, no snapshot)")
    return FactorData(snapshot, stale=True)
