import { create } from "zustand";
import type { ChatTurn } from "../lib/api";

// 서재(글) 모드 대화 히스토리. 사랑채는 WS 스트림이라 별도 store가 필요 없다.
// 페이지 전환 시 history는 유지하지만 새로고침 시 날아간다 — 학급 1회용으로 충분.

type ChatMessage = ChatTurn & { id: string };

type State = {
  messages: ChatMessage[];
  isWaiting: boolean;
  error: string | null;
};

type Actions = {
  pushUser: (text: string) => void;
  pushModel: (text: string) => void;
  setWaiting: (waiting: boolean) => void;
  setError: (msg: string | null) => void;
  reset: () => void;
};

let counter = 0;
const nextId = () => `m${Date.now()}-${counter++}`;

export const useChatStore = create<State & Actions>((set) => ({
  messages: [],
  isWaiting: false,
  error: null,
  pushUser: (text) =>
    set((s) => ({ messages: [...s.messages, { id: nextId(), role: "user", text }] })),
  pushModel: (text) =>
    set((s) => ({ messages: [...s.messages, { id: nextId(), role: "model", text }] })),
  setWaiting: (waiting) => set({ isWaiting: waiting }),
  setError: (msg) => set({ error: msg }),
  reset: () => set({ messages: [], isWaiting: false, error: null }),
}));

// 서버로 보낼 때는 id를 떼고 role/text만 보낸다.
export function toApiHistory(messages: ChatMessage[]): ChatTurn[] {
  return messages.map(({ role, text }) => ({ role, text }));
}
