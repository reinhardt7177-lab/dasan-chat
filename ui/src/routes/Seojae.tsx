import { useEffect, useRef, useState, type FormEvent } from "react";
import type React from "react";
import { Link } from "react-router-dom";

import { postChat } from "../lib/api";
import { toApiHistory, useChatStore } from "../store/chat";

// 서재(글) 모드. 책상 위 문답록(study-bg.png 안의 책)을 핫스팟으로 만들어,
// 호버 시 황금 글로우 + hover label, 클릭 시 빛이 터지면서 채팅 패널로 전환.
// 패턴은 Landing.tsx 의 DoorOverlay 와 동일.

const GREETING =
  "나의 꼬마 학자들아, 어서 오너라!\n\n나는 조선의 학자 정약용이니라. 강진 유배지에서 경세유표를 쓰며 더 나은 세상을 꿈꿨단다.\n\n오늘 너희가 만들 어린이 경세유표에 대해 무엇이든 물어보거라. 정책 아이디어, 상호 호혜, 실사구시… 무엇이든 함께 고민해보겠노라!";

const QUICK_QUESTIONS = [
  "경세유표가 뭐예요?",
  "우리 정책에 상호 호혜가 담겼는지 봐주세요",
  "실사구시가 무슨 뜻이에요?",
  "전남과 광주가 함께 할 수 있는 정책 아이디어를 주세요",
  "정약용 선생님은 강진에서 어떻게 지내셨어요?",
  "우리 정책이 지속 가능한지 확인해주세요",
];

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
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, isWaiting]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isWaiting) return;
    setError(null);
    pushUser(trimmed);
    setInput("");
    if (inputRef.current) { inputRef.current.style.height = "auto"; }
    setWaiting(true);
    try {
      const history = toApiHistory(useChatStore.getState().messages.slice(0, -1));
      const { reply } = await postChat(trimmed, history);
      const r = (reply ?? "").trim();
      if (!r) setError("선생님이 침묵하시네. 다시 여쭙어 주시구려.");
      else pushModel(r);
    } catch (err) {
      setError(`답변을 받지 못하였네: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setWaiting(false);
      inputRef.current?.focus();
    }
  };

  const onSubmit = (e: FormEvent) => { e.preventDefault(); send(input); };
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center px-3">
      <div
        className="chat-panel-rise flex h-[90vh] w-full max-w-[720px] flex-col overflow-hidden rounded-lg shadow-[0_20px_60px_rgba(0,0,0,0.7)]"
        style={{ background: "#f5f0e8", border: "1.5px solid #c8b98a" }}
      >
        {/* 헤더 */}
        <div
          className="relative shrink-0 px-5 py-3 text-center"
          style={{ borderBottom: "1px solid #c8b98a", background: "linear-gradient(to bottom, rgba(42,24,16,0.08), transparent)" }}
        >
          <div
            className="mb-0.5 inline-block rounded-sm px-3 py-0.5 text-[11px] tracking-widest"
            style={{ background: "#7a3b1e", color: "#f5f0e8" }}
          >
            AI 정약용 서재 · 다산초당
          </div>
          <div className="brush text-xl" style={{ color: "#7a3b1e" }}>
            📚 정약용 선생님께 여쭤보세요
          </div>
          <div className="mt-0.5 text-xs" style={{ color: "#7a6e58" }}>
            어린이 경세유표를 만들 때 궁금한 것을 정약용 선생님께 질문해 보세요.
          </div>
          {/* 닫기 */}
          <button
            type="button"
            onClick={onClose}
            aria-label="문답록 덮기 (ESC)"
            title="문답록 덮기 (ESC)"
            className="absolute top-1/2 right-3 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-sm transition hover:opacity-70"
            style={{ border: "1px solid #c8b98a", color: "#7a3b1e" }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <line x1="6" y1="6" x2="18" y2="18" /><line x1="6" y1="18" x2="18" y2="6" />
            </svg>
          </button>
        </div>

        {/* 탐구질문 배너 */}
        <div
          className="relative mx-4 mt-3 shrink-0 overflow-hidden rounded"
          style={{ border: "1.5px solid #c49a3c", background: "linear-gradient(135deg, #fffbf0 0%, #f5eed8 100%)", padding: "10px 16px" }}
        >
          <div className="absolute -top-1 left-2 font-serif text-4xl opacity-20" style={{ color: "#c49a3c" }}>❝</div>
          <div className="text-[11px] font-bold tracking-wide mb-1" style={{ color: "#c49a3c" }}>오늘의 탐구질문</div>
          <div className="font-serif text-sm font-bold leading-snug" style={{ color: "#7a3b1e" }}>
            꼬마 정약용으로서 전남광주통합특별시를 위한<br />어린이 경세유표를 어떻게 만들 수 있을까?
          </div>
        </div>

        {/* 빠른 질문 버튼 */}
        <div className="shrink-0 px-4 pt-2 pb-1">
          <div className="mb-1.5 text-xs" style={{ color: "#7a6e58" }}>💡 이런 것도 물어볼 수 있어요</div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                disabled={isWaiting}
                onClick={() => send(q)}
                className="rounded-full px-3 py-1.5 text-xs transition hover:text-white disabled:opacity-40"
                style={{ background: "#ede7d5", border: "1px solid #c8b98a", color: "#7a3b1e" }}
                onMouseEnter={(e) => { (e.currentTarget.style.background = "#7a3b1e"); (e.currentTarget.style.color = "#fff"); }}
                onMouseLeave={(e) => { (e.currentTarget.style.background = "#ede7d5"); (e.currentTarget.style.color = "#7a3b1e"); }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* 구분선 */}
        <div className="mx-4 my-2 flex shrink-0 items-center gap-2">
          <div className="h-px flex-1 opacity-40" style={{ background: "#c8b98a" }} />
          <span className="text-xs" style={{ color: "#7a6e58" }}>✦ 대화창 ✦</span>
          <div className="h-px flex-1 opacity-40" style={{ background: "#c8b98a" }} />
        </div>

        {/* 메시지 영역 */}
        <div
          ref={scrollRef}
          className="scroll-zone flex-1 space-y-3 overflow-y-auto px-4 pb-3"
          style={{ background: "rgba(255,253,248,0.8)" }}
        >
          <MessageRow role="model" text={GREETING} />
          {messages.map((m) => (
            <MessageRow key={m.id} role={m.role} text={m.text} />
          ))}
          {isWaiting && <TypingRow />}
          {error && <div className="py-1 text-center text-xs" style={{ color: "#7a3b1e" }}>({error})</div>}
        </div>

        {/* 입력 */}
        <form
          onSubmit={onSubmit}
          className="flex shrink-0 items-end gap-2 p-3"
          style={{ borderTop: "1px solid #c8b98a", background: "linear-gradient(to top, rgba(42,24,16,0.06), transparent)" }}
        >
          <textarea
            ref={inputRef}
            rows={1}
            autoComplete="off"
            disabled={isWaiting}
            placeholder="정약용 선생님께 질문해보세요… (예: 우리 모둠 정책을 봐주세요)"
            value={input}
            onChange={(e) => { setInput(e.target.value); autoResize(e.target); }}
            onKeyDown={onKeyDown}
            className="flex-grow resize-none rounded-md px-3 py-2 text-sm leading-relaxed transition focus:outline-none disabled:opacity-50"
            style={{
              border: "1.5px solid #c8b98a", background: "#fffdf8",
              color: "#1a1208", minHeight: "44px", maxHeight: "120px",
              fontFamily: "inherit",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "#7a3b1e")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "#c8b98a")}
          />
          <button
            type="submit"
            disabled={isWaiting || !input.trim()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-lg text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "#7a3b1e" }}
          >
            ➤
          </button>
        </form>

        <div className="shrink-0 py-2 text-center text-[11px]" style={{ color: "#7a6e58" }}>
          Enter 키로 전송 · Shift+Enter로 줄바꿈
        </div>
      </div>
    </div>
  );
}

function MessageRow({ role, text }: { role: "user" | "model"; text: string }) {
  const isUser = role === "user";
  return (
    <div className={`msg-row flex items-start gap-2 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base"
        style={{ border: "1.5px solid #c8b98a", background: isUser ? "#e8f0e0" : "#ede7d5" }}
      >
        {isUser ? "🧒" : "🧑‍🎓"}
      </div>
      <div className="max-w-[78%]">
        <div
          className="mb-1 text-[11px] font-bold tracking-wide"
          style={{ color: isUser ? "#4a6741" : "#7a3b1e", textAlign: isUser ? "right" : "left" }}
        >
          {isUser ? "우리 모둠" : "AI 정약용 선생님"}
        </div>
        <div
          className="whitespace-pre-line rounded-xl px-3 py-2 text-sm leading-relaxed"
          style={isUser
            ? { background: "#e8f0e0", border: "1px solid rgba(74,103,65,0.4)", color: "#1a1208", borderRadius: "12px 4px 12px 12px" }
            : { background: "#faf6ee", border: "1px solid rgba(201,154,60,0.4)", color: "#1a1208", fontFamily: "serif", borderRadius: "4px 12px 12px 12px" }
          }
        >
          {text}
        </div>
      </div>
    </div>
  );
}

function TypingRow() {
  return (
    <div className="msg-row flex items-start gap-2">
      <div
        className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base"
        style={{ border: "1.5px solid #c8b98a", background: "#ede7d5" }}
      >
        🧑‍🎓
      </div>
      <div>
        <div className="mb-1 text-[11px] font-bold tracking-wide" style={{ color: "#7a3b1e" }}>AI 정약용 선생님</div>
        <div className="rounded-xl px-3 py-2 text-sm" style={{ background: "#faf6ee", border: "1px solid rgba(201,154,60,0.4)", borderRadius: "4px 12px 12px 12px" }}>
          <span className="typing-dot" />
          <span className="typing-dot" />
          <span className="typing-dot" />
        </div>
      </div>
    </div>
  );
}
