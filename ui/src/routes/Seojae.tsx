import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { postChat } from "../lib/api";
import { toApiHistory, useChatStore } from "../store/chat";

// 서재(글) 모드. 닫힌 책 → 펼침 애니메이션 → 한지 채팅 패널.
// 원본 study/index.html + study.js 구조를 그대로 React로 옮겼다.

const GREETING =
  "허허, 어서 오게나. 무엇이 궁금한지 글로 적어 보시구려.";

export function Seojae() {
  const [opened, setOpened] = useState(false);
  const [animating, setAnimating] = useState(false);

  const handleOpen = () => {
    if (animating || opened) return;
    setAnimating(true);
    // 책이 펴지는 0.6초 애니메이션 후 패널 노출.
    setTimeout(() => {
      setOpened(true);
      setAnimating(false);
    }, 600);
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
      {/* darkening + 가운데로 시선 모으는 warm spotlight */}
      <div className="pointer-events-none absolute inset-0 z-[1] bg-black/45" />
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background:
            "radial-gradient(ellipse 32% 36% at 50% 52%, rgba(255, 220, 150, 0.28), transparent 70%)",
        }}
      />

      {/* 다산초당으로 */}
      <Link
        to="/"
        className="absolute top-4 left-4 z-50 rounded-sm border border-gold-soft/40 bg-wood/80 px-3 py-1.5 text-sm text-gold transition hover:bg-wood-2"
      >
        ← 다산초당
      </Link>

      {!opened ? (
        <ClosedBook onOpen={handleOpen} animating={animating} />
      ) : (
        <ChatPanel />
      )}

      {/* 책 펼침 + 메시지 입장 keyframes */}
      <style>{`
        @keyframes book-open {
          0%   { transform: scale(1) rotate(0deg); opacity: 1; }
          40%  { transform: scale(1.3) rotate(-3deg); opacity: 1; }
          100% { transform: scale(1.6) rotate(0deg); opacity: 0; }
        }
        .book-opening { animation: book-open 0.7s ease-in forwards; pointer-events: none; }

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

        /* 닫힌 책 */
        .book-closed { width: 220px; height: 300px; position: relative; cursor: pointer; transform-style: preserve-3d; transition: transform .4s ease, filter .4s ease; filter: drop-shadow(0 12px 28px rgba(0,0,0,0.6)); }
        .book-closed:hover { transform: translateY(-4px) rotate(-1deg); filter: drop-shadow(0 16px 36px rgba(0,0,0,0.7)) drop-shadow(0 0 24px rgba(201,168,87,0.4)); }
        .book-cover { position: absolute; inset: 0; background: radial-gradient(ellipse at 20% 30%, rgba(201,168,87,0.15) 0%, transparent 60%), linear-gradient(135deg, #2d1a10 0%, #4a2a1a 50%, #2d1a10 100%); border-radius: 4px 8px 8px 4px; border: 1px solid rgba(201,168,87,0.3); box-shadow: inset 12px 0 0 -8px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(201,168,87,0.15), 0 0 30px rgba(0,0,0,0.4); display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--color-gold); text-align: center; padding: 20px; }
        .book-cover::before { content:""; position:absolute; left:0; top:0; bottom:0; width:14px; background: linear-gradient(90deg, rgba(0,0,0,0.4), transparent); border-radius: 4px 0 0 4px; }
        .book-cover::after { content:""; position:absolute; right:0; top:4%; bottom:4%; width:6px; background: repeating-linear-gradient(90deg, rgba(245,236,217,0.85) 0px, rgba(221,208,176,0.85) 1px, rgba(245,236,217,0.85) 2px); }
        .book-title-zh { font-family: var(--font-brush); font-size: 36px; line-height: 1.1; margin-bottom: 8px; color: var(--color-gold); text-shadow: 0 2px 6px rgba(0,0,0,0.7); }
        .book-title-ko { font-size: 12px; color: var(--color-parchment-soft); letter-spacing: 0.3em; margin-top: 6px; }
        .book-author { position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%); font-size: 11px; color: var(--color-gold-soft); letter-spacing: 0.2em; opacity: 0.7; }

        .bubble-user   { background: rgba(74,107,79,0.12); border: 1px solid rgba(74,107,79,0.40); color: var(--color-ink); }
        .bubble-master { background: rgba(245,236,217,0.7); border: 1px solid rgba(201,168,87,0.40); color: var(--color-ink); }
      `}</style>
    </div>
  );
}

function ClosedBook({ onOpen, animating }: { onOpen: () => void; animating: boolean }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6">
      <div className="brush text-3xl text-parchment drop-shadow-[0_3px_10px_rgba(0,0,0,0.85)] md:text-4xl">
        서재
      </div>
      <button
        type="button"
        className={`book-closed ${animating ? "book-opening" : ""}`}
        aria-label="책 펼치기"
        onClick={onOpen}
      >
        <div className="book-cover">
          <div className="book-title-zh">
            問
            <br />
            答
            <br />
            錄
          </div>
          <div className="book-title-ko">문답록</div>
          <div className="book-author">— 다산 정약용 —</div>
        </div>
      </button>
      <div className="hint-pulse text-sm text-parchment/70 drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]">
        책을 펼쳐 선생님께 글로 여쭙어 보시구려
      </div>
    </div>
  );
}

function ChatPanel() {
  const { messages, isWaiting, error, pushUser, pushModel, setWaiting, setError } =
    useChatStore();
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

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
        <div className="border-b border-gold-soft/30 bg-gradient-to-b from-wood/15 to-transparent px-5 py-3 text-center">
          <div className="brush text-2xl text-ink">정약용 선생님과의 문답</div>
          <div className="mt-1 text-xs tracking-[0.3em] text-seal">
            — 글로 여쭙기 —
          </div>
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
