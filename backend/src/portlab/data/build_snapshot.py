"""Rebuild the bundled offline snapshot: `python -m portlab.data.build_snapshot`.

The snapshot backs tests, screenshots and demos when Yahoo Finance is unreachable. Prices are
stored to 6 significant figures, which keeps the file small (~600 KB) without changing any
return beyond the 6th digit.
"""

from __future__ import annotations

import json

import pandas as pd

from portlab.data import fundamentals, prices

TICKERS = [
    *["AAPL", "MSFT", "NVDA", "JNJ", "XOM", "TLT", "TSLA", "GOOGL", "AMZN", "META", "JPM"],
    *["SPY", "QQQ", "IWM", "IWD", "IWF", "MTUM", "QUAL", "SPLV"],
    *["EFA", "EEM", "AGG", "IEF", "SHY", "GLD", "VNQ", "DBC", "^IRX"],
]
START = "1995-01-01"


def main() -> None:
    fetched = prices._download(TICKERS)
    missing = sorted(set(TICKERS) - set(fetched))
    if missing:
        raise SystemExit(f"Yahoo returned no data for {', '.join(missing)}; not overwriting")
    frame = pd.concat(fetched, axis=1).sort_index().loc[START:]
    frame.index.name = "date"
    prices.SNAPSHOT_PATH.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(prices.SNAPSHOT_PATH, float_format="%.6g")

    caps = {t: fundamentals._fetch(t) for t in TICKERS if not t.startswith("^")}
    payload = {
        "as_of": str(frame.index[-1].date()),
        "note": "Equities: market capitalisation. ETFs: total net assets (fund size).",
        "market_caps": {t: None if v is None else round(v, -6) for t, v in caps.items()},
    }
    fundamentals.SNAPSHOT_PATH.write_text(json.dumps(payload, indent=1) + "\n")
    print(f"snapshot: {frame.shape[1]} series, {frame.index[0].date()} → {payload['as_of']}")


if __name__ == "__main__":
    main()
