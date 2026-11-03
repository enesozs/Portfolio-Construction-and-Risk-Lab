import numpy as np
import pandas as pd
import pytest

from portlab.estimators.estimates import estimate
from portlab.optimization.registry import ALLOCATORS, Constraints, allocate


def _estimates():
    rng = np.random.default_rng(7)
    r = pd.DataFrame(rng.normal(0.0004, 0.01, size=(400, 4)), columns=list("ABCD"))
    return estimate(r, risk_free=0.02)


@pytest.mark.parametrize("key", list(ALLOCATORS))
def test_every_allocator_is_fully_invested(key: str) -> None:
    w = allocate(key, _estimates(), Constraints(max_weight=0.6))
    assert w.index.tolist() == list("ABCD")
    assert float(w.sum()) == pytest.approx(1.0, abs=1e-6)


def test_allocator_errors_are_not_swallowed() -> None:
    # 4 assets capped at 20% cannot sum to 100%: this must surface, not silently fall back.
    with pytest.raises(ValueError):
        allocate("min_cvar", _estimates(), Constraints(max_weight=0.2))
