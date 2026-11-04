# AGENTS.md — Portfolio Construction & Risk Lab

Reference for any agent (or human) working on this project. Read this before changing code.
Keep it current: when a roadmap item is finished or a decision changes, update this file in the same change.

---

## 1. Goal

A **portfolio research lab**: a tested Python library (`portlab`), an HTTP API over it, and a web app
covering the whole portfolio-management loop:

- **Construction:** how to allocate capital.
- **Risk:** where the risk comes from.
- **Robustness and validation:** how much to trust an allocation.
- **Dynamic allocation:** how to move between holdings over time based on signals.
- **Planning:** what it means for a real investor's holdings and goals.

It is an **educational research tool**, not investment advice. Priorities, in order:

1. **Correctness.** Every number has a test that pins it to a closed form, an independent
   implementation, or a property it must satisfy. Look-ahead and silent data truncation count as bugs.
2. **Honesty about evidence.** Backtests are compared against buy-and-hold of the same universe, after
   costs and against cash. When many configurations are tried, report the selection bias (deflated
   Sharpe, PBO).
3. **Clarity.** Code reads like the math. Docstrings and UI copy explain *why*. The owner is learning
   the subject while building it.
4. **Polish and performance**, only after 1–3.

---

## 2. Current state (2026-11-03)

- **All six roadmap steps are done**, plus a **Learn** course (2026-11-04).
- **Eight areas, 21 pages**:
  - Universe: overview.
  - Construct: portfolios, estimators, Black–Litterman, tail risk, robust & turnover, risk budgets.
  - Dynamic: dynamic allocation.
  - Risk: decomposition, stress & scenarios, crisis replay, VaR backtest, Monte Carlo.
  - Validate: walk-forward, rebalancing, stability, compare methods.
  - Attribution: benchmark + Fama–French factor lab.
  - Plan: my portfolio, goal planner.
  - Report.
- **Learn** (`/learn`), modelled on project 05:
  - **Start here:** the shared universe, the page layout, units, chart conventions, and what the
    numbers are and are not.
  - **7 chapters**, each with two tabs:
    - *Using the pages*: a tour of every page in the area (purpose, workflow, an annotated
      screenshot with numbered regions), then experiments;
    - *Theory*: the `docs/0N-*.md` note, rendered with KaTeX.
  - **Glossary:** searchable, with links to pages.
  - Every area's tab row links to its chapter ("Learn this area").
- **Possible next steps** (not scheduled):
  - a shared `SeriesPicker` (the ≤4-line chip picker is duplicated in the compare and factor
    pages);
  - `HistogramChart` with `yName` and exact markers;
  - a `blocks` field in the PBO response;
  - "unconstrained" flags on the compare table;
  - ECharts dataZoom;
  - CPCV, which was not built (CSCV/PBO covers the overfitting question);
  - DCC-GARCH;
  - a "today" (EWMA) component VaR;
  - deployment to ozsoy.org.

## 3. Architecture

```text
backend/
  src/portlab/            the library (no web dependencies)
    data/                 prices (Yahoo, cached per ticker, bundled snapshot), universe, market values
    estimators/           expected returns, covariance (sample, EWMA, Ledoit–Wolf), Estimates bundle
    optimization/         allocators + registry (one signature: (Estimates, Constraints) -> weights)
    backtest.py           the one daily portfolio simulator (drift, costs, cash)
    validation/           walk-forward, rebalancing policies
    risk/  research/  robustness/  simulation/  portfolio/  allocation/  reporting/
  src/portlab_api/        FastAPI routes + pydantic schemas (step 2)
  tests/                  pytest, offline (PORTLAB_OFFLINE=1, set in conftest)
frontend/
  src/areas.ts            route table: every area and page (drives the router and tabs)
  src/features/<area>/    one file per page (`<name>-page.tsx`, default export)
  src/features/universe/  universe-context.ts (shared universe, useLab, useOverview), provider, bar
  src/lib/api.ts          typed client; types generated into src/lib/api-types.ts
  src/components/charts/  echart wrapper, theme (palette), TimeChart, WeightBars,
                          AllocationStack, CorrelationHeatmap, LinesChart, HistogramChart
e2e/smoke.py              every page, no console/API errors, universe editor, constraints, a
                          dynamic preset (settle() counts in-flight fetches)
```

