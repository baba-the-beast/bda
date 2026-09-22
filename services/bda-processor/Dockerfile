# Multi-stage Dockerfile for BDA Background Processor Service
FROM python:3.11-slim AS builder

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends build-essential gcc && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

FROM python:3.11-slim
WORKDIR /app
COPY --from=builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH
ENV PYTHONUNBUFFERED=1
ENV ENVIRONMENT=production
ENV BDA_MODE=RENDER_LITE
ENV DATA_STORE_MODE=mongodb

COPY . .

CMD ["python", "scripts/processor_daemon.py"]
