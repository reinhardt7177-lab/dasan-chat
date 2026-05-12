"""정약용 챗봇 API.

엔드포인트:
- POST /chat        — 서재(글). 짧은 히스토리를 받아 한 턴 응답.
- WS   /ws/live     — 사랑채(음성). half-cascade Live 모델로 음성 IO 중계.

클라이언트 ↔ 서버 WebSocket 메시지 프로토콜 (JSON):
  client → server:
    { type: "audio",       data: <base64 PCM 16kHz mono> }
    { type: "text",        data: <string> }
    { type: "end_of_turn" }                # push-to-talk에서 사용 (선택)
  server → client:
    { type: "audio",            data: <base64 PCM> }
    { type: "input_transcript", data: <string> }     # 학생 발화 인식 결과
    { type: "output_transcript",data: <string> }     # 선생님 답변 텍스트
    { type: "interrupted" }
    { type: "turn_complete" }
    { type: "error",            data: { message, action } }
"""

from __future__ import annotations

import asyncio
import base64
import logging
import traceback
import uuid
from asyncio import to_thread
from typing import List

from fastapi import APIRouter, HTTPException, WebSocket
from google import genai
from google.genai import types
from google.genai.types import (
    AudioTranscriptionConfig,
    AutomaticActivityDetection,
    EndSensitivity,
    LiveConnectConfig,
    LiveServerMessage,
    Modality,
    PrebuiltVoiceConfig,
    RealtimeInputConfig,
    SpeechConfig,
    StartSensitivity,
    VoiceConfig,
)
from pydantic import BaseModel, Field
from starlette.websockets import WebSocketDisconnect

from .config import SETTINGS
from .disconnect import is_benign_disconnect
from .persona import text_prompt, voice_prompt

logger = logging.getLogger("dasan_chat.api")

router = APIRouter()
client = genai.Client(api_key=SETTINGS.gemini_api_key, vertexai=False)


# ──────────────────────────────────────────────────────────────────────
# /chat — 서재(글) 모드
# ──────────────────────────────────────────────────────────────────────


class ChatTurn(BaseModel):
    role: str = Field(..., description="'user' or 'model'")
    text: str


class ChatRequest(BaseModel):
    message: str
    history: List[ChatTurn] = []


class ChatResponse(BaseModel):
    reply: str


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    if not req.message or not req.message.strip():
        raise HTTPException(status_code=400, detail="비어있는 질문은 받을 수 없습니다.")

    history = req.history[-SETTINGS.chat_history_limit :] if req.history else []
    contents = [
        types.Content(role=h.role, parts=[types.Part(text=h.text)]) for h in history
    ]
    contents.append(
        types.Content(role="user", parts=[types.Part(text=req.message.strip())])
    )

    response = None
    last_error: Exception | None = None
    chain = SETTINGS.text_model_chain
    for idx, model_name in enumerate(chain):
        try:
            response = await to_thread(
                client.models.generate_content,
                model=model_name,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=text_prompt(),
                    temperature=0.85,
                    max_output_tokens=SETTINGS.text_max_tokens,
                ),
            )
            logger.info("chat: model=%s OK", model_name)
            break
        except Exception as exc:
            msg = str(exc).lower()
            transient = "503" in msg or "unavailable" in msg or "overload" in msg or "resource_exhausted" in msg
            last_error = exc
            if transient and idx < len(chain) - 1:
                logger.warning(
                    "chat: model=%s transient (%s) — falling back to %s",
                    model_name,
                    type(exc).__name__,
                    chain[idx + 1],
                )
                continue
            logger.exception("chat: model=%s failed (non-transient or last in chain)", model_name)
            raise HTTPException(status_code=502, detail=f"답변 생성 중 오류: {exc}")

    if response is None:
        raise HTTPException(
            status_code=503,
            detail=f"선생님이 잠시 자리를 비우셨네. 잠시 후 다시 여쭙어 주시구려. ({last_error})",
        )

    finish_reason = ""
    try:
        finish_reason = str(response.candidates[0].finish_reason).upper()
    except Exception:
        pass
    if finish_reason and "STOP" not in finish_reason:
        logger.warning("chat: 비정상 종료 finish_reason=%s", finish_reason)

    text = (response.text or "").strip()
    if not text:
        raise HTTPException(
            status_code=502, detail="선생님이 답하시지 못하였네. 다시 여쭙어 주시구려."
        )
    return ChatResponse(reply=text)


# ──────────────────────────────────────────────────────────────────────
# /ws/live — 사랑채(음성) 모드
# ──────────────────────────────────────────────────────────────────────


def _build_live_config() -> LiveConnectConfig:
    """half-cascade 모델용 LiveConnectConfig.

    핵심 변경점 (vs 다산챗봇 원본):
    - response_modalities=[AUDIO] 그대로지만 모델이 half-cascade라 내부 ASR이 ko-KR 정확.
    - input_audio_transcription / output_audio_transcription 그대로 — 학생에게
      "선생님이 이렇게 들으셨네" 표시할 거라 input transcription 필수.
    - SpeechConfig.language_code="ko-KR" + Charon voice — ko-KR 출력 확실히 핀.
    - VAD sensitivity: START_HIGH(잡음 한 번 더 걸러냄) + END_LOW(말 끊김 방지).
      교실 환경(에어컨·옆 학생 잡담)에서 START_LOW가 너무 자주 false-fire함.
    """
    return LiveConnectConfig(
        system_instruction=voice_prompt(),
        response_modalities=[Modality.AUDIO],
        # language_codes=["ko-KR"]는 SDK type spec에는 있으나 native-audio latest도
        # "language_codes parameter not supported"로 거부 (2026-05-13 확인 — WS setup
        # 즉시 끊김). 따라서 SDK 거짓말이고 endpoint가 아직 지원 안 함. 일단 제거하고
        # 입력 인식 문제는 별도 (half-cascade 모델 / Cloud STT 분리)로 처방.
        input_audio_transcription=AudioTranscriptionConfig(),
        output_audio_transcription=AudioTranscriptionConfig(),
        speech_config=SpeechConfig(
            language_code="ko-KR",
            voice_config=VoiceConfig(
                prebuilt_voice_config=PrebuiltVoiceConfig(voice_name=SETTINGS.voice_name)
            ),
        ),
        realtime_input_config=RealtimeInputConfig(
            automatic_activity_detection=AutomaticActivityDetection(
                disabled=False,
                start_of_speech_sensitivity=StartSensitivity.START_SENSITIVITY_HIGH,
                end_of_speech_sensitivity=EndSensitivity.END_SENSITIVITY_LOW,
            )
        ),
    )


