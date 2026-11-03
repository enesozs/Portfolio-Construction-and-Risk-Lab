"""Every endpoint answers on the bundled snapshot (offline), with sane numbers."""

import pytest
from fastapi.testclient import TestClient

from portlab_api.main import app

client = TestClient(app)
UNIVERSE = {"tickers": ["AAPL", "MSFT", "JNJ", "XOM", "TLT"], "start": "2018-01-01"}


def post(path: str, **body):
    response = client.post(f"/api{path}", json={"universe": UNIVERSE, **body})
    assert response.status_code == 200, response.text
    return response.json()


def test_meta_and_health() -> None:
    assert client.get("/api/health").json() == {"status": "ok"}
    meta = client.get("/api/meta").json()
    assert {a["key"] for a in meta["allocators"]} >= {"max_sharpe", "hrp"}
    assert "Global Financial Crisis" in meta["crises"]


def test_overview_reports_alignment_and_cash() -> None:
    out = post("/universe/overview")
    assert out["meta"]["risk_free_source"].startswith("13-week")
    assert len(out["correlation"]) == 5
    assert out["growth"]["AAPL"]["values"][0] > 0
    assert post("/universe/dependency", window=63)["latest_regime"]


def test_portfolios_are_fully_invested_and_ranked() -> None:
    out = post("/construction/portfolios")
    assert len(out["portfolios"]) == 6
    for p in out["portfolios"]:
        assert sum(p["weights"].values()) == pytest.approx(1, abs=1e-5)
    assert len(out["frontier"]) > 5
    assert {r["objective"] for r in out["rankings"]} >= {"sharpe", "volatility"}


@pytest.mark.parametrize(
    ("path", "body"),
    [
        ("/construction/estimators", {"method": "min_variance"}),
        (
            "/construction/black-litterman",
            {"views": [{"asset": "XOM", "expected_return": 0.15, "confidence": 0.6}]},
        ),
        ("/construction/tail-risk", {"confidence": 0.95}),
        ("/construction/robust", {}),
        ("/construction/turnover", {"max_turnover": 0.1}),
        (
            "/construction/risk-budget",
            {"budgets": {"AAPL": 2, "MSFT": 1, "JNJ": 1, "XOM": 1, "TLT": 1}},
        ),
        ("/risk/decomposition", {"portfolio": "risk_parity"}),
        ("/risk/vol-target", {"portfolio": "max_sharpe", "target_volatility": 0.08}),
        ("/risk/stress", {"portfolio": "equal_weight"}),
        ("/risk/scenario", {"portfolio": "equal_weight", "shocks": {"AAPL": -0.3}}),
        ("/risk/simulation", {"portfolio": "hrp", "n_paths": 400, "horizon_days": 63}),
        ("/validation/walk-forward", {"method": "risk_parity"}),
        ("/validation/rebalancing", {"portfolio": "equal_weight"}),
        ("/validation/bootstrap", {"method": "min_variance", "n_bootstrap": 20}),
        ("/attribution/benchmark", {"portfolio": "equal_weight"}),
        ("/attribution/factors", {"portfolio": "equal_weight"}),
        ("/report", {"portfolio": "max_sharpe"}),
    ],
)
def test_endpoint_answers(path: str, body: dict) -> None:
    post(path, **body)


def test_black_litterman_view_raises_that_asset() -> None:
    view = [{"asset": "XOM", "expected_return": 0.30, "confidence": 0.9}]
    out = post("/construction/black-litterman", views=view)
    assert out["posterior"]["XOM"] > out["equilibrium"]["XOM"]
    assert out["prior_sources"]["TLT"] == "snapshot"


def test_crises_replay_before_the_research_window() -> None:
    crises = {c["name"]: c for c in post("/risk/crises", portfolio="equal_weight")["crises"]}
    gfc = crises["Global Financial Crisis"]
    assert gfc["error"] is None and gfc["max_drawdown"] < -0.2
    assert gfc["missing"] == []


def test_vol_target_puts_the_rest_in_cash() -> None:
    out = post("/risk/vol-target", portfolio="max_sharpe", target_volatility=0.05)
    assert out["volatility"] == pytest.approx(0.05, rel=1e-3)
    assert out["weights"]["CASH"] > 0


def test_user_errors_are_422_with_a_message() -> None:
    bad = {"tickers": ["AAPL", "NOTATICKER"], "start": "2018-01-01"}
    response = client.post("/api/universe/overview", json={"universe": bad})
    assert response.status_code == 422
    assert "NOTATICKER" in response.json()["detail"]
    capped = {**UNIVERSE, "max_weight": 0.1}
    response = client.post("/api/construction/portfolios", json={"universe": capped})
    assert response.status_code == 422
    assert "cannot add up to 100%" in response.json()["detail"]
