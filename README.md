# dasan-chat — 강진중앙초등학교 다산초당 챗봇

조선 후기 실학자 **정약용 선생님**을 학급 수업에서 만나보는 챗봇.
- 🏛️ **사랑채(음성)** — 마이크로 말하고 정약용 음성 응답
- 📚 **서재(글)** — 글로 묻고 글로 답

다산챗봇([haruiz/gemini-live-avatar](https://github.com/haruiz/gemini-live-avatar) 포크)의 디자인 + 페르소나를 무무클래스 표준 스택(React + Vite + TS + Tailwind + Zustand)으로 재작성.

## 구조

```
dasan-chat/
├── ui/        # React + Vite + TS + Tailwind + Zustand + react-router
└── server/    # FastAPI + google-genai (Gemini Live + /chat REST)
```

## 로컬 개발

```powershell
# 1) 백엔드
cd server
Copy-Item .env.example .env
# .env에 GEMINI_API_KEY 입력
.\run.ps1                 # http://127.0.0.1:8080

# 2) 프론트 (새 창)
cd ui
npm install
npm run dev               # http://127.0.0.1:5174
```

## 모델

| 모드 | 모델 | 비고 |
|---|---|---|
| 사랑채 (음성) | `gemini-2.5-flash-native-audio-latest` | Live API + ko-KR pin |
| 서재 (글) | `gemini-2.5-flash` → `gemini-2.5-pro` | flash 503 시 pro로 자동 폴백 |

## 배포 (Render)

이 저장소를 Render에 연결하면 `render.yaml`이 빌드/시작 명령을 자동 적용.
**환경변수 `GEMINI_API_KEY`**를 Render dashboard에서 설정해야 동작.

[Gemini Live API 제약상 region은 `oregon` 고정](https://github.com/reinhardt7177-lab/dasan-chatbot)
— 한국에서 직접 호출은 1007 "User location not supported"로 거부됨.