Same stack and conventions as 05 (Derivatives Pricing Lab) and 06 (Tessera). Copy patterns from there.

### Conventions (decided, don't re-litigate)

- **Returns:** daily simple returns. Annualise with 252.
- **Cash and risk-free rate:** cash earns the 13-week T-bill yield (`^IRX`) day by day.
  - Sharpe and Sortino are measured on returns *in excess of cash*.
  - `Universe.risk_free` is the sample-average cash rate. Max Sharpe and Sharpe ratios use it, and the
    user can override it.
- **Backtests** (`portlab.backtest.run_backtest`) follow these rules everywhere:
  - Weights drift with prices between trades.
  - A decision at day *t*'s close uses data through *t* and earns from *t+1*.
  - Costs are `cost_bps` per dollar traded, on risky assets.
  - Turnover is reported one-way.
  - Unallocated weight is `CASH`.
- **Universe alignment:** analyses use dates where every asset traded. The `Universe` records each
  ticker's first trade and which tickers moved the start date (`limiting`). The UI must show this.
- **Crisis replays** use each asset's full history, independent of the research window. Assets that
  had not listed yet are dropped, their weight is redistributed, and this is reported.
- **Allocators** are called only through `optimization.registry.allocate(key, estimates, constraints)`.
  Never catch broad exceptions around them. Infeasible constraints raise `InfeasibleError` (a
  ValueError, so 422 with the message). New convex methods must build their constraints with
  `convex._feasible` so every rule means the same thing everywhere.
- **Data:** `data/prices.py` fetches each ticker's full history once and caches it in memory and on
  disk (12 h). If Yahoo fails, it serves the last copy, then the bundled snapshot
  (`data/snapshot/prices.csv.gz`), flagged as stale.
  - The snapshot covers 28 common tickers back to 1995, plus `^IRX`.
  - Regenerate it with the script in §6.
- **Monte Carlo:** asset-level (normal / joint Student-t / t-copula / regime / block bootstrap). Every
  headline number has a batch-means standard error.
- **Long-horizon planning** must not silently use a short sample's mean: the planner defaults to an
  explicit return assumption and shows the sample's mean beside it.
- **Signals** are computed on each asset's *full* price history (`load_prices`), so long windows
  are ready at the sample start. A value on day t uses closes ≤ t (tested for every signal by
  truncation).
- **Dynamic results** are always judged against the base rebalanced on the same schedule; the
  headline probability is deflated for the grid. Keep it that way.
- **Frontend data:** pages query only through `useLab(name, api.x, params)`.
  - It adds the shared universe and debounces the *serialised* params, so inline object literals
    are fine.
  - Previous results stay visible, dimmed, while refetching.
- **API types** are generated (`make api-types`) after any pydantic schema change. Never edit
  `api-types.ts` by hand.
- **Learn content** lives in one file per area, so areas can be edited independently:
  - `frontend/src/content/guides/<area>.ts`: page tours. Region keys are `panel`, `stats`,
    `universe-bar`, or a card heading (exact, or `match: 'prefix'`).
  - `frontend/src/content/glossary/<area>.ts`: glossary terms.
  - `frontend/src/features/learn/chapters/<id>.ts`: summary and experiments.
  - `docs/0N-*.md`: theory.

  When a page changes:
  - Run `make learn-shots` (with `make dev` running). It re-captures
    `frontend/public/learn/*.jpg` and `features/learn/screens.json`.
  - Update the tour if a card heading changed. In dev, an unmatched region logs a console
    error, which fails `make e2e`.
  - Experiments quote control names, so re-check them after renaming a control.
  - Each chart's own "How to read this chart" text stays inline (`guide` prop); tours explain
    the page as a whole.
