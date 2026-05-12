import { useEffect, useRef } from "react";

// 입 다물기 + 입 벌림 두 PNG를 같은 자리에 겹치고, openAmount(0~1)로 위쪽 opacity를 조절.
// 원본 dasan-chatbot의 #character-stack / #character-open 패턴을 React로 옮김.
// SVG color-matrix 필터로 검은 배경을 투명 처리.

type Props = {
  /** AudioPlayer.onAmplitude가 흘려준 amplitude (보통 0~0.3). */
  amplitude: number;
  /** 현재 말하는 중인지 (전체 살짝 brightness 펄스). */
  speaking: boolean;
};

const DEAD = 0.04; // 이 이하면 입 다물기 고정
const FULL = 0.3; // 이 이상이면 100% open

export function Character({ amplitude, speaking }: Props) {
  const openRef = useRef<HTMLImageElement | null>(null);

  // 입력 amplitude를 dead-zone 매핑해 opacity로 적용.
  useEffect(() => {
    if (!openRef.current) return;
    const t = Math.max(0, Math.min(1, (amplitude - DEAD) / (FULL - DEAD)));
    openRef.current.style.opacity = String(t);
  }, [amplitude]);

  return (
    <>
      {/* 검은 배경 chroma-key용 SVG 필터 (인라인). */}
      <svg width="0" height="0" aria-hidden="true" className="absolute">
        <filter id="black-to-alpha" x="0" y="0" width="100%" height="100%">
          <feColorMatrix
            type="matrix"
            values="1 0 0 0 0
                    0 1 0 0 0
                    0 0 1 0 0
                    20 20 20 0 -1.5"
          />
          <feGaussianBlur stdDeviation="0.5" in="SourceGraphic" />
        </filter>
      </svg>

      <div
        className={`pointer-events-none absolute bottom-28 left-1/2 z-[2] max-h-[78vh] max-w-[55vw] -translate-x-1/2 ${
          speaking ? "anim-breath-fast" : "anim-breath-slow"
        }`}
      >
        <img
          src="/images/character.png"
          alt=""
          className="block max-h-[78vh] max-w-[55vw] object-contain"
          style={{
            filter: "url(#black-to-alpha) drop-shadow(0 10px 25px rgba(0,0,0,0.5))",
          }}
        />
        <img
          ref={openRef}
          src="/images/character_open.png"
          alt=""
          className="absolute inset-0 h-full w-full object-contain"
          style={{
            opacity: 0,
            filter: "url(#black-to-alpha) drop-shadow(0 10px 25px rgba(0,0,0,0.5))",
            transition: "opacity 50ms linear",
            willChange: "opacity",
          }}
        />
      </div>

      <style>{`
        @keyframes char-breath-fast {
          0%,100% { transform: translateX(-50%) scale(1); filter: brightness(1.00); }
          50%     { transform: translateX(-50%) scale(1.005); filter: brightness(1.04); }
        }
        @keyframes char-breath-slow {
          0%,100% { transform: translateX(-50%) scale(1); filter: brightness(1.00); }
          50%     { transform: translateX(-50%) scale(1.003); filter: brightness(1.02); }
        }
        .anim-breath-fast { animation: char-breath-fast 2.4s ease-in-out infinite; }
        .anim-breath-slow { animation: char-breath-slow 5.0s ease-in-out infinite; }
      `}</style>
    </>
  );
}
