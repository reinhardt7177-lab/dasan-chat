import { useEffect, useReducer, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { AudioPlayer } from "../lib/audio-player";
import { AudioRecorder } from "../lib/audio-recorder";
import { LiveSocket, type ServerMessage } from "../lib/live-ws";
import { Character } from "../components/Character";

// 사랑채(음성) 페이지.
// 라이프사이클:
//  - mount      : WS connect + AudioPlayer 인스턴스 준비. (마이크 권한 미요청)
//  - mic 토글ON : 사용자 제스처로 AudioContext resume + AudioRecorder.start
//  - mic 토글OFF: AudioRecorder.stop. WS는 유지.
//  - unmount    : 모두 정리.

type Status = "connecting" | "idle" | "listening" | "speaking";

type State = {
  status: Status;
  micOn: boolean;
  amplitude: number;
  /** 현재 turn 중에 누적된 학생 발화 인식 결과. turn_complete 시 lastHeard로 옮김. */
  heardBuffer: string;
  /** 직전 turn에서 인식된 학생 발화 (UI에 한 줄로 노출). */
  lastHeard: string;
  /** 현재 turn 중에 누적된 선생님 답변 텍스트(자막). */
  spokenBuffer: string;
  /** 마지막으로 완료된 turn의 선생님 답변. */
  lastSpoken: string;
  errorMsg: string | null;
};

type Action =
  | { type: "status"; value: Status }
  | { type: "micOn"; value: boolean }
  | { type: "amplitude"; value: number }
  | { type: "heardChunk"; text: string }
  | { type: "spokenChunk"; text: string }
  | { type: "turnComplete" }
  | { type: "interrupted" }
  | { type: "error"; message: string }
  | { type: "clearError" };

const initial: State = {
  status: "connecting",
  micOn: false,
  amplitude: 0,
  heardBuffer: "",
  lastHeard: "",
  spokenBuffer: "",
  lastSpoken: "",
  errorMsg: null,
};

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "status":
      return { ...s, status: a.value };
    case "micOn":
      return { ...s, micOn: a.value };
    case "amplitude":
      return { ...s, amplitude: a.value };
    case "heardChunk":
      return { ...s, heardBuffer: s.heardBuffer + a.text };
    case "spokenChunk":
      return { ...s, spokenBuffer: s.spokenBuffer + a.text };
    case "turnComplete": {
      // turn 종료: 버퍼들을 최종 표시 값으로 옮김. 둘 다 비어있으면 보존(에코 방지 false-fire).
      const lastHeard = s.heardBuffer.trim() || s.lastHeard;
      const lastSpoken = s.spokenBuffer.trim() || s.lastSpoken;
      return {
        ...s,
        heardBuffer: "",
        spokenBuffer: "",
        lastHeard,
        lastSpoken,
        amplitude: 0,
      };
    }
    case "interrupted":
      // 학생이 도중에 말 끊으면: 진행 중 답변 버퍼 비우고 amplitude 0.
      return { ...s, spokenBuffer: "", amplitude: 0 };
    case "error":
      return { ...s, errorMsg: a.message };
    case "clearError":
      return { ...s, errorMsg: null };
  }
}