- **Charts** follow the dataviz rules:
  - Categorical palette in `theme.ts`: eight slots assigned by universe order (`assetColor`); past
    eight, assets fold into "Other".
  - Weight comparisons put assets on the axis, with at most 4 allocations as series.
  - No dual axes.
  - Every card has a `guide` ("How to read this chart").
  - Log axes switch on only when the data spans more than 10×.
  - Charts honour `prefers-reduced-motion`; the e2e and screenshot runs use it.

---

## 4. Roadmap

Six steps, one commit each (the owner allows committing at milestones without asking).

1. **Fixes and restructure. Done.**
   - Library moved to `backend/src/portlab`; Streamlit removed; scikit-learn dropped (Ledoit–Wolf is
     implemented directly and matches sklearn to 1e-19).
   - Risk-free rate throughout; Sortino uses downside deviation; drawdown counts a first-day loss.
   - One backtest engine: drift and turnover vs drifted weights in walk-forward; costs per dollar traded.
   - Allocator registry (no `except TypeError` fallback).
   - Universe truncation reported; crisis replay redistributes missing assets.
   - Two crises added: dot-com bust and the 2025 tariff shock.
   - Asset-level Monte Carlo with standard errors.
   - Market values for the Black–Litterman prior: Yahoo market cap for stocks, fund size for ETFs.
2. **Web app at parity. Done.**
   - API and frontend:
     - FastAPI routes for every lab, each with an offline API test.
     - React app on one shared universe (universe bar and editor dialog), 16 pages.
     - Types generated from OpenAPI.
   - Tooling: Dockerfile, render.yaml, vercel.json, Makefile, e2e smoke, README with screenshots.
   - Fixes found while building:
     - The robust MV standard error was annualised wrongly (√252 too small).
     - Black–Litterman τ cancels from the posterior mean, so the control was removed.
     - Jensen's alpha is now over cash.
     - Crisis recovery is measured past the window.
     - The `useLab` debounce compared objects by identity, causing a re-render loop.
3. **Optimizer core on cvxpy. Done.**
   - `optimization/convex.py`: one `Constraints` → cvxpy translation (`_feasible`).
     - Min variance, max Sharpe and max diversification (Cornuéjols–Tütüncü y = κw), mean-variance.
     - Min CVaR (Rockafellar–Uryasev LP), Kelly (log growth), robust MV (SOC).
     - Spinu risk parity with an SLSQP fallback when caps bind.
     - Turnover-aware rebalancing, with the cost in annual-return units for both objectives.
     - Efficient frontier.
     - Max holdings uses the solve → keep largest → re-solve heuristic.
   - `optimization/hierarchical.py`: HERC (Raffinot), NCO (López de Prado), Michaud resampling.
   - SLSQP modules deleted (optimizers, frontier, turnover, robust, risk_budgeting, cvar).
     `risk/tail.py` keeps historical VaR/CVaR.
   - Universe-level `constraints`:
     - long-short with a max short and a gross cap, and a group cap (sector/fund category from
       `data/fundamentals.asset_groups`, snapshot fallback);
     - max holdings, and tracking error vs equal weight.
   - The registry flags `respects_constraints`; the UI marks HRP/HERC/NCO/equal weight as
     "unconstrained" when constraints are active.
   - The allocation stack draws shorts left of 0%.
