import { Link } from "react-router-dom";

// 사랑채 — 음성 대화 화면.
// 다산 아바타는 별도 작업 중이라 현재는 산타 임베드(HeyGen LiveAvatar)가 placeholder.
// 다산 아바타 준비되면 EMBED_URL만 교체.

const EMBED_URL =
  "https://embed.liveavatar.com/v1/e9aba2cb-c3d2-46b2-a6ad-970e4ecce41c?orientation=horizontal";

export function Sarangchae() {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      {/* 산타 임베드 풀화면 — cover 효과로 viewport 가득 채움 (가로/세로 중
          큰 쪽에 맞춰 16:9 비율 유지, 짧은 축은 살짝 잘림). */}
      <iframe
        src={EMBED_URL}
        allow="camera; microphone; autoplay; encrypted-media"
        className="absolute left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2 border-0"
        style={{
          width: "max(100vw, calc(100vh * 16 / 9))",
          height: "max(100vh, calc(100vw * 9 / 16))",
        }}
        title="다산 선생님과 대화"
      />

      {/* 뒤로가기 */}
      <Link
        to="/landing"
        className="absolute top-4 left-4 z-50 rounded-sm border border-gold-soft/40 bg-wood/80 px-3 py-1.5 text-sm text-gold transition hover:bg-wood-2"
      >
        ← 다산초당
      </Link>
    </div>
  );
}
