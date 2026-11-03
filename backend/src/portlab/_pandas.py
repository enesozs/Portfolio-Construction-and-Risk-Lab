"""Narrowing helpers for pandas' broad return types (keeps call sites readable)."""

from __future__ import annotations

from datetime import date
from typing import Any, cast

import pandas as pd


def column(frame: pd.DataFrame, name: Any) -> pd.Series:
    """`frame[name]` for a single, unique column label."""
    return cast(pd.Series, frame[name])


def to_date(value: Any) -> date:
    stamp = pd.Timestamp(value)
    if pd.isna(stamp):
        raise ValueError("missing date")
    return date(int(stamp.year), int(stamp.month), int(stamp.day))
