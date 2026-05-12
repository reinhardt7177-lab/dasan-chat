import { Link } from "react-router-dom";

// 다산초당 외경 + 두 문(사랑채/서재) hover label.
// 원본 dasan-chatbot/ui/index.html의 구성을 그대로 React로 옮겼다.
// 문 overlay 위치는 % 단위라 배경 이미지 비율을 따라간다.

export function Landing() {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#1a0e0a]">
      {/* 한옥 배경 */}
      <div
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/images/landing-bg.png')" }}
      />

      {/* 상하 vignette — 제목 가독성 + 마감감 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-48 bg-gradient-to-b from-black/55 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-32 bg-gradient-to-t from-black/45 to-transparent" />

      {/* 제목 */}
      <div className="anim-fadein absolute top-6 left-1/2 z-10 -translate-x-1/2 text-center">
        <h1 className="brush text-3xl text-parchment drop-shadow-[0_3px_10px_rgba(0,0,0,0.85)] md:text-4xl">
          다산초당
        </h1>
        <p className="mt-1 text-xs tracking-[0.3em] text-gold drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)] md:text-sm">
          정약용 선생님과의 만남
        </p>
      </div>

      {/* 안내 */}
      <div className="hint absolute bottom-10 left-1/2 z-10 -translate-x-1/2 text-sm tracking-wider text-parchment/70 drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]">
        문을 골라 들어가시구려
      </div>

      {/* LEFT door → 사랑채(음성) */}
      <DoorOverlay
        to="/sarangchae"
        side="left"
        label="사랑채"
        sub="— 음성으로 여쭙기 —"
        icon={<MicIcon />}
      />

      {/* RIGHT door → 서재(글) */}
      <DoorOverlay
        to="/seojae"
        side="right"
        label="서재"
        sub="— 글로 여쭙기 —"
        icon={<BookIcon />}
      />

      <div className="absolute right-3 bottom-2 text-[10px] tracking-wider text-gold-soft/50">
        강진중앙초등학교
      </div>

      {/* 인라인 keyframes (이 페이지에서만 쓰는 작은 애니메이션) */}
      <style>{`
        @keyframes fadein { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes hint-pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 0.85; } }
        .anim-fadein { animation: fadein 1.2s ease-out; }
        .hint { animation: hint-pulse 3s ease-in-out infinite; }
      `}</style>
    </div>
  );
}

type DoorProps = {
  to: string;
  side: "left" | "right";
  label: string;
  sub: string;
  icon: React.ReactNode;
};

function DoorOverlay({ to, side, label, sub, icon }: DoorProps) {
  // 배경 이미지 위 정확한 좌우 문 위치를 % 단위로 핀.
  // 다산챗봇 원본의 inset 그대로 — 화면 비율 변해도 건물 안에 머무름.
  const position =
    side === "left"
      ? { left: "18%", right: "51%", top: "32%", bottom: "22%" }
      : { left: "51%", right: "18%", top: "32%", bottom: "22%" };

  return (
    <Link
      to={to}
      className="door-overlay group absolute z-[5] cursor-pointer rounded-md border-2 border-transparent backdrop-blur-0 transition-all duration-300 ease-out hover:border-gold/70 hover:bg-[rgba(255,220,150,0.18)] hover:shadow-[0_0_30px_rgba(255,200,120,0.45),inset_0_0_40px_rgba(255,220,150,0.25)] hover:backdrop-blur-sm"
      style={position}
      aria-label={label}
    >
      {/* hover 시 떠오르는 label card */}
      <div className="pointer-events-none absolute -bottom-4 left-1/2 w-44 -translate-x-1/2 translate-y-full rounded-sm border border-gold/65 bg-gradient-to-b from-ink/95 to-[#0f0a08]/95 px-5 py-3 text-center text-parchment opacity-0 shadow-[0_8px_24px_rgba(0,0,0,0.55),inset_0_0_0_1px_rgba(201,168,87,0.15)] transition-all duration-300 ease-out group-hover:translate-y-full group-hover:opacity-100 md:w-52">
        <div className="mb-1 flex items-center justify-center gap-2">
          {icon}
          <span className="text-lg font-bold">{label}</span>
        </div>
        <div className="text-[11px] text-gold">{sub}</div>
      </div>
    </Link>
  );
}

function MicIcon() {
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
        d="M12 18.75v1.5m0-1.5a6.75 6.75 0 01-6.75-6.75M12 18.75a6.75 6.75 0 006.75-6.75M12 15a3.75 3.75 0 003.75-3.75V6.75a3.75 3.75 0 10-7.5 0v4.5A3.75 3.75 0 0012 15z"
      />
    </svg>
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
