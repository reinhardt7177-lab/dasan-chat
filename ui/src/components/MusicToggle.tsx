import { useAudioStore } from "../store/audio";

// 오른쪽 위 작은 음악 토글. 어디 페이지에 있든 떠 있어서 사용자가 언제든 끌 수 있다.

export function MusicToggle() {
  const muted = useAudioStore((s) => s.muted);
  const toggle = useAudioStore((s) => s.toggleMuted);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={muted ? "음악 켜기" : "음악 끄기"}
      title={muted ? "음악 켜기" : "음악 끄기"}
      className="fixed top-3 right-3 z-[60] flex h-9 w-9 items-center justify-center rounded-full border border-gold/40 bg-ink/55 text-parchment/85 shadow-[0_2px_10px_rgba(0,0,0,0.45)] backdrop-blur-sm transition-all duration-200 hover:border-gold/80 hover:bg-ink/75 hover:text-parchment md:top-4 md:right-4 md:h-10 md:w-10"
    >
      {muted ? <SpeakerMutedIcon /> : <SpeakerOnIcon />}
    </button>
  );
}

function SpeakerOnIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 md:h-[18px] md:w-[18px]"
    >
      <path d="M11 5 6 9H3v6h3l5 4V5z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}

function SpeakerMutedIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 md:h-[18px] md:w-[18px]"
    >
      <path d="M11 5 6 9H3v6h3l5 4V5z" />
      <path d="M22 9l-6 6" />
      <path d="M16 9l6 6" />
    </svg>
  );
}
