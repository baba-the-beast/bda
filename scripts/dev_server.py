"""
Unified Local Development Orchestrator.
Mounts all microservice routers into a single cohesive development server on port 8000
for instantaneous local evaluation, testing, and UI integration without needing 8 background daemons.
"""

import importlib.util
import os
import sys
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, BASE_DIR)

# Configure dev server defaults for local single-process development
os.environ.setdefault("DATA_STORE_MODE", "memory")
os.environ.setdefault("ENABLE_DEMO_SEED", "true")
os.environ.setdefault("JWT_SECRET", "dev-insecure-secret-key-32bytes-long-min-required")
os.environ.setdefault("BDA_MODE", "RENDER_LITE")

from shared.errors import PlatformException


def load_service_app(service_folder: str):
    """Load a microservice's FastAPI module by path, at most once per process.

    Service modules register Prometheus collectors at import time, so executing one
    twice raises DuplicateTimeseries. Caching keeps repeat calls cheap, and clearing a
    failed module keeps the real ImportError visible instead of a misleading metrics
    collision on the next attempt.
    """
    module_name = f"service_{service_folder.replace('-', '_')}"
    cached = sys.modules.get(module_name)
    if cached is not None:
        return cached

    svc_dir = os.path.join(BASE_DIR, "services", service_folder)
    if svc_dir not in sys.path:
        sys.path.insert(0, svc_dir)
    main_path = os.path.join(svc_dir, "src", "main.py")
    spec = importlib.util.spec_from_file_location(module_name, main_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    try:
        spec.loader.exec_module(module)
    except BaseException:
        sys.modules.pop(module_name, None)
        raise
    return module


auth_mod = load_service_app("auth-service")
dataset_mod = load_service_app("dataset-service")
prep_mod = load_service_app("preprocessing-service")
job_mod = load_service_app("job-orchestrator")
hive_mod = load_service_app("hive-query-service")
analytics_mod = load_service_app("analytics-service")
stream_mod = load_service_app("stream-service")


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with auth_mod.lifespan(app):
        yield


dev_app = FastAPI(
    title="Energy Platform Development Gateway",
    version="1.0.0",
    docs_url="/docs",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

dev_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@dev_app.exception_handler(PlatformException)
async def platform_exception_handler(request: Request, exc: PlatformException):
    return exc.to_response()

for mod in [auth_mod, dataset_mod, prep_mod, job_mod, hive_mod, analytics_mod, stream_mod]:
    for r in mod.app.routes:
        if hasattr(r, "path") and r.path.startswith("/api/v1"):
            if not any(
                existing.path == r.path and set(getattr(existing, "methods", [])) == set(getattr(r, "methods", []))
                for existing in dev_app.routes
            ):
                dev_app.routes.append(r)


@dev_app.get("/health")
def health():
    return {"status": "UP", "mode": "development-unified-gateway"}


from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

frontend_dist = os.path.join(BASE_DIR, "frontend", "dist")
if os.path.exists(frontend_dist):
    assets_dir = os.path.join(frontend_dist, "assets")
    if os.path.exists(assets_dir):
        dev_app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @dev_app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        candidate = os.path.join(frontend_dist, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        index_file = os.path.join(frontend_dist, "index.html")
        return FileResponse(index_file)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    print(f"[INFO] Starting Energy Analytics Platform Unified Server on http://0.0.0.0:{port}")
    uvicorn.run(dev_app, host="0.0.0.0", port=port)
