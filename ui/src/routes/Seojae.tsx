import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { postChat } from "../lib/api";
import { toApiHistory, useChatStore } from "../store/chat";

// 서재(글) 모드. 책상 위 문답록(study-bg.png 안의 책)을 핫스팟으로 만들어,
// 호버 시 황금 글로우 + hover label, 클릭 시 빛이 터지면서 채팅 패널로 전환.
// 패턴은 Landing.tsx 의 DoorOverlay 와 동일.

const GREETING =
  "허허, 어서 오게나. 무엇이 궁금한지 글로 적어 보시구려.";

export function Seojae() {
  const [opened, setOpened] = useState(false);
  const [animating, setAnimating] = useState(false);

  const handleOpen = () => {
    if (animating || opened) return;
    setAnimating(true);
    // 빛이 터지는 0.6초 효과 후 패널 노출.
    setTimeout(() => {
      setOpened(true);
      setAnimating(false);
    }, 600);
  };

  const handleClose = () => {
    // 패널만 닫고 핫스팟 화면으로 복귀. 대화 히스토리는 그대로 유지.
    setOpened(false);
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#1a0e0a]">
      {/* 서재 배경 (study-bg → background 순으로 fallback) */}
      <div
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage:
            "url('/images/study-bg.png'), url('/images/background.png')",
        }}
      />
      {/* darkening + 책상 위로 시선 모으는 warm spotlight */}
      <div className="pointer-events-none absolute inset-0 z-[1] bg-black/45" />
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background:
            "radial-gradient(ellipse 28% 28% at 50% 63%, rgba(255, 220, 150, 0.34), transparent 70%)",
        }}
      />

      {/* 다산초당으로 */}
      <Link
        to="/landing"
        className="absolute top-4 left-4 z-50 rounded-sm border border-gold-soft/40 bg-wood/80 px-3 py-1.5 text-sm text-gold transition hover:bg-wood-2"
      >
        ← 다산초당
      </Link>

      {!opened ? (
        <BookHotspot onOpen={handleOpen} animating={animating} />
      ) : (
        <ChatPanel onClose={handleClose} />
      )}

      {/* 핫스팟 + 채팅 패널 + 메시지 keyframes */}
      <style>{`
        /* 클릭 시 황금 빛이 펑 터지며 사라지는 효과 */
        @keyframes book-burst {
          0%   { opacity: 1; transform: scale(1);
                 box-shadow: 0 0 30px rgba(255,200,120,0.45), inset 0 0 40px rgba(255,220,150,0.25);
                 background-color: rgba(255,220,150,0.20); }
          40%  { opacity: 0.95; transform: scale(1.06);
                 box-shadow: 0 0 90px rgba(255,200,120,0.95), inset 0 0 100px rgba(255,220,150,0.6);
                 background-color: rgba(255,220,150,0.45); }
          100% { opacity: 0; transform: scale(1.25);
                 box-shadow: 0 0 140px rgba(255,200,120,0), inset 0 0 0 rgba(255,220,150,0);
                 background-color: rgba(255,220,150,0); }
        }
        .book-burst { animation: book-burst 0.6s ease-out forwards; pointer-events: none; }

        @keyframes chat-rise {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        .chat-panel-rise { animation: chat-rise 0.55s ease-out 0.05s backwards; }

        @keyframes msg-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .msg-row { animation: msg-in 0.35s ease-out; }

        @keyframes typing-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30%           { transform: translateY(-4px); opacity: 1; }
        }
        .typing-dot {
          display: inline-block; width: 6px; height: 6px; margin: 0 2px;
          border-radius: 50%; background: var(--color-gold-soft);
          animation: typing-bounce 1.2s ease-in-out infinite;
        }
        .typing-dot:nth-child(2) { animation-delay: 0.15s; }
        .typing-dot:nth-child(3) { animation-delay: 0.30s; }

        @keyframes hint-pulse { 0%,100%{opacity:.5} 50%{opacity:1} }
        .hint-pulse { animation: hint-pulse 2.5s ease-in-out infinite; }

        @keyframes fadein { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        .anim-fadein { animation: fadein 1.2s ease-out; }

        .bubble-user   { background: rgba(74,107,79,0.12); border: 1px solid rgba(74,107,79,0.40); color: var(--color-ink); }
        .bubble-master { background: rgba(245,236,217,0.7); border: 1px solid rgba(201,168,87,0.40); color: var(--color-ink); }
      `}</style>
    </div>
  );
}

