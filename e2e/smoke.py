"""Browser smoke test: visit every page and fail on any console error, bad response or error box.

Needs the dev servers running (`make dev`) and Google Chrome installed. Run with `make e2e`.
Usage: python e2e/smoke.py [base_url] [screenshot_dir]
"""

import sys
from pathlib import Path

from playwright.sync_api import ConsoleMessage, Page, Response, expect, sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5183"
SHOTS = Path(sys.argv[2]) if len(sys.argv) > 2 else None

PAGES = [
    ("/universe", "Universe"),
    ("/construct", "Portfolio construction"),
    ("/construct/estimators", None),
    ("/construct/black-litterman", None),
    ("/construct/tail-risk", None),
    ("/construct/robust", None),
    ("/construct/risk-budget", None),
    ("/dynamic", "Dynamic allocation"),
    ("/risk", None),
    ("/risk/stress", None),
    ("/risk/crises", None),
    ("/risk/simulation", None),
    ("/validate", None),
    ("/validate/rebalancing", None),
    ("/validate/bootstrap", None),
    ("/attribution", None),
    ("/report", None),
]


def shot(page: Page, name: str) -> None:
    if SHOTS:
        SHOTS.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=SHOTS / f"{name}.png", full_page=True)


def settle(page: Page) -> None:
    """Wait for the debounced queries to fire and every API request to finish.

    (`wait_for_load_state("networkidle")` returns at once after the first load, so it cannot
    see requests that start later.)
    """
    page.wait_for_timeout(700)
    page.wait_for_function("() => (window.__portlabPending ?? 0) === 0", timeout=60_000)


def main() -> int:
    problems: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel="chrome")
        page = browser.new_page(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce")
        page.add_init_script("localStorage.clear()")
        # Count in-flight /api requests so settle() can wait for every one, however late it starts.
        page.add_init_script("""
            window.__portlabPending = 0;
            const original = window.fetch;
            window.fetch = async (...args) => {
                window.__portlabPending++;
                try { return await original(...args); } finally { window.__portlabPending--; }
            };
        """)

        def on_console(message: ConsoleMessage) -> None:
            if message.type == "error":
                problems.append(f"{page.url}: console: {message.text}")

        def on_response(response: Response) -> None:
            if response.status >= 400 and "/api/" in response.url:
                problems.append(f"{page.url}: HTTP {response.status} {response.url}")

        page.on("console", on_console)
        page.on("pageerror", lambda e: problems.append(f"{page.url}: page error: {e}"))
        page.on("response", on_response)

        # Every page renders without errors on the default universe.
        page.goto(BASE)
        expect(page).to_have_url(f"{BASE}/universe")
        for path, heading in PAGES:
            page.goto(BASE + path)
            settle(page)
            if heading:
                expect(page.get_by_role("heading", level=1)).to_have_text(heading)
            alerts = page.get_by_role("alert").filter(has_text="Could not")
            if alerts.count():
                problems.append(f"{path}: {alerts.first.inner_text()}")
            shot(page, path.strip("/").replace("/", "_"))

        # The universe bar applies a preset to every page, and flags a late listing.
        page.goto(f"{BASE}/universe")
        page.get_by_role("button", name="Edit universe").click()
        page.get_by_role("button", name="Growth + defensives").click()
        page.get_by_label("Start date").fill("2005-01-03")
        page.get_by_role("button", name="Apply").click()
        settle(page)
        expect(page.get_by_text("The sample is shorter than requested")).to_be_visible()
        expect(page.get_by_text("TSLA first traded on")).to_be_visible()
        page.get_by_role("link", name="Construct").first.click()
        settle(page)
        expect(page.get_by_role("cell", name="Maximum Sharpe")).to_be_visible()

        # Constraints apply everywhere; methods that cannot honour them are flagged.
        page.get_by_role("button", name="Edit universe").click()
        page.get_by_role("radio", name="Long-short").click()
        page.get_by_role("button", name="Apply").click()
        settle(page)
        expect(page.get_by_text("long-short (≤20% short, 1.6× gross)")).to_be_visible()
        expect(page.get_by_text("unconstrained").first).to_be_visible()
        shot(page, "construct_long_short")

        # Dynamic allocation: a preset runs a ranking strategy end to end.
        page.get_by_role("link", name="Dynamic").first.click()
        settle(page)
        page.get_by_role("button", name="Dual momentum (top 3)").click()
        settle(page)
        expect(page.get_by_text("deflated for 15 variants")).to_be_visible()
        expect(page.get_by_role("columnheader", name="Score")).to_be_visible()
        shot(page, "dynamic_dual_momentum")

        # Bad input is reported, not crashed on.
        page.get_by_role("button", name="Edit universe").click()
        page.get_by_label("Tickers").fill("AAPL")
        expect(page.get_by_text("Enter at least two tickers.")).to_be_visible()
        expect(page.get_by_role("button", name="Apply")).to_be_disabled()

        browser.close()

    for problem in problems:
        print("✗", problem)
    print("smoke:", "FAILED" if problems else "all pages OK")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
