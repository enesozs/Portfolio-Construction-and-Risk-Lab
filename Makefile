# Portfolio Lab — common tasks. Run from the project root.
PY := backend/.venv/bin

.PHONY: install dev api web test e2e learn-shots lint check build serve api-types snapshot

install:            ## Create the Python venv and install both halves
	python3 -m venv backend/.venv
	$(PY)/pip install -q --upgrade pip
	$(PY)/pip install -q -e "backend[api,dev]"
	cd frontend && npm install

dev:                ## API on :8030 + Vite on :5183 (open http://localhost:5183)
	@trap 'kill 0' INT TERM EXIT; \
	$(MAKE) --no-print-directory api & \
	$(MAKE) --no-print-directory web & \
	wait

api:
	cd backend && .venv/bin/fastapi dev --port 8030

web:
	cd frontend && npm run dev

test:               ## Python test suite (offline: prices come from the bundled snapshot)
	cd backend && .venv/bin/pytest -q

e2e:                ## Browser smoke test over every page (needs `make dev` + Google Chrome)
	$(PY)/python e2e/smoke.py http://localhost:5183

learn-shots:        ## Re-capture the Learn screenshots and region boxes (needs `make dev`)
	$(PY)/python e2e/learn_screens.py http://localhost:5183

lint:               ## Format + lint + type-check both halves
	cd backend && .venv/bin/ruff format . ../e2e && .venv/bin/ruff check . ../e2e && .venv/bin/pyright
	cd frontend && npx tsc -b && npm run lint

check: lint test    ## Everything CI would run
	cd frontend && npm run build

api-types:          ## Regenerate frontend/src/lib/api-types.ts after a schema change
	cd frontend && npm run api-types

build:              ## Production build of the frontend (served by FastAPI from frontend/dist)
	cd frontend && npm run build

serve: build        ## Single process: API + built UI on http://localhost:8030
	cd backend && .venv/bin/fastapi run --port 8030

snapshot:           ## Refresh the bundled offline price snapshot from Yahoo Finance
	cd backend && .venv/bin/python -m portlab.data.build_snapshot
