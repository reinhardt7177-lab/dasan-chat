import { useEffect, useReducer, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { AudioRecorder } from "../lib/audio-recorder";
import { GeminiLiveDirect } from "../lib/gemini-live-direct";
import { HeyGenSession } from "../lib/heygen-avatar";
import { Character } from "../components/Character";

type Status = "idle" | "loading" | "listening" | "speaking";

type State = {
  status: Status;
  micOn: boolean;
  heardBuffer: string;
  lastHeard: string;
  spokenBuffer: string;
  lastSpoken: string;
  errorMsg: string | null;
};

type Action =
  | { type: "status"; value: Status }
  | { type: "micOn"; value: boolean }
  | { type: "heardChunk"; text: string }
  | { type: "spokenChunk"; text: string }
  | { type: "turnComplete" }
  | { type: "interrupted" }
  | { type: "error"; message: string }
  | { type: "clearError" };

const initial: State = {
  status: "idle",
  micOn: false,
  heardBuffer: "",
  lastHeard: "",
  spokenBuffer: "",
  lastSpoken: "",
  errorMsg: null,
};

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "status":      return { ...s, status: a.value };
    case "micOn":       return { ...s, micOn: a.value };
    case "heardChunk":  return { ...s, heardBuffer: s.heardBuffer + a.text };
    case "spokenChunk": return { ...s, spokenBuffer: s.spokenBuffer + a.text };
    case "turnComplete": {
      const lastHeard  = s.heardBuffer.trim()  || s.lastHeard;
      const lastSpoken = s.spokenBuffer.trim() || s.lastSpoken;
      return { ...s, heardBuffer: "", spokenBuffer: "", lastHeard, lastSpoken };
    }
    case "interrupted": return { ...s, spokenBuffer: "" };
    case "error":       return { ...s, errorMsg: a.message };
    case "clearError":  return { ...s, errorMsg: null };
  }
}

