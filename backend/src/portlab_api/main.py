"""FastAPI application.

Dev: `fastapi dev --port 8030` (entrypoint in pyproject.toml); Vite proxies /api to it.
If the frontend has been built (`frontend/dist`), it is served from `/` with client-side routing
fallback, so the whole lab can run as a single process.
"""

import os
from pathlib import Path

from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import JSONResponse

from .routes import attribution, construction, dynamic, meta, report, risk, universe, validation

app = FastAPI(title="Portfolio Lab API", version="0.2.0")

api = APIRouter(prefix="/api")
api.include_router(meta.router)
api.include_router(universe.router)
api.include_router(construction.router)
api.include_router(risk.router)
api.include_router(validation.router)
api.include_router(dynamic.router)
api.include_router(attribution.router)
api.include_router(report.router)


@api.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@api.api_route(
    "/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], include_in_schema=False
)
def api_not_found(path: str) -> JSONResponse:
    # Registered last: keeps unknown /api paths from falling through to the web app's index.html.
    return JSONResponse(status_code=404, content={"detail": f"Unknown API endpoint '/api/{path}'"})


app.include_router(api)


@app.exception_handler(ValueError)
async def value_error(_: Request, exc: ValueError) -> JSONResponse:
    # DataError (bad ticker, too little history) is a ValueError too: the message is for the user.
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.exception_handler(RuntimeError)
async def runtime_error(_: Request, exc: RuntimeError) -> JSONResponse:
    # Optimiser failures (infeasible constraints, no convergence).
    return JSONResponse(status_code=422, content={"detail": str(exc)})


# The built UI: next to the source tree in development, or wherever PORTLAB_STATIC_DIR points
# (the Docker image installs the package and copies the build to /app/static).
FRONTEND_DIST = Path(
    os.environ.get("PORTLAB_STATIC_DIR")
    or Path(__file__).resolve().parents[3] / "frontend" / "dist"
)
if FRONTEND_DIST.is_dir():
    # Low priority: /api routes match first, then static files, then the SPA fallback.
    app.frontend("/", directory=FRONTEND_DIST, fallback="index.html")
