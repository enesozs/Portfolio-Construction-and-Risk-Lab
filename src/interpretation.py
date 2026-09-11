from __future__ import annotations

from typing import TYPE_CHECKING

import pandas as pd

if TYPE_CHECKING:
    from src.validation.walk_forward import WalkForwardResult


def portfolio_executive_summary(
    comparison: pd.DataFrame,
    risk_contrib: pd.DataFrame | None = None,
    stability: pd.DataFrame | None = None,
    validation: WalkForwardResult | None = None,
) -> str:
    parts: list[str] = []
    if not comparison.empty:
        best = str(comparison["Expected Sharpe"].idxmax())
        low_risk = str(comparison["Expected Volatility"].idxmin())
        diversified = str(comparison["Diversification Ratio"].idxmax())
        parts.append(
            f"{best} has the strongest model-implied Sharpe ratio, while {low_risk} carries the lowest estimated volatility. "
            f"{diversified} achieves the highest diversification ratio, highlighting that return efficiency, minimum risk, and diversification are distinct portfolio objectives."
        )
    if risk_contrib is not None and not risk_contrib.empty:
        top = str(risk_contrib["risk_contribution_pct"].idxmax())
        pct = float(risk_contrib.loc[top, "risk_contribution_pct"])
        wt = float(risk_contrib.loc[top, "weight"])
        parts.append(
            f"Risk is most concentrated in {top}, which contributes {pct:.1%} of portfolio volatility versus a {wt:.1%} capital weight."
        )
    if stability is not None and not stability.empty:
        unstable = str(stability["std"].idxmax())
        parts.append(
            f"Bootstrap analysis identifies {unstable} as the least stable allocation, so its optimized weight should be treated as sample-sensitive rather than precise."
        )
    if validation is not None:
        perf = validation["performance"]
        parts.append(
            f"Walk-forward validation produced an out-of-sample annual return of {perf['annual_return']:.1%}, "
            f"volatility of {perf['annual_volatility']:.1%}, and Sharpe ratio of {perf['sharpe']:.2f}."
        )
    return " ".join(parts)
