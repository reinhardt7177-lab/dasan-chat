import { useEffect, useReducer, useRef } from "react";
import { Link } from "react-router-dom";

import { AudioPlayer } from "../lib/audio-player";
import { AudioRecorder } from "../lib/audio-recorder";
import { GeminiLiveDirect } from "../lib/gemini-live-direct";
import { Character } from "../components/Character";

// 사랑채(음성) 페이지 — Live 스트리밍 모드.
// 버튼 ON: Gemini Live 세션 열기 + 마이크 PCM을 실시간 스트리밍.
// Gemini VAD가 발화 끝 감지 → 음성 응답 → 다시 학생 발화 가능.
// 버튼 OFF: 마이크 + 세션 종료.

type Status = "idle" | "listening" | "speaking";

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
  status: "idle",
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

  const recorderRef = useRef<AudioRecorder | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const sessionRef = useRef<GeminiLiveDirect | null>(null);
  const speakingTimerRef = useRef<number | null>(null);
  const startingRef = useRef(false);

  // === Player 초기화 ===================================================
  useEffect(() => {
    const player = new AudioPlayer();
    player.onAmplitude = (level) => {
      dispatch({ type: "amplitude", value: level });
      if (speakingTimerRef.current !== null) window.clearTimeout(speakingTimerRef.current);
      if (level > 0) {
        speakingTimerRef.current = window.setTimeout(() => {
          dispatch({ type: "amplitude", value: 0 });
        }, 1200);
      }
    };
    playerRef.current = player;
    dispatch({ type: "status", value: "idle" });

    return () => {
      if (speakingTimerRef.current !== null) window.clearTimeout(speakingTimerRef.current);
      recorderRef.current?.stop();
      recorderRef.current = null;
      sessionRef.current?.close();
      sessionRef.current = null;
      player.destroy();
      playerRef.current = null;
    };
  }, []);

  // === 라이브 토글 =====================================================
  // ON : Gemini Live 세션 열기 + 마이크 PCM 실시간 스트리밍
  // OFF: 마이크 + 세션 종료
  // VAD가 학생 발화 끝을 자동 감지 → 정약용이 음성으로 바로 응답.

  const startLive = async () => {
    if (startingRef.current || state.micOn) return;
    startingRef.current = true;
    const player = playerRef.current;
    if (!player) { startingRef.current = false; return; }

    // 기존 세션 정리
    sessionRef.current?.close();
    sessionRef.current = null;
    player.reset();

    try {
      await player.ensureContext();

      const session = new GeminiLiveDirect();
      session.on({
        onAudio: (b64) => player.play(b64),
        onOutputTranscript: (text) => dispatch({ type: "spokenChunk", text }),
        onTurnComplete: () => dispatch({ type: "turnComplete" }),
        onInterrupted: () => { player.reset(); dispatch({ type: "interrupted" }); },
        onClose: () => {
          // 예상치 못한 세션 종료 → idle로
          sessionRef.current = null;
          dispatch({ type: "micOn", value: false });
          dispatch({ type: "status", value: "idle" });
        },
        onError: (err) => {
          dispatch({ type: "error", message: `연결 오류: ${err.message}` });
        },
      });

      await session.connect();
      sessionRef.current = session;

      // 마이크 → PCM 청크를 실시간으로 Gemini에 스트리밍
      const rec = new AudioRecorder();
      rec.onChunk = (b64) => session.sendAudio(b64);
      await rec.start();
      recorderRef.current = rec;

      dispatch({ type: "micOn", value: true });
      dispatch({ type: "status", value: "listening" });
      dispatch({ type: "clearError" });
    } catch (err) {
      sessionRef.current?.close();
      sessionRef.current = null;
      dispatch({ type: "error", message: formatMicError(err) });
    } finally {
      startingRef.current = false;
    }
  };

  const stopLive = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    sessionRef.current?.close();
    sessionRef.current = null;
    playerRef.current?.reset();
    dispatch({ type: "micOn", value: false });
    dispatch({ type: "status", value: "idle" });
  };

  // === amplitude → speaking 상태 자동 갱신 ============================
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
            onClick={() => (state.micOn ? stopLive() : startLive())}
            className={`relative flex h-16 w-16 select-none items-center justify-center rounded-full border transition ${
              state.micOn
                ? "scale-110 border-seal-bright bg-seal text-parchment shadow-[0_0_24px_rgba(139,26,26,0.6)]"
                : "border-gold-soft/40 bg-wood-2/70 text-gold hover:bg-wood-2"
            }`}
            aria-label={state.micOn ? "마이크 끄기" : "마이크 켜기"}
            aria-pressed={state.micOn}
          >
            <MicIcon />
            {state.micOn && (
              <span className="pointer-events-none absolute inset-0 animate-ping rounded-full bg-seal/40" />
            )}
          </button>
          <div className="text-sm text-parchment/80">
            {state.micOn
              ? "🎤 듣고 계시네… 다시 누르면 전송"
              : "마이크 버튼을 눌러 말씀하시구려"}
          </div>
        </div>

      </div>
    </div>
  );
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
    idle: {
      text: "🎤 마이크 버튼을 눌러 대화를 시작하시구려",
      cls: "bg-wood/70 text-gold",
    },
    listening: {
      text: "🎤 듣고 있네… 말씀하시구려 (다시 누르면 종료)",
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
