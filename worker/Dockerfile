# Python worker image. Build from the repo root:
#   docker compose -f infra/docker-compose.yml up --build
FROM python:3.12-slim

# Never run as root inside the container.
RUN useradd --create-home --uid 10001 worker
WORKDIR /app

COPY worker/pyproject.toml ./
COPY worker/worker ./worker
RUN pip install --no-cache-dir .

USER worker
ENV PYTHONUNBUFFERED=1
# No EXPOSE: the worker only makes outbound connections.
CMD ["python", "-m", "worker.main"]
