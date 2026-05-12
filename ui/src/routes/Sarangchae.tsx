import { useEffect, useReducer, useRef } from "react";
import { Link } from "react-router-dom";

import { postTranscribe } from "../lib/api";
import { AudioPlayer } from "../lib/audio-player";
import { AudioRecorder } from "../lib/audio-recorder";
import { GeminiLiveDirect } from "../lib/gemini-live-direct";
import { chunksToWavBase64 } from "../lib/wav";
import { Character } from "../components/Character";

// 사랑채(음성) 페이지 — Client-to-Server 패턴.
// 브라우저가 @google/genai SDK로 Gemini Live에 직접 연결.
// 라이프사이클:
//  - mount      : AudioPlayer 인스턴스 준비. (마이크·Gemini 연결은 PTT 시점에)
//  - mic 토글ON : AudioContext resume + AudioRecorder.start
//  - mic 토글OFF: 녹음 중단 → /api/transcribe → 새 GeminiLiveDirect 세션 → 음성 응답
//  - unmount    : 모두 정리.

type Status = "connecting" | "idle" | "listening" | "transcribing" | "speaking";

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
  const recorderRef = useRef<AudioRecorder | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  /** 현재 한 turn 처리 중인 Gemini Live 직접 세션. 응답 다 받으면 close.
   *  매 PTT마다 새 인스턴스를 만들어 Gemini Live session corruption 회피. */
  const activeWsRef = useRef<GeminiLiveDirect | null>(null);
  /** 응답 음성 chunk가 마지막으로 도착한 후 일정 시간 더 안 오면 turn 종료로 간주, ws 닫음. */
  const turnEndTimerRef = useRef<number | null>(null);
  /** 1.2s 청크 없으면 입 다물기 (캐릭터 lipsync safety net). */
  const speakingTimerRef = useRef<number | null>(null);

  // === Player 초기화 (WS는 mount 시 안 만듦 — turn마다 만들기) =========
  useEffect(() => {
    const player = new AudioPlayer();
    player.onAmplitude = (level) => {
      dispatch({ type: "amplitude", value: level });
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
    // 즉시 idle — connection 대기 화면 없이 사용자가 마이크 누르면 그때 연결.
    dispatch({ type: "status", value: "idle" });

    return () => {
      if (speakingTimerRef.current !== null) {
        window.clearTimeout(speakingTimerRef.current);
      }
      if (turnEndTimerRef.current !== null) {
        window.clearTimeout(turnEndTimerRef.current);
      }
      recorderRef.current?.stop();
      recorderRef.current = null;
      activeWsRef.current?.close();
      activeWsRef.current = null;
      player.destroy();
      playerRef.current = null;
    };
  }, []);

  /** 현재 진행 중인 turn ws를 즉시 닫고 player 큐 비움 (barge-in). */
  const closeActiveTurn = () => {
    if (turnEndTimerRef.current !== null) {
      window.clearTimeout(turnEndTimerRef.current);
      turnEndTimerRef.current = null;
    }
    if (activeWsRef.current) {
      activeWsRef.current.close();
      activeWsRef.current = null;
    }
    playerRef.current?.reset();
  };

  // === Push-to-Talk (이중 path) =======================================
  // 입력: 마이크 → 16kHz PCM 청크들을 클라이언트에 누적 → 손 떼면 WAV로 패킹
  //       → /api/transcribe (Gemini Flash, ko-KR 정확) → 한국어 텍스트
  // 출력: 받은 텍스트를 /ws/live에 `text` 메시지로 송신 → 정약용 음성 응답
  //
  // 이중 path 이유: native-audio Live가 한국어 ASR이 약해 사용자 발화를 noise/외국어로
  // 오인. Gemini Flash의 audio understanding은 ko-KR 정확하므로 입력 path만 분리.

  const pttStartingRef = useRef(false);
  /** PTT 한 발에서 모은 16kHz PCM 청크들(base64 Int16). */
  const pcmChunksRef = useRef<string[]>([]);

  const startPTT = async () => {
    if (pttStartingRef.current || state.micOn) return;
    pttStartingRef.current = true;
    const player = playerRef.current;
    if (!player) {
      pttStartingRef.current = false;
      return;
    }

    // Barge-in: 직전 turn이 아직 응답 중이거나 큐에 잔여 chunk 있으면 즉시 중단.
    closeActiveTurn();

    try {
      await player.ensureContext();
      pcmChunksRef.current = [];
      const rec = new AudioRecorder();
      rec.onChunk = (b64) => pcmChunksRef.current.push(b64);
      await rec.start();
      recorderRef.current = rec;
      dispatch({ type: "micOn", value: true });
      dispatch({ type: "status", value: "listening" });
      dispatch({ type: "clearError" });
    } catch (err) {
      dispatch({ type: "error", message: formatMicError(err) });
    } finally {
      pttStartingRef.current = false;
    }
  };

  /** 응답 dead-time이 일정 시간 지속되면 turn 종료로 간주, ws close.
   *  기본 4초 — 정약용 음성이 문장 사이 잠시 멈출 때(노학자 톤)도 끊기지 않게.
   *  너무 짧으면 응답 도중 close, 너무 길면 다음 PTT 반응이 느려짐. 4s가 sweet spot.
   */
  const scheduleTurnEnd = (delayMs = 4000) => {
    if (turnEndTimerRef.current !== null) {
      window.clearTimeout(turnEndTimerRef.current);
    }
    turnEndTimerRef.current = window.setTimeout(() => {
      turnEndTimerRef.current = null;
      activeWsRef.current?.close();
      activeWsRef.current = null;
      dispatch({ type: "status", value: "idle" });
    }, delayMs);
  };

  const stopPTT = async () => {
    if (!state.micOn) return;
    recorderRef.current?.stop();
    recorderRef.current = null;
    dispatch({ type: "micOn", value: false });

    const chunks = pcmChunksRef.current;
    pcmChunksRef.current = [];
    if (chunks.length === 0) {
      dispatch({ type: "status", value: "idle" });
      return;
    }

    dispatch({ type: "status", value: "transcribing" });
    try {
      const wavBase64 = chunksToWavBase64(chunks, 16000);
      const text = await postTranscribe(wavBase64);
      const cleaned = text.trim();
      if (!cleaned) {
        dispatch({ type: "status", value: "idle" });
        dispatch({
          type: "error",
          message: "잘 들리지 않았네. 한 번 더 또박또박 말씀해 주시구려.",
        });
        return;
      }
      dispatch({ type: "heardChunk", text: cleaned });

      // 매 turn 새 GeminiLiveDirect — 한 세션 재사용 시 SDK 상태 오염 우회.
      const player = playerRef.current;
      if (!player) return;
      const session = new GeminiLiveDirect();
      activeWsRef.current = session;
      session.on({
        onAudio: (base64Pcm) => {
          player.play(base64Pcm);
          scheduleTurnEnd(); // chunk 도착마다 4초 타이머 리셋
        },
        onOutputTranscript: (text) => {
          dispatch({ type: "spokenChunk", text });
        },
        onTurnComplete: () => {
          dispatch({ type: "turnComplete" });
          scheduleTurnEnd(200); // 즉시 종료
        },
        onInterrupted: () => {
          player.reset();
          dispatch({ type: "interrupted" });
        },
        onClose: () => {
          if (activeWsRef.current === session) {
            activeWsRef.current = null;
            if (turnEndTimerRef.current !== null) {
              window.clearTimeout(turnEndTimerRef.current);
              turnEndTimerRef.current = null;
            }
          }
        },
        onError: (err) => {
          dispatch({ type: "error", message: `선생님 연결 오류: ${err.message}` });
          dispatch({ type: "status", value: "idle" });
        },
      });

      try {
        await session.connect(); // 직접 연결 (SDK가 열릴 때까지 대기)
      } catch (connErr) {
        const msg = connErr instanceof Error ? connErr.message : String(connErr);
        dispatch({ type: "status", value: "idle" });
        dispatch({ type: "error", message: `선생님과 연결이 닿지 않았네: ${msg}` });
        activeWsRef.current = null;
        return;
      }

      await session.sendText(cleaned);
      dispatch({ type: "status", value: "speaking" });
      // 응답 chunk가 한 번도 안 와도 무한 대기 안 하게 안전망.
      scheduleTurnEnd(15000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      dispatch({ type: "status", value: "idle" });
      dispatch({ type: "error", message: `음성을 옮기지 못하였네: ${msg}` });
    }
  };

  // === amplitude 기반 status 갱신 (speaking 자동 토글) ==================
  // transcribing 중에는 덮어쓰지 않음 — 그 단계는 사용자 발화 처리 중이라
  // 정약용이 아직 말 안 함. amplitude 0 인 상태는 정상.
  useEffect(() => {
    if (state.status === "transcribing") return;
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
            onClick={() => (state.micOn ? stopPTT() : startPTT())}
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
    connecting: {
      text: "다산초당에 연결을 기다리는 중…",
      cls: "bg-wood/70 text-gold",
    },
    idle: {
      text: "🎤 마이크 버튼을 눌러 말씀하시구려",
      cls: "bg-wood/70 text-gold",
    },
    listening: {
      text: "🎤 듣고 계시네… 다시 누르면 전송",
      cls: "bg-jade/80 text-parchment",
    },
    transcribing: {
      text: "✍️ 자네 말을 옮겨 적는 중…",
      cls: "bg-gold/80 text-ink",
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
