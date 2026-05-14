import { Link } from "react-router-dom";

// 사랑채 — 음성 대화 화면.
// 다산 아바타는 별도 작업 중이라 현재는 산타 임베드(HeyGen LiveAvatar)가 placeholder.
// 다산 아바타 준비되면 EMBED_URL만 교체.

const EMBED_URL =
  "https://embed.liveavatar.com/v1/e9aba2cb-c3d2-46b2-a6ad-970e4ecce41c?orientation=horizontal";

export function Sarangchae() {
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

      {/* 상단 안내 배지 */}
      <div className="absolute top-4 left-1/2 z-40 -translate-x-1/2 rounded-sm border border-gold/40 bg-wood/70 px-4 py-1.5 text-sm tracking-wide text-gold backdrop-blur-md">
        다산 선생님과 대화를 나누시구려
      </div>

      {/* 산타 임베드 — 화면 가운데. 다산 아바타 준비되면 교체. */}
      <div className="absolute inset-0 z-[2] flex items-center justify-center pt-12">
        <iframe
          src={EMBED_URL}
          allow="camera; microphone; autoplay; encrypted-media"
          className="aspect-video rounded-lg border border-gold-soft/40 shadow-[0_12px_48px_rgba(0,0,0,0.75)]"
          style={{ width: "min(75vw, calc(80vh * 16 / 9))" }}
          title="다산 선생님과 대화"
        />
      </div>
    </div>
  );
}
