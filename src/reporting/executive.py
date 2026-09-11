from __future__ import annotations

import pandas as pd


def build_research_report(
    tickers: list[str],
    summary: pd.DataFrame,
    selected_portfolio: str,
    risk_table: pd.DataFrame,
    diversification: dict[str, float],
    robustness_note: str | None = None,
    validation_note: str | None = None,
    stress_note: str | None = None,
    attribution_note: str | None = None,
) -> str:
    best_sharpe = str(summary["Expected Sharpe"].idxmax())
    min_vol = str(summary["Expected Volatility"].idxmin())
    max_div = str(summary["Diversification Ratio"].idxmax())
    largest_risk = str(risk_table["risk_contribution_pct"].idxmax())
    largest_rc = float(risk_table.loc[largest_risk, "risk_contribution_pct"])
    largest_w = float(risk_table.loc[largest_risk, "weight"])
    sections = [
        "# Portfolio Research Report",
        "",
        f"**Universe:** {', '.join(tickers)}",
        f"**Selected portfolio:** {selected_portfolio}",
        "",
        "## Executive Summary",
        f"- **{best_sharpe}** has the highest model-implied Sharpe ratio in the current estimator setup.",
        f"- **{min_vol}** has the lowest estimated volatility, while **{max_div}** has the highest diversification ratio.",
        f"- **{largest_risk}** contributes {largest_rc:.1%} of total portfolio volatility versus a {largest_w:.1%} capital weight in the selected portfolio.",
        f"- The selected portfolio has an effective asset count of {diversification['effective_assets_hhi']:.2f} and weighted average correlation of {diversification['weighted_average_correlation']:.2f}.",
        "",
        "## Interpretation",
        "Portfolio objectives are not interchangeable: return efficiency, minimum variance, tail protection, diversification, allocation stability, and implementation cost can favor different allocations.",
    ]
    optional = [
        ("Robustness", robustness_note),
        ("Out-of-Sample Validation", validation_note),
        ("Stress & Scenarios", stress_note),
        ("Attribution", attribution_note),
    ]
    for title, note in optional:
        if note:
            sections.extend(["", f"## {title}", note])
    sections.extend([
        "",
        "## Research Caveat",
        "All results are historical/model-based research outputs. They are sensitive to data, estimator choice, constraints, transaction-cost assumptions, and regime changes; they are not investment advice.",
    ])
    return "\n".join(sections)
