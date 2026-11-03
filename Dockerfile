# Portfolio Lab as one container: the built React app served by the FastAPI API.
#   docker build -t portlab .
#   docker run -p 8000:8000 portlab        → http://localhost:8000
# On Render (render.yaml), the platform sets $PORT and the same image runs unchanged.

# --- 1. Build the web app ---------------------------------------------------------------------
FROM node:24-alpine AS web
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# --- 2. Python runtime: the portfolio library and API ----------------------------------------
FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORTLAB_STATIC_DIR=/app/static \
    PORTLAB_CACHE_DIR=/tmp/portlab-cache \
    PORT=8000
WORKDIR /app
COPY backend /tmp/portlab
RUN pip install "/tmp/portlab[api]" && rm -rf /tmp/portlab
COPY --from=web /src/frontend/dist /app/static
RUN useradd --create-home --uid 10001 portlab
USER portlab
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/api/health', timeout=4)"
CMD ["sh", "-c", "exec uvicorn portlab_api.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers"]