export function Sarangchae() {
  const [state, dispatch] = useReducer(reducer, initial);

  // 외부 객체들 ref 보존 (재렌더 영향 X).
  const wsRef = useRef<LiveSocket | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);

  // turn 종료 후 일정 시간 청크 없으면 입 다물기 (1.2s safety net).
  const speakingTimerRef = useRef<number | null>(null);

  // amplitude는 ref로도 들고 있어서 timer-based 자동 꺼짐 동기화에 쓴다.
  // (현재는 reducer에 의존, 별도 ref 불필요)

  // === WS / Player 초기화 ============================================
  useEffect(() => {
    const player = new AudioPlayer();
    player.onAmplitude = (level) => {
      dispatch({ type: "amplitude", value: level });

      // 1.2초간 신규 청크 없으면 강제로 amplitude 0 → 입 다물기.
      // (Gemini turn_complete 누락 안전망 — 다산챗봇 패턴.)
      if (speakingTimerRef.current !== null) {
        window.clearTimeout(speakingTimerRef.current);
      }
      if (level > 0) {
        speakingTimerRef.current = window.setTimeout(() => {
          dispatch({ type: "amplitude", value: 0 });
        }, 1200);
      }
    };
    playerRef.current = player;

    const ws = new LiveSocket();
    wsRef.current = ws;
    ws.on({
      onOpen: () => dispatch({ type: "status", value: "idle" }),
      onClose: () => dispatch({ type: "status", value: "connecting" }),
      onMessage: (msg) => handleServerMessage(msg, dispatch, player),
    });
    ws.connect();

    return () => {
      if (speakingTimerRef.current !== null) {
        window.clearTimeout(speakingTimerRef.current);
      }
      recorderRef.current?.stop();
      recorderRef.current = null;
      player.destroy();
      ws.close();
      wsRef.current = null;
      playerRef.current = null;
    };
  }, []);

  // === mic 토글 ======================================================
  const toggleMic = async () => {
    const ws = wsRef.current;
    const player = playerRef.current;
    if (!ws || !player) return;

    if (state.micOn) {
      recorderRef.current?.stop();
      recorderRef.current = null;
      dispatch({ type: "micOn", value: false });
      dispatch({ type: "status", value: "idle" });
      return;
    }

    // WS 미연결이면 잠깐 기다림 (Render cold start 대비).
    if (!ws.isOpen()) {
      dispatch({ type: "status", value: "connecting" });
      const ok = await ws.waitOpen(8000);
      if (!ok) {
        dispatch({
          type: "error",
          message: "선생님과 연결되지 않았네. 잠시 후 다시 시도해 주시구려.",
        });
        return;
      }
    }

    try {
      // autoplay 정책: 사용자 클릭 후에 출력 컨텍스트 resume.
      await player.ensureContext();

      const rec = new AudioRecorder();
      rec.onChunk = (b64) => ws.sendAudioChunk(b64);
      await rec.start();
      recorderRef.current = rec;
      dispatch({ type: "micOn", value: true });
      dispatch({ type: "status", value: "listening" });
      dispatch({ type: "clearError" });
    } catch (err) {
      const msg = formatMicError(err);
      dispatch({ type: "error", message: msg });
    }
  };

  // === amplitude 기반 status 갱신 (speaking 자동 토글) ==================
  useEffect(() => {
    if (state.amplitude > 0 && state.status !== "speaking") {
      dispatch({ type: "status", value: "speaking" });
    } else if (state.amplitude === 0 && state.status === "speaking") {
      dispatch({ type: "status", value: state.micOn ? "listening" : "idle" });
    }
  }, [state.amplitude, state.status, state.micOn]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#1a0e0a]">
      {/* 다산초당 실내 배경 */}
      <div
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/images/background.png')" }}
      />
      <div className="pointer-events-none absolute inset-0 z-[1] bg-black/25" />

      {/* 다산초당으로 */}
      <Link
        to="/"
        className="absolute top-4 left-4 z-50 rounded-sm border border-gold-soft/40 bg-wood/80 px-3 py-1.5 text-sm text-gold transition hover:bg-wood-2"
      >
        ← 다산초당
      </Link>

      {/* 상단 상태 표시 */}
      <StatusBadge status={state.status} />

      {/* 정약용 캐릭터 */}
      <Character
        amplitude={state.amplitude}
        speaking={state.status === "speaking"}
      />

      {/* 학생 발화 인식 (좌측 상단) */}
      {(state.heardBuffer || state.lastHeard) && (
        <div className="hanji-surface scroll-zone absolute top-24 left-6 z-40 max-h-[35vh] w-[28rem] overflow-y-auto rounded-sm border border-gold-soft/50 p-4 text-ink shadow-[0_4px_12px_rgba(0,0,0,0.35)]">
          <div className="mb-1 text-xs font-bold text-jade tracking-wide">학생 (자네)</div>
          <div className="text-base leading-relaxed">
            {state.heardBuffer || state.lastHeard}
          </div>
        </div>
      )}

      {/* 선생님 답변 자막 (우측 상단) */}
      {(state.spokenBuffer || state.lastSpoken) && (
        <div className="hanji-surface scroll-zone absolute top-24 right-6 z-40 max-h-[35vh] w-[28rem] overflow-y-auto rounded-sm border border-gold-soft/50 p-4 text-ink shadow-[0_4px_12px_rgba(0,0,0,0.35)]">
          <div className="mb-1 text-xs font-bold text-seal tracking-wide">정약용</div>
          <div className="text-base leading-relaxed">
            {state.spokenBuffer || state.lastSpoken}
          </div>
        </div>
      )}

      {/* 에러 표시 */}
      {state.errorMsg && (
        <div className="absolute bottom-28 left-1/2 z-50 -translate-x-1/2 rounded-sm border border-seal/60 bg-wood/90 px-4 py-2 text-sm text-parchment">
          {state.errorMsg}
          <button
            onClick={() => dispatch({ type: "clearError" })}
            className="ml-3 text-gold underline-offset-2 hover:underline"
          >
            닫기
          </button>
        </div>
      )}

      {/* 하단 컨트롤 바 */}
      <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-6">
        <div className="lacquer-surface mx-auto flex w-full max-w-3xl items-center justify-center gap-3 rounded-md px-5 py-4">
          <button
            onClick={toggleMic}
            className={`relative flex h-16 w-16 items-center justify-center rounded-full border transition ${
              state.micOn
                ? "border-seal-bright bg-seal text-parchment shadow-[0_0_24px_rgba(139,26,26,0.6)]"
                : "border-gold-soft/40 bg-wood-2/70 text-gold hover:bg-wood-2"
            }`}
            aria-label={state.micOn ? "녹음 중지" : "마이크 켜기"}
          >
            <MicIcon />
            {state.micOn && (
              <span className="pointer-events-none absolute inset-0 animate-ping rounded-full bg-seal/40" />
            )}
          </button>
          <div className="text-sm text-parchment/80">
            {state.micOn
              ? "🎤 듣고 계시네… 말씀하시구려"
              : "마이크를 눌러 선생님께 여쭙어 보시구려"}
          </div>
        </div>

        {/* dev-only: 마이크 없이 텍스트로 Live API 들이받기. prod 빌드에선 사라짐. */}
        {import.meta.env.DEV && (
          <DevTextInjector wsRef={wsRef} playerRef={playerRef} />
        )}
      </div>
    </div>
  );
}

