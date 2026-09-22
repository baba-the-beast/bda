# Multi-stage Dockerfile for Production Stream Service
FROM python:3.11-slim as builder

WORKDIR /install
COPY services/stream-service/requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.11-slim

WORKDIR /app

RUN groupadd -g 10001 appgroup && \
    useradd -u 10001 -g appgroup -s /bin/sh -d /app appuser

COPY --from=builder /install /usr/local
COPY shared /app/shared
COPY services/stream-service/src /app/src

ENV PYTHONPATH=/app \
    PYTHONUNBUFFERED=1

USER 10001:10001

EXPOSE 8007

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8007/health')" || exit 1

ENTRYPOINT ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8007", "--no-access-log"]
