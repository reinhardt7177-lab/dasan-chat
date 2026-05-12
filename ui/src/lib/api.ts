// 서재(글) 모드용 REST 클라이언트.
// WebSocket(/api/ws/live)은 사랑채에서 별도로 다룬다.

export type ChatTurn = { role: "user" | "model"; text: string };

export type ChatResponse = { reply: string };

export async function postChat(
  message: string,
  history: ChatTurn[],
): Promise<ChatResponse> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(body.detail ?? `${res.status} ${res.statusText}`);
  }
  return (await res.json()) as ChatResponse;
}
