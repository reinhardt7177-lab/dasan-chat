"""런타임 설정. 환경변수 + 합리적인 기본값.

다산챗봇의 runtime_config.json + CLI 옵션 두 갈래를 하나로 합쳤다 —
교실 배포에는 .env 하나로 충분하다.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Final

from dotenv import find_dotenv, load_dotenv

load_dotenv(find_dotenv())


@dataclass(frozen=True)
class Settings:
    gemini_api_key: str

    # 사랑채(음성) 출력용 Live 모델 — native-audio 복귀.
    # gemini-3.1-flash-live-preview는 minimal config로도 setup 단계에서 끊김 확인(2026-05-13).
    # 한국어 ASR 약점은 별도 path(/api/transcribe with Gemini Flash audio understanding)으로 처방.
    voice_model: str = "gemini-2.5-flash-native-audio-latest"

    # 입력 음성 → 텍스트 전사용 모델. Gemini Flash의 audio understanding으로 ko-KR 정확 인식.
    transcribe_model: str = "gemini-2.5-flash"

    # 음성 합성 voice (ko-KR). Charon은 깊은 남성 톤이라 노학자에 잘 어울린다.
    voice_name: str = "Charon"

    # 서재(텍스트) 모델 폴백 체인.
    # 1차 flash: 평상시 ~2-4초로 빠름, 가용성 가장 좋음, 페르소나 따라가는 데 품질 충분.
    # 2차 pro: flash가 503/quota면 자동 폴백. ~12-15초지만 안 끊김.
    # 두 모델 다 503이면 그제야 에러.
    text_model_chain: tuple[str, ...] = (
        "gemini-2.5-flash",
        "gemini-2.5-pro",
    )

    # 텍스트 모드 응답 최대 길이. 4096 ≈ 한국어 2700자.
    text_max_tokens: int = 4096

    # CORS / WebSocket 허용 origin. dev 5173 + 배포시 추가.
    allowed_origins: tuple[str, ...] = (
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
    )

    # /chat 에 함께 보낼 직전 대화 턴 수 상한.
    chat_history_limit: int = 12


def load() -> Settings:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY 환경변수가 설정되지 않았습니다. "
            "server/.env.example을 .env로 복사하고 키를 채워주세요."
        )

    extra_origins = os.environ.get("EXTRA_ALLOWED_ORIGINS", "")
    default = Settings(gemini_api_key=api_key)
    if extra_origins.strip():
        merged = default.allowed_origins + tuple(
            o.strip() for o in extra_origins.split(",") if o.strip()
        )
        return Settings(gemini_api_key=api_key, allowed_origins=merged)
    return default


SETTINGS: Final[Settings] = load()
