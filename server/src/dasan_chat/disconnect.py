"""Gemini Live WebSocket의 정상 종료(GoAway / 1008 / 1011 등)를
에러로 오해하지 않도록 구분하는 헬퍼.

원본: dasan-chatbot api.py:613-621. 거기서 학생 트래픽으로 실제 디버깅된 결과물이라
그대로 가져온다. 새 로직 추가하지 말고, 새 패턴 발견되면 _BENIGN_DISCONNECT_HINTS에만 더한다.
"""

_BENIGN_DISCONNECT_HINTS = (
    "connection closed",
    "1008",            # Gemini Live policy-violation close (session limit 포함)
    "policy violation",
    "session durat",   # Gemini가 잘라 보내는 "session duration..." 메시지
    "goaway",
    "1011",            # internal error, transient
    "client disconnected",
    "going away",
    "no close frame",
    "abnormal closure",
)

# 1008/1011 코드로 묻혀 들어오지만 "정상 종료가 아닌" 진짜 에러들.
# 이 패턴이 메시지에 있으면 benign에서 제외 — 모델 설정/이름이 잘못된 경우다.
_REAL_ERROR_HINTS = (
    "is not found",
    "is not supported",
    "not a valid model",
    "invalid argument",
    "unauthenticated",
    "permission denied",
    "api key not valid",
)

_BENIGN_EXCEPTION_TYPES = (
    "ConnectionClosed",
    "ConnectionClosedError",
    "ConnectionClosedOK",
    "WebSocketDisconnect",
    "CancelledError",
)


def is_benign_disconnect(exc: BaseException) -> bool:
    msg = str(exc).lower()
    # 진짜 에러 신호가 있으면 우선. (모델 not found 같은 게 1008 코드로 묻혀 옴.)
    if any(real in msg for real in _REAL_ERROR_HINTS):
        return False
    if type(exc).__name__ in _BENIGN_EXCEPTION_TYPES:
        return True
    for base in type(exc).__mro__:
        if base.__name__ in _BENIGN_EXCEPTION_TYPES:
            return True
    return any(hint in msg for hint in _BENIGN_DISCONNECT_HINTS)