function BookHotspot({
  onOpen,
  animating,
}: {
  onOpen: () => void;
  animating: boolean;
}) {
  // 핫스팟 박스 — study-bg.png 안의 책상 위 문답록(問答錄) 책 위치에 정확히 핀.
  // 책 자체 크기에 가깝게 좁혀서 호버 영역이 책에서 벗어나지 않도록.
  const bookPosition = {
    left: "calc(38% + 110px)",
    right: "calc(54% - 110px)",
    top: "calc(53% + 30px)",
    bottom: "calc(33% - 30px)",
  };

  return (
    <>
      {/* 상단 제목 */}
      <div className="anim-fadein absolute top-8 left-1/2 z-10 -translate-x-1/2 text-center">
        <div className="brush text-3xl text-parchment drop-shadow-[0_3px_10px_rgba(0,0,0,0.85)] md:text-4xl">
          서재
        </div>
        <div className="mt-1 text-xs tracking-[0.3em] text-gold drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)] md:text-sm">
          — 글로 여쭙기 —
        </div>
      </div>

      {/* 책상 위 문답록 핫스팟 */}
      <button
        type="button"
        onClick={onOpen}
        aria-label="문답록 책 펼치기"
        className={`book-hotspot group absolute z-[5] cursor-pointer rounded-sm border-2 border-transparent transition-all duration-300 ease-out hover:border-gold/80 hover:bg-[rgba(255,220,150,0.08)] hover:shadow-[0_0_24px_rgba(255,200,120,0.55),inset_0_0_12px_rgba(255,220,150,0.18)] ${
          animating ? "book-burst" : ""
        }`}
        style={bookPosition}
      >
        {/* hover label — 책 아래에 떠오름 */}
        <div className="pointer-events-none absolute -bottom-4 left-1/2 w-48 -translate-x-1/2 translate-y-full rounded-sm border border-gold/65 bg-gradient-to-b from-ink/95 to-[#0f0a08]/95 px-5 py-3 text-center text-parchment opacity-0 shadow-[0_8px_24px_rgba(0,0,0,0.55),inset_0_0_0_1px_rgba(201,168,87,0.15)] transition-all duration-300 ease-out group-hover:translate-y-full group-hover:opacity-100 md:w-56">
          <div className="mb-1 flex items-center justify-center gap-2">
            <BookIcon />
            <span className="text-lg font-bold">문답록</span>
          </div>
          <div className="text-[11px] text-gold">— 펼쳐 여쭙기 —</div>
        </div>
      </button>

      {/* 하단 안내 */}
      <div className="hint-pulse absolute bottom-10 left-1/2 z-10 -translate-x-1/2 text-sm text-parchment/70 drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]">
        책상 위 문답록을 펴 보시구려
      </div>
    </>
  );
}

function BookIcon() {
  return (
    <svg
      className="h-5 w-5 text-gold"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth="1.5"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
      />
    </svg>
  );
}