@router.websocket("/ws/live")
async def ws_live(ws: WebSocket) -> None:
    session_id = uuid.uuid4().hex[:8]
    await ws.accept()
    logger.info("🌐 [%s] WS accepted (model=%s)", session_id, SETTINGS.voice_model)

    try:
        async with client.aio.live.connect(
            model=SETTINGS.voice_model,
            config=_build_live_config(),
        ) as live_session:
            async with asyncio.TaskGroup() as tg:
                tg.create_task(_pump_client_to_gemini(ws, live_session, session_id))
                tg.create_task(_pump_gemini_to_client(ws, live_session, session_id))

    except* WebSocketDisconnect:
        logger.info("[%s] client disconnected", session_id)
    except* Exception as eg:
        # ExceptionGroup → 평탄화 후 분류
        flat: list[BaseException] = []

        def _flat(e: BaseException) -> None:
            if isinstance(e, BaseExceptionGroup):
                for x in e.exceptions:
                    _flat(x)
            else:
                flat.append(e)

        _flat(eg)
        if flat and all(is_benign_disconnect(e) for e in flat):
            # 디버깅 강화: benign 분류된 케이스도 본문은 한 줄 찍는다.
            # (모델 이름 오타·미지원 필드는 종종 1008 메시지에 묻혀와 정상 종료로 오인되기 때문.)
            logger.info(
                "[%s] benign disconnect: %s | %s",
                session_id,
                [type(e).__name__ for e in flat],
                [str(e)[:300] for e in flat],
            )
        else:
            for e in flat:
                logger.error("[%s] %s: %s", session_id, type(e).__name__, e)
                logger.error(traceback.format_exc())
            await _safe_send(
                ws,
                {
                    "type": "error",
                    "data": {
                        "message": "선생님과의 연결에 잠시 문제가 있었네.",
                        "action": "다시 시도해 보시구려.",
                    },
                },
            )
    finally:
        logger.info("[%s] WS closed", session_id)


async def _pump_client_to_gemini(
    ws: WebSocket, live_session, session_id: str
) -> None:
    """브라우저 → Gemini Live."""
    while True:
        try:
            data = await ws.receive_json()
        except WebSocketDisconnect:
            return

        msg_type = data.get("type")
        payload = data.get("data")

        if msg_type == "audio":
            audio_bytes = base64.b64decode(payload)
            await live_session.send_realtime_input(
                media=types.Blob(mime_type="audio/pcm;rate=16000", data=audio_bytes)
            )
        elif msg_type == "text":
            await live_session.send_realtime_input(text=payload)
        elif msg_type == "end_of_turn":
            # push-to-talk 클라이언트가 명시적으로 발화 끝을 알리는 경우.
            # send_realtime_input의 audio_stream_end로 VAD에게 끝 신호.
            await live_session.send_realtime_input(audio_stream_end=True)
        else:
            logger.warning("[%s] unknown client message type: %s", session_id, msg_type)


async def _pump_gemini_to_client(
    ws: WebSocket, live_session, session_id: str
) -> None:
    """Gemini Live → 브라우저."""
    async for chunk in live_session.receive():
        await _process_chunk(ws, chunk, session_id)


async def _process_chunk(
    ws: WebSocket, response: LiveServerMessage, session_id: str
) -> None:
    if not response:
        return

    server_content = response.server_content
    audio_data = response.data  # 누적된 PCM 청크 (model_turn 동안 발생)

    # Barge-in: 학생이 선생님 말 도중에 다시 말하면 server VAD가 interrupted=True 전달.
    if server_content and server_content.interrupted:
        await _safe_send(ws, {"type": "interrupted"})
        return

    # 오디오 청크 그대로 전달 (PCM base64).
    if server_content and server_content.model_turn and audio_data:
        await _safe_send(
            ws,
            {"type": "audio", "data": base64.b64encode(audio_data).decode("utf-8")},
        )

    # 학생 발화 인식 결과 — UI에 작게 표시해 "잘못 들었나?" 즉시 확인 가능.
    if server_content and getattr(server_content, "input_transcription", None):
        heard = server_content.input_transcription.text
        if heard:
            await _safe_send(ws, {"type": "input_transcript", "data": heard})

    # 선생님 답변 텍스트 — 자막 용도.
    if server_content and server_content.output_transcription:
        spoken = server_content.output_transcription.text
        if spoken:
            await _safe_send(ws, {"type": "output_transcript", "data": spoken})

    if server_content and server_content.turn_complete:
        await _safe_send(ws, {"type": "turn_complete"})


async def _safe_send(ws: WebSocket, payload: dict) -> None:
    try:
        await ws.send_json(payload)
    except RuntimeError as exc:
        # 이미 닫힌 WS에 쓰려 할 때 발생. 무해.
        if "unexpected asgi message" not in str(exc).lower():
            raise
