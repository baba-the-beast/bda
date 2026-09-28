# Standalone image for the Render keep-alive monitor. Independent of the
# application images: standard library only, nothing from the app is copied.
#   docker build -f tools/render_monitor/Dockerfile -t bda-render-monitor .
#   docker run --rm -e RENDER_URL=https://your-app.onrender.com bda-render-monitor
FROM python:3.11-slim

WORKDIR /app

RUN groupadd -g 10001 appgroup && \
    useradd -u 10001 -g appgroup -s /bin/sh -d /app appuser

COPY tools/render_monitor/monitor.py /app/monitor.py

# STATUS_HOST only matters when STATUS_PORT is set. Inside a container the
# loopback address is unreachable from the host, so bind all interfaces and let
# `docker run -p` decide what is published.
ENV PYTHONUNBUFFERED=1     STATUS_HOST=0.0.0.0

USER 10001:10001

# docker stop sends SIGTERM; the monitor finishes the current wait and exits.
ENTRYPOINT ["python", "/app/monitor.py"]