function ChatPanel({ onClose }: { onClose: () => void }) {
  const { messages, isWaiting, error, pushUser, pushModel, setWaiting, setError } =
    useChatStore();
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // ESC 키로도 패널 닫기.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 메시지 추가될 때마다 맨 아래로 스크롤.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, isWaiting]);

  // 패널 열리자마자 입력 포커스.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isWaiting) return;

    setError(null);
    pushUser(text);
    setInput("");
    setWaiting(true);

    try {
      // 직전까지의 히스토리만 보낸다(현재 메시지는 서버가 별도 message 인자로 받음).
      const history = toApiHistory(useChatStore.getState().messages.slice(0, -1));
      const { reply } = await postChat(text, history);
      const trimmed = (reply ?? "").trim();
      if (!trimmed) {
        setError("선생님이 침묵하시네. 다시 여쭙어 주시구려.");
      } else {
        pushModel(trimmed);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`답변을 받지 못하였네: ${msg}`);
    } finally {
      setWaiting(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center">
      <div className="chat-panel-rise hanji-surface flex h-[80vh] w-[92vw] flex-col overflow-hidden rounded-md border border-gold-soft/60 shadow-[0_20px_60px_rgba(0,0,0,0.7)] md:h-[36rem] md:w-[44rem]">
        {/* 헤더 */}
        <div className="relative border-b border-gold-soft/30 bg-gradient-to-b from-wood/15 to-transparent px-5 py-3 text-center">
          <div className="brush text-2xl text-ink">정약용 선생님과의 문답</div>
          <div className="mt-1 text-xs tracking-[0.3em] text-seal">
            — 글로 여쭙기 —
          </div>

          {/* 닫기 (책 덮기) */}
          <button
            type="button"
            onClick={onClose}
            aria-label="문답록 덮기 (ESC)"
            title="문답록 덮기 (ESC)"
            className="absolute top-1/2 right-3 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-sm border border-gold-soft/40 bg-parchment/40 text-ink/70 transition hover:border-seal/60 hover:bg-seal/10 hover:text-seal"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="6" y1="18" x2="18" y2="6" />
            </svg>
          </button>
        </div>

        {/* 메시지 영역 */}
        <div
          ref={scrollRef}
          className="scroll-zone flex-1 space-y-3 overflow-y-auto px-5 py-4 text-ink"
        >
          {/* 첫 인사 — store에는 안 담는다 (서버 history에도 보낼 필요 없음). */}
          <MessageRow role="model" text={GREETING} />
          {messages.map((m) => (
            <MessageRow key={m.id} role={m.role} text={m.text} />
          ))}
          {isWaiting && <TypingRow />}
          {error && (
            <div className="py-1 text-center text-xs text-seal">({error})</div>
          )}
        </div>

        {/* 입력 */}
        <form
          onSubmit={onSubmit}
          className="flex gap-2 border-t border-gold-soft/30 bg-gradient-to-t from-wood/10 to-transparent p-3"
        >
          <input
            ref={inputRef}
            type="text"
            autoComplete="off"
            required
            disabled={isWaiting}
            placeholder="여기에 글을 적어 보시구려…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-grow rounded-sm border border-gold-soft/40 bg-white/60 px-3 py-2 text-ink placeholder:text-gold-soft/70 placeholder:italic transition focus:border-gold focus:bg-white/80 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isWaiting || !input.trim()}
            className="rounded-sm bg-seal px-4 py-2 text-parchment shadow-[0_2px_8px_rgba(139,26,26,0.4)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            여쭙기
          </button>
        </form>
      </div>
    </div>
  );
}

function MessageRow({ role, text }: { role: "user" | "model"; text: string }) {
  const isUser = role === "user";
  return (
    <div className="msg-row flex items-start gap-2">
      <div
        className="mt-1 w-12 shrink-0 text-xs font-bold"
        style={{ color: isUser ? "var(--color-jade)" : "var(--color-seal)" }}
      >
        {isUser ? "학생" : "정약용"}
      </div>
      <div
        className={`whitespace-pre-line rounded-sm px-3 py-2 text-sm leading-relaxed ${isUser ? "bubble-user" : "bubble-master"}`}
      >
        {text}
      </div>
    </div>
  );
}

function TypingRow() {
  return (
    <div className="msg-row flex items-start gap-2">
      <div className="mt-1 w-12 shrink-0 text-xs font-bold text-seal">정약용</div>
      <div className="bubble-master rounded-sm px-3 py-2 text-sm leading-relaxed">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
    </div>
  );
}
