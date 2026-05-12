# dasan-chat / server

다산초당 정약용 챗봇 백엔드. FastAPI + Google Gemini.

## 빠른 시작

```powershell
cd D:\mumuapps\apps\dasan-chat\server
Copy-Item .env.example .env
# .env 열어서 GEMINI_API_KEY 채우기 (https://aistudio.google.com/apikey)

uv sync           # 의존성 설치
.\run.ps1         # http://127.0.0.1:8080
```

헬스체크: `GET /healthz`

## 엔드포인트

- `POST /api/chat` — 서재(글) 모드. `{ message, history: [{role,text}] }` → `{ reply }`
- `WS   /api/ws/live` — 사랑채(음성) 모드. JSON 메시지 프로토콜은 `api.py` 상단 주석 참고.

## 모델 선택

| 모드 | 모델 | 이유 |
|---|---|---|
| 음성 (사랑채) | `gemini-live-2.5-flash-preview` (half-cascade) | native-audio 계열은 영어 편향이 심해 한국어 인식이 떨어짐. half-cascade는 내부 ASR이 ko-KR 정확. |
| 텍스트 (서재) | `gemini-2.5-pro` | 학급 환경에선 일관성 우선. preview 폴백 체인은 사용 안 함. |

`config.py`에서 모델/보이스 변경 가능.
