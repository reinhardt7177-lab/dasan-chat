// 전역 배경음악 싱글톤. 라우트 사이를 오가도 동일 audio가 유지된다.
// 첫 사용자 제스처(인트로 클릭) 이후에만 재생이 허용됨 — 브라우저 autoplay 정책.

let audio: HTMLAudioElement | null = null;

function getAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio("/audio/morning-at-the-peak.mp3");
    audio.loop = true;
    audio.volume = 0.45;
    audio.preload = "auto";
  }
  return audio;
}

export function playBgMusic() {
  const a = getAudio();
  // play() 는 Promise — 사용자 제스처 전에는 reject 됨. 무시한다.
  void a.play().catch(() => {});
}

export function pauseBgMusic() {
  if (audio) audio.pause();
}
