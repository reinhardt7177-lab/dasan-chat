import { create } from "zustand";

// 배경음악 사용자 토글 상태. 음소거시 모든 라우트에서 재생 안 함.
// 라우트 기반 자동 일시정지(사랑채/서재)는 RootLayout 에서 별도로 처리.

type State = {
  muted: boolean;
};

type Actions = {
  toggleMuted: () => void;
};

export const useAudioStore = create<State & Actions>((set) => ({
  muted: false,
  toggleMuted: () => set((s) => ({ muted: !s.muted })),
}));
