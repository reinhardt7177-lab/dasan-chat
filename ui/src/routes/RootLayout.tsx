import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { MusicToggle } from "../components/MusicToggle";
import { pauseBgMusic, playBgMusic } from "../lib/bgMusic";
import { useAudioStore } from "../store/audio";

// 라우트 + 사용자 음소거 상태에 따라 배경음악 재생/일시정지.
// 음악 라우트: 인트로(/) 와 1차 랜딩(/landing). 그 외에서는 일시정지.
// 음소거 토글이 켜져 있으면 어디서든 일시정지.

const MUSIC_ROUTES = new Set<string>(["/", "/landing"]);

export function RootLayout() {
  const { pathname } = useLocation();
  const muted = useAudioStore((s) => s.muted);

  useEffect(() => {
    if (MUSIC_ROUTES.has(pathname) && !muted) {
      playBgMusic();
    } else {
      pauseBgMusic();
    }
  }, [pathname, muted]);

  return (
    <>
      <Outlet />
      <MusicToggle />
    </>
  );
}
