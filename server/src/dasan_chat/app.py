"""FastAPI 앱 조립.

라우터는 /api 아래에 마운트하여 프론트의 Vite 프록시 규칙(`/api/*` → backend)과
배포 환경의 reverse-proxy 규칙을 일치시킨다.
"""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
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

    # 정적 에셋 마운트 (CSS/JS/이미지). /assets, /images는 파일이 실제 존재하는 경우만.
    if SPA_DIR.is_dir():
        assets_dir = SPA_DIR / "assets"
        if assets_dir.is_dir():
            app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")
        images_dir = SPA_DIR / "images"
        if images_dir.is_dir():
            app.mount("/images", StaticFiles(directory=images_dir), name="images")
        logger.info("Mounted static assets from %s", SPA_DIR)

    # SPA catch-all — React Router가 쓰는 모든 경로(/seojae, /sarangchae 등)에
    # 새로고침/직접 접속해도 index.html을 내려줘야 클라이언트 라우팅이 동작함.
    index_file = SPA_DIR / "index.html"

    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str) -> FileResponse | JSONResponse:  # noqa: ARG001
        if index_file.exists():
            return FileResponse(index_file)
        return JSONResponse({"detail": "SPA not built"}, status_code=404)

    if index_file.exists():
        logger.info("SPA fallback active → %s", index_file)
    else:
        logger.warning(
            "SPA build not found at %s — running in API-only mode. "
            "Build the UI with `cd ui && npm run build`.",
            SPA_DIR,
        )

    return app


app = create_app()
