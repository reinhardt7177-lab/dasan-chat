"""FastAPI 앱 조립.

라우터는 /api 아래에 마운트하여 프론트의 Vite 프록시 규칙(`/api/*` → backend)과
배포 환경의 reverse-proxy 규칙을 일치시킨다.
"""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .api import router as api_router
from .config import SETTINGS

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

logger = logging.getLogger("dasan_chat.app")

# 빌드된 React SPA가 떨어지는 위치. vite.config.ts의 build.outDir과 동일 경로.
# dev 모드(uv run python -m dasan_chat)에서는 이 폴더가 비어있어 mount를 건너뜀.
SPA_DIR = Path(__file__).parent / "static"


def create_app() -> FastAPI:
    app = FastAPI(title="다산초당 챗봇", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(SETTINGS.allowed_origins),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # API 먼저 마운트 — `/api/*` 경로가 SPA fallback에 먹히지 않도록 우선순위 확보.
    app.include_router(api_router, prefix="/api")

    @app.get("/api/")
    async def api_root() -> dict[str, str]:
        # render.yaml의 healthCheckPath와 일치.
        return {"status": "ok", "service": "dasan-chat"}

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    # SPA 마운트는 마지막 — `/`가 모든 미매칭 경로를 빌드된 index.html로 보냄.
    # html=True가 SPA 라우팅(/seojae, /sarangchae)을 위해 fallback을 활성화.
    if SPA_DIR.is_dir() and (SPA_DIR / "index.html").exists():
        app.mount("/", StaticFiles(directory=SPA_DIR, html=True), name="spa")
        logger.info("Mounted SPA from %s", SPA_DIR)
    else:
        logger.warning(
            "SPA build not found at %s — running in API-only mode. "
            "Build the UI with `cd ui && npm run build`.",
            SPA_DIR,
        )

    return app


app = create_app()
