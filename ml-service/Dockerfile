# syntax=docker/dockerfile:1
#
# FastAPI ML service — multi-stage.
#   target: dev     -> uvicorn --reload with the source bind-mounted (compose override)
#   target: runner  -> minimal production image, runtime deps only
#
# Python 3.14 matches the team standard enforced by scripts/setup.js.

ARG PYTHON_IMAGE=python:3.14-slim

# --- base ----------------------------------------------------------------
FROM ${PYTHON_IMAGE} AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PATH="/opt/venv/bin:$PATH"
WORKDIR /app

# --- deps: venv with runtime dependencies only -----------------------
FROM base AS deps
RUN python -m venv /opt/venv
COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

# --- dev: reload server, includes test/lint deps --------------------
FROM base AS dev
RUN python -m venv /opt/venv
COPY requirements.txt requirements-dev.txt ./
RUN pip install --upgrade pip && pip install -r requirements-dev.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# --- runner: minimal production image ------------------------------
FROM base AS runner
COPY --from=deps /opt/venv /opt/venv
RUN useradd --system --uid 1001 appuser
# Only the serving layer and the trained models are needed at runtime;
# datagen/ and training/ are offline tooling.
COPY app ./app
COPY models ./models
USER appuser
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
