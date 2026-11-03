"""Static choices the frontend needs: allocators, crises, bundled tickers."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from portlab.data.prices import snapshot_tickers
from portlab.optimization.registry import ALLOCATORS
from portlab.risk.scenarios import HISTORICAL_CRISES

router = APIRouter(tags=["meta"])


class AllocatorOut(BaseModel):
    key: str
    label: str
    uses_expected_returns: bool


class MetaResponse(BaseModel):
    allocators: list[AllocatorOut]
    crises: dict[str, tuple[str, str]]
    snapshot_tickers: list[str]


@router.get("/meta")
def meta() -> MetaResponse:
    return MetaResponse(
        allocators=[
            AllocatorOut(key=s.key, label=s.label, uses_expected_returns=s.uses_expected_returns)
            for s in ALLOCATORS.values()
        ],
        crises=HISTORICAL_CRISES,
        snapshot_tickers=[t for t in snapshot_tickers() if not t.startswith("^")],
    )
