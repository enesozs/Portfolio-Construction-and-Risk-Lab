# Portfolio Construction & Risk Lab — common tasks. Run from the project root.
PY := backend/.venv/bin

.PHONY: install test lint

install:            ## Create the Python venv and install the library, API and dev tools
	python3 -m venv backend/.venv
	$(PY)/pip install -q --upgrade pip
	$(PY)/pip install -q -e "backend[api,dev]"

test:               ## Python test suite (offline: prices come from the bundled snapshot)
	cd backend && .venv/bin/pytest -q

lint:               ## Format + lint + type-check
	cd backend && .venv/bin/ruff format . && .venv/bin/ruff check . && .venv/bin/pyright
