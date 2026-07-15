FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN groupadd --gid 10001 ldcn \
    && useradd --uid 10001 --gid ldcn --create-home ldcn

# /workspace/apps/api, not a flat /app: app/core/config.py derives
# WORKSPACE_ROOT as two directories above BASE_DIR (BASE_DIR.parents[1]) to
# reach the monorepo root (where generated-projects/ lives) -- same reason
# apps/web/Dockerfile already uses /workspace/apps/web. A flat /app collapses
# that arithmetic (parents[1] doesn't exist) and crashes on import.
WORKDIR /workspace/apps/api
COPY requirements.lock ./
RUN pip install --require-hashes --requirement requirements.lock
COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app

# The app creates generated-projects/ (repo-root-relative) and app/data/
# subpaths (sqlite db, execution evidence, ...) at runtime -- without this,
# everything stays root-owned and uid 10001 can't create them (PermissionError
# on the very first request).
RUN mkdir -p /workspace/generated-projects && chown -R 10001:10001 /workspace

USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3)"]
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-proxy-headers"]
