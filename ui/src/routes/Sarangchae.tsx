import { Link } from "react-router-dom";

// HeyGen LiveAvatar 임베드. 음성 채팅 UI/마이크/페르소나 모두 HeyGen 대시보드 쪽에서 관리.
// 우리 백엔드(Gemini) 와는 분리 — 사랑채는 임베드에 100% 위임, 서재만 우리 Gemini를 씀.
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
      <div className="pointer-events-none absolute inset-0 z-[1] bg-black/35" />

      {/* 뒤로가기 */}
      <Link
        to="/landing"
        className="absolute top-4 left-4 z-50 rounded-sm border border-gold-soft/40 bg-wood/80 px-3 py-1.5 text-sm text-gold transition hover:bg-wood-2"
      >
        ← 다산초당
      </Link>

      {/* 아바타 임베드 */}
      <div className="absolute inset-0 z-10 flex items-center justify-center px-6 py-12">
        <iframe
          src={EMBED_URL}
          allow="camera; microphone; autoplay; encrypted-media"
          className="h-full max-h-[80vh] w-full max-w-5xl rounded-lg border border-gold-soft/40 shadow-[0_8px_40px_rgba(0,0,0,0.7)]"
          title="다산 선생님과 대화"
        />
      </div>
    </div>
  );
}