export function Sarangchae() {
  const [state, dispatch] = useReducer(reducer, initial);
  const [avatarStream, setAvatarStream] = useState<MediaStream | null>(null);

  const recorderRef   = useRef<AudioRecorder | null>(null);
  const sessionRef    = useRef<GeminiLiveDirect | null>(null);
  const heygenRef     = useRef<HeyGenSession | null>(null);
  const pendingTextRef = useRef("");
  const micOnRef      = useRef(false);   // closure-safe mirror of state.micOn
  const startingRef   = useRef(false);
  const videoRef      = useRef<HTMLVideoElement>(null);

  // micOnRef 동기화
  useEffect(() => { micOnRef.current = state.micOn; }, [state.micOn]);

  // HeyGen 스트림 → video 엘리먼트에 연결
  useEffect(() => {
    if (videoRef.current && avatarStream) {
      videoRef.current.srcObject = avatarStream;
    }
  }, [avatarStream]);

  // 언마운트 정리
  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      sessionRef.current?.close();
      heygenRef.current?.stop().catch(() => {});
    };
  }, []);

  // ── 대화 시작 ────────────────────────────────────────────────────────────
  const startLive = async () => {
    if (startingRef.current || state.micOn) return;
    startingRef.current = true;
    dispatch({ type: "status", value: "loading" });

    try {
      // 1) HeyGen 세션
      const heygen = new HeyGenSession();
      heygen.onStream    = (stream) => setAvatarStream(stream);
      heygen.onTalkStart = () => dispatch({ type: "status", value: "speaking" });
      heygen.onTalkEnd   = () =>
        dispatch({ type: "status", value: micOnRef.current ? "listening" : "idle" });
      await heygen.start();
      heygenRef.current = heygen;

      // 2) Gemini Live 세션
      sessionRef.current?.close();
      const session = new GeminiLiveDirect();
      session.on({
        onAudio: () => {
          // A방식: Gemini 오디오 무시 — HeyGen TTS가 대신 말함
        },
        onOutputTranscript: (text) => {
          dispatch({ type: "spokenChunk", text });
          pendingTextRef.current += text;
        },
        onTurnComplete: async () => {
          const text = pendingTextRef.current.trim();
          pendingTextRef.current = "";
          dispatch({ type: "turnComplete" });
          if (text) await heygenRef.current?.speak(text);
        },
        onInterrupted: () => {
          heygenRef.current?.interrupt().catch(() => {});
          pendingTextRef.current = "";
          dispatch({ type: "interrupted" });
        },
        onClose: () => {
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

      // 3) 마이크 → Gemini 스트리밍
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
      heygenRef.current?.stop().catch(() => {});
      heygenRef.current = null;
      setAvatarStream(null);
      dispatch({ type: "error", message: formatMicError(err) });
      dispatch({ type: "status", value: "idle" });
    } finally {
      startingRef.current = false;
    }
  };

  // ── 대화 종료 ────────────────────────────────────────────────────────────
  const stopLive = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    sessionRef.current?.close();
    sessionRef.current = null;
    heygenRef.current?.stop().catch(() => {});
    heygenRef.current = null;
    pendingTextRef.current = "";
    setAvatarStream(null);
    dispatch({ type: "micOn", value: false });
    dispatch({ type: "status", value: "idle" });
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#1a0e0a]">
      {/* 배경 */}
      <div
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/images/background.png')" }}
      />
      <div className="pointer-events-none absolute inset-0 z-[1] bg-black/25" />

      {/* 뒤로가기 */}
      <Link
        to="/landing"
        className="absolute top-4 left-4 z-50 rounded-sm border border-gold-soft/40 bg-wood/80 px-3 py-1.5 text-sm text-gold transition hover:bg-wood-2"
      >
        ← 다산초당
      </Link>

      {/* 상태 배지 */}
      <StatusBadge status={state.status} />

      {/* 아바타 또는 기본 캐릭터 */}
      {avatarStream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="absolute bottom-28 left-1/2 z-10 -translate-x-1/2 max-h-[62vh] w-auto rounded-lg shadow-[0_8px_40px_rgba(0,0,0,0.7)]"
        />
      ) : (
        <Character
          amplitude={0}
          speaking={state.status === "speaking"}
        />
      )}

      {/* 학생 발화 자막 (좌) */}
      {(state.heardBuffer || state.lastHeard) && (
        <div className="hanji-surface scroll-zone absolute top-24 left-6 z-40 max-h-[35vh] w-[28rem] overflow-y-auto rounded-sm border border-gold-soft/50 p-4 text-ink shadow-[0_4px_12px_rgba(0,0,0,0.35)]">
          <div className="mb-1 text-xs font-bold text-jade tracking-wide">학생 (자네)</div>
          <div className="text-base leading-relaxed">{state.heardBuffer || state.lastHeard}</div>
        </div>
      )}

      {/* 선생님 답변 자막 (우) */}
      {(state.spokenBuffer || state.lastSpoken) && (
        <div className="hanji-surface scroll-zone absolute top-24 right-6 z-40 max-h-[35vh] w-[28rem] overflow-y-auto rounded-sm border border-gold-soft/50 p-4 text-ink shadow-[0_4px_12px_rgba(0,0,0,0.35)]">
          <div className="mb-1 text-xs font-bold text-seal tracking-wide">정약용</div>
          <div className="text-base leading-relaxed">{state.spokenBuffer || state.lastSpoken}</div>
        </div>
      )}

      {/* 에러 */}
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

      {/* 하단 컨트롤 */}
      <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-6">
        <div className="lacquer-surface mx-auto flex w-full max-w-3xl flex-col items-center justify-center gap-2 rounded-md px-5 py-4">
          <button
            onClick={() => (state.micOn ? stopLive() : startLive())}
            disabled={state.status === "loading"}
            className={`relative flex h-20 w-20 select-none items-center justify-center rounded-full border-2 transition-all duration-200 ${
              state.micOn
                ? "border-seal-bright bg-seal text-parchment shadow-[0_0_32px_rgba(139,26,26,0.7)] scale-110"
                : state.status === "loading"
                ? "border-gold-soft/40 bg-wood-2/70 text-gold/50 cursor-wait"
                : "border-gold-soft/40 bg-wood-2/70 text-gold hover:bg-wood-2 hover:scale-105"
            }`}
            aria-label={state.micOn ? "대화 종료" : "대화 시작"}
            aria-pressed={state.micOn}
          >
            {state.status === "loading" ? (
              <LoadingIcon />
            ) : state.micOn ? (
              <PhoneOffIcon />
            ) : (
              <PhoneIcon />
            )}
            {state.micOn && (
              <span className="pointer-events-none absolute inset-0 animate-ping rounded-full bg-seal/30" />
            )}
          </button>
          <div className="text-center text-sm text-parchment/80">
            {state.status === "loading"
              ? "선생님을 모시는 중… 잠시만 기다리시구려"
              : state.micOn
              ? state.status === "speaking"
                ? "선생님 말씀 중… 기다리시구려"
                : "말씀하시구려 — 잠시 멈추면 선생님이 답하시리"
              : "버튼을 눌러 다산 선생님과 대화를 시작하시구려"}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 유틸 ────────────────────────────────────────────────────────────────────

function formatMicError(err: unknown): string {
  if (!(err instanceof Error)) return `오류: ${String(err)}`;
  switch (err.name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "마이크 사용 권한이 거부되었네. 주소창 자물쇠 아이콘에서 마이크를 허용해 주시구려.";
    case "NotFoundError":
      return "마이크 장치를 찾지 못하였네. 마이크가 연결되어 있는지 살펴 주시구려.";
    case "NotSupportedError":
      return "이 브라우저에서는 마이크를 쓸 수 없네. 크롬이나 엣지를 써 주시구려.";
    case "SecurityError":
      return "https가 아니어서 마이크를 쓸 수 없네.";
    default:
      return `오류: ${err.message}`;
  }
}

function StatusBadge({ status }: { status: Status }) {
  const conf: Record<Status, { text: string; cls: string }> = {
    idle: {
      text: "버튼을 눌러 다산 선생님과 대화를 시작하시구려",
      cls: "bg-wood/70 text-gold",
    },
    loading: {
      text: "⏳ 선생님을 모시는 중…",
      cls: "bg-wood/70 text-gold animate-pulse",
    },
    listening: {
      text: "🎤 말씀하시구려 — 잠시 멈추면 선생님이 답하시리",
      cls: "bg-jade/80 text-parchment",
    },
    speaking: {
      text: "💬 선생님께서 말씀하시는 중… 기다리시구려",
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

function LoadingIcon() {
  return (
    <svg className="h-8 w-8 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
    </svg>
  );
}

function PhoneOffIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 3.75L18 6m0 0l2.25 2.25M18 6l2.25-2.25M18 6l-2.25 2.25m1.5 13.5c-8.284 0-15-6.716-15-15V4.5A2.25 2.25 0 014.5 2.25h1.372c.516 0 .966.351 1.091.852l1.106 4.423c.11.44-.055.902-.417 1.173l-1.293.97a1.125 1.125 0 00-.38 1.21 12.035 12.035 0 007.143 7.143c.441.162.928-.004 1.21-.38l.97-1.293c.271-.363.734-.527 1.173-.417l4.423 1.106c.5.125.852.575.852 1.091V19.5a2.25 2.25 0 01-2.25 2.25h-2.25z" />
    </svg>
  );
}