function handleServerMessage(
  msg: ServerMessage,
  dispatch: React.Dispatch<Action>,
  player: AudioPlayer,
): void {
  switch (msg.type) {
    case "audio":
      player.play(msg.data);
      break;
    case "input_transcript":
      dispatch({ type: "heardChunk", text: msg.data });
      break;
    case "output_transcript":
      dispatch({ type: "spokenChunk", text: msg.data });
      break;
    case "interrupted":
      player.reset();
      dispatch({ type: "interrupted" });
      break;
    case "turn_complete":
      dispatch({ type: "turnComplete" });
      break;
    case "error":
      dispatch({
        type: "error",
        message: msg.data?.message ?? "알 수 없는 오류가 발생했습니다.",
      });
      break;
  }
}

function formatMicError(err: unknown): string {
  if (!(err instanceof Error)) return `마이크를 켤 수 없네: ${String(err)}`;
  switch (err.name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "마이크 사용 권한이 거부되었네. 주소창의 자물쇠 아이콘에서 마이크를 허용해 주시구려.";
    case "NotFoundError":
      return "마이크 장치를 찾지 못하였네. 마이크가 연결되어 있는지 살펴 주시구려.";
    case "NotSupportedError":
      return "이 브라우저에서는 마이크를 쓸 수 없네. 크롬이나 엣지를 써 주시구려.";
    case "SecurityError":
      return "https가 아니어서 마이크를 쓸 수 없네.";
    default:
      return `마이크를 켤 수 없네: ${err.message}`;
  }
}

function StatusBadge({ status }: { status: Status }) {
  const conf: Record<
    Status,
    { text: string; cls: string }
  > = {
    connecting: {
      text: "다산초당에 연결을 기다리는 중…",
      cls: "bg-wood/70 text-gold",
    },
    idle: {
      text: "🎤 마이크를 눌러 선생님께 여쭙어 보시구려",
      cls: "bg-wood/70 text-gold",
    },
    listening: {
      text: "🎤 듣고 계시네… 말씀하시구려",
      cls: "bg-jade/80 text-parchment",
    },
    speaking: {
      text: "💬 선생님께서 말씀하시는 중",
      cls: "bg-seal/85 text-parchment",
    },
  };
  const c = conf[status];
  return (
    <div
      className={`absolute top-4 left-1/2 z-40 -translate-x-1/2 rounded-sm border border-gold/40 px-4 py-1.5 text-sm tracking-wide backdrop-blur-md transition-all duration-300 ${c.cls}`}
    >
      {c.text}
    </div>
  );
}

function DevTextInjector({
  wsRef,
  playerRef,
}: {
  wsRef: React.RefObject<LiveSocket | null>;
  playerRef: React.RefObject<AudioPlayer | null>;
}) {
  const [text, setText] = useState("");
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    const ws = wsRef.current;
    const player = playerRef.current;
    if (!t || !ws || !player) return;
    if (!ws.isOpen()) {
      const ok = await ws.waitOpen(4000);
      if (!ok) return;
    }
    // autoplay 통과 — 사용자 클릭 직후 이 핸들러가 호출되니 안전.
    await player.ensureContext();
    ws.sendText(t);
    setText("");
  };
  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto mt-3 flex w-full max-w-3xl items-center gap-2"
      aria-label="dev: text injector"
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="(dev) 마이크 대신 텍스트로 Live API에 보내기 — 한국어로 한 문장…"
        className="flex-grow rounded-sm border border-gold-soft/30 bg-wood-2/60 px-3 py-2 text-sm text-parchment placeholder:text-gold-soft/60 placeholder:italic focus:border-gold/60 focus:outline-none"
      />
      <button
        type="submit"
        className="rounded-sm border border-gold-soft/40 bg-wood/80 px-3 py-2 text-sm text-gold hover:bg-wood-2"
      >
        보내기
      </button>
    </form>
  );
}

function MicIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-7 w-7"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth="1.5"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 18.75v1.5m0-1.5a6.75 6.75 0 01-6.75-6.75M12 18.75a6.75 6.75 0 006.75-6.75M12 15a3.75 3.75 0 003.75-3.75V6.75a3.75 3.75 0 10-7.5 0v4.5A3.75 3.75 0 0012 15z"
      />
    </svg>
  );
}
