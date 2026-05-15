import { Link } from "react-router-dom";

// 사랑채 — 음성 대화 화면.
// 다산 아바타는 별도 작업 중이라 현재는 산타 임베드(HeyGen LiveAvatar)가 placeholder.
// 다산 아바타 준비되면 EMBED_URL만 교체.

const EMBED_URL =
  "https://embed.liveavatar.com/v1/cb6af202-f59c-4368-9758-4a552e466e1e?orientation=horizontal";

export function Sarangchae() {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      {/* 산타 임베드 — contain 효과로 16:9 콘텐츠 전체(특히 하단 'Chat now'
          버튼)가 항상 보이도록. 좌우 또는 위아래에 검은 띠. */}
      <iframe
        src={EMBED_URL}
        allow="camera; microphone; autoplay; encrypted-media"
        className="absolute left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2 border-0"
        style={{
          width: "min(100vw, calc(100vh * 16 / 9))",
          height: "min(100vh, calc(100vw * 9 / 16))",
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