4. **Dynamic (tactical) allocation. Done.** The user picks the universe; the system moves weight
   between those assets *and cash* based on signals.
   - Library:
     - `signals.py`: a catalogue of 7 timing and 4 ranking signals, with parameter ranges and a
       "primary" window for the grid.
     - `dynamic.py`: `DynamicSpec`, `target_weights`, `run_dynamic`.
     - `validation/sharpe_tests.py`: PSR and DSR, ported from 02.
   - Evaluation:
     - Strategy vs the same base rebalanced on the same schedule (the signals' contribution),
       buy-and-hold and cash.
     - PSR of the daily active return, and DSR of it over a ×0.5–×2 grid of the main window
       (± top-k).
     - Base weights are cached per (day, subset) across the strategy, benchmark and grid.
   - API: `/dynamic/signals` (catalogue) and `/dynamic/backtest`.
   - UI (`/dynamic`): presets, base (allocator or custom weights), method, signal pickers built
     from the catalogue, verdict tiles, a hindsight caveat, growth/drawdown/holdings, signal
     strip, side-by-side table, robustness grid, today's target.
   - Original plan, kept for reference:
   - Signals: timing filters ported from 02 (MA/EMA cross, MACD, Donchian, regime filter, …) and
     cross-sectional ranks (12-1 momentum, vol-adjusted momentum, short-term reversal).
   - Signal → weights methods: tilt around base weights, top-k rotation, signals as Black–Litterman
     views, filter + any allocator.
   - Runs on the shared engine, with costs and turnover caps.
   - Always compared with buy-and-hold of the user's base weights. Deflated Sharpe over the
     configurations tried.
5. **Risk models, factors, validation rigour. Done.**
   - Risk models:
     - `risk/var_backtest.py`: four rolling VaR models, Kupiec / Christoffersen / conditional
       coverage, Basel traffic light, Euler component VaR/ES.
     - `simulation/monte_carlo.py`: `t_copula` (empirical marginals + Student-t copula on
       normal scores) and `regime` (2-state Markov; calm/stress split by 2-means on log
       rolling vol).
   - Covariance: `estimators/covariance.py` adds `denoised` (Marchenko–Pastur
     constant-residual-eigenvalue).
   - Factors:
     - `data/factors.py`: Ken French daily 5 factors + momentum, cached daily with a snapshot
       `ff_factors.csv.gz`.
     - `research/factor_model.py`: Newey–West OLS, Euler factor risk shares, rolling betas.
       This replaces the ETF proxies.
   - Validation: `validation/compare.py` has the all-methods walk-forward (resampled max Sharpe
     excluded for speed), the Memmel–Jobson–Korkie Sharpe test, CSCV PBO (10 blocks → 252
     splits) and covariance estimators out of sample.
   - UI: VaR backtest page, two new MC models with a regime card, compare-methods page,
     factor lab section.
   - Original plan, kept for reference:
   - Risk models: t-copula and regime-switching Monte Carlo; component VaR/ES; VaR backtests
     (Kupiec, Christoffersen).
   - Covariance: Marchenko–Pastur denoising, factor covariance, DCC-GARCH.
   - Factors: Fama–French factor lab, replacing the ETF proxies.
   - Validation: all-methods walk-forward comparison with significance tests, PBO, CPCV.
6. **My portfolio and goal planner. Done.**
   - `holdings.py`: parse, value, and a trade list (whole/fractional shares, never overdraws,
     min trade, costs, cash buffer).
   - `planner.py`: monthly simulation with contributions/withdrawals in real terms, glide path to
     T-bills, expected-return override (default 6% in the API), goal and ruin probabilities, safe
     withdrawal by bisection, sequence-of-returns quintiles.
   - API: `/portfolio/holdings`, `/planner`.
   - UI: Plan area (my portfolio, goal planner); saved universes in the dialog (localStorage).
   - Original plan, kept for reference:
   - My portfolio: holdings CSV import, current vs optimized, a trade list with share rounding and
     costs, saved configurations.
   - Goal planner: contributions/withdrawals, probability of reaching a goal or of ruin, glide paths,
     sequence-of-returns risk.

---

## 5. Commands

```bash
make install   # venv + backend[api,dev] + npm install
make dev       # API on :8030 and Vite on :5183 → http://localhost:5183
make test      # offline pytest
make e2e       # Playwright smoke over every page (needs `make dev` + Chrome)
make lint      # ruff, pyright, tsc, oxlint, prettier
make check     # lint + test + frontend build
make api-types # regenerate frontend types after a schema change
make learn-shots # re-capture Learn screenshots + region boxes (needs `make dev`)
make serve     # built UI served by FastAPI on :8030
```

## 6. Maintenance

Regenerate the snapshot (prices and market values) from `backend/`:

```bash
.venv/bin/python -m portlab.data.build_snapshot
```
