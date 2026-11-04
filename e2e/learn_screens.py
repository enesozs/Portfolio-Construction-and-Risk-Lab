"""Capture a screenshot of every page and the position of each region, for the Learn tours.

The page guides (frontend/src/content/guides) draw numbered markers over these screenshots and
refer to regions by key:
- "panel": the inputs on the left;
- "stats": the row of headline tiles;
- "universe-bar": the shared universe strip;
- otherwise a card's heading.

Re-run after UI changes (`make learn-shots`, with `make dev` running). Pages use the default
universe, so the tours show the numbers a first-time visitor sees.

Usage: python e2e/learn_screens.py [base_url]
"""

import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
IMAGES = ROOT / "frontend" / "public" / "learn"
MANIFEST = ROOT / "frontend" / "src" / "features" / "learn" / "screens.json"

# Screenshot id → page. Ids start with the area's path; that links each tour to its chapter.
PAGES = {
    "universe-overview": "/universe",
    "construct-portfolios": "/construct",
    "construct-estimators": "/construct/estimators",
    "construct-black-litterman": "/construct/black-litterman",
    "construct-tail-risk": "/construct/tail-risk",
    "construct-robust": "/construct/robust",
    "construct-risk-budget": "/construct/risk-budget",
    "dynamic-allocation": "/dynamic",
    "risk-decomposition": "/risk",
    "risk-stress": "/risk/stress",
    "risk-crises": "/risk/crises",
    "risk-var": "/risk/var",
    "risk-simulation": "/risk/simulation",
    "validate-walk-forward": "/validate",
    "validate-rebalancing": "/validate/rebalancing",
    "validate-bootstrap": "/validate/bootstrap",
    "validate-compare": "/validate/compare",
    "attribution-benchmark": "/attribution",
    "report-research": "/report",
    "plan-holdings": "/plan",
    "plan-goals": "/plan/goals",
}

# Count in-flight fetches so each page is captured only after every result has arrived.
TRACK_FETCH = """
window.__portlabPending = 0;
const original = window.fetch;
window.fetch = async (...args) => {
    window.__portlabPending++;
    try { return await original(...args); } finally { window.__portlabPending--; }
};
"""

REGIONS_JS = """
() => {
  const box = (el) => {
    const r = el.getBoundingClientRect()
    return [r.left + scrollX, r.top + scrollY, r.width, r.height].map(Math.round)
  }
  const regions = []
  const bar = document.querySelector('[data-tour=universe-bar]')
  if (bar) regions.push({ key: 'universe-bar', box: box(bar) })
  const panel = document.querySelector('main aside')
  if (panel) regions.push({ key: 'panel', box: box(panel) })
  const stats = document.querySelector('main [data-tour=stats]')
  if (stats) regions.push({ key: 'stats', box: box(stats) })
  for (const card of document.querySelectorAll('main [data-slot=card]')) {
    if (card.closest('aside')) continue
    const h = card.querySelector('h2')
    if (h) regions.push({ key: h.textContent.trim(), box: box(card) })
  }
  const root = document.documentElement
  return { width: root.scrollWidth, height: root.scrollHeight, regions }
}
"""


def main() -> int:
    base = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5183"
    only = set(sys.argv[2:])
    IMAGES.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome")
        page = browser.new_page(
            viewport={"width": 1280, "height": 900},
            color_scheme="light",
            reduced_motion="reduce",
        )
        page.add_init_script("localStorage.clear()")
        page.add_init_script(TRACK_FETCH)
        for key, path in PAGES.items():
            if only and key not in only:
                continue
            page.goto(base + path)
            page.wait_for_timeout(900)  # debounced queries fire
            page.wait_for_function("() => window.__portlabPending === 0", timeout=120_000)
            page.wait_for_timeout(600)
            page.screenshot(path=IMAGES / f"{key}.jpg", full_page=True, type="jpeg", quality=72)
            manifest[key] = {"path": path, **page.evaluate(REGIONS_JS)}
            print(f"✓ {key}: {len(manifest[key]['regions'])} regions")
        browser.close()
    MANIFEST.write_text(json.dumps(manifest, indent=1, ensure_ascii=False) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
