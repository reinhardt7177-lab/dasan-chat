import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { playBgMusic } from "../lib/bgMusic";

// 첫 진입 화면 — 학이 날고 물이 흐르는 이이남 스타일 영상.
// 1번째 클릭: 배경음악 재생 시작 (브라우저 autoplay 정책상 사용자 제스처 필요).
// 2번째 클릭: 페이드아웃 후 /landing 으로 이동.

type Step = "armed" | "music-on" | "leaving";

export function Intro() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("armed");

  const handleClick = () => {
    if (step === "armed") {
      playBgMusic();
      setStep("music-on");
      return;
    }
    if (step === "music-on") {
      setStep("leaving");
      window.setTimeout(() => navigate("/landing"), 800);
    }
  };

  return (
    <div
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handleClick();
      }}
      role="button"
      tabIndex={0}
      aria-label={
        step === "armed" ? "음악을 켜고 다산초당으로 들어가기" : "다산초당으로 들어가기"
      }
      className={`fixed inset-0 z-50 cursor-pointer overflow-hidden bg-black transition-opacity duration-700 ease-out ${
        step === "leaving" ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* 배경 영상 */}
      <video
        className="absolute inset-0 z-0 h-full w-full object-cover"
        autoPlay
        loop
        muted
        playsInline
        poster="/videos/intro-poster.jpg"
      >
        <source src="/videos/intro.mp4" type="video/mp4" />
      </video>

      {/* vignette — 글자 가독성 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-40 bg-gradient-to-b from-black/55 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-44 bg-gradient-to-t from-black/65 to-transparent" />

      {/* 제목 — 화면 정중앙 */}
      <div className="anim-fadein absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-center">
        {/* 제목 뒤 국부 어둠 — 영상이 무엇이든 글자가 떠보이게 */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/2 -z-10 h-[160%] w-[140%] -translate-x-1/2 -translate-y-1/2"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.55) 35%, rgba(0,0,0,0.25) 60%, rgba(0,0,0,0) 80%)",
          }}
        />
        <h1 className="title-brush text-7xl text-parchment md:text-9xl">
          다산초당
        </h1>
        <p className="title-sub mt-6 text-base tracking-[0.5em] text-gold md:mt-8 md:text-xl">
          정약용 선생님과의 만남
        </p>

        {/* 다산 명언 */}
        <blockquote className="quote-text anim-quote-in mx-auto mt-10 max-w-[26ch] text-lg leading-relaxed text-parchment/95 md:mt-14 md:max-w-none md:text-2xl">
          <span className="quote-mark mr-1 align-top text-gold/80">“</span>
          책 읽기는 나의 꿈을 키우는 가장 든든한 뿌리란다.
          <span className="quote-mark ml-1 align-top text-gold/80">”</span>
        </blockquote>
      </div>

      <style>{`
        @keyframes fadein { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes quote-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .anim-fadein { animation: fadein 1.4s ease-out; }
        .anim-quote-in { animation: quote-in 1.6s ease-out 0.9s both; }

        /* 다산 명언 — 본문은 명조, 따옴표는 큼직하게 */
        .quote-text {
          font-family: var(--font-serif);
          font-style: italic;
          -webkit-text-stroke: 0.5px rgba(0, 0, 0, 0.6);
          paint-order: stroke fill;
          text-shadow:
            0 1px 0 rgba(0, 0, 0, 0.85),
            0 2px 10px rgba(0, 0, 0, 0.9),
            0 4px 18px rgba(0, 0, 0, 0.7);
        }
        .quote-mark {
          font-family: var(--font-serif);
          font-style: normal;
          font-size: 1.4em;
          line-height: 0;
        }

        /* 메인 타이틀 — 다층 그림자 + 미세 윤곽으로 어떤 배경에서도 또렷하게 */
        .title-brush {
          font-family: var(--font-brush);
          letter-spacing: 0.05em;
          font-weight: 400;
          -webkit-text-stroke: 1px rgba(0, 0, 0, 0.55);
          paint-order: stroke fill;
          text-shadow:
            0 2px 0 rgba(0, 0, 0, 0.85),
            0 4px 12px rgba(0, 0, 0, 0.9),
            0 8px 24px rgba(0, 0, 0, 0.75),
            0 0 40px rgba(0, 0, 0, 0.5);
        }
        /* 부제 — 금색이라 어두운 윤곽으로 또렷하게 */
        .title-sub {
          -webkit-text-stroke: 0.6px rgba(0, 0, 0, 0.7);
          paint-order: stroke fill;
          text-shadow:
            0 1px 0 rgba(0, 0, 0, 0.9),
            0 2px 8px rgba(0, 0, 0, 0.95),
            0 4px 16px rgba(0, 0, 0, 0.75);
        }
      `}</style>
    </div>
  );
}
